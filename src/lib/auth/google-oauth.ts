import { createHash } from "node:crypto";
import { hmacSha256, randomToken, safeEqual } from "@/lib/crypto";
import { env, googleRedirectUri } from "@/lib/env";

/**
 * Stateless Google OAuth helpers. No Next.js imports live here so state, PKCE
 * and token verification can be unit-tested without a request context. Nothing
 * in this module logs tokens or claim payloads.
 */

export const GOOGLE_OAUTH_COOKIE = "ibx_google_oauth";

const COOKIE_PATH = "/api/auth/google";
const COOKIE_MAX_AGE = 600;
const TRANSACTION_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8_000;
const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";

type TransactionPayload = { state: string; verifier: string; exp: number };

export type GoogleOAuthTransaction = { state: string; codeChallenge: string; cookieValue: string };
export type GoogleClaims = { sub: string; email: string; name: string };
export type GoogleOAuthTransactionInspection = { verifier: string | null; expired: boolean };

export function googleCookieOptions() {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: env.NODE_ENV === "production",
    path: COOKIE_PATH,
    maxAge: COOKIE_MAX_AGE,
  };
}

/**
 * Builds a post-login Location from a query-free base. Google sends the one-time
 * authorization code and state in the callback query; they must never be copied
 * into the page the user lands on.
 */
export function googleRedirectTarget(requestUrl: string, path: string): string {
  const base = new URL(requestUrl);
  base.search = "";
  base.hash = "";
  return new URL(path, base).toString();
}

/** PKCE S256: base64url(SHA-256(ASCII(verifier))). */
export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

export function buildGoogleAuthorizeUrl(state: string, codeChallenge: string): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID ?? "");
  url.searchParams.set("redirect_uri", googleRedirectUri);
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export function createGoogleOAuthTransaction(): GoogleOAuthTransaction {
  const state = randomToken(32);
  const verifier = randomToken(32);
  const payload: TransactionPayload = { state, verifier, exp: Date.now() + TRANSACTION_TTL_MS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = hmacSha256(env.AUTH_SECRET, encoded);
  return { state, codeChallenge: pkceChallenge(verifier), cookieValue: `${encoded}.${signature}` };
}

/** Parses and authenticates the signed transaction cookie. Never throws. */
export function inspectGoogleOAuthTransaction(
  cookieValue: string | undefined | null,
  state: string,
): GoogleOAuthTransactionInspection {
  if (!cookieValue || !state) return { verifier: null, expired: false };
  const parts = cookieValue.split(".");
  if (parts.length !== 2) return { verifier: null, expired: false };
  const [encoded, signature] = parts as [string, string];
  if (!safeEqual(hmacSha256(env.AUTH_SECRET, encoded), signature)) {
    return { verifier: null, expired: false };
  }

  let payload: TransactionPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as TransactionPayload;
  } catch {
    return { verifier: null, expired: false };
  }
  if (
    typeof payload.state !== "string" ||
    typeof payload.verifier !== "string" ||
    !payload.state ||
    !payload.verifier ||
    typeof payload.exp !== "number" ||
    !Number.isFinite(payload.exp)
  ) {
    return { verifier: null, expired: false };
  }
  if (payload.exp <= Date.now()) return { verifier: null, expired: true };
  if (!safeEqual(payload.state, state)) return { verifier: null, expired: false };
  return { verifier: payload.verifier, expired: false };
}

/** Returns the PKCE verifier only for a valid, unexpired, state-bound cookie. */
export function verifyGoogleOAuthTransaction(cookieValue: string | undefined | null, state: string): string | null {
  return inspectGoogleOAuthTransaction(cookieValue, state).verifier;
}

/** Validates the id_token against Google's tokeninfo endpoint (fail closed). */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleClaims | null> {
  const clientId = env.GOOGLE_CLIENT_ID;
  if (!clientId || !idToken) return null;
  try {
    const url = new URL(TOKENINFO_URL);
    url.searchParams.set("id_token", idToken);
    const response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const claims = (await response.json()) as Record<string, unknown>;
    if (claims.aud !== clientId) return null;
    if (claims.iss !== "https://accounts.google.com" && claims.iss !== "accounts.google.com") return null;
    // Google's tokeninfo endpoint returns epoch seconds as a JSON string.
    const exp = typeof claims.exp === "number" || typeof claims.exp === "string" ? Number(claims.exp) : Number.NaN;
    if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) return null;
    if (typeof claims.email !== "string" || !claims.email.trim()) return null;
    if (claims.email_verified !== true && claims.email_verified !== "true") return null;
    const sub = typeof claims.sub === "string" ? claims.sub.trim() : "";
    if (!sub) return null;
    const name = typeof claims.name === "string" ? claims.name.trim() : "";
    return { sub, email: claims.email.trim().toLowerCase(), name };
  } catch {
    return null;
  }
}

/** Exchanges the authorization code with PKCE. Returns only the id_token. */
export async function exchangeGoogleCode(code: string, codeVerifier: string): Promise<string | null> {
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  try {
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: googleRedirectUri,
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    });
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const tokens = (await response.json()) as { id_token?: unknown };
    return typeof tokens.id_token === "string" && tokens.id_token ? tokens.id_token : null;
  } catch {
    return null;
  }
}
