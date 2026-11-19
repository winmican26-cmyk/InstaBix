import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { chromium } from "@playwright/test";
import { AUTH_STATE_PATH, envValue, playwrightChannel } from "./auth-state";

/**
 * Sign in once and share the session with every authenticated test. Repeated UI
 * logins trip the real 8-attempt/15-minute rate limiter, so tests must not
 * re-authenticate one by one.
 */
export default async function globalSetup(): Promise<void> {
  const email = envValue("SEED_EMAIL");
  const password = envValue("SEED_PASSWORD");
  if (!email || !password) throw new Error("SEED_EMAIL and SEED_PASSWORD must be set in .env.local");

  const baseURL = process.env.APP_URL ?? "http://localhost:3000";
  // Warm the route so the browser does not race the dev server's first compile.
  await fetch(`${baseURL}/login`).catch(() => undefined);

  const browser = await chromium.launch({ channel: playwrightChannel });
  try {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    // The route is warm above; wait for React to attach to the form so the
    // submit is handled by the server action instead of a native GET.
    await page.goto("/login");
    await page.waitForFunction(() => {
      const form = document.querySelector("form");
      return !!form && Object.keys(form).some((key) => key.startsWith("__reactFiber$"));
    });
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    try {
      await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
    } catch (error) {
      const alerts = await page.getByRole("alert").allTextContents();
      const main = (await page.locator("main").innerText()).slice(0, 400);
      throw new Error(`Login failed (${page.url()}): ${JSON.stringify(alerts)} | ${main}`, { cause: error });
    }

    mkdirSync(dirname(AUTH_STATE_PATH), { recursive: true });
    await context.storageState({ path: AUTH_STATE_PATH });
  } finally {
    await browser.close();
  }
}
