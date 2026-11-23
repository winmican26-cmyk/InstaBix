import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let localEnv: Record<string, string> = {};
try {
  localEnv = parse(readFileSync(".env.local"));
} catch {
  // Fall back to the ambient environment below.
}
const adminUrl = localEnv.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL_ADMIN;
if (!adminUrl) {
  throw new Error("creator-unlock-schema test requires DATABASE_URL_ADMIN (see .env.local).");
}

const up = readFileSync("drizzle/0010_creator_unlocks.sql", "utf8");
const down = readFileSync("drizzle/down/0010_creator_unlocks.sql", "utf8");
const newTables = ["creator_unlocks", "org_entitlements"];
const week = "2026-11-23"; // UTC Monday

describe("creator unlock schema migration", () => {
  let admin: Client;

  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
  });

  afterAll(async () => {
    await admin.end();
  });

  async function seedPrereqs() {
    const orgA = randomUUID();
    const orgB = randomUUID();
    const userA = randomUUID();
    const creatorA = randomUUID();
    const creatorB = randomUUID();
    const suffix = randomUUID();
    await admin.query("insert into orgs (id, name, slug) values ($1, $2, $3), ($4, $5, $6)", [
      orgA,
      `Org A ${suffix}`,
      `org-a-${suffix}`,
      orgB,
      `Org B ${suffix}`,
      `org-b-${suffix}`,
    ]);
    await admin.query("insert into users (id, email, name, password_hash) values ($1, $2, $3, $4)", [
      userA,
      `unlock-${suffix}@example.invalid`,
      "Unlock Test",
      "test-hash",
    ]);
    await admin.query(
      "insert into creator_accounts (id, org_id, username, source, created_by) "
        + "values ($1, $2, $3, 'manual', $4), ($5, $6, $7, 'manual', $4)",
      [creatorA, orgA, `creator-a-${suffix}`, userA, creatorB, orgB, `creator-b-${suffix}`],
    );
    return { orgA, orgB, userA, creatorA, creatorB };
  }

  async function asOrg(orgId: string) {
    await admin.query("reset role");
    await admin.query("select set_config('app.org_id', $1, true)", [orgId]);
    await admin.query("set local role vistabix_app");
  }

  // An expected SQL error aborts the transaction; a savepoint keeps the
  // surrounding test transaction usable so the final ROLLBACK is clean.
  async function expectFailure(sql: string, values: unknown[], matcher: RegExp | object, name: string) {
    await admin.query(`savepoint ${name}`);
    try {
      if (matcher instanceof RegExp) {
        await expect(admin.query(sql, values)).rejects.toThrow(matcher);
      } else {
        await expect(admin.query(sql, values)).rejects.toMatchObject(matcher);
      }
    } finally {
      await admin.query(`rollback to savepoint ${name}`);
    }
  }

  it("creates both tables with forced RLS and the expected policies", async () => {
    await admin.query("begin");
    try {
      await admin.query(up);

      const tables = await admin.query(
        "select relname, relrowsecurity, relforcerowsecurity from pg_class "
          + "where relname = any($1) and relnamespace = 'public'::regnamespace order by relname",
        [newTables],
      );
      expect(tables.rows.map((row: { relname: string }) => row.relname)).toEqual([...newTables].sort());
      for (const row of tables.rows) {
        expect(row.relrowsecurity).toBe(true);
        expect(row.relforcerowsecurity).toBe(true);
      }

      const policies = await admin.query(
        "select tablename, policyname, permissive, qual, with_check from pg_policies "
          + "where tablename = any($1) and schemaname = 'public' order by tablename, policyname",
        [newTables],
      );
      expect(policies.rows).toEqual(
        [...newTables].sort().flatMap((tablename) => [
          {
            tablename,
            policyname: "no_cross_tenant_when_scoped",
            permissive: "RESTRICTIVE",
            qual: expect.any(String),
            with_check: expect.any(String),
          },
          {
            tablename,
            policyname: "tenant_isolation",
            permissive: "PERMISSIVE",
            qual: expect.any(String),
            with_check: expect.any(String),
          },
        ]),
      );
      for (const policy of policies.rows) {
        expect(policy.qual).toContain("current_setting('app.org_id'");
        expect(policy.with_check).toContain("current_setting('app.org_id'");
      }
    } finally {
      await admin.query("rollback");
    }
  });

  it("enforces week uniqueness and tenant isolation on creator_unlocks", async () => {
    await admin.query("begin");
    try {
      await admin.query(up);
      const { orgA, orgB, userA, creatorA, creatorB } = await seedPrereqs();

      await asOrg(orgA);
      const inserted = await admin.query(
        "insert into creator_unlocks (org_id, creator_id, unlocked_by, week_start) "
          + "values ($1, $2, $3, $4) returning id",
        [orgA, creatorA, userA, week],
      );
      expect(inserted.rows[0]?.id).toBeTruthy();

      await expectFailure(
        "insert into creator_unlocks (org_id, creator_id, week_start) values ($1, $2, $3)",
        [orgA, creatorA, week],
        { code: "23505" },
        "duplicate_week",
      );

      await expectFailure(
        "insert into creator_unlocks (org_id, creator_id, week_start) values ($1, $2, $3)",
        [orgB, creatorB, week],
        /row-level security|policy/i,
        "cross_tenant_unlock",
      );

      // Org B can write its own row; org A must not see it.
      await asOrg(orgB);
      await admin.query(
        "insert into creator_unlocks (org_id, creator_id, week_start) values ($1, $2, $3)",
        [orgB, creatorB, week],
      );

      await asOrg(orgA);
      const visible = await admin.query(
        "select org_id, creator_id, to_char(week_start, 'YYYY-MM-DD') as week_start from creator_unlocks",
      );
      expect(visible.rows).toEqual([{ org_id: orgA, creator_id: creatorA, week_start: week }]);
    } finally {
      await admin.query("rollback");
    }
  });

  it("scopes org_entitlements to the active org", async () => {
    await admin.query("begin");
    try {
      await admin.query(up);
      const { orgA, orgB } = await seedPrereqs();

      await asOrg(orgA);
      const inserted = await admin.query(
        "insert into org_entitlements (org_id) values ($1) returning plan, status",
        [orgA],
      );
      expect(inserted.rows[0]).toEqual({ plan: "free", status: "inactive" });

      const readA = await admin.query("select org_id from org_entitlements");
      expect(readA.rows).toEqual([{ org_id: orgA }]);

      await expectFailure(
        "insert into org_entitlements (org_id) values ($1)",
        [orgB],
        /row-level security|policy/i,
        "cross_tenant_entitlement",
      );

      await asOrg(orgB);
      const readB = await admin.query("select org_id from org_entitlements");
      expect(readB.rows).toEqual([]);
      await admin.query("insert into org_entitlements (org_id) values ($1)", [orgB]);
      const readB2 = await admin.query("select org_id from org_entitlements");
      expect(readB2.rows).toEqual([{ org_id: orgB }]);
    } finally {
      await admin.query("rollback");
    }
  });

  it("down migration removes both tables and their policies", async () => {
    await admin.query("begin");
    try {
      await admin.query(up);
      await admin.query(down);

      const remainingTables = await admin.query(
        "select relname from pg_class where relname = any($1) and relnamespace = 'public'::regnamespace",
        [newTables],
      );
      expect(remainingTables.rows).toEqual([]);

      const remainingPolicies = await admin.query(
        "select policyname from pg_policies where tablename = any($1) and schemaname = 'public'",
        [newTables],
      );
      expect(remainingPolicies.rows).toEqual([]);
    } finally {
      await admin.query("rollback");
    }
  });
});
