import { getSessionUser, destroySession } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/http";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** Programmatic sign-out for clients that cannot submit a server action. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }

  const session = await getSessionUser();
  await destroySession();
  if (session) logger.info("auth.logout", { userId: session.user.id });
  return Response.json({ ok: true });
}
