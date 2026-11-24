import "server-only";
import { and, eq } from "drizzle-orm";
import { withOrg } from "@/lib/db";
import { creatorAccounts } from "@/lib/db/schema";

/**
 * The only profile fields visible before a reveal. Everything else is fetched
 * by the full-detail query and is deliberately absent from this projection.
 */
export async function getCreatorTeaser(orgId: string, creatorId: string) {
  return withOrg(orgId, async (tx) => {
    const [row] = await tx
      .select({
        id: creatorAccounts.id,
        username: creatorAccounts.username,
        displayName: creatorAccounts.displayName,
        niche: creatorAccounts.niche,
        source: creatorAccounts.source,
        status: creatorAccounts.status,
        consentStatus: creatorAccounts.consentStatus,
        createdAt: creatorAccounts.createdAt,
      })
      .from(creatorAccounts)
      .where(and(eq(creatorAccounts.orgId, orgId), eq(creatorAccounts.id, creatorId)))
      .limit(1);
    return row ?? null;
  });
}
