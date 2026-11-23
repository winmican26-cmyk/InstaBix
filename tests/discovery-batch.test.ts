import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeBatchPayload } from "@/lib/discovery/batch-response";

// Integration suite against the real container. Only the two DB URLs are read
// from .env.local so no other credential node is touched.
let localEnv: Record<string, string> = {};
try {
  localEnv = parse(readFileSync(".env.local"));
} catch {
  // Fall back to the ambient environment below.
}
const adminUrl = localEnv.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL_ADMIN;
const runtimeUrl = localEnv.DATABASE_URL ?? process.env.DATABASE_URL;
if (!adminUrl || !runtimeUrl) {
  throw new Error("discovery-batch test requires DATABASE_URL_ADMIN and DATABASE_URL (see .env.local).");
}

const originalDatabaseUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL = runtimeUrl;

vi.mock("server-only", () => ({}));
vi.stubEnv("META_DISCOVERY_TOKEN", "test-discovery-token");
vi.stubEnv("META_DISCOVERY_IG_USER_ID", "test-discovery-ig-user-id");

const { enrichCreatorMock } = vi.hoisted(() => ({ enrichCreatorMock: vi.fn() }));
vi.mock("@/lib/instagram/sync", () => ({ enrichCreator: enrichCreatorMock }));

const { DISCOVERY_BATCH_LIMIT, parseHandles } = await import("@/lib/discovery/parse-handles");
const { runDiscoveryBatch } = await import("@/lib/discovery/batch");

const suffix = randomUUID().slice(0, 8);
const orgId = randomUUID();
const userId = randomUUID();
const grantedCreatorId = randomUUID();
const pendingCreatorId = randomUUID();
const grantedUsername = `granted_${suffix}`;
const pendingUsername = `pending_${suffix}`;

let admin: Client;

beforeAll(async () => {
  admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query("begin");
  try {
    await admin.query("insert into orgs (id, name, slug) values ($1, $2, $3)", [
      orgId,
      `Discovery batch fixture ${suffix}`,
      `discovery-batch-${suffix}`,
    ]);
    await admin.query("insert into users (id, email, name, password_hash) values ($1, $2, $3, $4)", [
      userId,
      `discovery-batch-${suffix}@example.test`,
      "Discovery Batch Fixture",
      "test-only-hash",
    ]);
    await admin.query("insert into memberships (org_id, user_id, role) values ($1, $2, 'admin')", [orgId, userId]);
    await admin.query(
      `insert into creator_accounts (id, org_id, username, source, consent_status, created_by)
       values ($1, $2, $3, 'discovery', 'granted', $4), ($5, $2, $6, 'discovery', 'pending', $4)`,
      [grantedCreatorId, orgId, grantedUsername, userId, pendingCreatorId, pendingUsername],
    );
    await admin.query("commit");
  } catch (error) {
    await admin.query("rollback");
    throw error;
  }
});

beforeEach(() => {
  enrichCreatorMock.mockReset();
  // No suite in this file may make a real outbound request.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("outbound fetch is disabled in discovery-batch tests");
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  if (admin) {
    await admin.query("delete from audit_events where org_id = $1", [orgId]);
    await admin.query("delete from orgs where id = $1", [orgId]);
    await admin.query("delete from users where id = $1", [userId]);
    await admin.end();
  }
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("parseHandles", () => {
  it("splits mixed separators, strips @ and URL wrappers, and normalizes case", () => {
    expect(
      parseHandles("@Alpha, beta; gamma\n delta\tepsilon").handles,
    ).toEqual(["alpha", "beta", "gamma", "delta", "epsilon"]);
    expect(
      parseHandles("https://www.instagram.com/Foo/?igsh=abc  https://instagram.com/bar/#frag @BAZ/").handles,
    ).toEqual(["foo", "bar", "baz"]);
  });

  it("dedupes case-insensitively and preserves first-seen order", () => {
    expect(parseHandles("@Dup, dup; DUP, other").handles).toEqual(["dup", "other"]);
  });

  it("rejects invalid tokens and silently skips empty ones", () => {
    const parsed = parseHandles(["good_handle", "", "bad@handle!", "   ", "another-invalid!"]);
    expect(parsed.handles).toEqual(["good_handle"]);
    expect(parsed.rejected).toEqual(["bad@handle!", "another-invalid!"]);
  });

  it("does not truncate at 50; the cap belongs to the orchestrator", () => {
    const handles = Array.from({ length: DISCOVERY_BATCH_LIMIT + 1 }, (_, index) => `user_${index}`);
    expect(parseHandles(handles).handles).toHaveLength(DISCOVERY_BATCH_LIMIT + 1);
  });
});

describe("normalizeBatchPayload", () => {
  it("keeps per-handle statuses and the top-level error from a nested 429 body", () => {
    const items = [
      { handle: "someone", status: "rate_limited" as const, message: "Discovery is rate limited.", retryAfterSeconds: 90 },
    ];
    const rateLimit = { seconds: 90, message: "Discovery is rate limited. Try again shortly." };
    const normalized = normalizeBatchPayload(
      { error: "Discovery is rate limited. Try again shortly.", results: { items, rejected: ["bad@handle!"], rateLimit } },
      false,
    );

    expect(normalized.result).not.toBeNull();
    expect(normalized.result?.items).toEqual(items);
    expect(normalized.result?.rejected).toEqual(["bad@handle!"]);
    expect(normalized.result?.rateLimit).toEqual(rateLimit);
    expect(normalized.error).toBe("Discovery is rate limited. Try again shortly.");
  });

  it("normalizes a plain 200 body without an error", () => {
    const items = [{ handle: "new_handle", status: "pending" as const }];
    const normalized = normalizeBatchPayload({ items, rejected: [] }, true);
    expect(normalized.result?.items).toEqual(items);
    expect(normalized.result?.rejected).toEqual([]);
    expect(normalized.error).toBeNull();
  });

  it("reports a simple error with no result", () => {
    expect(normalizeBatchPayload({ error: "Bad request" }, false)).toEqual({ error: "Bad request", result: null });
  });

  it("does not throw on malformed payloads", () => {
    expect(normalizeBatchPayload(null, false)).toEqual({ error: "Import failed. Try again.", result: null });
    expect(normalizeBatchPayload({ items: "nope", error: 42 }, false)).toEqual({
      error: "Import failed. Try again.",
      result: null,
    });
    expect(normalizeBatchPayload({ results: { items: [], rejected: "nope" }, error: 42 }, false).result?.rejected).toEqual([]);
  });
});

describe("runDiscoveryBatch against Postgres", () => {
  it("enriches only granted creators, stores new/pending rows, collapses duplicates and rejects invalid tokens", async () => {
    enrichCreatorMock.mockResolvedValue({ ok: true, enriched: true, message: "Public metrics refreshed." });
    const newHandle = `fresh_${suffix}`;
    const input = [
      `@${grantedUsername}`,
      grantedUsername.toUpperCase(),
      `@${pendingUsername}`,
      `https://www.instagram.com/${newHandle}/?igsh=1`,
      `https://instagram.com/${newHandle}/`,
      "bad@handle!",
      "",
    ].join("\n");

    const result = await runDiscoveryBatch(orgId, userId, input);

    expect(result.items.map((item) => [item.handle, item.status])).toEqual([
      [grantedUsername, "enriched"],
      [pendingUsername, "pending"],
      [newHandle, "pending"],
    ]);
    expect(result.items[1]?.message).toContain("No Meta API call");
    expect(result.items[2]?.message).toContain("Consent must be collected");
    expect(enrichCreatorMock).toHaveBeenCalledTimes(1);
    expect(enrichCreatorMock).toHaveBeenCalledWith(orgId, grantedCreatorId);
    expect(result.rejected).toEqual(["bad@handle!"]);

    const stored = await admin.query(
      `select id, source, consent_status, status, created_by from creator_accounts
       where org_id = $1 and username = $2`,
      [orgId, newHandle],
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]).toMatchObject({
      source: "discovery",
      consent_status: "pending",
      status: "new",
      created_by: userId,
    });

    const audits = await admin.query(
      "select action, actor_user_id, metadata, ip from audit_events where org_id = $1 and entity_id = $2",
      [orgId, stored.rows[0].id],
    );
    expect(audits.rows).toHaveLength(1);
    expect(audits.rows[0]).toMatchObject({
      action: "creator.created",
      actor_user_id: userId,
      ip: null,
      metadata: { username: newHandle, source: "discovery", via: "batch" },
    });
  });

  it("rejects an over-limit batch before any enrichment", async () => {
    const handles = Array.from({ length: DISCOVERY_BATCH_LIMIT + 1 }, (_, index) => `bulk_${suffix}_${index}`);
    const result = await runDiscoveryBatch(orgId, userId, handles);
    expect(result.error).toBe("A batch can contain at most 50 unique handles.");
    expect(result.items).toEqual([]);
    expect(enrichCreatorMock).not.toHaveBeenCalled();
  });

  it("maps a rate-limited enrichment and exposes the maximum retry", async () => {
    enrichCreatorMock.mockResolvedValue({
      ok: false,
      error: "Discovery is rate limited. Try again shortly.",
      status: "rate_limited",
      retryAfterSeconds: 90,
    });
    const result = await runDiscoveryBatch(orgId, userId, `@${grantedUsername}`);
    expect(result.items[0]?.status).toBe("rate_limited");
    expect(result.items[0]?.retryAfterSeconds).toBe(90);
    expect(result.rateLimit?.seconds).toBe(90);
  });
});

describe("POST /api/discovery/batch", () => {
  const getWorkspace = vi.fn();
  const canReview = vi.fn();
  const runDiscoveryBatchRouteMock = vi.fn();
  let POST: (request: Request) => Promise<Response>;

  const workspace = { user: { id: userId }, org: { id: orgId }, role: "admin" };

  function post(body: unknown) {
    const host = "localhost:3000";
    return new Request(`https://${host}/api/discovery/batch`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: `https://${host}`,
        host,
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  }

  beforeAll(async () => {
    vi.doMock("@/lib/auth/session", () => ({ getWorkspace, canReview }));
    vi.doMock("@/lib/discovery/batch", () => ({ runDiscoveryBatch: runDiscoveryBatchRouteMock }));
    vi.resetModules();
    ({ POST } = await import("@/app/api/discovery/batch/route"));
  });

  afterAll(() => {
    vi.doUnmock("@/lib/auth/session");
    vi.doUnmock("@/lib/discovery/batch");
    vi.resetModules();
  });

  beforeEach(() => {
    getWorkspace.mockReset();
    canReview.mockReset();
    runDiscoveryBatchRouteMock.mockReset();
    getWorkspace.mockResolvedValue(workspace);
    canReview.mockReturnValue(true);
  });

  it("returns 401 when signed out", async () => {
    getWorkspace.mockResolvedValue(null);
    const response = await POST(post({ handles: "someone" }));
    expect(response.status).toBe(401);
    expect(runDiscoveryBatchRouteMock).not.toHaveBeenCalled();
  });

  it("returns 403 for a role without review rights", async () => {
    canReview.mockReturnValue(false);
    const response = await POST(post({ handles: "someone" }));
    expect(response.status).toBe(403);
    expect(runDiscoveryBatchRouteMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed body", async () => {
    const response = await POST(post("{not json"));
    expect(response.status).toBe(400);
  });

  it("returns 400 for more than 50 unique handles", async () => {
    const handles = Array.from({ length: DISCOVERY_BATCH_LIMIT + 1 }, (_, index) => `route_${index}`);
    const response = await POST(post({ handles }));
    expect(response.status).toBe(400);
    expect(runDiscoveryBatchRouteMock).not.toHaveBeenCalled();
  });

  it("returns 429 with Retry-After and results when rate limited", async () => {
    const result = {
      items: [],
      rejected: [],
      rateLimit: { seconds: 90, message: "Discovery is rate limited. Try again shortly." },
    };
    runDiscoveryBatchRouteMock.mockResolvedValue(result);
    const response = await POST(post({ handles: "someone" }));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("90");
    const body = (await response.json()) as { error: string; results: typeof result };
    expect(body.error).toBe(result.rateLimit.message);
    expect(body.results).toEqual(result);
  });

  it("returns 200 with per-handle results on success", async () => {
    const result = {
      items: [{ handle: "someone", status: "pending", message: "Consent must be collected before enrichment." }],
      rejected: ["bad@handle!"],
    };
    runDiscoveryBatchRouteMock.mockResolvedValue(result);
    const response = await POST(post({ handles: "@someone, bad@handle!" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
    expect(runDiscoveryBatchRouteMock).toHaveBeenCalledWith(orgId, userId, ["someone"]);
  });
});
