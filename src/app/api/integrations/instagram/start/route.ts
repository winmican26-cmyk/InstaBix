import { requireWorkspace, canManage } from "@/lib/auth/session";
import { metaConfigured } from "@/lib/env";
import { authorizeUrl } from "@/lib/instagram/client";
import { createOAuthState } from "@/lib/instagram/oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  const { org, user, role } = await requireWorkspace();
  if (!canManage(role)) {
    return Response.json({ error: "Only owners and admins can connect Instagram." }, { status: 403 });
  }
  if (!metaConfigured) {
    return Response.json(
      { error: "META_APP_ID and META_APP_SECRET are not configured. Nothing was started." },
      { status: 503 },
    );
  }

  const state = createOAuthState(org.id, user.id);
  return Response.redirect(authorizeUrl(state), 303);
}
