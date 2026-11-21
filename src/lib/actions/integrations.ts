"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { withOrg, db } from "@/lib/db";
import { integrations, messages, orgs } from "@/lib/db/schema";
import { requireWorkspace } from "@/lib/auth/session";
import { insertAudit } from "@/lib/audit";
import { syncOwnAccount } from "@/lib/instagram/sync";
import { sendEmail } from "@/lib/email/resend";
import { aiConfigured, metaConfigured, resendConfigured, stripeConfigured } from "@/lib/env";
import { logger, errorMessage } from "@/lib/logger";

export type IntegrationState = { error?: string; success?: string };

async function requestIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

export async function syncInstagramAction(): Promise<IntegrationState> {
  const { user, org } = await requireWorkspace();
  const result = await syncOwnAccount(org.id);
  const ip = await requestIp();

  await withOrg(org.id, async (tx) =>
    insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: result.ok ? "instagram.synced" : "instagram.sync_failed",
      entityType: "integration",
      entityId: "instagram",
      metadata: result.ok
        ? { username: result.username ?? null, followers: result.followers ?? null, mediaCount: result.mediaCount ?? null }
        : { error: result.error ?? "unknown" },
      ip,
    }),
  );

  revalidatePath("/integrations");
  revalidatePath("/dashboard");
  if (!result.ok) return { error: result.error ?? "Sync failed." };
  return {
    success: `Synced @${result.username ?? "account"} · ${result.followers ?? 0} followers · ${result.mediaCount ?? 0} media items.`,
  };
}

export async function disconnectInstagramAction(): Promise<IntegrationState> {
  const { user, org, role } = await requireWorkspace();
  if (role !== "owner" && role !== "admin") return { error: "Only owners and admins can disconnect an integration." };

  const updated = await withOrg(org.id, async (tx) => {
    const [row] = await tx
      .update(integrations)
      .set({
        status: "disconnected",
        tokenEncrypted: null,
        tokenExpiresAt: null,
        scopes: [],
        lastError: null,
        updatedAt: new Date(),
      })
      .where(and(eq(integrations.orgId, org.id), eq(integrations.provider, "instagram")))
      .returning({ id: integrations.id });
    if (!row) return null;
    await insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: "instagram.disconnected",
      entityType: "integration",
      entityId: row.id,
      metadata: { tokensRevokedLocally: true },
      ip: await requestIp(),
    });
    return row;
  });

  revalidatePath("/integrations");
  revalidatePath("/dashboard");
  if (!updated) return { error: "Instagram is not connected in this workspace." };
  return { success: "Disconnected. Stored tokens were deleted and the workspace is empty again. Audit history is intact." };
}

export async function sendTestEmailAction(): Promise<IntegrationState> {
  const { user, org } = await requireWorkspace();
  if (!resendConfigured) {
    return {
      error: "Email is not configured. Add RESEND_API_KEY, OUTREACH_FROM, EMAIL_FROM_DOMAIN and OUTREACH_PHYSICAL_ADDRESS.",
    };
  }

  const result = await sendEmail({
    orgId: org.id,
    to: user.email,
    subject: "VistaBix delivery check",
    text: `This is a delivery check from ${org.name}.\n\nIf you can read this, Resend accepted the message and your domain authentication is working. Unsubscribe links in real outreach are signed per recipient.\n\nRequested by ${user.name}.`,
    idempotencyKey: `test:${org.id}:${Date.now()}`,
  });

  const ip = await requestIp();
  await withOrg(org.id, async (tx) =>
    insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: result.ok ? "email.test_sent" : "email.test_failed",
      entityType: "integration",
      entityId: "resend",
      metadata: result.ok ? { providerId: result.id ?? null } : { error: result.error },
      ip,
    }),
  );

  revalidatePath("/integrations");
  if (!result.ok) return { error: `Resend rejected the message: ${result.error}` };
  return { success: `Delivery check accepted by Resend for ${user.email} (id ${result.id ?? "n/a"}). Check the inbox.` };
}

export async function refreshCapabilityAction(): Promise<IntegrationState> {
  const { org } = await requireWorkspace();
  const status = {
    instagram: metaConfigured,
    resend: resendConfigured,
    stripe: stripeConfigured,
    anthropic: aiConfigured,
  };
  return {
    success: `Capabilities — Instagram: ${status.instagram ? "configured" : "missing keys"} · Email: ${status.resend ? "configured" : "missing keys"} · Stripe: ${status.stripe ? "configured" : "missing keys"} · AI: ${status.anthropic ? "configured" : "missing keys"} (${org.name})`,
  };
}

/** Operator kill switch, also used by the outreach page. Mirrored here for the integrations surface. */
export async function setGlobalSendLockAction(locked: boolean): Promise<IntegrationState> {
  const { user, org, role } = await requireWorkspace();
  if (role !== "owner" && role !== "admin") return { error: "Only owners and admins can change the send lock." };

  await withOrg(org.id, async (tx) => {
    await tx.execute(
      sql`update orgs set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{outreachPaused}', ${JSON.stringify(locked)}::jsonb, true), updated_at = now() where id = ${org.id}`,
    );
    await insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: locked ? "outreach.paused" : "outreach.resumed",
      entityType: "org",
      entityId: org.id,
      metadata: { source: "integrations" },
      ip: await requestIp(),
    });
  });

  revalidatePath("/integrations");
  revalidatePath("/outreach");
  return { success: locked ? "Outbound sending is locked." : "Outbound sending is unlocked." };
}

/**
 * Records a failed provider call without pretending the integration is healthy.
 * Called by the integration surfaces when a key exists but the provider refuses.
 */
export async function recordIntegrationErrorAction(provider: "instagram" | "resend" | "stripe" | "anthropic", message: string) {
  const { org } = await requireWorkspace();
  try {
    await withOrg(org.id, (tx) =>
      tx
        .update(integrations)
        .set({ status: "error", lastError: message.slice(0, 500), updatedAt: new Date() })
        .where(and(eq(integrations.orgId, org.id), eq(integrations.provider, provider))),
    );
  } catch (error) {
    logger.warn("integration.error_record_failed", { provider, message: errorMessage(error) });
  }
}

export async function queueDepthAction(): Promise<{ queued: number; needsApproval: number }> {
  const { org } = await requireWorkspace();
  const [pending] = await withOrg(org.id, (tx) =>
    tx.select({ n: sql<number>`count(*)::int` }).from(messages).where(eq(messages.status, "needs_approval")),
  );
  const [orgRow] = await db.select({ settings: orgs.settings }).from(orgs).where(eq(orgs.id, org.id)).limit(1);
  const queued = orgRow?.settings?.outreachPaused === true ? 0 : (pending?.n ?? 0);
  return { queued, needsApproval: pending?.n ?? 0 };
}
