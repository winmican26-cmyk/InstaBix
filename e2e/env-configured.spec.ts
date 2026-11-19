import { describe, expect, test } from "@playwright/test";
import { AUTH_STATE_PATH } from "./auth-state";

/**
 * Opt-in inverse of the fail-closed suite. Run it against a temporary server
 * started with fake process env values; it never reads or writes credentials in
 * .env.local. Enable with EXPECT_CONFIGURED=1.
 */
describe("configured env states", () => {
  test.skip(process.env.EXPECT_CONFIGURED !== "1", "set EXPECT_CONFIGURED=1 for the temporary configured-env server");

  test.use({ storageState: AUTH_STATE_PATH });

  test("integrations page shows configured providers", async ({ page }) => {
    await page.goto("/integrations");

    const instagram = page
      .getByRole("heading", { name: "Instagram" })
      .locator("xpath=ancestor::div[contains(@class, 'card')][1]");
    await expect(instagram).not.toContainText("App credentials missing");
    await expect(instagram.getByRole("link", { name: /Connect Instagram/ })).toBeVisible();
    await expect(instagram).toContainText("Business Discovery requires a Facebook-Login token: configured");

    const email = page
      .getByRole("heading", { name: "Email · Resend" })
      .locator("xpath=ancestor::div[contains(@class, 'card')][1]");
    await expect(email).toContainText("configured");
    await expect(email).not.toContainText("not configured");
    await expect(email.getByRole("button", { name: /Send delivery check/ })).toBeVisible();

    const payments = page
      .getByRole("heading", { name: "Payments · Stripe" })
      .locator("xpath=ancestor::div[contains(@class, 'card')][1]");
    await expect(payments).toContainText("configured");
    await expect(payments).not.toContainText("not configured");
    await expect(payments).toContainText("webhook secret set");
    await expect(payments).toContainText("mode: test or unset");

    const ai = page
      .getByRole("heading", { name: "AI · Anthropic" })
      .locator("xpath=ancestor::div[contains(@class, 'card')][1]");
    await expect(ai).toContainText("configured");
    await expect(ai).not.toContainText("not configured");
  });
});
