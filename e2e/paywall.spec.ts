import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";
import { Client } from "pg";
import { expect, test } from "@playwright/test";
import { AUTH_STATE_PATH } from "./auth-state";

/**
 * BILL-06 paywall smoke. Setup and cleanup use the admin Postgres URL only.
 * This spec never calls Stripe, never submits a checkout form and never moves
 * money: the upgrade CTA is only asserted as visible text.
 */
let localEnv: Record<string, string> = {};
try {
  localEnv = parse(readFileSync(resolve(process.cwd(), ".env.local"), "utf8"));
} catch {
  // Fall back to the ambient environment below.
}

const seedEmail = (process.env.SEED_EMAIL ?? localEnv.SEED_EMAIL)?.trim().toLowerCase();
const adminUrl = (process.env.DATABASE_URL_ADMIN ?? localEnv.DATABASE_URL_ADMIN)?.trim();
const DEDICATED_PREFIX = "e2e_paywall_";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/** Never let this spec connect to a non-local/disposable database. */
function isLocalAdminUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname.replace(/^\[|\]$/g, "");
    return LOCAL_HOSTS.has(hostname);
  } catch {
    return false;
  }
}

type SeedContext = {
  orgIds: string[];
  orgId: string;
  userId: string;
  role: string;
  proActive: boolean;
};

let admin: Client | undefined;

async function adminClient(): Promise<Client> {
  if (!admin) {
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
  }
  return admin;
}

test.afterAll(async () => {
  if (admin) await admin.end();
  admin = undefined;
});

/** Resolve the seed user's workspace(s) through users -> memberships. */
async function seedContext(client: Client): Promise<SeedContext | null> {
  if (!seedEmail) return null;
  const user = await client.query<{ id: string }>("select id from users where lower(email) = $1 limit 1", [seedEmail]);
  const userId = user.rows[0]?.id;
  if (!userId) return null;

  const membership = await client.query<{ orgId: string; role: string }>(
    `select m.org_id as "orgId", m.role
       from memberships m
       where m.user_id = $1
       order by case when m.role in ('owner', 'admin') then 0 else 1 end, m.org_id`,
    [userId],
  );
  const orgIds = membership.rows.map((row) => row.orgId);
  const selected = membership.rows[0];
  if (!selected) return null;

  const entitlement = await client.query<{
    plan: string;
    status: string;
    currentPeriodEnd: Date | null;
  }>(
    `select plan, status, current_period_end as "currentPeriodEnd"
       from org_entitlements where org_id = $1 limit 1`,
    [selected.orgId],
  );
  const ent = entitlement.rows[0];
  const proActive = Boolean(
    ent
      && ent.plan === "pro"
      && ent.status === "active"
      && ent.currentPeriodEnd
      && new Date(ent.currentPeriodEnd).getTime() > Date.now(),
  );
  return { orgIds, orgId: selected.orgId, userId, role: selected.role, proActive };
}

/** Wipe weekly unlocks for every seed-user org and any fixture creator this spec created. */
async function resetSeedUnlocks(client: Client): Promise<void> {
  const context = await seedContext(client);
  if (context) {
    await client.query("delete from creator_unlocks where org_id = any($1::uuid[])", [context.orgIds]);
  }
  await client.query("delete from creator_accounts where starts_with(username, $1)", [DEDICATED_PREFIX]);
}

/** Fixture rows are always removed by the test's finally block. */
async function createFixtureCreator(client: Client, context: SeedContext, tag: string): Promise<string> {
  const inserted = await client.query<{ id: string }>(
    `insert into creator_accounts (org_id, username, source, created_by, display_name)
     values ($1, $2, 'manual', $3, $4)
     returning id`,
    [context.orgId, `${DEDICATED_PREFIX}${tag}_${randomUUID().slice(0, 8)}`, context.userId, `Paywall E2E ${tag}`],
  );
  const id = inserted.rows[0]?.id;
  if (!id) throw new Error("Fixture creator insert returned no id");
  return id;
}

test.describe("weekly unlock paywall", () => {
  test.use({ storageState: AUTH_STATE_PATH });
  test.setTimeout(90_000);

  test("teaser then unlock reveals full creator detail", async ({ page }) => {
    test.skip(!isLocalAdminUrl(adminUrl), "DATABASE_URL_ADMIN must point at a local/disposable database");
    test.skip(!seedEmail || !adminUrl, "SEED_EMAIL and DATABASE_URL_ADMIN are required for the paywall smoke");
    const client = await adminClient();
    const context = await seedContext(client);
    test.skip(!context, "SEED_EMAIL has no workspace membership in the seeded database");
    test.skip(context?.role !== "owner" && context?.role !== "admin", "Seed user is not an owner/admin of the workspace");
    test.skip(context?.proActive, "Seed workspace has an active Pro entitlement, so no creator is locked");

    await resetSeedUnlocks(client);
    let fixtureCreatorId: string | undefined;
    try {
      fixtureCreatorId = await createFixtureCreator(client, context, "unlock");
      await page.goto("/creators", { waitUntil: "domcontentloaded" });
      await expect(page.locator("main")).toBeVisible();
      await expect(page.getByText(/free unlocks left this week|VistaBix Pro is active/).first()).toBeVisible();

      const lockedLinks = page.getByRole("link", { name: /^Unlock @/ });
      await expect(lockedLinks.first()).toBeVisible({ timeout: 20_000 });
      await lockedLinks.first().click();

      await expect(page.getByText("Preview only")).toBeVisible();
      await expect(page.getByText("Explainable score")).toHaveCount(0);

      const unlockButton = page.getByRole("button", { name: /^Unlock @/ });
      await expect(unlockButton).toBeVisible();
      await unlockButton.click();
      await expect(page.getByText("Creator unlocked.")).toBeVisible({ timeout: 20_000 });

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByText(/Explainable score|Recent public media/).first()).toBeVisible({ timeout: 20_000 });
      const body = await page.locator("body").innerText();
      expect(body).not.toContain("STRIPE_SECRET_KEY");
      expect(body).not.toContain("DATABASE_URL");
    } finally {
      if (fixtureCreatorId) {
        await client.query("delete from creator_accounts where id = $1", [fixtureCreatorId]);
      }
      await resetSeedUnlocks(client);
    }
  });

  test("zero remaining shows upgrade CTA instead of unlock", async ({ page }) => {
    test.skip(!isLocalAdminUrl(adminUrl), "DATABASE_URL_ADMIN must point at a local/disposable database");
    test.skip(!seedEmail || !adminUrl, "SEED_EMAIL and DATABASE_URL_ADMIN are required for the paywall smoke");
    const client = await adminClient();
    const context = await seedContext(client);
    test.skip(!context, "SEED_EMAIL has no workspace membership in the seeded database");
    test.skip(context?.role !== "owner" && context?.role !== "admin", "Seed user is not an owner/admin of the workspace");
    test.skip(context?.proActive, "Seed workspace has an active Pro entitlement, so the 0-of-10 banner is not applicable");

    await resetSeedUnlocks(client);
    const fixtureCreatorIds: string[] = [];
    try {
      const existing = await client.query<{ id: string }>(
        "select id from creator_accounts where org_id = $1 order by created_at asc limit 10",
        [context.orgId],
      );
      const creatorIds = existing.rows.map((row) => row.id);
      // The seed org may be empty; create only the missing creators, all with a
      // dedicated prefix so cleanup cannot touch real workspace rows.
      for (let index = creatorIds.length; index < 10; index += 1) {
        const id = await createFixtureCreator(client, context, `quota${index}`);
        creatorIds.push(id);
        fixtureCreatorIds.push(id);
      }

      // Current UTC ISO week, derived by Postgres rather than by the browser.
      await client.query(
        `insert into creator_unlocks (org_id, creator_id, unlocked_by, week_start)
           select $1, ca.id, $2, date_trunc('week', now() at time zone 'UTC')::date
           from creator_accounts ca
           where ca.id = any($3::uuid[])
           on conflict do nothing`,
        [context.orgId, context.userId, creatorIds],
      );

      const dedicatedCreatorId = await createFixtureCreator(client, context, "locked");
      fixtureCreatorIds.push(dedicatedCreatorId);

      await page.goto("/creators", { waitUntil: "domcontentloaded" });
      await expect(page.locator("main")).toBeVisible();
      await expect(page.getByText(/0 of 10 free unlocks left this week/)).toBeVisible();
      // Visible only: this spec must never submit the checkout form.
      await expect(page.getByRole("button", { name: "Upgrade to VistaBix Pro" })).toBeVisible();

      await page.goto(`/creators/${dedicatedCreatorId}`, { waitUntil: "domcontentloaded" });
      await expect(page.getByText("Preview only")).toBeVisible();
      await expect(page.getByText(/\$29 \/ month/)).toBeVisible();
      await expect(page.getByRole("button", { name: /^Unlock @/ })).toHaveCount(0);
    } finally {
      for (const id of fixtureCreatorIds) {
        await client.query("delete from creator_accounts where id = $1", [id]);
      }
      await resetSeedUnlocks(client);
    }
  });
});
