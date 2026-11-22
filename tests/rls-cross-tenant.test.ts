import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Integration suite against the real container. Read only the two DB URLs from
// .env.local so other credential nodes stay untouched for the rest of the suite.
let localEnv: Record<string, string> = {};
try {
  localEnv = parse(readFileSync(".env.local"));
} catch {
  // Fall back to the ambient environment below.
}
const adminUrl = localEnv.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL_ADMIN;
const runtimeUrl = localEnv.DATABASE_URL ?? process.env.DATABASE_URL;
if (!adminUrl || !runtimeUrl) {
  throw new Error("rls-cross-tenant test requires DATABASE_URL_ADMIN and DATABASE_URL (see .env.local).");
}
// Modules imported below parse env at import time and build the runtime pool.
process.env.DATABASE_URL = runtimeUrl;

const mockWorkspace = vi.hoisted(() => ({
  org: null as Record<string, unknown> | null,
  user: null as Record<string, unknown> | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({
  getWorkspace: async () => ({ org: mockWorkspace.org, user: mockWorkspace.user, role: "owner", sessionTokenHash: "test" }),
}));

const { GET } = await import("@/app/api/export/route");
const { getDashboard } = await import("@/lib/db/queries");

const suffix = randomUUID().slice(0, 8);
const orgA = randomUUID();
const orgB = randomUUID();
const userId = randomUUID();
const creatorA = randomUUID();
const creatorB = randomUUID();
const productA = randomUUID();
const draftA = randomUUID();
const productB = randomUUID();
const chapterA = randomUUID();
const chapterB = randomUUID();
const orderA = randomUUID();
const orderB = randomUUID();
const ledgerA = randomUUID();
const ledgerB = randomUUID();
const agreementA = randomUUID();
const agreementB = randomUUID();
const auditA = randomUUID();
const auditB = randomUUID();
const orgIds = [orgA, orgB];

let admin: Client;
let runtime: Client;

beforeAll(async () => {
  admin = new Client({ connectionString: adminUrl });
  runtime = new Client({ connectionString: runtimeUrl });
  await Promise.all([admin.connect(), runtime.connect()]);

  await admin.query("begin");
  try {
    await admin.query("insert into orgs (id, name, slug) values ($1, $2, $3), ($4, $5, $6)", [
      orgA,
      `RLS tenant A ${suffix}`,
      `rls-cross-tenant-a-${suffix}`,
      orgB,
      `RLS tenant B ${suffix}`,
      `rls-cross-tenant-b-${suffix}`,
    ]);
    await admin.query("insert into users (id, email, name, password_hash) values ($1, $2, $3, $4)", [
      userId,
      `rls-${suffix}@example.test`,
      "RLS Test Operator",
      "test-only-hash",
    ]);
    await admin.query("insert into creator_accounts (id, org_id, username, source) values ($1, $2, $3, $4), ($5, $6, $7, $8)", [
      creatorA,
      orgA,
      `rls_alpha_${suffix}`,
      "manual",
      creatorB,
      orgB,
      `rls_beta_${suffix}`,
      "manual",
    ]);
    await admin.query(
      "insert into products (id, org_id, creator_id, title, status) values ($1, $2, $3, $4, $5), ($6, $7, $8, $9, $10), ($11, $12, $13, $14, $15)",
      [
        productA,
        orgA,
        creatorA,
        "Published product A",
        "published",
        draftA,
        orgA,
        creatorA,
        "Draft product A",
        "draft",
        productB,
        orgB,
        creatorB,
        "Published product B",
        "published",
      ],
    );
    await admin.query("insert into chapters (id, org_id, product_id, position, title) values ($1, $2, $3, $4, $5), ($6, $7, $8, $9, $10)", [
      chapterA,
      orgA,
      productA,
      1,
      "Published chapter A",
      chapterB,
      orgB,
      productB,
      1,
      "Published chapter B",
    ]);
    await admin.query(
      "insert into orders (id, org_id, product_id, creator_id, stripe_session_id, amount_cents, status) values ($1, $2, $3, $4, $5, $6, $7), ($8, $9, $10, $11, $12, $13, $14)",
      [
        orderA,
        orgA,
        productA,
        creatorA,
        `cs_rls_a_${suffix}`,
        4900,
        "paid",
        orderB,
        orgB,
        productB,
        creatorB,
        `cs_rls_b_${suffix}`,
        4900,
        "paid",
      ],
    );
    await admin.query(
      "insert into ledger_entries (id, org_id, order_id, creator_id, account, direction, amount_cents) values ($1, $2, $3, $4, $5, $6, $7), ($8, $9, $10, $11, $12, $13, $14)",
      [
        ledgerA,
        orgA,
        orderA,
        creatorA,
        "operator_revenue",
        "credit",
        4900,
        ledgerB,
        orgB,
        orderB,
        creatorB,
        "operator_revenue",
        "credit",
        4900,
      ],
    );
    await admin.query(
      "insert into agreements (id, org_id, creator_id, product_id, version, document_hash) values ($1, $2, $3, $4, $5, $6), ($7, $8, $9, $10, $11, $12)",
      [
        agreementA,
        orgA,
        creatorA,
        productA,
        "v1",
        `hash-a-${suffix}`,
        agreementB,
        orgB,
        creatorB,
        productB,
        "v1",
        `hash-b-${suffix}`,
      ],
    );
    await admin.query("insert into audit_events (id, org_id, actor_user_id, action, entity_type) values ($1, $2, $3, $4, $5), ($6, $7, $8, $9, $10)", [
      auditA,
      orgA,
      userId,
      "rls.fixture.a",
      "org",
      auditB,
      orgB,
      userId,
      "rls.fixture.b",
      "org",
    ]);
    await admin.query("commit");
  } catch (error) {
    await admin.query("rollback");
    throw error;
  }

  mockWorkspace.org = { id: orgA, name: `RLS tenant A ${suffix}`, slug: `rls-cross-tenant-a-${suffix}`, createdAt: new Date() };
  mockWorkspace.user = { id: userId, email: `rls-${suffix}@example.test`, name: "RLS Test Operator" };
});

afterAll(async () => {
  if (admin) {
    for (const table of [
      "ledger_entries",
      "audit_events",
      "agreements",
      "orders",
      "chapters",
      "products",
      "creator_accounts",
    ]) {
      await admin.query(`delete from ${table} where org_id = any($1::uuid[])`, [orgIds]);
    }
    await admin.query("delete from orgs where id = any($1::uuid[])", [orgIds]);
    await admin.query("delete from users where id = $1", [userId]);
    await admin.end();
  }
  if (runtime) await runtime.end();
});

describe("cross-tenant RLS regression", () => {
  it("uses a runtime role that cannot bypass RLS or own the protected table", async () => {
    const role = await runtime.query<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }>(
      "select rolname, rolsuper, rolbypassrls from pg_roles where rolname = current_user",
    );
    const [roleRow] = role.rows;
    expect(roleRow).toBeDefined();
    expect(roleRow!.rolsuper).toBe(false);
    expect(roleRow!.rolbypassrls).toBe(false);

    const owner = await runtime.query<{ owner: string }>(
      "select pg_get_userbyid(relowner) as owner from pg_class where oid = 'products'::regclass",
    );
    const [ownerRow] = owner.rows;
    expect(ownerRow).toBeDefined();
    expect(ownerRow!.owner).not.toBe(roleRow!.rolname);
  });

  it("hides org B's published product and chapter from a scoped org A session", async () => {
    await runtime.query("begin");
    try {
      await runtime.query("select set_config('app.org_id', $1, true)", [orgA]);
      const products = await runtime.query<{ id: string; org_id: string }>("select id, org_id from products");
      const chapters = await runtime.query<{ id: string; org_id: string }>("select id, org_id from chapters");
      expect(products.rows.map((row) => row.id)).toEqual(expect.arrayContaining([productA, draftA]));
      expect(products.rows.map((row) => row.id)).not.toContain(productB);
      expect(chapters.rows.map((row) => row.id)).not.toContain(chapterB);
      expect(products.rows.every((row) => row.org_id === orgA)).toBe(true);
      expect(chapters.rows.every((row) => row.org_id === orgA)).toBe(true);
    } finally {
      await runtime.query("rollback");
    }
  });

  it("returns no org B rows from export-shaped selects under an org A scope", async () => {
    await runtime.query("begin");
    try {
      await runtime.query("select set_config('app.org_id', $1, true)", [orgA]);
      for (const table of ["products", "chapters", "orders", "ledger_entries", "agreements", "audit_events"]) {
        const result = await runtime.query<{ id: string; org_id: string }>(`select id, org_id from ${table}`);
        expect(result.rows.every((row) => row.org_id === orgA), `${table} leaked a foreign row`).toBe(true);
      }
    } finally {
      await runtime.query("rollback");
    }
  });

  it("rejects a cross-tenant insert while scoped to org A", async () => {
    await runtime.query("begin");
    try {
      await runtime.query("select set_config('app.org_id', $1, true)", [orgA]);
      await runtime.query("savepoint cross_tenant_insert");
      await expect(
        runtime.query("insert into creator_accounts (org_id, username, source) values ($1, $2, 'manual')", [
          orgB,
          `rls_sneaky_${suffix}`,
        ]),
      ).rejects.toThrow();
      await runtime.query("rollback to savepoint cross_tenant_insert");
    } finally {
      await runtime.query("rollback");
    }
  });

  it("preserves the anonymous storefront: both published products, zero drafts", async () => {
    await runtime.query("begin");
    try {
      await runtime.query("select set_config('app.org_id', '', true)");
      const products = await runtime.query<{ id: string; status: string }>("select id, status from products");
      expect(products.rows.map((row) => row.id)).toEqual(expect.arrayContaining([productA, productB]));
      expect(products.rows.map((row) => row.id)).not.toContain(draftA);
      expect(products.rows.every((row) => row.status === "published")).toBe(true);
    } finally {
      await runtime.query("rollback");
    }
  });

  it("actual export GET handler excludes org B products and chapters", async () => {
    const response = await GET(new Request("http://localhost/api/export"));
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      products: Array<{ id: string; orgId: string }>;
      chapters: Array<{ id: string; productId: string }>;
      orders: Array<{ orgId: string }>;
      ledgerEntries: Array<{ orgId: string }>;
      agreements: Array<{ orgId: string }>;
      auditEvents: Array<{ orgId: string }>;
    };
    expect(payload.products.map((row) => row.id)).not.toContain(productB);
    expect(payload.chapters.map((row) => row.id)).not.toContain(chapterB);
    expect(payload.chapters.every((row) => row.productId !== productB)).toBe(true);
    // The chapter projection omits orgId, so verify its owning product above.
    for (const rows of [payload.products, payload.orders, payload.ledgerEntries, payload.agreements, payload.auditEvents]) {
      expect(rows.every((row) => row.orgId === orgA)).toBe(true);
    }
  });

  it("actual getDashboard product stats exclude org B's published product", async () => {
    const dashboard = await getDashboard(orgA);
    expect(dashboard.products.total).toBe(2);
    expect(dashboard.products.live).toBe(1);
  });
});
