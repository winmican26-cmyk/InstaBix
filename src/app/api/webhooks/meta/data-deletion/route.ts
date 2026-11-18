import { and, eq, inArray } from "drizzle-orm";
import { pool, withOrg } from "@/lib/db";
import { creatorAccounts, creatorSnapshots, integrations, media, scores } from "@/lib/db/schema";
import { insertAudit } from "@/lib/audit";
import { parseSignedRequest } from "@/lib/meta";
import { sha256 } from "@/lib/crypto";
import { absoluteUrl } from "@/lib/utils";
import { clientIp } from "@/lib/http";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

async function orgIdsFor(externalId: string): Promise<string[]> {
  const { rows } = await pool.query<{ org_id: string }>("select unnest(instagram_org_ids($1)) as org_id", [externalId]);
  return rows.map((row) => row.org_id);
}

/**
 * Meta data-deletion callback. Removes the stored Instagram-derived rows for the
 * account that asked: the integration token, public media samples, snapshots and
 * scores. The audit entry stays, without any of the deleted content.
 */
export async function POST(request: Request) {
  const body = new URLSearchParams(await request.text());
  const signed = body.get("signed_request");
  if (!signed) return Response.json({ error: "signed_request is required." }, { status: 400 });

  const payload = parseSignedRequest(signed);
  if (!payload) return Response.json({ error: "Signature verification failed." }, { status: 401 });

  const externalId = typeof payload.user_id === "string" ? payload.user_id : null;
  if (!externalId) return Response.json({ error: "No account id in the signed request." }, { status: 400 });

  const orgIds = await orgIdsFor(externalId);
  let removed = 0;

  for (const orgId of orgIds) {
    await withOrg(orgId, async (tx) => {
      const creatorRows = await tx
        .select({ id: creatorAccounts.id })
        .from(creatorAccounts)
        .where(and(eq(creatorAccounts.orgId, orgId), eq(creatorAccounts.igUserId, externalId)));
      const creatorIds = creatorRows.map((row) => row.id);

      if (creatorIds.length > 0) {
        await tx.delete(media).where(inArray(media.creatorId, creatorIds));
        await tx.delete(creatorSnapshots).where(inArray(creatorSnapshots.creatorId, creatorIds));
        await tx.delete(scores).where(inArray(scores.creatorId, creatorIds));
        await tx
          .update(creatorAccounts)
          .set({ igUserId: null, profilePictureUrl: null, updatedAt: new Date() })
          .where(inArray(creatorAccounts.id, creatorIds));
        removed += creatorIds.length;
      }

      await tx
        .delete(integrations)
        .where(and(eq(integrations.orgId, orgId), eq(integrations.provider, "instagram"), eq(integrations.externalAccountId, externalId)));

      await insertAudit(tx, {
        orgId,
        actorUserId: null,
        action: "instagram.data_deleted",
        entityType: "integration",
        entityId: "instagram",
        metadata: { externalAccountId: externalId, creatorsCleared: creatorIds.length, source: "meta_callback" },
        ip: clientIp(request),
      });
    });
  }

  const confirmationCode = sha256(`${externalId}:${orgIds.join(",")}`).slice(0, 24);
  logger.info("instagram.data_deleted", { orgs: orgIds.length, creators: removed });

  return Response.json({
    url: absoluteUrl("/legal/privacy#data-deletion"),
    confirmation_code: confirmationCode,
  });
}
