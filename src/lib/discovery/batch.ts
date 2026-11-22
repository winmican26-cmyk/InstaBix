import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { withOrg } from "@/lib/db";
import { creatorAccounts } from "@/lib/db/schema";
import { insertAudit } from "@/lib/audit";
import { enrichCreator, type EnrichResult } from "@/lib/instagram/sync";
import { DISCOVERY_BATCH_LIMIT, parseHandles } from "./parse-handles";

export type DiscoveryBatchStatus =
  | "pending"
  | "enriched"
  | "not_found"
  | "not_eligible"
  | "rate_limited"
  | "error";

export type DiscoveryBatchItem = {
  handle: string;
  status: DiscoveryBatchStatus;
  creatorId?: string;
  message?: string;
  retryAfterSeconds?: number;
};

export type DiscoveryBatchResult = {
  items: DiscoveryBatchItem[];
  rejected: string[];
  rateLimit?: { seconds: number; message: string };
  error?: string;
};

function fromEnrichResult(handle: string, creatorId: string, result: EnrichResult): DiscoveryBatchItem {
  const base = { handle, creatorId, message: result.message ?? result.error };
  if (result.ok) return { ...base, status: "enriched" };
  if (result.status === "not_found") return { ...base, status: "not_found" };
  if (result.status === "not_eligible") return { ...base, status: "not_eligible" };
  if (result.status === "rate_limited" || typeof result.retryAfterSeconds === "number") {
    return { ...base, status: "rate_limited", retryAfterSeconds: result.retryAfterSeconds ?? 60 };
  }
  return { ...base, status: "error" };
}

/**
 * Consent-safe batch import. New and non-granted handles are only stored; the
 * single outbound path is enrichCreator, which is called solely for creators
 * whose consent is already granted in this org.
 */
export async function runDiscoveryBatch(
  orgId: string,
  actorUserId: string,
  input: string | string[],
): Promise<DiscoveryBatchResult> {
  const { handles, rejected } = parseHandles(input);
  if (handles.length > DISCOVERY_BATCH_LIMIT) {
    return { items: [], rejected, rateLimit: undefined, error: "A batch can contain at most 50 unique handles." };
  }

  const result: DiscoveryBatchResult = { items: [], rejected };
  if (handles.length === 0) return result;

  const existing = await withOrg(orgId, (tx) =>
    tx
      .select({ id: creatorAccounts.id, username: creatorAccounts.username, consentStatus: creatorAccounts.consentStatus })
      .from(creatorAccounts)
      .where(and(eq(creatorAccounts.orgId, orgId), inArray(creatorAccounts.username, handles))),
  );
  const byUsername = new Map(existing.map((row) => [row.username, row]));

  let rateLimited = false;
  let maxRetry = 0;

  for (const handle of handles) {
    const row = byUsername.get(handle);

    if (row) {
      if (row.consentStatus !== "granted") {
        result.items.push({
          handle,
          status: "pending",
          creatorId: row.id,
          message: "No Meta API call was made until consent is granted.",
        });
        continue;
      }
      if (rateLimited) {
        result.items.push({
          handle,
          status: "rate_limited",
          creatorId: row.id,
          message: "Discovery is rate limited. Try again shortly.",
          retryAfterSeconds: maxRetry,
        });
        continue;
      }
      const enriched = await enrichCreator(orgId, row.id);
      const item = fromEnrichResult(handle, row.id, enriched);
      result.items.push(item);
      if (item.status === "rate_limited") {
        rateLimited = true;
        maxRetry = Math.max(maxRetry, item.retryAfterSeconds ?? 60);
      }
      continue;
    }

    const created = await withOrg(orgId, async (tx) => {
      const [inserted] = await tx
        .insert(creatorAccounts)
        .values({
          orgId,
          username: handle,
          source: "discovery",
          consentStatus: "pending",
          status: "new",
          createdBy: actorUserId,
        })
        .onConflictDoNothing({ target: [creatorAccounts.orgId, creatorAccounts.username] })
        .returning({ id: creatorAccounts.id });
      if (inserted) {
        await insertAudit(tx, {
          orgId,
          actorUserId,
          action: "creator.created",
          entityType: "creator",
          entityId: inserted.id,
          metadata: { username: handle, source: "discovery", via: "batch" },
          ip: null,
        });
        return inserted;
      }
      // A concurrent import may have inserted the same handle after the read above.
      const [current] = await tx
        .select({ id: creatorAccounts.id })
        .from(creatorAccounts)
        .where(and(eq(creatorAccounts.orgId, orgId), eq(creatorAccounts.username, handle)))
        .limit(1);
      return current ?? null;
    });

    result.items.push({
      handle,
      status: "pending",
      creatorId: created?.id,
      message: "Consent must be collected before enrichment. No Meta API call was made.",
    });
  }

  if (rateLimited) {
    const seconds = maxRetry > 0 ? maxRetry : 60;
    result.rateLimit = { seconds, message: "Discovery is rate limited. Try again shortly." };
  }
  return result;
}
