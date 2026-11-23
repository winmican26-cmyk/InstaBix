import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
  throw new Error("consent-enforcement test requires DATABASE_URL_ADMIN and DATABASE_URL (see .env.local).");
}

// Modules imported below parse env at import time and build the runtime pool.
const originalDatabaseUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL = runtimeUrl;

vi.mock("server-only", () => ({}));
vi.stubEnv("META_DISCOVERY_TOKEN", "test-discovery-token");
vi.stubEnv("META_DISCOVERY_IG_USER_ID", "test-discovery-ig-user-id");

const { enrichCreator } = await import("@/lib/instagram/sync");
const { withOrg } = await import("@/lib/db");
const { readProductExport, formatProductExport } = await import("@/lib/products/export");

const suffix = randomUUID().slice(0, 8);
const orgId = randomUUID();
const userId = randomUUID();
const grantedCreatorId = randomUUID();
const pendingCreatorId = randomUUID();
const revokedCreatorId = randomUUID();
const productId = randomUUID();
const checkoutProductId = randomUUID();
const ledgerId = randomUUID();
const grantedUsername = `consent_granted_${suffix}`;
const pendingUsername = `consent_pending_${suffix}`;
const revokedUsername = `consent_revoked_${suffix}`;
const checkoutSessionId = `cs_test_${suffix}`;
const orgLimitKey = `discovery:org:${orgId}:hourly`;
const globalLimitKey = "discovery:global:hourly";

// Minimal official-shaped Business Discovery response. No real outbound request.
const discoveryPayload = {
  id: "17841400000000001",
  business_discovery: {
    id: "17841400000000001",
    username: grantedUsername,
    followers_count: 1200,
    media_count: 2,
    media: {
      data: [
        {
          id: `consent_media_1_${suffix}`,
          caption: "First public post",
          media_type: "IMAGE",
          permalink: "https://www.instagram.com/p/consent1/",
          thumbnail_url: "https://example.test/consent1.jpg",
          timestamp: "2026-01-20T12:00:00+0000",
          like_count: 42,
          comments_count: 5,
        },
        {
          id: `consent_media_2_${suffix}`,
          caption: "Second public post",
          media_type: "IMAGE",
          permalink: "https://www.instagram.com/p/consent2/",
          thumbnail_url: "https://example.test/consent2.jpg",
          timestamp: "2026-01-19T12:00:00+0000",
          like_count: 31,
          comments_count: 3,
        },
      ],
    },
  },
};

let admin: Client;
let fetchSpy: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  admin = new Client({ connectionString: adminUrl });
  await admin.connect();

  await admin.query("begin");
  try {
    await admin.query("insert into orgs (id, name, slug) values ($1, $2, $3)", [
      orgId,
      `Consent fixture ${suffix}`,
      `consent-${suffix}`,
    ]);
    await admin.query("insert into users (id, email, name, password_hash) values ($1, $2, $3, $4)", [
      userId,
      `consent-${suffix}@example.test`,
      "Consent Fixture Operator",
      "test-only-hash",
    ]);
    await admin.query("insert into memberships (org_id, user_id, role) values ($1, $2, 'admin')", [orgId, userId]);
    await admin.query(
      `insert into creator_accounts (id, org_id, username, source, created_by, consent_status)
       values ($1, $2, $3, 'discovery', $4, 'granted'),
              ($5, $2, $6, 'discovery', $4, 'pending'),
              ($7, $2, $8, 'discovery', $4, 'revoked')`,
      [
        grantedCreatorId,
        orgId,
        grantedUsername,
        userId,
        pendingCreatorId,
        pendingUsername,
        revokedCreatorId,
        revokedUsername,
      ],
    );
    await admin.query(
      "insert into products (id, org_id, creator_id, title, status) values ($1, $2, $3, $4, 'draft')",
      [productId, orgId, pendingCreatorId, `Pending creator draft ${suffix}`],
    );
    await admin.query(
      "insert into products (id, org_id, creator_id, title, status) values ($1, $2, $3, $4, 'published')",
      [checkoutProductId, orgId, pendingCreatorId, `Pending creator published ${suffix}`],
    );
    await admin.query(
      `insert into ledger_entries (id, org_id, creator_id, account, direction, amount_cents, memo)
       values ($1, $2, $3, 'creator_payable', 'credit', 1250, $4)`,
      [ledgerId, orgId, pendingCreatorId, `ledger fixture ${suffix}`],
    );
    // The granted-enrichment case must reach the Graph stub, not a leftover budget.
    await admin.query("delete from rate_limits where key = any($1::text[])", [[orgLimitKey, globalLimitKey]]);
    await admin.query("commit");
  } catch (error) {
    await admin.query("rollback");
    throw error;
  }
});

beforeEach(() => {
  fetchSpy = vi.fn(async () =>
    new Response(JSON.stringify(discoveryPayload), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  if (admin) {
    await admin.query("delete from rate_limits where key = any($1::text[])", [[orgLimitKey, globalLimitKey]]);
    await admin.query("delete from audit_events where org_id = $1", [orgId]);
    await admin.query("delete from ledger_entries where org_id = $1", [orgId]);
    await admin.query("delete from orders where org_id = $1", [orgId]);
    await admin.query("delete from products where org_id = $1", [orgId]);
    // Org deletion cascades to creators, snapshots, media, scores and membership.
    await admin.query("delete from orgs where id = $1", [orgId]);
    await admin.query("delete from users where id = $1", [userId]);
    await admin.end();
  }
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("enrichCreator central consent gate", () => {
  it("refuses a pending creator before any Graph request", async () => {
    const result = await enrichCreator(orgId, pendingCreatorId);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/consent/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses a revoked creator before any Graph request", async () => {
    const result = await enrichCreator(orgId, revokedCreatorId);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/consent/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("still enriches a granted creator through the official API", async () => {
    const result = await enrichCreator(orgId, grantedCreatorId);
    expect(result.ok, result.error).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]));
    expect(requestUrl.hostname).toBe("graph.facebook.com");
  });
});

describe("export routes and product export exclude non-granted creators", () => {
  const getWorkspace = vi.fn();
  const loggerInfo = vi.fn();
  const stripeCreate = vi.fn();
  let exportCreatorsGET: (request: Request) => Promise<Response>;
  let exportAllGET: (request: Request) => Promise<Response>;
  let exportLedgerGET: (request: Request) => Promise<Response>;
  let checkoutPOST: (request: Request) => Promise<Response>;

  beforeAll(async () => {
    vi.doMock("@/lib/auth/session", () => ({ getWorkspace }));
    vi.doMock("@/lib/logger", () => ({
      logger: { info: loggerInfo, warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
      errorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
    }));
    vi.doMock("@/lib/stripe/client", () => ({
      stripe: () => ({ checkout: { sessions: { create: stripeCreate } } }),
      verifyStripeSignature: () => null,
    }));
    vi.resetModules();
    ({ GET: exportCreatorsGET } = await import("@/app/api/export/creators/route"));
    ({ GET: exportAllGET } = await import("@/app/api/export/route"));
    ({ GET: exportLedgerGET } = await import("@/app/api/export/ledger/route"));
    ({ POST: checkoutPOST } = await import("@/app/api/checkout/route"));
  });

  afterAll(() => {
    vi.doUnmock("@/lib/auth/session");
    vi.doUnmock("@/lib/logger");
    vi.doUnmock("@/lib/stripe/client");
    vi.resetModules();
  });

  beforeEach(() => {
    getWorkspace.mockReset();
    loggerInfo.mockReset();
    stripeCreate.mockReset();
    getWorkspace.mockResolvedValue({
      user: { id: userId },
      org: { id: orgId, name: `Consent fixture ${suffix}`, slug: `consent-${suffix}` },
      role: "admin",
    });
    stripeCreate.mockResolvedValue({ id: checkoutSessionId, url: "https://checkout.example.test/session" });
  });

  it("creator CSV contains only the granted creator", async () => {
    const response = await exportCreatorsGET(new Request("https://localhost/api/export/creators"));
    expect(response.status).toBe(200);
    const csv = await response.text();
    expect(csv).toContain(grantedUsername);
    expect(csv).not.toContain(pendingUsername);
    expect(csv).not.toContain(revokedUsername);
  });

  it("workspace JSON export contains only the granted creator id but keeps financial rows", async () => {
    const response = await exportAllGET(new Request("https://localhost/api/export"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      creators: Array<{ id: string }>;
      ledgerEntries: Array<{ id: string; creatorId: string | null }>;
    };
    expect(body.creators.map((creator) => creator.id)).toEqual([grantedCreatorId]);
    expect(body.ledgerEntries.some((entry) => entry.id === ledgerId && entry.creatorId === pendingCreatorId)).toBe(true);
  });

  it("ledger CSV keeps the row but omits the non-granted creator username", async () => {
    const response = await exportLedgerGET(new Request("https://localhost/api/export/ledger"));
    expect(response.status).toBe(200);
    const csv = await response.text();
    const row = csv.split(/\r?\n/).find((line) => line.includes(ledgerId));
    expect(row).toBeDefined();
    expect(row).toContain(`ledger fixture ${suffix}`);
    expect(row).not.toContain(pendingUsername);
    // creator_username is the final column and is empty for a non-granted creator.
    expect(row?.endsWith(",")).toBe(true);
  });

  it("product export hides a non-granted creator and renders unknown", async () => {
    const exported = await withOrg(orgId, (tx) => readProductExport(tx, orgId, productId));
    expect(exported).not.toBeNull();
    expect(exported?.creator).toBeFalsy();
    expect(formatProductExport(exported!)).toContain("Creator: unknown");
  });

  it("checkout logs no creator username for a non-granted creator without blocking the sale", async () => {
    const host = "localhost:3000";
    const form = new FormData();
    form.set("productId", checkoutProductId);
    const response = await checkoutPOST(
      new Request(`https://${host}/api/checkout`, {
        method: "POST",
        headers: { origin: `https://${host}`, host },
        body: form,
      }),
    );
    expect(response.status).toBe(303);
    expect(stripeCreate).toHaveBeenCalledTimes(1);
    expect(loggerInfo).toHaveBeenCalledWith("checkout.created", expect.objectContaining({ creator: null }));
  });
});
