import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { withOrg } from "@/lib/db";
import { creatorUnlocks, orgEntitlements } from "@/lib/db/schema";

export const FREE_WEEKLY_UNLOCKS = 10;

/** Monday 00:00 UTC of the ISO week containing `now`, formatted as YYYY-MM-DD. */
export function weekStartUtc(now: Date = new Date()): string {
  const dayOfWeek = now.getUTCDay(); // Sunday is 0; Monday is 1.
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const monday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday),
  );
  return monday.toISOString().slice(0, 10);
}

export type QuotaState = {
  plan: string;
  status: string;
  pro: boolean;
  limit: number;
  used: number;
  remaining: number;
  weekStart: string;
};

export type UnlockResult =
  | { ok: true; used: number; remaining: number; weekStart: string }
  | { ok: false; reason: "quota_exceeded"; used: number; limit: number; weekStart: string };

/** Thrown inside the unlock transaction to force a rollback of the rejected insert. */
export class UnlockQuotaExceededError extends Error {
  readonly used: number;
  readonly limit: number;
  readonly weekStart: string;

  constructor(used: number, limit: number, weekStart: string) {
    super("Weekly creator unlock quota exceeded.");
    this.name = "UnlockQuotaExceededError";
    this.used = used;
    this.limit = limit;
    this.weekStart = weekStart;
  }
}

async function usedThisWeek(
  tx: Parameters<Parameters<typeof withOrg>[1]>[0],
  orgId: string,
  weekStart: string,
): Promise<number> {
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(creatorUnlocks)
    .where(and(eq(creatorUnlocks.orgId, orgId), eq(creatorUnlocks.weekStart, weekStart)));
  return Number(row?.count ?? 0);
}

function isPro(entitlement: { plan: string; status: string; currentPeriodEnd: Date | null }, at: Date): boolean {
  return (
    entitlement.plan === "pro"
    && entitlement.status === "active"
    && entitlement.currentPeriodEnd !== null
    && entitlement.currentPeriodEnd.getTime() > at.getTime()
  );
}

/** Current org quota snapshot. Pro still reports a 10-slot limit; callers bypass with `pro`. */
export async function getQuotaState(orgId: string, now?: Date): Promise<QuotaState> {
  const at = now ?? new Date();
  const weekStart = weekStartUtc(at);
  return withOrg(orgId, async (tx) => {
    const [row] = await tx
      .select({
        plan: orgEntitlements.plan,
        status: orgEntitlements.status,
        currentPeriodEnd: orgEntitlements.currentPeriodEnd,
      })
      .from(orgEntitlements)
      .where(eq(orgEntitlements.orgId, orgId))
      .limit(1);
    const plan = row?.plan ?? "free";
    const status = row?.status ?? "inactive";
    const used = await usedThisWeek(tx, orgId, weekStart);
    return {
      plan,
      status,
      pro: isPro(
        { plan, status, currentPeriodEnd: row?.currentPeriodEnd ?? null },
        at,
      ),
      limit: FREE_WEEKLY_UNLOCKS,
      used,
      remaining: Math.max(0, FREE_WEEKLY_UNLOCKS - used),
      weekStart,
    };
  });
}

/** Org-scoped, week-scoped existence check for a single creator unlock. */
export async function hasUnlocked(orgId: string, creatorId: string, now?: Date): Promise<boolean> {
  const weekStart = weekStartUtc(now ?? new Date());
  return withOrg(orgId, async (tx) => {
    const rows = await tx
      .select({ id: creatorUnlocks.id })
      .from(creatorUnlocks)
      .where(
        and(
          eq(creatorUnlocks.orgId, orgId),
          eq(creatorUnlocks.creatorId, creatorId),
          eq(creatorUnlocks.weekStart, weekStart),
        ),
      )
      .limit(1);
    return rows.length > 0;
  });
}

/**
 * Record a creator unlock for the injected `now`'s ISO week. Concurrent calls for
 * one org/week are serialized by a transaction-scoped advisory lock so the
 * 10-unlock free cap cannot be raced.
 */
export async function unlockCreator(
  orgId: string,
  userId: string,
  creatorId: string,
  now?: Date,
): Promise<UnlockResult> {
  const at = now ?? new Date();
  const weekStart = weekStartUtc(at);
  try {
    return await withOrg(orgId, async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'creator-unlock:' + orgId + ':' + weekStart}))`);

      const [entitlement] = await tx
        .select({
          plan: orgEntitlements.plan,
          status: orgEntitlements.status,
          currentPeriodEnd: orgEntitlements.currentPeriodEnd,
        })
        .from(orgEntitlements)
        .where(eq(orgEntitlements.orgId, orgId))
        .limit(1);
      const pro = isPro(
        {
          plan: entitlement?.plan ?? "free",
          status: entitlement?.status ?? "inactive",
          currentPeriodEnd: entitlement?.currentPeriodEnd ?? null,
        },
        at,
      );

      await tx
        .insert(creatorUnlocks)
        .values({ orgId, creatorId, unlockedBy: userId, weekStart })
        .onConflictDoNothing()
        .returning({ id: creatorUnlocks.id });

      const used = await usedThisWeek(tx, orgId, weekStart);
      if (!pro && used > FREE_WEEKLY_UNLOCKS) {
        throw new UnlockQuotaExceededError(used, FREE_WEEKLY_UNLOCKS, weekStart);
      }
      return {
        ok: true as const,
        used,
        remaining: Math.max(0, FREE_WEEKLY_UNLOCKS - used),
        weekStart,
      };
    });
  } catch (error) {
    if (error instanceof UnlockQuotaExceededError) {
      return {
        ok: false,
        reason: "quota_exceeded",
        used: error.used,
        limit: error.limit,
        weekStart: error.weekStart,
      };
    }
    throw error;
  }
}
