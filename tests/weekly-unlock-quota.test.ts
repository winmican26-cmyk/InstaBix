import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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
  throw new Error("weekly-unlock-quota test requires DATABASE_URL_ADMIN and DATABASE_URL (see .env.local).");
}

// Modules imported below parse env at import time and build the runtime pool.
const originalDatabaseUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL = runtimeUrl;

vi.mock("server-only", () => ({}));

const { getQuotaState, hasUnlocked, unlockCreator, weekStartUtc } = await import("@/lib/billing/quota");

const suffix = randomUUID().slice(0, 8);
const orgA = randomUUID();
const orgB = randomUUID();
const userId = randomUUID();
const orgIds = [orgA, orgB];
const creatorIds = Array.from({ length: 15 }, () => randomUUID());
const orgBCreatorIds = Array.from({ length: 3 }, () => randomUUID());
const midweek = (yyyyMmDd: string): Date => new Date(`${yyyyMmDd}T12:00:00.000Z`);

let admin: Client;

beforeAll(async () => {
  admin = new Client({ connectionString: adminUrl });
  await admin.connect();

  await admin.query("begin");
  try {
    await admin.query("insert into orgs (id, name, slug) values ($1, $2, $3), ($4, $5, $6)", [
      orgA,
      `Weekly quota org A ${suffix}`,
      `weekly-quota-a-${suffix}`,
      orgB,
      `Weekly quota org B ${suffix}`,
      `weekly-quota-b-${suffix}`,
    ]);
    await admin.query("insert into users (id, email, name, password_hash) values ($1, $2, $3, $4)", [
      userId,
      `weekly-quota-${suffix}@example.test`,
      "Weekly Quota Fixture Operator",
      "test-only-hash",
    ]);
    for (const [index, creatorId] of creatorIds.entries()) {
      await admin.query(
        "insert into creator_accounts (id, org_id, username, source, created_by) values ($1, $2, $3, 'manual', $4)",
        [creatorId, orgA, `quota_a_${suffix}_${String(index).padStart(2, "0")}`, userId],
      );
    }
    for (const [index, creatorId] of orgBCreatorIds.entries()) {
      await admin.query(
        "insert into creator_accounts (id, org_id, username, source, created_by) values ($1, $2, $3, 'manual', $4)",
        [creatorId, orgB, `quota_b_${suffix}_${String(index).padStart(2, "0")}`, userId],
      );
    }
    for (const orgId of orgIds) {
      await admin.query(
        "insert into org_entitlements (org_id, plan, status) values ($1, 'free', 'inactive')",
        [orgId],
      );
    }
    await admin.query("commit");
  } catch (error) {
    await admin.query("rollback");
    throw error;
  }
});

afterAll(async () => {
  if (admin) {
    await admin.query("delete from orgs where id = any($1::uuid[])", [orgIds]);
    await admin.query("delete from users where id = $1", [userId]);
    await admin.end();
  }
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
});

async function setEntitlement(orgId: string, plan: string, status: string, periodEnd: Date | null): Promise<void> {
  await admin.query(
    `insert into org_entitlements (org_id, plan, status, current_period_end)
     values ($1, $2, $3, $4)
     on conflict (org_id) do update
       set plan = excluded.plan, status = excluded.status,
           current_period_end = excluded.current_period_end, updated_at = now()`,
    [orgId, plan, status, periodEnd],
  );
}

async function unlockRowCount(orgId: string, weekStart: string): Promise<number> {
  const result = await admin.query<{ count: string }>(
    "select count(*)::text as count from creator_unlocks where org_id = $1 and week_start::text = $2",
    [orgId, weekStart],
  );
  return Number(result.rows[0]?.count ?? "0");
}

async function unlockDistinctCreators(
  orgId: string,
  now: Date,
  count: number,
): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await unlockCreator(orgId, userId, creatorIds[index]!, now);
  }
}

describe("weekly creator unlock quota", () => {
  it("computes the UTC ISO week starting Monday, including Sunday inputs", () => {
    expect(weekStartUtc(new Date("2026-01-05T00:00:00.000Z"))).toBe("2026-01-05");
    expect(weekStartUtc(new Date("2026-01-05T00:00:00.001Z"))).toBe("2026-01-05");
    expect(weekStartUtc(new Date("2026-01-07T12:34:56.000Z"))).toBe("2026-01-05");
    expect(weekStartUtc(new Date("2026-01-11T23:59:59.000Z"))).toBe("2026-01-05");
    expect(weekStartUtc(new Date("2026-01-04T23:59:59.000Z"))).toBe("2025-12-29");
    // The ISO week follows UTC, not the browser's local date.
    expect(weekStartUtc(new Date("2026-01-11T23:30:00-05:00"))).toBe("2026-01-12");
  });

  it("admits 10 distinct unlocks, rejects the 11th and persists no extra row", async () => {
    await setEntitlement(orgA, "free", "inactive", null);
    const now = midweek("2026-01-07");
    for (let index = 0; index < 10; index += 1) {
      expect(await unlockCreator(orgA, userId, creatorIds[index]!, now)).toEqual({
        ok: true,
        used: index + 1,
        remaining: 9 - index,
        weekStart: "2026-01-05",
      });
    }

    expect(await unlockCreator(orgA, userId, creatorIds[10]!, now)).toMatchObject({
      ok: false,
      reason: "quota_exceeded",
      limit: 10,
      weekStart: "2026-01-05",
    });
    expect(await unlockRowCount(orgA, "2026-01-05")).toBe(10);
    expect(await getQuotaState(orgA, now)).toEqual({
      plan: "free",
      status: "inactive",
      pro: false,
      limit: 10,
      used: 10,
      remaining: 0,
      weekStart: "2026-01-05",
    });
  });

  it("does not consume a second slot on a repeat unlock and scopes hasUnlocked", async () => {
    await setEntitlement(orgA, "free", "inactive", null);
    const now = midweek("2026-01-14");
    const first = await unlockCreator(orgA, userId, creatorIds[0]!, now);
    const second = await unlockCreator(orgA, userId, creatorIds[0]!, now);
    expect(first).toEqual({ ok: true, used: 1, remaining: 9, weekStart: "2026-01-12" });
    expect(second).toEqual(first);
    expect((await getQuotaState(orgA, now)).used).toBe(1);
    expect(await unlockRowCount(orgA, "2026-01-12")).toBe(1);

    expect(await hasUnlocked(orgA, creatorIds[0]!, now)).toBe(true);
    expect(await hasUnlocked(orgB, creatorIds[0]!, now)).toBe(false);
    expect(await hasUnlocked(orgA, creatorIds[0]!, midweek("2026-01-21"))).toBe(false);
    expect(await hasUnlocked(orgA, creatorIds[1]!, now)).toBe(false);
  });

  it("admits exactly 10 of 15 concurrent unlocks", async () => {
    await setEntitlement(orgA, "free", "inactive", null);
    const now = midweek("2026-01-21");
    const results = await Promise.all(
      creatorIds.map((creatorId) => unlockCreator(orgA, userId, creatorId, now)),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(10);
    const denied = results.filter((result) => !result.ok);
    expect(denied).toHaveLength(5);
    expect(denied.every((result) => result.ok === false && result.reason === "quota_exceeded")).toBe(true);
    expect(await unlockRowCount(orgA, "2026-01-19")).toBe(10);
    expect((await getQuotaState(orgA, now)).used).toBe(10);
  });

  it("lets an active Pro entitlement bypass the cap but keeps limit at 10", async () => {
    await setEntitlement(orgA, "pro", "active", new Date("2026-12-31T00:00:00.000Z"));
    const now = midweek("2026-01-28");
    const results = await Promise.all(
      creatorIds.map((creatorId) => unlockCreator(orgA, userId, creatorId, now)),
    );
    expect(results.every((result) => result.ok)).toBe(true);
    expect(await unlockRowCount(orgA, "2026-01-26")).toBe(15);
    expect(await getQuotaState(orgA, now)).toEqual({
      plan: "pro",
      status: "active",
      pro: true,
      limit: 10,
      used: 15,
      remaining: 0,
      weekStart: "2026-01-26",
    });
  });

  it("does not bypass the cap for an expired period or a past_due status", async () => {
    await setEntitlement(orgA, "pro", "active", new Date("2026-01-01T00:00:00.000Z"));
    const expiredNow = midweek("2026-02-04");
    expect((await getQuotaState(orgA, expiredNow)).pro).toBe(false);
    await unlockDistinctCreators(orgA, expiredNow, 10);
    expect(await unlockCreator(orgA, userId, creatorIds[10]!, expiredNow)).toMatchObject({
      ok: false,
      reason: "quota_exceeded",
    });
    expect(await unlockRowCount(orgA, "2026-02-02")).toBe(10);

    await setEntitlement(orgA, "pro", "past_due", new Date("2026-12-31T00:00:00.000Z"));
    const pastDueNow = midweek("2026-02-11");
    expect((await getQuotaState(orgA, pastDueNow)).pro).toBe(false);
    await unlockDistinctCreators(orgA, pastDueNow, 10);
    expect(await unlockCreator(orgA, userId, creatorIds[10]!, pastDueNow)).toMatchObject({
      ok: false,
      reason: "quota_exceeded",
    });
    expect(await unlockRowCount(orgA, "2026-02-09")).toBe(10);
  });

  it("counts each organisation independently", async () => {
    await setEntitlement(orgA, "free", "inactive", null);
    await setEntitlement(orgB, "free", "inactive", null);
    const now = midweek("2026-02-18");
    await unlockDistinctCreators(orgA, now, 10);

    expect(await unlockCreator(orgB, userId, orgBCreatorIds[0]!, now)).toMatchObject({
      ok: true,
      used: 1,
      remaining: 9,
      weekStart: "2026-02-16",
    });
    expect(await unlockCreator(orgB, userId, orgBCreatorIds[1]!, now)).toMatchObject({
      ok: true,
      used: 2,
      remaining: 8,
      weekStart: "2026-02-16",
    });
    expect(await getQuotaState(orgB, now)).toEqual({
      plan: "free",
      status: "inactive",
      pro: false,
      limit: 10,
      used: 2,
      remaining: 8,
      weekStart: "2026-02-16",
    });
    expect(await unlockRowCount(orgA, "2026-02-16")).toBe(10);
    expect(await unlockRowCount(orgB, "2026-02-16")).toBe(2);
  });
});
