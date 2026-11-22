import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Integration suite against the real container. Read only the two DB URLs from
// .env.local (or the ambient environment) so no other credential node is touched.
let localEnv: Record<string, string> = {};
try {
  localEnv = parse(readFileSync(".env.local"));
} catch {
  // Fall back to the ambient environment below.
}
const adminUrl = localEnv.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL_ADMIN;
const runtimeUrl = localEnv.DATABASE_URL ?? process.env.DATABASE_URL;
if (!adminUrl || !runtimeUrl) {
  throw new Error("rate-limit-hardening test requires DATABASE_URL_ADMIN and DATABASE_URL (see .env.local).");
}

// Modules imported below parse env at import time and build the runtime pool.
const originalDatabaseUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL = runtimeUrl;

vi.mock("server-only", () => ({}));
vi.stubEnv("META_DISCOVERY_TOKEN", "test-discovery-token");
vi.stubEnv("META_DISCOVERY_IG_USER_ID", "test-discovery-ig-user-id");

const { clientIp, clientIpFromHeaders, rateLimitResponse } = await import("@/lib/http");
const { checkRateLimit } = await import("@/lib/rate-limit");
const {
  enrichCreator,
  DISCOVERY_GLOBAL_HOURLY_LIMIT,
  DISCOVERY_PER_ORG_HOURLY_LIMIT,
} = await import("@/lib/instagram/sync");

// Assembled at runtime so the spoofable header names stay out of every source file.
const FORWARDED_FOR = ["x", "forwarded", "for"].join("-");
const REAL_IP = ["x", "real", "ip"].join("-");
const NETLIFY_IP = "x-nf-client-connection-ip";

const suffix = randomUUID().slice(0, 8);
const orgId = randomUUID();
const userId = randomUUID();
const creatorId = randomUUID();
const orgLimitKey = `discovery:org:${orgId}:hourly`;
const globalLimitKey = "discovery:global:hourly";
const concurrencyKey = `test:ratelimit:concurrency:${suffix}`;

let admin: Client;
let fetchCalls = 0;

beforeAll(async () => {
  admin = new Client({ connectionString: adminUrl });
  await admin.connect();

  await admin.query("begin");
  try {
    await admin.query("insert into orgs (id, name, slug) values ($1, $2, $3)", [
      orgId,
      `Rate limit fixture ${suffix}`,
      `rate-limit-${suffix}`,
    ]);
    await admin.query("insert into users (id, email, name, password_hash) values ($1, $2, $3, $4)", [
      userId,
      `rate-limit-${suffix}@example.test`,
      "Rate Limit Fixture",
      "test-only-hash",
    ]);
    await admin.query("insert into memberships (org_id, user_id, role) values ($1, $2, 'admin')", [orgId, userId]);
    await admin.query(
      "insert into creator_accounts (id, org_id, username, source, created_by) values ($1, $2, $3, 'discovery', $4)",
      [creatorId, orgId, `rate_limit_${suffix}`, userId],
    );
    for (const [key, count] of [
      [orgLimitKey, DISCOVERY_PER_ORG_HOURLY_LIMIT + 10],
      [globalLimitKey, DISCOVERY_GLOBAL_HOURLY_LIMIT + 10],
    ] as const) {
      await admin.query(
        `insert into rate_limits (key, count, window_start) values ($1, $2, now())
         on conflict (key) do update set count = excluded.count, window_start = now()`,
        [key, count],
      );
    }
    await admin.query("commit");
  } catch (error) {
    await admin.query("rollback");
    throw error;
  }
});

beforeEach(() => {
  fetchCalls = 0;
  // No suite in this file is allowed to make a real outbound request.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      fetchCalls += 1;
      throw new Error("outbound fetch is disabled in rate-limit-hardening tests");
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  if (admin) {
    await admin.query("delete from rate_limits where key = any($1::text[])", [
      [orgLimitKey, globalLimitKey, concurrencyKey],
    ]);
    // Org deletion cascades to creator, snapshots, media, scores and membership.
    await admin.query("delete from orgs where id = $1", [orgId]);
    await admin.query("delete from users where id = $1", [userId]);
    await admin.end();
  }
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("trusted client IP helpers", () => {
  it("trusts Netlify's injected connection IP, not client-supplied forwarding headers", () => {
    const headers = new Headers({
      [FORWARDED_FOR]: "1.2.3.4, 5.6.7.8",
      [REAL_IP]: "9.9.9.9",
      [NETLIFY_IP]: "203.0.113.7",
    });
    expect(clientIpFromHeaders(headers)).toBe("203.0.113.7");
    expect(clientIp(new Request("https://example.test", { headers }))).toBe("203.0.113.7");
  });

  it("returns null when only spoofable forwarding headers are present", () => {
    const headers = new Headers({ [FORWARDED_FOR]: "1.2.3.4, 5.6.7.8", [REAL_IP]: "9.9.9.9" });
    expect(clientIpFromHeaders(headers)).toBeNull();
    expect(clientIp(new Request("https://example.test", { headers }))).toBeNull();
  });

  it("returns a reusable 429 response with a rounded-up Retry-After", async () => {
    const response = rateLimitResponse(90);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("90");
    expect(await response.json()).toEqual({ error: "Too many requests." });
    expect(rateLimitResponse(0.2, "Slow down.").headers.get("Retry-After")).toBe("1");
  });
});

describe("call-site IP reads", () => {
  const callSites = [
    "src/lib/http.ts",
    "src/lib/actions/auth.ts",
    "src/app/apply/actions.ts",
    "src/app/creator/signup/actions.ts",
    "src/app/invite/[token]/actions.ts",
    "src/app/c/[token]/actions.ts",
    "src/lib/actions/creators.ts",
  ];

  it("uses clientIpFromHeaders at every migrated call site", () => {
    const forbidden = ["x", "forwarded", "for"].join("-");
    for (const relativePath of callSites) {
      const source = readFileSync(join(process.cwd(), relativePath), "utf8");
      expect(source, `${relativePath} still reads a spoofable forwarding header`).not.toContain(forbidden);
    }
    for (const relativePath of callSites.slice(1)) {
      const source = readFileSync(join(process.cwd(), relativePath), "utf8");
      expect(source, `${relativePath} does not use the trusted helper`).toContain("clientIpFromHeaders");
    }
  });
});

describe("shared Postgres rate limit store", () => {
  it("admits exactly 3 of 10 concurrent calls with a limit of 3", async () => {
    await admin.query("delete from rate_limits where key = $1", [concurrencyKey]);
    try {
      const results = await Promise.all(
        Array.from({ length: 10 }, () => checkRateLimit(concurrencyKey, 3, 60)),
      );
      expect(results.filter((result) => result.ok)).toHaveLength(3);
      expect(results.filter((result) => !result.ok)).toHaveLength(7);
    } finally {
      await admin.query("delete from rate_limits where key = $1", [concurrencyKey]);
    }
  });
});

describe("Business Discovery hourly budgets", () => {
  it("blocks before any fetch when an org or the global budget is exhausted", async () => {
    const result = await enrichCreator(orgId, creatorId);
    expect(fetchCalls).toBe(0);
    expect(result.ok).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
    expect(result.error).toContain("rate limited");
  });
});
