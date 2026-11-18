import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { withOrg } from "@/lib/db";
import { integrations } from "@/lib/db/schema";
import { canManage, requireWorkspace } from "@/lib/auth/session";
import { insertAudit } from "@/lib/audit";
import { encryptSecret } from "@/lib/crypto";
import { env, metaConfigured } from "@/lib/env";
import { exchangeCode, exchangeLongLived, getProfile, tokenExpiry } from "@/lib/instagram/client";
import { verifyOAuthState } from "@/lib/instagram/oauth";
import { logger, errorMessage } from "@/lib/logger";

export const dynamic = "force-dynamic";

function failure(reason: string): never {
  redirect(`/integrations?instagram=error&reason=${encodeURIComponent(reason.slice(0, 180))}`);
}

export async function GET(request: Request) {
  if (!metaConfigured) failure("Meta credentials are not configured.");

  const url = new URL(request.url);
  const error = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (error) failure(error);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) failure("The callback did not include a code and state.");

  const payload = verifyOAuthState(state);
  if (!payload) failure("The OAuth state is invalid or expired. Start the connection again.");

  const { org, user, role } = await requireWorkspace();
  if (!canManage(role)) failure("Your role cannot connect integrations.");
  if (payload.orgId !== org.id || payload.userId !== user.id) {
    failure("The OAuth state does not belong to this session.");
  }

  try {
    const short = await exchangeCode(code);
    const long = await exchangeLongLived(short.access_token);
    const profile = await getProfile(long.access_token);
    const externalAccountId = profile.user_id ?? short.user_id ?? profile.id ?? null;

    await withOrg(org.id, async (tx) => {
      await tx
        .insert(integrations)
        .values({
          orgId: org.id,
          provider: "instagram",
          status: "connected",
          externalAccountId,
          externalUsername: profile.username ?? null,
          scopes: (short.permissions ?? "instagram_business_basic").split(",").map((scope) => scope.trim()).filter(Boolean),
          tokenEncrypted: encryptSecret(long.access_token),
          tokenExpiresAt: tokenExpiry(long.expires_in),
          lastSyncAt: new Date(),
          lastError: null,
          metadata: {
            accountType: profile.account_type ?? null,
            followersCount: profile.followers_count ?? null,
            mediaCount: profile.media_count ?? null,
            connectedVia: "instagram_login",
          },
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [integrations.orgId, integrations.provider],
          set: {
            status: "connected",
            externalAccountId,
            externalUsername: profile.username ?? null,
            scopes: (short.permissions ?? "instagram_business_basic").split(",").map((scope) => scope.trim()).filter(Boolean),
            tokenEncrypted: encryptSecret(long.access_token),
            tokenExpiresAt: tokenExpiry(long.expires_in),
            lastSyncAt: new Date(),
            lastError: null,
            updatedAt: new Date(),
          },
        });

      await insertAudit(tx, {
        orgId: org.id,
        actorUserId: user.id,
        action: "instagram.connected",
        entityType: "integration",
        entityId: "instagram",
        metadata: { username: profile.username ?? null, accountType: profile.account_type ?? null },
        ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      });
    });

    logger.info("instagram.connected", { orgId: org.id, username: profile.username ?? null });
  } catch (error) {
    const message = errorMessage(error);
    logger.warn("instagram.oauth_failed", { orgId: org.id, message });
    await withOrg(org.id, (tx) =>
      tx
        .update(integrations)
        .set({ status: "error", lastError: message.slice(0, 500), updatedAt: new Date() })
        .where(and(eq(integrations.orgId, org.id), eq(integrations.provider, "instagram"))),
    ).catch(() => undefined);
    failure(message);
  }

  redirect("/integrations?instagram=connected");
}

void env;
