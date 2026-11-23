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
  throw new Error("rate-limit-rls-policy test requires DATABASE_URL_ADMIN (see .env.local).");
}

const up = readFileSync("drizzle/0008_rate_limits_runtime_policy.sql", "utf8");
const down = readFileSync("drizzle/down/0008_rate_limits_runtime_policy.sql", "utf8");

describe("rate_limits runtime RLS policy migration", () => {
  let admin: Client;

  beforeAll(async () => {
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
  });

  afterAll(async () => {
    await admin.end();
  });

  it("lets the runtime role upsert while RLS is enabled", async () => {
    const key = `test:ratelimit:rls:${randomUUID()}`;
    await admin.query("begin");
    try {
      await admin.query("alter table rate_limits enable row level security");
      await admin.query("alter table rate_limits force row level security");
      await admin.query(up);
      await admin.query("set local role vistabix_app");
      const result = await admin.query(
        `insert into rate_limits (key, count, window_start)
         values ($1, 1, now())
         on conflict (key) do update set count = rate_limits.count + 1
         returning count`,
        [key],
      );
      expect(result.rows[0]?.count).toBe(1);
      await admin.query("reset role");
    } finally {
      await admin.query("rollback");
    }
  });

  it("can be rolled back, restoring the RLS denial", async () => {
    const key = `test:ratelimit:rls-down:${randomUUID()}`;
    await admin.query("begin");
    try {
      await admin.query("alter table rate_limits enable row level security");
      await admin.query("alter table rate_limits force row level security");
      await admin.query(up);
      await admin.query(down);
      await admin.query("set local role vistabix_app");
      await expect(
        admin.query("insert into rate_limits (key, count, window_start) values ($1, 1, now())", [key]),
      ).rejects.toThrow(/row-level security|policy/i);
    } finally {
      await admin.query("rollback");
    }
  });
});
