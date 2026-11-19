import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Credential nodes are prepared empty in .env files and filled later. An empty
 * value must mean "unset", never "configured", so no provider is enabled by a
 * placeholder. The env module parses at import time, so each case resets
 * modules and stubs the specific variable.
 */
describe("optional credential env values", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("treats an empty credential node as unset", async () => {
    vi.stubEnv("META_APP_ID", "");
    vi.resetModules();
    const { env, metaConfigured } = await import("@/lib/env");
    expect(env.META_APP_ID).toBeUndefined();
    expect(metaConfigured).toBe(false);
  });

  it("treats a whitespace-only credential node as unset", async () => {
    vi.stubEnv("RESEND_API_KEY", "   ");
    vi.resetModules();
    const { env, resendConfigured } = await import("@/lib/env");
    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(resendConfigured).toBe(false);
  });

  it("still treats a real value as configured", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-only-key");
    vi.resetModules();
    const { env, aiConfigured } = await import("@/lib/env");
    expect(env.ANTHROPIC_API_KEY).toBe("test-only-key");
    expect(aiConfigured).toBe(true);
  });
});
