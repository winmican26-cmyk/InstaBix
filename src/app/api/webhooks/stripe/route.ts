import type Stripe from "stripe";
import { and, eq } from "drizzle-orm";
import { db, pool, withOrg } from "@/lib/db";
import { ledgerEntries, orders, products, refunds, webhookEvents } from "@/lib/db/schema";
import { verifyStripeSignature } from "@/lib/stripe/client";
import { computeSplit, refundLines, saleLines } from "@/lib/ledger";
import { insertAudit } from "@/lib/audit";
import { logger, errorMessage } from "@/lib/logger";
import { PRO_KIND } from "@/lib/billing/subscription";
import { applyStripeSubscriptionEvent } from "@/lib/billing/subscription-entitlement";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const raw = await request.text();
  const event = verifyStripeSignature(raw, request.headers.get("stripe-signature"));
  if (!event) return bad("Stripe signature verification failed.", 401);

  const [seen] = await db
    .select({ id: webhookEvents.id })
    .from(webhookEvents)
    .where(and(eq(webhookEvents.provider, "stripe"), eq(webhookEvents.externalId, event.id)))
    .limit(1);
  if (seen) return Response.json({ received: true, duplicate: true });

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.kind === PRO_KIND) {
        logger.info("billing.checkout_completed", {
          sessionId: session.id,
          orgId: session.metadata?.orgId ?? null,
        });
      } else {
        await handlePaid(session);
      }
    } else if (
      event.type === "customer.subscription.created"
      || event.type === "customer.subscription.updated"
      || event.type === "customer.subscription.deleted"
    ) {
      const subscription = event.data.object as Stripe.Subscription;
      const deleted = event.type === "customer.subscription.deleted";
      const action = await applyStripeSubscriptionEvent(subscription, event.id, event.created, deleted);
      logger.info("stripe.subscription_event", {
        eventId: event.id,
        action,
        status: deleted ? "canceled" : subscription.status,
      });
    } else if (event.type === "refund.created") {
      await handleRefund(event.data.object as Stripe.Refund);
    } else {
      logger.info("stripe.event_ignored", { type: event.type, id: event.id });
    }

    await db
      .insert(webhookEvents)
      .values({ provider: "stripe", externalId: event.id, payload: event as unknown as Record<string, unknown> })
      .onConflictDoNothing({ target: [webhookEvents.provider, webhookEvents.externalId] });
  } catch (error) {
    logger.error("stripe.webhook_failed", { type: event.type, message: errorMessage(error) });
    return bad("The event could not be processed. Stripe will retry.", 500);
  }

  return Response.json({ received: true });
}

async function handlePaid(session: Stripe.Checkout.Session) {
  const orgId = session.metadata?.orgId;
  const productId = session.metadata?.productId;
  const amountCents = session.amount_total ?? 0;
  if (!orgId || !productId || amountCents <= 0) {
    logger.warn("stripe.session_missing_metadata", { sessionId: session.id });
    return;
  }

  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null);
  const buyerEmail = session.customer_details?.email ?? session.customer_email ?? null;
  const currency = (session.currency ?? "usd").toLowerCase();

  await withOrg(orgId, async (tx) => {
    const [product] = await tx
      .select()
      .from(products)
      .where(and(eq(products.id, productId), eq(products.orgId, orgId)))
      .limit(1);
    if (!product) {
      logger.warn("stripe.product_missing", { orgId, productId });
      return;
    }

    const [order] = await tx
      .insert(orders)
      .values({
        orgId,
        productId: product.id,
        creatorId: product.creatorId,
        stripeSessionId: session.id,
        stripePaymentIntentId: paymentIntentId,
        amountCents,
        feeCents: 0,
        currency,
        status: "paid",
        buyerEmail,
      })
      .onConflictDoUpdate({
        target: orders.stripeSessionId,
        set: {
          status: "paid",
          stripePaymentIntentId: paymentIntentId,
          amountCents,
          buyerEmail,
          updatedAt: new Date(),
        },
      })
      .returning({ id: orders.id });

    if (!order) return;

    const existing = await tx
      .select({ id: ledgerEntries.id })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.orderId, order.id))
      .limit(1);

    if (existing.length === 0) {
      const split = computeSplit(amountCents, product.splitCreatorBps, 0, currency);
      await tx.insert(ledgerEntries).values(
        saleLines(split, session.id).map((line) => ({
          orgId,
          orderId: order.id,
          creatorId: product.creatorId,
          account: line.account,
          direction: line.direction,
          amountCents: line.amountCents,
          memo: line.memo,
        })),
      );
      await insertAudit(tx, {
        orgId,
        actorUserId: null,
        action: "order.paid",
        entityType: "order",
        entityId: order.id,
        metadata: {
          productId: product.id,
          amountCents,
          creatorBps: product.splitCreatorBps,
          creatorCents: split.creatorCents,
          operatorCents: split.operatorCents,
          provider: "stripe",
        },
        ip: null,
      });
    }
  });
}

async function handleRefund(refund: Stripe.Refund) {
  if (refund.status !== "succeeded") {
    logger.info("stripe.refund_not_settled", { refundId: refund.id, status: refund.status });
    return;
  }

  const paymentIntentId = typeof refund.payment_intent === "string" ? refund.payment_intent : (refund.payment_intent?.id ?? null);
  if (!paymentIntentId) {
    logger.warn("stripe.refund_without_payment_intent", { refundId: refund.id });
    return;
  }

  const { rows } = await pool.query<{ org_id: string }>("select unnest(order_org_for_payment_intent($1)) as org_id", [
    paymentIntentId,
  ]);
  const orgId = rows[0]?.org_id;
  if (!orgId) {
    logger.warn("stripe.refund_order_not_found", { refundId: refund.id });
    return;
  }

  const amountCents = refund.amount ?? 0;
  if (amountCents <= 0) return;

  await withOrg(orgId, async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.orgId, orgId), eq(orders.stripePaymentIntentId, paymentIntentId)))
      .limit(1);
    if (!order) return;

    const [existing] = await tx
      .select({ id: refunds.id })
      .from(refunds)
      .where(and(eq(refunds.orderId, order.id), eq(refunds.stripeRefundId, refund.id)))
      .limit(1);
    if (existing) return;

    await tx.insert(refunds).values({
      orgId,
      orderId: order.id,
      stripeRefundId: refund.id,
      amountCents,
      reason: refund.reason ?? null,
    });

    const [product] = await tx
      .select({ splitCreatorBps: products.splitCreatorBps })
      .from(products)
      .where(eq(products.id, order.productId))
      .limit(1);
    const refundSplit = computeSplit(amountCents, product?.splitCreatorBps ?? 0, 0, order.currency);

    await tx.insert(ledgerEntries).values(
      refundLines(refundSplit, refund.id).map((line) => ({
        orgId,
        orderId: order.id,
        creatorId: order.creatorId,
        account: line.account,
        direction: line.direction,
        amountCents: line.amountCents,
        memo: line.memo,
      })),
    );

    const fullyRefunded = amountCents >= order.amountCents;
    await tx
      .update(orders)
      .set({ status: fullyRefunded ? "refunded" : order.status, updatedAt: new Date() })
      .where(eq(orders.id, order.id));

    await insertAudit(tx, {
      orgId,
      actorUserId: null,
      action: "order.refunded",
      entityType: "order",
      entityId: order.id,
      metadata: { refundId: refund.id, amountCents, fullyRefunded, provider: "stripe" },
      ip: null,
    });
  });
}
