import "server-only";
import { and, eq } from "drizzle-orm";
import { weekStartUtc, type QuotaState } from "@/lib/billing/quota";
import { withOrg } from "@/lib/db";
import { creatorUnlocks } from "@/lib/db/schema";

/** One rule for reveal access: an active Pro entitlement or a recorded unlock. */
export function canRevealCreator(quota: QuotaState, unlocked: boolean): boolean {
  return quota.pro || unlocked;
}

/** All creator ids unlocked by this org in the current UTC week. */
export async function listUnlockedCreatorIds(orgId: string, now?: Date): Promise<Set<string>> {
  const weekStart = weekStartUtc(now ?? new Date());
  return withOrg(orgId, async (tx) => {
    const rows = await tx
      .select({ creatorId: creatorUnlocks.creatorId })
      .from(creatorUnlocks)
      .where(and(eq(creatorUnlocks.orgId, orgId), eq(creatorUnlocks.weekStart, weekStart)));
    return new Set(rows.map((row) => row.creatorId));
  });
}
