import "server-only";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { withOrg } from "@/lib/db";
import { orgEntitlements } from "@/lib/db/schema";
import { insertAudit } from "@/lib/audit";
import { PRO_KIND } from "@/lib/billing/subscription";

type EntitlementAction =
  | "activated"
  | "renewed"
  | "past_due"
  | "canceled"
  | "updated"
  | "ignored";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAST_DUE_STATUSES = new Set(["past_due", "unpaid", "incomplete", "incomplete_expired"]);

function activeWithFuturePeriod(
  row: { status: string; currentPeriodEnd: Date | null } | undefined,
  at: Date,
): boolean {
  return Boolean(row && row.status === "active" && row.currentPeriodEnd && row.currentPeriodEnd.getTime() > at.getTime());
}

export async function applyStripeSubscriptionEvent(
  subscription: Stripe.Subscription,
  eventId: string,
  eventCreatedUnix: number,
  deleted = false,
): Promise<EntitlementAction> {
  // Validate before opening any transaction: no write and no audit on bad input.
  const orgId = subscription.metadata?.orgId;
  // The installed Stripe typings moved this field to subscription items, but the
  // webhook payload contract for this handler still carries it on the event object.
  const periodEndUnix = (subscription as Stripe.Subscription & { current_period_end?: number }).current_period_end;
  if (
    subscription.metadata?.kind !== PRO_KIND
    || !orgId
    || !UUID_RE.test(orgId)
    || typeof subscription.id !== "string"
    || subscription.id.length === 0
    || typeof periodEndUnix !== "number"
    || !Number.isFinite(periodEndUnix)
    || periodEndUnix <= 0
    || !Number.isFinite(eventCreatedUnix)
    || eventCreatedUnix <= 0
  ) {
    return "ignored";
  }

  const status = deleted ? "canceled" : subscription.status;
  const customer = subscription.customer;
  const stripeCustomerId = typeof customer === "string" ? customer : (customer?.id ?? null);
  const currentPeriodEnd = new Date(periodEndUnix * 1000);
  const eventDate = new Date(eventCreatedUnix * 1000);

  return withOrg(orgId, async (tx) => {
    const [existing] = await tx
      .select()
      .from(orgEntitlements)
      .where(eq(orgEntitlements.orgId, orgId))
      .limit(1);

    if (existing?.stripeSubscriptionId && eventDate.getTime() <= existing.updatedAt.getTime()) {
      return "ignored";
    }
    if (existing?.stripeSubscriptionId && existing.stripeSubscriptionId !== subscription.id && status !== "active") {
      return "ignored";
    }

    const oldActiveFuture = activeWithFuturePeriod(existing, eventDate);
    const newActiveFuture = status === "active" && currentPeriodEnd.getTime() > eventDate.getTime();

    let action: EntitlementAction;
    if (status === "canceled") {
      action = "canceled";
    } else if (PAST_DUE_STATUSES.has(status)) {
      action = "past_due";
    } else if (status === "active") {
      if (!existing || !oldActiveFuture) {
        action = "activated";
      } else if (newActiveFuture && currentPeriodEnd.getTime() > (existing.currentPeriodEnd?.getTime() ?? 0)) {
        action = "renewed";
      } else {
        action = "updated";
      }
    } else {
      action = "updated";
    }

    await tx
      .insert(orgEntitlements)
      .values({
        orgId,
        plan: "pro",
        status,
        stripeCustomerId,
        stripeSubscriptionId: subscription.id,
        currentPeriodEnd,
        updatedAt: eventDate,
      })
      .onConflictDoUpdate({
        target: orgEntitlements.orgId,
        set: {
          plan: "pro",
          status,
          stripeCustomerId,
          stripeSubscriptionId: subscription.id,
          currentPeriodEnd,
          updatedAt: eventDate,
        },
      });

    await insertAudit(tx, {
      orgId,
      actorUserId: null,
      action: `billing.subscription_${action}`,
      entityType: "subscription",
      entityId: subscription.id,
      metadata: {
        eventId,
        status,
        previousStatus: existing?.status ?? null,
        currentPeriodEnd: currentPeriodEnd.toISOString(),
        provider: "stripe",
        kind: PRO_KIND,
      },
      ip: null,
    });

    return action;
  });
}
