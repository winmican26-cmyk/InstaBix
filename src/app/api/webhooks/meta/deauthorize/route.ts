import { and, eq } from "drizzle-orm";
import { pool, withOrg } from "@/lib/db";
import { integrations } from "@/lib/db/schema";
import { insertAudit } from "@/lib/audit";
import { parseSignedRequest } from "@/lib/meta";
import { logger } from "@/lib/logger";
import { clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";

async function orgIdsFor(externalId: string): Promise<string[]> {
  const { rows } = await pool.query<{ org_id: string }>("select unnest(instagram_org_ids($1)) as org_id", [externalId]);
  return rows.map((row) => row.org_id);
}

export async function POST(request: Request) {
  const body = new URLSearchParams(await request.text());
  const signed = body.get("signed_request");
  if (!signed) return Response.json({ error: "signed_request is required." }, { status: 400 });

  const payload = parseSignedRequest(signed);
  if (!payload) return Response.json({ error: "Signature verification failed." }, { status: 401 });

  const externalId = typeof payload.user_id === "string" ? payload.user_id : null;
  if (!externalId) return Response.json({ error: "No account id in the signed request." }, { status: 400 });

  const orgIds = await orgIdsFor(externalId);
  for (const orgId of orgIds) {
    await withOrg(orgId, async (tx) => {
      await tx
        .update(integrations)
        .set({
          status: "disconnected",
          tokenEncrypted: null,
          tokenExpiresAt: null,
          scopes: [],
          lastError: "Deauthorized by the account owner through Meta.",
          updatedAt: new Date(),
        })
        .where(and(eq(integrations.provider, "instagram"), eq(integrations.externalAccountId, externalId)));

      await insertAudit(tx, {
        orgId,
        actorUserId: null,
        action: "instagram.deauthorized",
        entityType: "integration",
        entityId: "instagram",
        metadata: { externalAccountId: externalId, source: "meta_callback" },
        ip: clientIp(request),
      });
    });
  }

  logger.info("instagram.deauthorized", { orgs: orgIds.length });
  return Response.json({ ok: true });
}
