import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";
import { describe, expect, test, type Page } from "@playwright/test";
import { AUTH_STATE_PATH } from "./auth-state";

/**
 * Wiring smoke suite: click every visible interactive control on every real
 * route and assert that the app never throws. Credential-gated surfaces must
 * fail closed while their env nodes are empty; the configured-env check uses
 * temporary process env against a separate server.
 */

const PUBLIC_ROUTES = [
  "/",
  "/how-it-works",
  "/for-creators",
  "/apply",
  "/creator/signup",
  "/login",
  "/legal/privacy",
  "/legal/terms",
];

const APP_ROUTES = [
  "/dashboard",
  "/creators",
  "/outreach",
  "/studio",
  "/revenue",
  "/integrations",
  "/audit",
  "/settings",
];

const CONTROL_SELECTOR = 'button:visible, a:visible:not([href="#main"]), select:visible, input:visible';

type CredentialKey = "META_APP_ID" | "META_APP_SECRET" | "STRIPE_SECRET_KEY";

/** Presence-only probe; values are never printed, logged or stored. */
function isConfigured(key: CredentialKey): boolean {
  const fromProcess = process.env[key];
  if (fromProcess !== undefined) return fromProcess.trim().length > 0;
  try {
    const local = parse(readFileSync(resolve(process.cwd(), ".env.local")))[key];
    return Boolean(local?.trim());
  } catch {
    return false;
  }
}

// The banner is client-rendered after hydration and stores consent in
// localStorage, so one short wait per page is enough; later navigations reuse it.
const consentHandled = new WeakSet<Page>();

async function dismissCookieBanner(page: Page): Promise<void> {
  if (consentHandled.has(page)) return;
  const essential = page.getByRole("button", { name: "Only Essential" });
  if (!(await essential.isVisible().catch(() => false))) {
    try {
      await essential.waitFor({ state: "visible", timeout: 5_000 });
    } catch {
      consentHandled.add(page);
      return;
    }
  }
  await essential.click();
  consentHandled.add(page);
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

async function gotoRoute(page: Page, route: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.locator("main")).toBeVisible();
      await dismissCookieBanner(page);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function clickEveryControl(page: Page, route: string): Promise<string[]> {
  await gotoRoute(page, route);
  const total = await page.locator(CONTROL_SELECTOR).count();
  const visited: string[] = [];

  for (let index = 0; index < total; index += 1) {
    // Reset to a clean page before every click so menus, filters and dialogs
    // from a previous click cannot change the next control's identity.
    await gotoRoute(page, route);
    const controls = page.locator(CONTROL_SELECTOR);
    if (index >= (await controls.count())) {
      visited.push(`control-${index}: no longer visible (skipped)`);
      continue;
    }
    const control = controls.nth(index);
    const name = (
      (await control.textContent()) ??
      (await control.getAttribute("aria-label")) ??
      (await control.getAttribute("placeholder")) ??
      (await control.getAttribute("name")) ??
      `control-${index}`
    )
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 70);

    if (await control.isDisabled().catch(() => true)) {
      visited.push(`${name}: disabled (skipped)`);
      continue;
    }

    try {
      await control.click({ timeout: 5000 });
      await page.waitForLoadState("domcontentloaded").catch(() => undefined);
      visited.push(`${name}: ok -> ${new URL(page.url()).pathname}`);
    } catch (error) {
      const message = (error as Error).message.split("\n")[0];
      if (/download|ERR_ABORTED|interrupted/i.test(message)) {
        visited.push(`${name}: download/navigation interrupted (expected)`);
        continue;
      }
      throw new Error(`Control "${name}" on ${route} was not clickable: ${message}`);
    }
  }
  return visited;
}

describe("public routes", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`every control on ${route} is wired without a page error`, async ({ page }) => {
      const errors = watchErrors(page);
      const visited = await clickEveryControl(page, route);
      console.log(`[${route}] ${visited.length} controls: ${visited.join(" | ")}`);
      expect(errors, `page errors on ${route}`).toEqual([]);
    });
  }
});

describe("authenticated routes", () => {
  test.use({ storageState: AUTH_STATE_PATH });

  for (const route of APP_ROUTES) {
    test(`every control on ${route} is wired without a page error`, async ({ page }) => {
      const errors = watchErrors(page);
      const visited = await clickEveryControl(page, route);
      console.log(`[${route}] ${visited.length} controls: ${visited.join(" | ")}`);
      expect(errors, `page errors on ${route}`).toEqual([]);
    });
  }

  test("credential-gated endpoints respond according to local env configuration", async ({ page }) => {
    const metaConfigured = isConfigured("META_APP_ID") && isConfigured("META_APP_SECRET");
    const stripeConfigured = isConfigured("STRIPE_SECRET_KEY");
    const webhookSecretConfigured = isConfigured("META_APP_SECRET");

    const instagram = await page.request.get("/api/integrations/instagram/start", { maxRedirects: 0 });
    if (metaConfigured) {
      expect(instagram.status()).toBe(303);
      expect(instagram.headers()["location"] ?? "").toContain("https://www.instagram.com/oauth/authorize");
    } else {
      expect(instagram.status()).toBe(503);
      expect((await instagram.json()).error).toContain("not configured");
    }

    const checkout = await page.request.post("/api/checkout", {
      form: { productId: "not-a-uuid" },
      maxRedirects: 0,
    });
    if (stripeConfigured) {
      expect(checkout.status()).toBe(400);
      expect((await checkout.json()).error).toContain("Unknown product");
    } else {
      expect(checkout.status()).toBe(503);
      expect((await checkout.json()).error).toContain("not configured");
    }

    const webhook = await page.request.post("/api/webhooks/instagram", { maxRedirects: 0 });
    if (webhookSecretConfigured) {
      expect(webhook.status()).toBe(401);
      expect((await webhook.json()).error).toContain("Signature verification failed");
    } else {
      expect(webhook.status()).toBe(503);
      expect((await webhook.json()).error).toContain("META_APP_SECRET is not configured");
    }

    const health = await page.request.get("/api/health", { maxRedirects: 0 });
    expect(health.status()).toBe(200);
    expect((await health.json()).database).toBe("reachable");
  });
});
