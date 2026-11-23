import { cookies } from "next/headers";
import {
  GOOGLE_OAUTH_COOKIE,
  buildGoogleAuthorizeUrl,
  createGoogleOAuthTransaction,
  googleCookieOptions,
} from "@/lib/auth/google-oauth";
import { googleOAuthConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  if (!googleOAuthConfigured) {
    return new Response("Google sign-in is not configured.", { status: 503 });
  }

  const transaction = createGoogleOAuthTransaction();
  const jar = await cookies();
  jar.set(GOOGLE_OAUTH_COOKIE, transaction.cookieValue, googleCookieOptions());
  return Response.redirect(buildGoogleAuthorizeUrl(transaction.state, transaction.codeChallenge), 303);
}
