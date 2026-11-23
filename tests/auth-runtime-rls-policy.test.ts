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
  throw new Error("auth-runtime-rls-policy test requires DATABASE_URL_ADMIN (see .env.local).");
}

const up = readFileSync("drizzle/0009_auth_runtime_rls_policies.sql", "utf8");
const down = readFileSync("drizzle/down/0009_auth_runtime_rls_policies.sql", "utf8");
const authTables = ["users", "memberships", "orgs", "sessions"];

describe("auth runtime RLS policy migration", () => {
  let admin: Client;

  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
  });

  afterAll(async () => {
    await admin.end();
  });

  it("lets the runtime role create and read a user while RLS is enabled", async () => {
    const email = `rls-auth-test-${randomUUID()}@example.invalid`;
    await admin.query("begin");
    try {
      await admin.query("alter table users enable row level security");
      await admin.query(up);
      await admin.query("set local role vistabix_app");
      const inserted = await admin.query(
        "insert into users (email, name, password_hash) values ($1, $2, $3) returning id",
        [email, "RLS Test", "test-hash"],
      );
      expect(inserted.rows[0]?.id).toBeTruthy();
      const found = await admin.query("select id from users where email = $1", [email]);
      expect(found.rowCount).toBe(1);
      await admin.query("reset role");

      const policies = await admin.query(
        "select tablename, policyname from pg_policies where policyname = 'auth_runtime' and tablename = any($1) order by tablename",
        [authTables],
      );
      expect(policies.rows.map((row) => row.tablename)).toEqual([...authTables].sort());
    } finally {
      await admin.query("rollback");
    }
  });

  it("can be rolled back, restoring the RLS denial", async () => {
    const email = `rls-auth-down-${randomUUID()}@example.invalid`;
    await admin.query("begin");
    try {
      await admin.query("alter table users enable row level security");
      await admin.query(up);
      await admin.query(down);
      await admin.query("set local role vistabix_app");
      await expect(
        admin.query("insert into users (email, name, password_hash) values ($1, $2, $3)", [email, "RLS Test", "test-hash"]),
      ).rejects.toThrow(/row-level security|policy/i);
    } finally {
      await admin.query("rollback");
    }
  });
});
