import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { withOrg } from "@/lib/db";
import { creatorAccounts, creatorSnapshots, integrations, media, scores } from "@/lib/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { scoreCreator } from "@/lib/scoring";
import { logger, errorMessage } from "@/lib/logger";
import { businessDiscovery, getMedia, getProfile, InstagramError, refreshLongLived, tokenExpiry } from "./client";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Business Discovery spends the shared Meta discovery token. 25 calls/hour per org
 * is enough for routine enrichment, while 200/hour across the whole deployment keeps
 * a conservative global ceiling below typical platform quotas. Both counters live in
 * Postgres so every serverless instance spends the same shared budget.
 */
export const DISCOVERY_PER_ORG_HOURLY_LIMIT = 25;
export const DISCOVERY_GLOBAL_HOURLY_LIMIT = 200;
const DISCOVERY_WINDOW_SECONDS = 60 * 60;

type IntegrationRow = typeof integrations.$inferSelect;

async function loadInstagramIntegration(orgId: string, provider: "instagram" | "instagram_discovery" = "instagram") {
  const [row] = await withOrg(orgId, (tx) =>
    tx.select().from(integrations).where(eq(integrations.provider, provider)).limit(1),
  );
  return row ?? null;
}

async function tokenFor(row: IntegrationRow): Promise<string> {
  if (!row.tokenEncrypted) throw new InstagramError("No access token is stored for this integration.", 401);
  let token = decryptSecret(row.tokenEncrypted);
  if (row.tokenExpiresAt && row.tokenExpiresAt.getTime() - Date.now() < 7 * 86_400_000) {
    try {
      const refreshed = await refreshLongLived(token);
      token = refreshed.access_token;
      await withOrg(row.orgId, (tx) =>
        tx
          .update(integrations)
          .set({
            tokenEncrypted: encryptSecret(token),
            tokenExpiresAt: tokenExpiry(refreshed.expires_in),
            updatedAt: new Date(),
          })
          .where(eq(integrations.id, row.id)),
      );
    } catch (error) {
      logger.warn("instagram.refresh_failed", { message: errorMessage(error) });
    }
  }
  return token;
}

export type SyncResult = {
  ok: boolean;
  username?: string;
  followers?: number;
  mediaCount?: number;
  error?: string;
};

/** Refreshes the connected account's own profile. Public metrics of others are not available here. */
export async function syncOwnAccount(orgId: string): Promise<SyncResult> {
  const row = await loadInstagramIntegration(orgId);
  if (!row || row.status !== "connected") return { ok: false, error: "Instagram is not connected." };

  try {
    const token = await tokenFor(row);
    const profile = await getProfile(token);
    const igUserId = profile.user_id ?? profile.id ?? row.externalAccountId;

    const ownMedia = igUserId ? await getMedia(token, igUserId, 12).catch(() => []) : [];

    await withOrg(orgId, (tx) =>
      tx
        .update(integrations)
        .set({
          status: "connected",
          externalAccountId: igUserId ?? row.externalAccountId,
          externalUsername: profile.username ?? row.externalUsername,
          lastSyncAt: new Date(),
          lastError: null,
          metadata: {
            followersCount: profile.followers_count ?? null,
            mediaCount: profile.media_count ?? null,
            accountType: profile.account_type ?? null,
            profilePictureUrl: profile.profile_picture_url ?? null,
            recentMediaSample: ownMedia.length,
          },
          updatedAt: new Date(),
        })
        .where(eq(integrations.id, row.id)),
    );

    return {
      ok: true,
      username: profile.username,
      followers: profile.followers_count,
      mediaCount: profile.media_count,
    };
  } catch (error) {
    const message = errorMessage(error);
    await withOrg(orgId, (tx) =>
      tx.update(integrations).set({ status: "error", lastError: message, updatedAt: new Date() }).where(eq(integrations.id, row.id)),
    );
    logger.warn("instagram.sync_failed", { orgId, message });
    return { ok: false, error: message };
  }
}

export type EnrichResult = {
  ok: boolean;
  enriched?: boolean;
  snapshot?: boolean;
  error?: string;
  message?: string;
  retryAfterSeconds?: number;
};

/**
 * Enriches one creator from public data only. Media is append-only/upserted, and a
 * score is recomputed from the stored snapshot so the result is reproducible.
 */
export async function enrichCreator(orgId: string, creatorId: string): Promise<EnrichResult> {
  const [creator] = await withOrg(orgId, (tx) =>
    tx.select().from(creatorAccounts).where(eq(creatorAccounts.id, creatorId)).limit(1),
  );
  if (!creator) return { ok: false, error: "Creator not found." };
  if (creator.consentStatus === "revoked") return { ok: false, error: "Consent has been revoked. Enrichment is disabled." };

  let limits: Awaited<ReturnType<typeof checkRateLimit>>[];
  try {
    limits = await Promise.all([
      checkRateLimit(`discovery:org:${orgId}:hourly`, DISCOVERY_PER_ORG_HOURLY_LIMIT, DISCOVERY_WINDOW_SECONDS),
      checkRateLimit("discovery:global:hourly", DISCOVERY_GLOBAL_HOURLY_LIMIT, DISCOVERY_WINDOW_SECONDS),
    ]);
  } catch {
    // Fail closed: without the shared budget check, no Graph request may go out.
    return { ok: false, error: "Rate limit check unavailable. Try again shortly.", retryAfterSeconds: 60 };
  }
  const [orgLimit, globalLimit] = limits;
  if (!orgLimit || !globalLimit || !orgLimit.ok || !globalLimit.ok) {
    const retryAfterSeconds = Math.max(orgLimit?.retryAfterSeconds ?? 60, globalLimit?.retryAfterSeconds ?? 60);
    return { ok: false, error: "Discovery is rate limited. Try again shortly.", retryAfterSeconds };
  }

  let discovery;
  try {
    discovery = await businessDiscovery(creator.username);
  } catch (error) {
    const message = errorMessage(error);
    logger.warn("instagram.enrich_failed", { orgId, creatorId, message });
    return { ok: false, error: message };
  }

  const followers = discovery.profile.followers_count ?? 0;
  const mediaCount = discovery.profile.media_count ?? discovery.media.length;
  const requestId = (discovery.raw as { id?: string })?.id ?? null;

  await withOrg(orgId, async (tx) => {
    await tx.insert(creatorSnapshots).values({
      orgId,
      creatorId,
      followers,
      mediaCount,
      apiVersion: process.env.GRAPH_VERSION ?? "v23.0",
      requestId,
      raw: { source: "business_discovery", mediaSample: discovery.media.length },
    });

    for (const item of discovery.media) {
      await tx
        .insert(media)
        .values({
          orgId,
          creatorId,
          igMediaId: item.id,
          mediaType: item.media_type ?? null,
          caption: item.caption ?? null,
          permalink: item.permalink ?? null,
          thumbnailUrl: item.thumbnail_url ?? null,
          postedAt: item.timestamp ? new Date(item.timestamp) : null,
          likeCount: item.like_count ?? 0,
          commentCount: item.comments_count ?? 0,
          // Views are omitted for some media types; keep SQL NULL, never zero.
          viewCount: item.view_count ?? null,
          metricsCapturedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [media.orgId, media.igMediaId],
          set: {
            likeCount: item.like_count ?? 0,
            commentCount: item.comments_count ?? 0,
            viewCount: item.view_count ?? null,
            caption: item.caption ?? null,
            metricsCapturedAt: new Date(),
          },
        });
    }
  });

  const recomputed = await recomputeScore(orgId, creatorId);
  return {
    ok: true,
    enriched: true,
    snapshot: recomputed.ok,
    message: recomputed.ok
      ? `Public metrics refreshed. Score ${recomputed.total} from ${recomputed.sampleSize} posts.`
      : recomputed.message,
  };
}

export type RecomputeResult =
  | { ok: true; total: number; sampleSize: number }
  | { ok: false; message: string; sampleSize?: number };

export async function recomputeScore(orgId: string, creatorId: string): Promise<RecomputeResult> {
  const data = await withOrg(orgId, async (tx) => {
    const [snapshot] = await tx
      .select()
      .from(creatorSnapshots)
      .where(eq(creatorSnapshots.creatorId, creatorId))
      .orderBy(desc(creatorSnapshots.capturedAt))
      .limit(1);
    const rows = await tx
      .select()
      .from(media)
      .where(eq(media.creatorId, creatorId))
      .orderBy(desc(media.postedAt))
      .limit(24);
    return { snapshot, rows };
  });

  if (!data.snapshot) return { ok: false, message: "No follower snapshot yet. Connect discovery and enrich this creator first." };

  const result = scoreCreator({
    followers: data.snapshot.followers,
    media: data.rows.map((m) => ({
      likes: m.likeCount,
      comments: m.commentCount,
      views: m.viewCount ?? null,
      caption: m.caption,
      postedAt: m.postedAt,
    })),
  });

  if (!result.ok) return { ok: false, message: result.message, sampleSize: result.sampleSize };

  await withOrg(orgId, (tx) =>
    tx.insert(scores).values({
      orgId,
      creatorId,
      modelVersion: result.modelVersion,
      total: result.total.toFixed(2),
      sampleSize: result.sampleSize,
      factors: result.factors,
      inputsHash: result.inputsHash,
    }),
  );

  return { ok: true, total: result.total, sampleSize: result.sampleSize };
}

export async function latestScore(orgId: string, creatorId: string) {
  const [row] = await withOrg(orgId, (tx) =>
    tx
      .select()
      .from(scores)
      .where(and(eq(scores.creatorId, creatorId), eq(scores.orgId, orgId)))
      .orderBy(desc(scores.computedAt))
      .limit(1),
  );
  return row ?? null;
}
