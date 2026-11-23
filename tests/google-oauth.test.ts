import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * The helpers have no Next.js imports, so they can be loaded directly. Each
 * case resets modules after stubbing OAuth env values because env.ts parses at
 * import time.
 */
function loadHelpers(overrides: Record<string, string>) {
  for (const [key, value] of Object.entries(overrides)) vi.stubEnv(key, value);
  vi.resetModules();
  return import("@/lib/auth/google-oauth");
}

const VALID_CLAIMS = {
  aud: "test-google-client-id",
  iss: "https://accounts.google.com",
  exp: Math.floor(Date.now() / 1000) + 600,
  email: "Owner@Example.com",
  email_verified: true,
  sub: "google-sub-123",
  name: "Test Owner",
};

function tokenInfoResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("Google authorize URL", () => {
  it("builds the authorize URL with all required params and the derived redirect URI", async () => {
    const { buildGoogleAuthorizeUrl } = await loadHelpers({ GOOGLE_CLIENT_ID: VALID_CLAIMS.aud });
    const url = new URL(buildGoogleAuthorizeUrl("state-abc", "challenge-xyz"));
    expect(`${url.origin}${url.pathname}`).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe(VALID_CLAIMS.aud);
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/auth/google/callback");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("state")).toBe("state-abc");
    expect(url.searchParams.get("code_challenge")).toBe("challenge-xyz");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("prompt")).toBe("select_account");
  });

  it("uses an explicit redirect URI override", async () => {
    const { buildGoogleAuthorizeUrl } = await loadHelpers({
      GOOGLE_CLIENT_ID: VALID_CLAIMS.aud,
      GOOGLE_REDIRECT_URI: "https://app.example.test/oauth/google/callback",
    });
    const url = new URL(buildGoogleAuthorizeUrl("state", "challenge"));
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.example.test/oauth/google/callback");
  });
});

describe("signed OAuth transaction", () => {
  it("round-trips a valid state and returns the PKCE verifier", async () => {
    const { createGoogleOAuthTransaction, verifyGoogleOAuthTransaction } = await loadHelpers({
      GOOGLE_CLIENT_ID: VALID_CLAIMS.aud,
    });
    const tx = createGoogleOAuthTransaction();
    const verifier = verifyGoogleOAuthTransaction(tx.cookieValue, tx.state);
    expect(verifier).toBeTruthy();
    expect(verifier!.length).toBeGreaterThanOrEqual(43);
  });

  it("rejects a tampered cookie, a wrong state, and an absent cookie", async () => {
    const { createGoogleOAuthTransaction, verifyGoogleOAuthTransaction } = await loadHelpers({
      GOOGLE_CLIENT_ID: VALID_CLAIMS.aud,
    });
    const tx = createGoogleOAuthTransaction();
    const tampered = `${tx.cookieValue.slice(0, -1)}${tx.cookieValue.endsWith("a") ? "b" : "a"}`;
    expect(verifyGoogleOAuthTransaction(tampered, tx.state)).toBeNull();
    expect(verifyGoogleOAuthTransaction(tx.cookieValue, "wrong-state")).toBeNull();
    expect(verifyGoogleOAuthTransaction(undefined, tx.state)).toBeNull();
  });

  it("rejects an expired payload and reports it distinctly from tampering", async () => {
    const { verifyGoogleOAuthTransaction, inspectGoogleOAuthTransaction } = await loadHelpers({
      GOOGLE_CLIENT_ID: VALID_CLAIMS.aud,
    });
    const encoded = Buffer.from(
      JSON.stringify({ state: "state-expired", verifier: "verifier-expired", exp: Date.now() - 1_000 }),
    ).toString("base64url");
    const signature = createHmac("sha256", process.env.AUTH_SECRET!).update(encoded).digest("hex");
    const cookie = `${encoded}.${signature}`;
    expect(verifyGoogleOAuthTransaction(cookie, "state-expired")).toBeNull();
    expect(inspectGoogleOAuthTransaction(cookie, "state-expired").expired).toBe(true);
  });

  it("computes the S256 challenge as base64url SHA-256 of the verifier", async () => {
    const { createGoogleOAuthTransaction, verifyGoogleOAuthTransaction, pkceChallenge } = await loadHelpers({
      GOOGLE_CLIENT_ID: VALID_CLAIMS.aud,
    });
    const tx = createGoogleOAuthTransaction();
    const verifier = verifyGoogleOAuthTransaction(tx.cookieValue, tx.state)!;
    expect(tx.codeChallenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
    expect(tx.codeChallenge).toBe(pkceChallenge(verifier));
    expect(tx.codeChallenge).not.toContain("=");
  });
});

describe("verifyGoogleIdToken", () => {
  it("accepts a valid tokeninfo response and normalizes the email", async () => {
    const { verifyGoogleIdToken } = await loadHelpers({ GOOGLE_CLIENT_ID: VALID_CLAIMS.aud });
    const fetchMock = vi.fn(async () => tokenInfoResponse(VALID_CLAIMS));
    vi.stubGlobal("fetch", fetchMock);
    const claims = await verifyGoogleIdToken("never-log-this-token-value");
    expect(claims).toEqual({ sub: "google-sub-123", email: "owner@example.com", name: "Test Owner" });
    const requested = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
    expect(requested.origin + requested.pathname).toBe("https://oauth2.googleapis.com/tokeninfo");
    expect(requested.searchParams.get("id_token")).toBe("never-log-this-token-value");
  });

  it("accepts Google's string-valued exp and email_verified fields", async () => {
    const { verifyGoogleIdToken } = await loadHelpers({ GOOGLE_CLIENT_ID: VALID_CLAIMS.aud });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        tokenInfoResponse({
          ...VALID_CLAIMS,
          exp: String(Math.floor(Date.now() / 1000) + 600),
          email_verified: "true",
        }),
      ),
    );
    expect(await verifyGoogleIdToken("never-log-this-token-value")).toEqual({
      sub: "google-sub-123",
      email: "owner@example.com",
      name: "Test Owner",
    });
  });

  it.each([
    ["wrong audience", { ...VALID_CLAIMS, aud: "another-client" }],
    ["wrong issuer", { ...VALID_CLAIMS, iss: "https://evil.example.test" }],
    ["expired token", { ...VALID_CLAIMS, exp: Math.floor(Date.now() / 1000) - 10 }],
    ["expired string token", { ...VALID_CLAIMS, exp: String(Math.floor(Date.now() / 1000) - 10) }],
    ["non-numeric exp", { ...VALID_CLAIMS, exp: "not-a-timestamp" }],
    ["unverified email", { ...VALID_CLAIMS, email_verified: false }],
    ["missing email", { ...VALID_CLAIMS, email: "" }],
  ])("rejects %s", async (_label, body) => {
    const { verifyGoogleIdToken } = await loadHelpers({ GOOGLE_CLIENT_ID: VALID_CLAIMS.aud });
    vi.stubGlobal("fetch", vi.fn(async () => tokenInfoResponse(body)));
    expect(await verifyGoogleIdToken("never-log-this-token-value")).toBeNull();
  });

  it("rejects a non-2xx response without logging the token", async () => {
    const { verifyGoogleIdToken } = await loadHelpers({ GOOGLE_CLIENT_ID: VALID_CLAIMS.aud });
    vi.stubGlobal("fetch", vi.fn(async () => tokenInfoResponse({ error: "invalid_token" }, 400)));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await verifyGoogleIdToken("never-log-this-token-value")).toBeNull();
    const logged = JSON.stringify([...log.mock.calls, ...warn.mock.calls, ...error.mock.calls]);
    expect(logged).not.toContain("never-log-this-token-value");
  });
});

/**
 * High-risk route invariants cannot be exercised without a real DB and Google
 * client, so the shipped source is asserted instead.
 */
describe("route and login UI invariants", () => {
  const startSource = readFileSync(new URL("../src/app/api/auth/google/start/route.ts", import.meta.url), "utf8");
  const callbackSource = readFileSync(new URL("../src/app/api/auth/google/callback/route.ts", import.meta.url), "utf8");
  const loginFormSource = readFileSync(new URL("../src/app/(auth)/login/login-form.tsx", import.meta.url), "utf8");
  const layoutSource = readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");

  it("start route fails closed with a short 503 response when unconfigured", () => {
    expect(startSource).toContain("googleOAuthConfigured");
    expect(startSource).toContain("status: 503");
    expect(startSource).toContain("Response.redirect(");
    expect(startSource).toContain(", 303)");
  });

  it("callback never reads forwarded headers directly and never derives a role from claims", () => {
    expect(callbackSource).not.toContain("x-forwarded-for");
    expect(callbackSource).toContain("clientIpFromHeaders(await headers())");
    expect(callbackSource).not.toMatch(/claims\??\.(role|orgId|membership|org)/);
    expect(callbackSource).not.toContain("role: claims");
  });

  it("callback reuses the users table and the existing session system", () => {
    expect(callbackSource).toContain("onConflictDoNothing()");
    expect(callbackSource).toContain("emailVerifiedAt: new Date()");
    expect(callbackSource).toContain("hashPassword(randomToken(32))");
    expect(callbackSource).toContain("createSession(user.id, orgId)");
    expect(callbackSource).toContain("withOrg(orgId");
    expect(callbackSource).toContain("insertAudit");
    expect(callbackSource).toContain('checkRateLimit(`google:${ip}:${email}`, 8, 15 * 60)');
  });

  it("callback returns a clean HTML 200 response with no redirect header", () => {
    expect(callbackSource).toContain("new Response(html");
    expect(callbackSource).toContain("status: 200");
    expect(callbackSource).toContain('"content-type": "text/html; charset=utf-8"');
    expect(callbackSource).toContain("location.replace(");
    expect(callbackSource).not.toContain("Location");
    expect(callbackSource).not.toContain("status: 303");
    expect(callbackSource).not.toContain("Response.redirect(");
    expect(callbackSource).not.toContain("googleRedirectTarget");
    expect(callbackSource).not.toContain("signin=google");
  });

  it("callback strips every OAuth callback param before navigating", () => {
    expect(callbackSource).toContain(
      'const CALLBACK_QUERY_PARAMS = ["signin", "code", "state", "iss", "scope", "authuser", "hd", "prompt"] as const;',
    );
    for (const key of ["signin", "code", "state", "iss", "scope", "authuser", "hd", "prompt"]) {
      expect(callbackSource).toContain(`"${key}"`);
    }
    expect(callbackSource).toContain("JSON.stringify([...CALLBACK_QUERY_PARAMS])");
    expect(callbackSource).toContain("u.searchParams.delete(k)");
    expect(callbackSource).toContain('history.replaceState(null,"",u.pathname+u.search+u.hash)');
    expect(callbackSource).toContain("JSON.stringify(path)");
  });

  it("callback keeps the role-based destination and passes it only through finish", () => {
    expect(callbackSource).toContain('creatorOnly ? "/creator" : first ? "/dashboard" : "/onboarding"');
    expect(callbackSource).toContain("canAccessOperator(row.role)");
    expect(callbackSource).toContain("return finish(destination);");
    expect(callbackSource).not.toContain("finish(request,");
  });

  it("layout strips the success marker and any copied OAuth params before render", () => {
    expect(layoutSource).toContain('u.searchParams.get("signin")!=="google"');
    for (const key of ["signin", "code", "state", "iss", "scope", "authuser", "hd", "prompt"]) {
      expect(layoutSource).toContain(`"${key}"`);
    }
    expect(layoutSource).toContain("history.replaceState(null");
    expect(layoutSource).toContain("oauthCleanupScript");
  });

  it("renders the Google link only behind googleEnabled", () => {
    expect(loginFormSource).toContain("googleEnabled ? (");
    expect(loginFormSource).toContain('href="/api/auth/google/start"');
    expect(loginFormSource).toContain("Continue with Google");
    expect(loginFormSource).toContain('buttonVariants({ variant: "secondary", size: "lg" })');
  });
});
