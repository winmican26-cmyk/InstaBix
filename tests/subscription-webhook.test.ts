import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

// Integration suite against the real Postgres container. Only the two DB URLs
// are read from .env.local so no other credential node is touched.
let localEnv: Record<string, string> = {};
try {
  localEnv = parse(readFileSync(".env.local"));
} catch {
  // Fall back to the ambient environment below.
}
const adminUrl = localEnv.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL_ADMIN;
const runtimeUrl = localEnv.DATABASE_URL ?? process.env.DATABASE_URL;
if (!adminUrl || !runtimeUrl) {
  throw new Error("subscription-webhook test requires DATABASE_URL_ADMIN and DATABASE_URL (see .env.local).");
}

// Modules imported below parse env at import time and build the runtime pool.
const originalDatabaseUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL = runtimeUrl;

vi.mock("server-only", () => ({}));

const stripeState = vi.hoisted(() => ({ event: null as Stripe.Event | null }));
vi.mock("@/lib/stripe/client", () => ({
  verifyStripeSignature: () => stripeState.event,
  stripe: () => null,
}));

const { POST } = await import("@/app/api/webhooks/stripe/route");
const { getQuotaState } = await import("@/lib/billing/quota");
const { PRO_KIND } = await import("@/lib/billing/subscription");

const suffix = randomUUID().slice(0, 8);
const mainOrgId = randomUUID();
const staleOrgId = randomUUID();
const invalidKindOrgId = randomUUID();
const badPeriodOrgId = randomUUID();
const invalidSigOrgId = randomUUID();
const checkoutOrgId = randomUUID();
const orgIds = [mainOrgId, staleOrgId, invalidKindOrgId, badPeriodOrgId, invalidSigOrgId, checkoutOrgId];
const eventIds: string[] = [];

const nowUnix = Math.floor(Date.now() / 1000);
const baseUnix = nowUnix - 10 * 86_400;
const periodA = baseUnix + 30 * 86_400;
const periodB = periodA + 30 * 86_400;

let admin: Client;

function nextEventId(): string {
  const id = randomUUID();
  eventIds.push(id);
  return id;
}

type SubscriptionType =
  | "customer.subscription.created"
  | "customer.subscription.updated"
  | "customer.subscription.deleted";

function subscriptionEvent(options: {
  eventId: string;
  created: number;
  type: SubscriptionType;
  orgId?: string | null;
  kind?: string | null;
  subscriptionId?: string;
  status?: string;
  periodEnd?: number;
  customer?: string;
}): Stripe.Event {
  const metadata: Record<string, string> = {};
  const kind = options.kind === undefined ? PRO_KIND : options.kind;
  if (kind !== null) metadata.kind = kind;
  if (options.orgId !== undefined && options.orgId !== null) metadata.orgId = options.orgId;
  return {
    id: options.eventId,
    created: options.created,
    type: options.type,
    data: {
      object: {
        id: options.subscriptionId ?? randomUUID(),
        object: "subscription",
        status: options.status ?? "active",
        customer: options.customer ?? `cus_${suffix}`,
        current_period_end: options.periodEnd ?? periodA,
        metadata,
      },
    },
  } as unknown as Stripe.Event;
}

function checkoutEvent(options: {
  eventId: string;
  sessionId: string;
  orgId: string;
  kind?: string;
  productId?: string;
}): Stripe.Event {
  const metadata: Record<string, string> = { orgId: options.orgId };
  if (options.kind) metadata.kind = options.kind;
  if (options.productId) metadata.productId = options.productId;
  return {
    id: options.eventId,
    created: nowUnix,
    type: "checkout.session.completed",
    data: {
      object: {
        id: options.sessionId,
        object: "checkout.session",
        amount_total: 2_900,
        currency: "usd",
        payment_intent: `pi_${options.sessionId}`,
        metadata,
      },
    },
  } as unknown as Stripe.Event;
}

async function post(event: Stripe.Event | null): Promise<Response> {
  stripeState.event = event;
  return POST(
    new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": event ? "test-signature" : "" },
      body: JSON.stringify(event ?? {}),
    }),
  );
}

async function entitlement(orgId: string) {
  const { rows } = await admin.query(
    `select plan, status, stripe_customer_id, stripe_subscription_id, current_period_end, updated_at
       from org_entitlements where org_id = $1`,
    [orgId],
  );
  return rows[0] ?? null;
}

async function audits(orgId: string) {
  const { rows } = await admin.query(
    `select id, action, entity_type, entity_id, actor_user_id, metadata, ip
       from audit_events where org_id = $1 order by created_at, id`,
    [orgId],
  );
  return rows as Array<{
    id: string;
    action: string;
    entity_type: string;
    entity_id: string | null;
    actor_user_id: string | null;
    metadata: Record<string, unknown>;
    ip: string | null;
  }>;
}

async function webhookRow(eventId: string) {
  const { rows } = await admin.query(
    "select id, external_id from webhook_events where provider = 'stripe' and external_id = $1",
    [eventId],
  );
  return rows;
}

async function orgCount(table: "orders" | "ledger_entries", orgId: string): Promise<number> {
  const { rows } = await admin.query(`select count(*)::int as count from ${table} where org_id = $1`, [orgId]);
  return Number(rows[0]?.count ?? 0);
}

beforeAll(async () => {
  admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(
    `insert into orgs (id, name, slug)
     select id, name, slug from unnest($1::uuid[], $2::text[], $3::text[]) as t(id, name, slug)`,
    [
      orgIds,
      orgIds.map((_, index) => `Subscription webhook fixture ${suffix} ${index}`),
      orgIds.map((_, index) => `sub-hook-${suffix}-${index}`),
    ],
  );
});

afterAll(async () => {
  if (admin) {
    await admin.query("delete from webhook_events where external_id = any($1::text[])", [eventIds]);
    await admin.query("delete from audit_events where org_id = any($1::uuid[])", [orgIds]);
    await admin.query("delete from ledger_entries where org_id = any($1::uuid[])", [orgIds]);
    await admin.query("delete from orders where org_id = any($1::uuid[])", [orgIds]);
    await admin.query("delete from org_entitlements where org_id = any($1::uuid[])", [orgIds]);
    await admin.query("delete from orgs where id = any($1::uuid[])", [orgIds]);
    await admin.end();
  }
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
});

describe("Stripe subscription webhook entitlement lifecycle", () => {
  const createdEventId = nextEventId();
  const subscriptionId = randomUUID();
  const createdEvent = subscriptionEvent({
    eventId: createdEventId,
    created: baseUnix,
    type: "customer.subscription.created",
    orgId: mainOrgId,
    subscriptionId,
    status: "active",
    periodEnd: periodA,
  });

  it("activates a valid Pro subscription and records the webhook", async () => {
    const response = await post(createdEvent);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });

    const row = await entitlement(mainOrgId);
    expect(row).not.toBeNull();
    expect(row.plan).toBe("pro");
    expect(row.status).toBe("active");
    expect(row.stripe_subscription_id).toBe(subscriptionId);
    expect(row.stripe_customer_id).toBe(`cus_${suffix}`);
    expect(new Date(row.current_period_end).toISOString()).toBe(new Date(periodA * 1000).toISOString());
    expect(new Date(row.updated_at).toISOString()).toBe(new Date(baseUnix * 1000).toISOString());

    const rows = await audits(mainOrgId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe("billing.subscription_activated");
    expect(rows[0]?.entity_type).toBe("subscription");
    expect(rows[0]?.entity_id).toBe(subscriptionId);
    expect(rows[0]?.actor_user_id).toBeNull();
    expect(rows[0]?.ip).toBeNull();
    expect(rows[0]?.metadata).toEqual({
      eventId: createdEventId,
      status: "active",
      previousStatus: null,
      currentPeriodEnd: new Date(periodA * 1000).toISOString(),
      provider: "stripe",
      kind: PRO_KIND,
    });
    expect(await webhookRow(createdEventId)).toHaveLength(1);
    expect((await getQuotaState(mainOrgId)).pro).toBe(true);
  });

  it("does not reprocess a replayed webhook event id", async () => {
    const response = await post(createdEvent);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, duplicate: true });
    expect(await audits(mainOrgId)).toHaveLength(1);
    const row = await entitlement(mainOrgId);
    expect(new Date(row.updated_at).toISOString()).toBe(new Date(baseUnix * 1000).toISOString());
  });

  it("rejects an invalid signature without granting entitlement", async () => {
    const response = await post(null);
    expect(response.status).toBe(401);
    expect(await entitlement(invalidSigOrgId)).toBeNull();
    expect(await audits(invalidSigOrgId)).toHaveLength(0);
  });

  it("ignores invalid kind, missing org id, and non-positive period end without DB writes", async () => {
    const kindEventId = nextEventId();
    const kindResponse = await post(subscriptionEvent({
      eventId: kindEventId,
      created: baseUnix + 10,
      type: "customer.subscription.updated",
      orgId: invalidKindOrgId,
      kind: "one_time_product",
      subscriptionId: randomUUID(),
    }));
    expect(kindResponse.status).toBe(200);
    expect(await entitlement(invalidKindOrgId)).toBeNull();
    expect(await audits(invalidKindOrgId)).toHaveLength(0);

    const missingOrgEventId = nextEventId();
    const missingOrgResponse = await post(subscriptionEvent({
      eventId: missingOrgEventId,
      created: baseUnix + 20,
      type: "customer.subscription.updated",
      orgId: null,
      subscriptionId: randomUUID(),
    }));
    expect(missingOrgResponse.status).toBe(200);
    const { rows: missingOrgAudits } = await admin.query(
      "select id from audit_events where metadata->>'eventId' = $1",
      [missingOrgEventId],
    );
    expect(missingOrgAudits).toHaveLength(0);

    const badPeriodEventId = nextEventId();
    const badPeriodResponse = await post(subscriptionEvent({
      eventId: badPeriodEventId,
      created: baseUnix + 30,
      type: "customer.subscription.updated",
      orgId: badPeriodOrgId,
      subscriptionId: randomUUID(),
      periodEnd: 0,
    }));
    expect(badPeriodResponse.status).toBe(200);
    expect(await entitlement(badPeriodOrgId)).toBeNull();
    expect(await audits(badPeriodOrgId)).toHaveLength(0);
  });

  it("renews an active subscription with a later period end", async () => {
    const eventId = nextEventId();
    const response = await post(subscriptionEvent({
      eventId,
      created: baseUnix + 3_600,
      type: "customer.subscription.updated",
      orgId: mainOrgId,
      subscriptionId,
      status: "active",
      periodEnd: periodB,
    }));
    expect(response.status).toBe(200);
    const row = await entitlement(mainOrgId);
    expect(row.status).toBe("active");
    expect(new Date(row.current_period_end).toISOString()).toBe(new Date(periodB * 1000).toISOString());
    const rows = await audits(mainOrgId);
    expect(rows).toHaveLength(2);
    const renewal = rows.find((auditRow) => auditRow.metadata.eventId === eventId);
    expect(renewal?.action).toBe("billing.subscription_renewed");
    expect(renewal?.metadata.previousStatus).toBe("active");
    expect((await getQuotaState(mainOrgId)).pro).toBe(true);
  });

  it("moves entitlement to past_due and drops Pro access", async () => {
    const eventId = nextEventId();
    const response = await post(subscriptionEvent({
      eventId,
      created: baseUnix + 7_200,
      type: "customer.subscription.updated",
      orgId: mainOrgId,
      subscriptionId,
      status: "past_due",
      periodEnd: periodB,
    }));
    expect(response.status).toBe(200);
    expect((await entitlement(mainOrgId)).status).toBe("past_due");
    const rows = await audits(mainOrgId);
    expect(rows.find((auditRow) => auditRow.metadata.eventId === eventId)?.action).toBe("billing.subscription_past_due");
    expect((await getQuotaState(mainOrgId)).pro).toBe(false);
  });

  it("cancels entitlement on a deleted subscription event", async () => {
    const eventId = nextEventId();
    const response = await post(subscriptionEvent({
      eventId,
      created: baseUnix + 10_800,
      type: "customer.subscription.deleted",
      orgId: mainOrgId,
      subscriptionId,
      status: "active",
      periodEnd: periodB,
    }));
    expect(response.status).toBe(200);
    expect((await entitlement(mainOrgId)).status).toBe("canceled");
    const rows = await audits(mainOrgId);
    expect(rows.find((auditRow) => auditRow.metadata.eventId === eventId)?.action).toBe("billing.subscription_canceled");
    expect((await getQuotaState(mainOrgId)).pro).toBe(false);
  });

  it("does not regress an active entitlement with an older stale event", async () => {
    const staleSubscriptionId = randomUUID();
    const firstEventId = nextEventId();
    expect((await post(subscriptionEvent({
      eventId: firstEventId,
      created: baseUnix,
      type: "customer.subscription.created",
      orgId: staleOrgId,
      subscriptionId: staleSubscriptionId,
      status: "active",
      periodEnd: periodA,
    }))).status).toBe(200);

    const staleEventId = nextEventId();
    const response = await post(subscriptionEvent({
      eventId: staleEventId,
      created: baseUnix - 3_600,
      type: "customer.subscription.updated",
      orgId: staleOrgId,
      subscriptionId: staleSubscriptionId,
      status: "past_due",
      periodEnd: periodA,
    }));
    expect(response.status).toBe(200);
    const row = await entitlement(staleOrgId);
    expect(row.status).toBe("active");
    expect(new Date(row.updated_at).toISOString()).toBe(new Date(baseUnix * 1000).toISOString());
    const rows = await audits(staleOrgId);
    expect(rows).toHaveLength(1);
    expect(rows.some((auditRow) => auditRow.metadata.eventId === staleEventId)).toBe(false);
  });

  it("does not let a different older subscription cancel the newer one", async () => {
    const olderSubscriptionId = randomUUID();
    const eventId = nextEventId();
    const response = await post(subscriptionEvent({
      eventId,
      created: baseUnix + 3_600,
      type: "customer.subscription.deleted",
      orgId: staleOrgId,
      subscriptionId: olderSubscriptionId,
      status: "active",
      periodEnd: periodA,
    }));
    expect(response.status).toBe(200);
    const row = await entitlement(staleOrgId);
    expect(row.status).toBe("active");
    expect(row.stripe_subscription_id).not.toBe(olderSubscriptionId);
    const rows = await audits(staleOrgId);
    expect(rows).toHaveLength(1);
    expect(rows.some((auditRow) => auditRow.metadata.eventId === eventId)).toBe(false);
  });

  it("keeps Pro checkout sessions out of the one-time order path", async () => {
    const eventId = nextEventId();
    const response = await post(checkoutEvent({
      eventId,
      sessionId: `cs_pro_${suffix}`,
      orgId: checkoutOrgId,
      kind: PRO_KIND,
      productId: randomUUID(),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(await entitlement(checkoutOrgId)).toBeNull();
    expect(await audits(checkoutOrgId)).toHaveLength(0);
    expect(await orgCount("orders", checkoutOrgId)).toBe(0);
    expect(await orgCount("ledger_entries", checkoutOrgId)).toBe(0);
    expect(await webhookRow(eventId)).toHaveLength(1);
  });

  it("still dispatches one-time checkout sessions to the existing paid handler", async () => {
    const eventId = nextEventId();
    const response = await post(checkoutEvent({
      eventId,
      sessionId: `cs_one_time_${suffix}`,
      orgId: checkoutOrgId,
      productId: randomUUID(),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(await entitlement(checkoutOrgId)).toBeNull();
    expect(await orgCount("orders", checkoutOrgId)).toBe(0);
    expect(await webhookRow(eventId)).toHaveLength(1);
  });

  it("keeps the entitlement module free of one-time sale internals", () => {
    const source = readFileSync("src/lib/billing/subscription-entitlement.ts", "utf8");
    for (const forbidden of ["saleLines", "computeSplit", "ledgerEntries", "orders", "products"]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
