import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Credential nodes are prepared empty in .env files and filled later. An empty
 * value must mean "unset", never "configured", so no provider is enabled by a
 * placeholder. The env module parses at import time, so each case resets
 * modules and stubs only the variables under test.
 */
function stubEnv(values: Record<string, string>) {
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value);
}

describe("optional credential env values", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("treats an empty credential node as unset", async () => {
    stubEnv({ META_APP_ID: "" });
    vi.resetModules();
    const { env, metaConfigured } = await import("@/lib/env");
    expect(env.META_APP_ID).toBeUndefined();
    expect(metaConfigured).toBe(false);
  });

  it("treats a whitespace-only credential node as unset", async () => {
    stubEnv({ RESEND_API_KEY: "   " });
    vi.resetModules();
    const { env, resendConfigured } = await import("@/lib/env");
    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(resendConfigured).toBe(false);
  });

  it("still treats a real value as configured", async () => {
    stubEnv({ ANTHROPIC_API_KEY: "test-only-key" });
    vi.resetModules();
    const { env, aiConfigured } = await import("@/lib/env");
    expect(env.ANTHROPIC_API_KEY).toBe("test-only-key");
    expect(aiConfigured).toBe(true);
  });

  it("enables Meta OAuth only when both app credentials are present", async () => {
    stubEnv({ META_APP_ID: "test-app-id" });
    vi.resetModules();
    const missingSecret = await import("@/lib/env");
    expect(missingSecret.metaConfigured).toBe(false);

    vi.unstubAllEnvs();
    stubEnv({ META_APP_ID: "test-app-id", META_APP_SECRET: "test-app-secret" });
    vi.resetModules();
    const complete = await import("@/lib/env");
    expect(complete.metaConfigured).toBe(true);
  });

  it("enables Meta discovery only when both discovery nodes are present", async () => {
    stubEnv({ META_DISCOVERY_TOKEN: "test-token" });
    vi.resetModules();
    const missingUser = await import("@/lib/env");
    expect(missingUser.metaDiscoveryConfigured).toBe(false);

    vi.unstubAllEnvs();
    stubEnv({ META_DISCOVERY_TOKEN: "test-token", META_DISCOVERY_IG_USER_ID: "12345" });
    vi.resetModules();
    const complete = await import("@/lib/env");
    expect(complete.metaDiscoveryConfigured).toBe(true);
  });

  it("enables email only with key, sender, domain and physical address", async () => {
    stubEnv({
      RESEND_API_KEY: "re_test",
      OUTREACH_FROM: "VistaBix <hello@example.com>",
      EMAIL_FROM_DOMAIN: "example.com",
    });
    vi.resetModules();
    const missingAddress = await import("@/lib/env");
    expect(missingAddress.resendConfigured).toBe(false);

    vi.unstubAllEnvs();
    stubEnv({
      RESEND_API_KEY: "re_test",
      OUTREACH_FROM: "VistaBix <hello@example.com>",
      EMAIL_FROM_DOMAIN: "example.com",
      OUTREACH_PHYSICAL_ADDRESS: "1 Main Street, Test City",
    });
    vi.resetModules();
    const complete = await import("@/lib/env");
    expect(complete.resendConfigured).toBe(true);
  });

  it("enables Stripe with only the secret key", async () => {
    stubEnv({ STRIPE_SECRET_KEY: "" });
    vi.resetModules();
    const empty = await import("@/lib/env");
    expect(empty.stripeConfigured).toBe(false);

    vi.unstubAllEnvs();
    stubEnv({ STRIPE_SECRET_KEY: "sk_test_only" });
    vi.resetModules();
    const configured = await import("@/lib/env");
    expect(configured.stripeConfigured).toBe(true);
  });

  it("uses the default OAuth scope when META_SCOPES is empty", async () => {
    stubEnv({ META_APP_ID: "test-app-id", META_SCOPES: "   " });
    vi.resetModules();
    const { authorizeUrl } = await import("@/lib/instagram/client");
    const url = new URL(authorizeUrl("test-state"));
    expect(url.searchParams.get("scope")).toBe("instagram_business_basic");
  });

  it("uses an explicitly configured META_SCOPES value", async () => {
    stubEnv({ META_APP_ID: "test-app-id", META_SCOPES: "instagram_business_basic,instagram_content_publish" });
    vi.resetModules();
    const { authorizeUrl } = await import("@/lib/instagram/client");
    const url = new URL(authorizeUrl("test-state"));
    expect(url.searchParams.get("scope")).toBe("instagram_business_basic,instagram_content_publish");
  });

  it("treats empty or whitespace-only Google sign-in credentials as unset", async () => {
    stubEnv({ GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "   " });
    vi.resetModules();
    const { env, googleOAuthConfigured } = await import("@/lib/env");
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(env.GOOGLE_CLIENT_SECRET).toBeUndefined();
    expect(googleOAuthConfigured).toBe(false);
  });

  it("enables Google sign-in only when both client credentials are present", async () => {
    stubEnv({ GOOGLE_CLIENT_ID: "google-client-id" });
    vi.resetModules();
    expect((await import("@/lib/env")).googleOAuthConfigured).toBe(false);

    vi.unstubAllEnvs();
    stubEnv({ GOOGLE_CLIENT_ID: "google-client-id", GOOGLE_CLIENT_SECRET: "google-client-secret" });
    vi.resetModules();
    expect((await import("@/lib/env")).googleOAuthConfigured).toBe(true);
  });

  it("derives the Google redirect URI from APP_URL without a trailing slash", async () => {
    stubEnv({ APP_URL: "https://app.example.test/" });
    vi.resetModules();
    const { googleRedirectUri } = await import("@/lib/env");
    expect(googleRedirectUri).toBe("https://app.example.test/api/auth/google/callback");
  });

  it("uses an explicit Google redirect URI when provided", async () => {
    stubEnv({ GOOGLE_REDIRECT_URI: "https://other.example.test/oauth/google/callback" });
    vi.resetModules();
    const { env, googleRedirectUri } = await import("@/lib/env");
    expect(env.GOOGLE_REDIRECT_URI).toBe("https://other.example.test/oauth/google/callback");
    expect(googleRedirectUri).toBe("https://other.example.test/oauth/google/callback");
  });
});
