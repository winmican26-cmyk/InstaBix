import { clearSessionCookie, getSessionUser, destroySession } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/http";
import { errorMessage, logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

function logDbFailure(event: string, error: unknown): void {
  logger.error(event, { message: errorMessage(error) });
}

/** Programmatic sign-out for clients that cannot submit a server action. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }

  let session: Awaited<ReturnType<typeof getSessionUser>> = null;
  try {
    session = await getSessionUser();
  } catch (error) {
    logDbFailure("auth.logout.session_lookup_failed", error);
  }

  try {
    await destroySession();
  } catch (error) {
    logDbFailure("auth.logout.session_destroy_failed", error);
  }
  await clearSessionCookie();

  if (session) logger.info("auth.logout", { userId: session.user.id });
  return new Response(null, { status: 303, headers: { Location: "/login" } });
}
