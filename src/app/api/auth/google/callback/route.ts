import { asc, eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { logActionFailure } from "@/lib/action-errors";
import { insertAudit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth/password";
import { canAccessOperator, CREATOR_ROLE, type Role } from "@/lib/auth/roles";
import {
  GOOGLE_OAUTH_COOKIE,
  exchangeGoogleCode,
  googleCookieOptions,
  inspectGoogleOAuthTransaction,
  verifyGoogleIdToken,
} from "@/lib/auth/google-oauth";
import { createSession } from "@/lib/auth/session";
import { randomToken } from "@/lib/crypto";
import { db, withOrg } from "@/lib/db";
import { memberships, users, type User } from "@/lib/db/schema";
import { googleOAuthConfigured } from "@/lib/env";
import { clientIpFromHeaders } from "@/lib/http";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type MembershipRow = { orgId: string; role: Role };

/** Callback query keys that must never survive into the destination URL. */
const CALLBACK_QUERY_PARAMS = ["signin", "code", "state", "iss", "scope", "authuser", "hd", "prompt"] as const;

/**
 * Every terminal branch clears the short-lived OAuth cookie and returns a tiny
 * HTML page instead of a redirect. The hosting layer copies the incoming
 * callback query onto redirects whose target has no query string, so the page
 * removes those params in the browser and then navigates to a fixed,
 * server-controlled destination.
 */
async function finish(path: string): Promise<Response> {
  const jar = await cookies();
  // Same path/options as the setter, with an expired maxAge, so the transaction
  // cookie is removed even on error paths.
  jar.set(GOOGLE_OAUTH_COOKIE, "", { ...googleCookieOptions(), maxAge: 0 });
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Signing in</title></head><body><script>(function(){var u=new URL(location.href);${JSON.stringify([...CALLBACK_QUERY_PARAMS])}.forEach(function(k){u.searchParams.delete(k)});history.replaceState(null,"",u.pathname+u.search+u.hash);location.replace(${JSON.stringify(path)});})();</script></body></html>`;
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function loginError(code: string): Promise<Response> {
  return finish(`/login?error=${code}`);
}

export async function GET(request: Request): Promise<Response> {
  if (!googleOAuthConfigured) return loginError("google_unavailable");

  const params = new URL(request.url).searchParams;
  if (params.get("error")) return loginError("google_invalid");
  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return loginError("google_invalid");

  const jar = await cookies();
  const transaction = inspectGoogleOAuthTransaction(jar.get(GOOGLE_OAUTH_COOKIE)?.value, state);
  if (!transaction.verifier) {
    return loginError(transaction.expired ? "google_expired" : "google_invalid");
  }

  let claims: Awaited<ReturnType<typeof verifyGoogleIdToken>>;
  try {
    const idToken = await exchangeGoogleCode(code, transaction.verifier);
    if (!idToken) throw new Error("Google token exchange returned no id_token.");
    claims = await verifyGoogleIdToken(idToken);
    if (!claims) throw new Error("Google id_token claims were rejected.");
  } catch (error) {
    logActionFailure("auth.google.callback_failed", error);
    return loginError("google_failed");
  }

  const email = claims.email.toLowerCase();
  const ip = clientIpFromHeaders(await headers()) ?? "local";

  let limit: Awaited<ReturnType<typeof checkRateLimit>>;
  try {
    limit = await checkRateLimit(`google:${ip}:${email}`, 8, 15 * 60);
  } catch (error) {
    logActionFailure("auth.google.rate_limit_failed", error);
    return loginError("google_failed");
  }
  if (!limit.ok) return loginError("google_blocked");

  let user: User | undefined;
  let membershipRows: MembershipRow[] = [];
  try {
    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
    user = existing[0];
    if (!user) {
      // password_hash is NOT NULL: a random, unguessable hash makes password
      // login impossible for a Google-only account. The plaintext is discarded.
      const passwordHash = await hashPassword(randomToken(32));
      const localPart = email.split("@")[0]?.trim() || "User";
      const name = (claims.name || localPart).slice(0, 80) || localPart.slice(0, 80);
      await db
        .insert(users)
        .values({ email, name, passwordHash, emailVerifiedAt: new Date() })
        .onConflictDoNothing();
      user = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
    }
    if (!user) throw new Error("Unable to resolve the Google user.");

    await db
      .update(users)
      .set({
        ...(user.emailVerifiedAt ? {} : { emailVerifiedAt: new Date() }),
        lastLoginAt: new Date(),
      })
      .where(eq(users.id, user.id));

    membershipRows = await db
      .select({ orgId: memberships.orgId, role: memberships.role })
      .from(memberships)
      .where(eq(memberships.userId, user.id))
      .orderBy(asc(memberships.createdAt));
  } catch (error) {
    logActionFailure("auth.google.provision_failed", error);
    return loginError("google_failed");
  }

  const first = membershipRows[0];
  const orgId = first?.orgId ?? null;
  try {
    await createSession(user.id, orgId);
  } catch (error) {
    logActionFailure("auth.google.session_failed", error);
    return loginError("google_failed");
  }

  if (orgId) {
    try {
      await withOrg(orgId, async (tx) => {
        await insertAudit(tx, {
          orgId,
          actorUserId: user.id,
          action: "auth.login",
          entityType: "session",
          ip,
        });
      });
    } catch (error) {
      // Auditing must never turn a successful login into a failure.
      logger.warn("audit.google_login_failed", { message: error instanceof Error ? error.message : "unknown" });
    }
  }

  const creatorOnly =
    first?.role === CREATOR_ROLE && !membershipRows.some((row) => canAccessOperator(row.role));
  const destination = creatorOnly ? "/creator" : first ? "/dashboard" : "/onboarding";
  return finish(destination);
}
