import "server-only";
import { db } from "@/lib/db";
import { auditEvents } from "@/lib/db/schema";
import type { Tx } from "@/lib/db";

export type AuditInput = {
  orgId: string;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
};

export async function insertAudit(tx: Tx, input: AuditInput): Promise<void> {
  await tx.insert(auditEvents).values({
    orgId: input.orgId,
    actorUserId: input.actorUserId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    metadata: input.metadata ?? {},
    ip: input.ip ?? null,
  });
}

export async function audit(input: AuditInput): Promise<void> {
  await db.insert(auditEvents).values({
    orgId: input.orgId,
    actorUserId: input.actorUserId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    metadata: input.metadata ?? {},
    ip: input.ip ?? null,
  });
}
