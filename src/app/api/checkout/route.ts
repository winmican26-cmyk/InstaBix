import { and, eq } from "drizzle-orm";
import { db, withOrg } from "@/lib/db";
import { creatorAccounts, orders, products } from "@/lib/db/schema";
import { stripe } from "@/lib/stripe/client";
import { assertSameOrigin } from "@/lib/http";
import { env } from "@/lib/env";
import { logger, errorMessage } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }

  const client = stripe();
  if (!client) return Response.json({ error: "Payments are not configured." }, { status: 503 });

  const form = await request.formData();
  const productId = String(form.get("productId") ?? "");
  if (!UUID.test(productId)) return Response.json({ error: "Unknown product." }, { status: 400 });

  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.status, "published")))
    .limit(1);
  if (!product) return Response.json({ error: "That product is not on sale." }, { status: 404 });

  const [creator] = await withOrg(product.orgId, (tx) =>
    tx
      .select({ username: creatorAccounts.username, displayName: creatorAccounts.displayName })
      .from(creatorAccounts)
      .where(eq(creatorAccounts.id, product.creatorId))
      .limit(1),
  );

  try {
    const session = await client.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: product.currency,
            unit_amount: product.priceCents,
            product_data: {
              name: product.title,
              description: product.promise ?? product.subtitle ?? undefined,
            },
          },
        },
      ],
      success_url: `${env.APP_URL.replace(/\/$/, "")}/p/${product.id}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.APP_URL.replace(/\/$/, "")}/p/${product.id}?checkout=cancelled`,
      metadata: {
        orgId: product.orgId,
        productId: product.id,
        creatorId: product.creatorId,
      },
      payment_intent_data: {
        metadata: { orgId: product.orgId, productId: product.id, creatorId: product.creatorId },
      },
    });

    if (!session.url) return Response.json({ error: "Stripe did not return a checkout URL." }, { status: 502 });

    await withOrg(product.orgId, (tx) =>
      tx
        .insert(orders)
        .values({
          orgId: product.orgId,
          productId: product.id,
          creatorId: product.creatorId,
          stripeSessionId: session.id,
          amountCents: product.priceCents,
          feeCents: 0,
          currency: product.currency,
          status: "pending",
        })
        .onConflictDoNothing({ target: orders.stripeSessionId }),
    );

    logger.info("checkout.created", {
      orgId: product.orgId,
      productId: product.id,
      sessionId: session.id,
      creator: creator?.username ?? null,
    });

    return Response.redirect(session.url, 303);
  } catch (error) {
    logger.error("checkout.failed", { productId, message: errorMessage(error) });
    return Response.json({ error: "Checkout could not be started. Nothing was charged." }, { status: 502 });
  }
}
