"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { withOrg } from "@/lib/db";
import {
  creatorAccounts,
  messageEvents,
  messages,
  orgs,
  sequenceSteps,
  sequences,
  suppressions,
} from "@/lib/db/schema";
import { requireWorkspace, canReview } from "@/lib/auth/session";
import { insertAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email/resend";
import { env, resendConfigured } from "@/lib/env";
import { renderTemplate } from "@/lib/email/template";
import { logger } from "@/lib/logger";
import { randomToken } from "@/lib/crypto";
import {
  dailyCapCondition,
  dailyCapReached,
  domainFromEmail,
  isOutreachPaused,
  sendCapForDomain,
  startOfUtcDay,
  warmupAllowsSend,
} from "@/lib/outreach-policy";

export type OutreachState = { error?: string; success?: string; fieldErrors?: Record<string, string> };

async function requestIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

const stepSchema = z.object({
  subject: z.string().trim().min(3, "Add a subject.").max(160),
  body: z.string().trim().min(20, "Write the message body.").max(8000),
  delayDays: z.coerce.number().int().min(0).max(60),
});

export async function saveSequenceStepAction(stepId: string, formData: FormData): Promise<OutreachState> {
  const { user, org, role } = await requireWorkspace();
  if (!canReview(role)) return { error: "Your role cannot edit sequences." };

  const parsed = stepSchema.safeParse({
    subject: String(formData.get("subject") ?? ""),
    body: String(formData.get("body") ?? ""),
    delayDays: String(formData.get("delayDays") ?? "0"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const updated = await withOrg(org.id, async (tx) => {
    const [row] = await tx
      .update(sequenceSteps)
      .set({ subject: parsed.data.subject, body: parsed.data.body, delayDays: parsed.data.delayDays })
      .where(and(eq(sequenceSteps.id, stepId), eq(sequenceSteps.orgId, org.id)))
      .returning({ id: sequenceSteps.id, sequenceId: sequenceSteps.sequenceId });
    if (!row) return null;
    await insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: "sequence.step_updated",
      entityType: "sequence_step",
      entityId: stepId,
      metadata: { sequenceId: row.sequenceId },
      ip: await requestIp(),
    });
    return row;
  });

  if (!updated) return { error: "Step not found." };
  revalidatePath("/outreach");
  return { success: "Step saved as a draft." };
}

export async function setSequenceStatusAction(sequenceId: string, status: "draft" | "active" | "paused"): Promise<OutreachState> {
  const { user, org, role } = await requireWorkspace();
  if (!canReview(role)) return { error: "Your role cannot change sequence status." };

  const updated = await withOrg(org.id, async (tx) => {
    const [row] = await tx
      .update(sequences)
      .set({ status })
      .where(and(eq(sequences.id, sequenceId), eq(sequences.orgId, org.id)))
      .returning({ id: sequences.id });
    if (!row) return null;
    await insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: "sequence.status_changed",
      entityType: "sequence",
      entityId: sequenceId,
      metadata: { status },
      ip: null,
    });
    return row;
  });

  if (!updated) return { error: "Sequence not found." };
  revalidatePath("/outreach");
  return { success: `Sequence ${status}.` };
}

const queueSchema = z.object({
  creatorId: z.string().uuid(),
  sequenceId: z.string().uuid(),
  stepId: z.string().uuid(),
});

/**
 * Creates an approval item. It deliberately does not send: the only path to the
 * provider is approveAndSendAction, which re-checks consent and suppression.
 */
export async function queueMessageAction(_prev: OutreachState, formData: FormData): Promise<OutreachState> {
  const { user, org, role } = await requireWorkspace();
  if (!canReview(role)) return { error: "Your role cannot queue outreach." };

  const parsed = queueSchema.safeParse({
    creatorId: String(formData.get("creatorId") ?? ""),
    sequenceId: String(formData.get("sequenceId") ?? ""),
    stepId: String(formData.get("stepId") ?? ""),
  });
  if (!parsed.success) return { error: "Choose a creator and a sequence step." };

  const result = await withOrg(org.id, async (tx) => {
    const [creator] = await tx
      .select()
      .from(creatorAccounts)
      .where(and(eq(creatorAccounts.id, parsed.data.creatorId), eq(creatorAccounts.orgId, org.id)))
      .limit(1);
    if (!creator) return { error: "Creator not found." } as const;

    const [step] = await tx
      .select({ id: sequenceSteps.id, subject: sequenceSteps.subject, body: sequenceSteps.body, sequenceId: sequenceSteps.sequenceId })
      .from(sequenceSteps)
      .where(and(eq(sequenceSteps.id, parsed.data.stepId), eq(sequenceSteps.sequenceId, parsed.data.sequenceId)))
      .limit(1);
    if (!step) return { error: "Sequence step not found." } as const;

    if (creator.consentStatus !== "granted") {
      return { error: `@${creator.username} has not granted contact consent. Record consent first.` } as const;
    }
    if (!creator.contactEmail) {
      return { error: `@${creator.username} has no contact email on file.` } as const;
    }
    if (creator.status === "suppressed") {
      return { error: `@${creator.username} is suppressed. Sending is blocked.` } as const;
    }

    const [suppressed] = await tx
      .select({ id: suppressions.id })
      .from(suppressions)
      .where(eq(suppressions.email, creator.contactEmail))
      .limit(1);
    if (suppressed) return { error: "That email address is on the suppression list." } as const;

    const rendered = renderTemplate(step.subject, step.body, {
      first_name: (creator.displayName ?? creator.username).split(" ")[0] ?? creator.username,
      username: creator.username,
      handle: `@${creator.username}`,
      operator_name: user.name,
      niche: creator.niche ?? "",
    });

    const [message] = await tx
      .insert(messages)
      .values({
        orgId: org.id,
        creatorId: creator.id,
        stepId: step.id,
        direction: "outbound",
        channel: "email",
        toEmail: creator.contactEmail,
        fromEmail: null,
        subject: rendered.subject,
        body: rendered.body,
        status: "needs_approval",
        idempotencyKey: `queue:${step.id}:${creator.id}:${randomToken(6)}`,
      })
      .returning({ id: messages.id });

    if (!message) return { error: "Could not create the approval item." } as const;

    await insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: "message.queued_for_approval",
      entityType: "message",
      entityId: message.id,
      metadata: { creatorId: creator.id, stepId: step.id },
      ip: await requestIp(),
    });

    return { ok: true, id: message.id, username: creator.username } as const;
  });

  revalidatePath("/outreach");
  if ("error" in result) return { error: result.error };
  if (!("ok" in result)) return { error: "Could not queue the message." };
  return { success: `Draft queued for @${result.username}. Approve it to send.` };
}

export async function updateDraftAction(messageId: string, formData: FormData): Promise<OutreachState> {
  const { user, org, role } = await requireWorkspace();
  if (!canReview(role)) return { error: "Your role cannot edit drafts." };

  const parsed = z
    .object({
      subject: z.string().trim().min(3).max(160),
      body: z.string().trim().min(20).max(8000),
    })
    .safeParse({ subject: String(formData.get("subject") ?? ""), body: String(formData.get("body") ?? "") });
  if (!parsed.success) return { error: "Subject or body is invalid." };

  const updated = await withOrg(org.id, async (tx) => {
    const [row] = await tx
      .update(messages)
      .set({ subject: parsed.data.subject, body: parsed.data.body, updatedAt: new Date() })
      .where(and(eq(messages.id, messageId), eq(messages.orgId, org.id), eq(messages.status, "needs_approval")))
      .returning({ id: messages.id });
    if (!row) return null;
    await insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: "message.edited",
      entityType: "message",
      entityId: messageId,
      metadata: {},
      ip: null,
    });
    return row;
  });

  if (!updated) return { error: "Only messages awaiting approval can be edited." };
  revalidatePath("/outreach");
  return { success: "Draft updated." };
}

export async function approveAndSendAction(messageId: string): Promise<OutreachState> {
  const { user, org, role } = await requireWorkspace();
  if (!canReview(role)) return { error: "Your role cannot approve sends." };

  if (!resendConfigured) {
    return { error: "Email is not configured. Add RESEND_API_KEY, OUTREACH_FROM, EMAIL_FROM_DOMAIN, and OUTREACH_PHYSICAL_ADDRESS to send real mail." };
  }

  const prepared = await withOrg(org.id, async (tx) => {
    const [row] = await tx
      .select({ message: messages, creator: creatorAccounts })
      .from(messages)
      .innerJoin(creatorAccounts, eq(creatorAccounts.id, messages.creatorId))
      .where(and(eq(messages.id, messageId), eq(messages.orgId, org.id)))
      .limit(1);
    if (!row) return { error: "Message not found." } as const;
    if (row.message.status !== "needs_approval") return { error: "This message is not awaiting approval." } as const;
    if (row.creator.consentStatus !== "granted") return { error: "Consent is not granted. Send blocked." } as const;
    if (row.creator.status === "suppressed") return { error: "Creator is suppressed. Send blocked." } as const;
    if (!row.message.toEmail) return { error: "No destination email on the message." } as const;

    const [suppressed] = await tx
      .select({ id: suppressions.id })
      .from(suppressions)
      .where(eq(suppressions.email, row.message.toEmail))
      .limit(1);
    if (suppressed) return { error: "Destination is on the suppression list. Send blocked." } as const;

    // Stage 1 safety gates. All of these run inside the same org-scoped
    // transaction, before the message is claimed and before any provider call.
    const [orgRow] = await tx
      .select({ settings: orgs.settings })
      .from(orgs)
      .where(eq(orgs.id, org.id))
      .limit(1);
    const settings = orgRow?.settings ?? {};

    if (isOutreachPaused(settings)) {
      await insertAudit(tx, {
        orgId: org.id,
        actorUserId: user.id,
        action: "message.send_blocked_paused",
        entityType: "message",
        entityId: messageId,
        metadata: { reason: "outreach_paused" },
        ip: await requestIp(),
      });
      return { error: "Outbound sending is paused for this workspace." } as const;
    }

    if (!warmupAllowsSend(settings)) {
      await insertAudit(tx, {
        orgId: org.id,
        actorUserId: user.id,
        action: "message.send_blocked_warmup",
        entityType: "message",
        entityId: messageId,
        metadata: { reason: "domain_warmup_incomplete" },
        ip: await requestIp(),
      });
      return { error: "Domain warmup is not complete. Sending remains blocked." } as const;
    }

    // Stage 1 uses one verified sending domain, so the ceiling covers every
    // message this workspace sent today. The filter is compiled by the policy
    // helper so the wrong-column bug is covered by a unit test.
    const [capRow] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(messages)
      .where(dailyCapCondition(org.id, startOfUtcDay()));
    const sentToday = capRow?.count ?? 0;
    if (dailyCapReached(sentToday)) {
      await insertAudit(tx, {
        orgId: org.id,
        actorUserId: user.id,
        action: "message.send_blocked_cap",
        entityType: "message",
        entityId: messageId,
        metadata: {
          reason: "daily_domain_cap",
          domain: domainFromEmail(env.OUTREACH_FROM ?? ""),
          cap: sendCapForDomain(),
          sentToday,
        },
        ip: await requestIp(),
      });
      return { error: "Daily send cap reached for this domain." } as const;
    }

    const [claimed] = await tx
      .update(messages)
      .set({ status: "sending", updatedAt: new Date() })
      .where(and(eq(messages.id, messageId), eq(messages.status, "needs_approval")))
      .returning({ id: messages.id });
    if (!claimed) return { error: "Another operator already claimed this message." } as const;

    return { ok: true, message: row.message, creatorId: row.creator.id } as const;
  });

  if ("error" in prepared) return { error: prepared.error };
  if (!("ok" in prepared)) return { error: "Could not prepare the send." };
  const message = prepared.message;

  const sent = await sendEmail({
    orgId: org.id,
    to: message.toEmail!,
    subject: message.subject ?? "(no subject)",
    text: message.body,
    idempotencyKey: message.idempotencyKey ?? message.id,
  });

  await withOrg(org.id, async (tx) => {
    if (sent.ok) {
      await tx
        .update(messages)
        .set({ status: "sent", sentAt: new Date(), providerId: sent.id ?? null, error: null, updatedAt: new Date() })
        .where(eq(messages.id, messageId));
      await tx.insert(messageEvents).values({ orgId: org.id, messageId, type: "sent", metadata: { providerId: sent.id ?? null } });
      await tx
        .update(creatorAccounts)
        .set({ status: "contacted", updatedAt: new Date() })
        .where(eq(creatorAccounts.id, prepared.creatorId));
      await insertAudit(tx, {
        orgId: org.id,
        actorUserId: user.id,
        action: "message.sent",
        entityType: "message",
        entityId: messageId,
        metadata: { providerId: sent.id ?? null, to: message.toEmail },
        ip: await requestIp(),
      });
    } else {
      await tx
        .update(messages)
        .set({ status: "failed", error: sent.error, updatedAt: new Date() })
        .where(eq(messages.id, messageId));
      await tx.insert(messageEvents).values({ orgId: org.id, messageId, type: "failed", metadata: { error: sent.error } });
      await insertAudit(tx, {
        orgId: org.id,
        actorUserId: user.id,
        action: "message.send_failed",
        entityType: "message",
        entityId: messageId,
        metadata: { error: sent.error },
        ip: await requestIp(),
      });
      logger.warn("outreach.send_failed", { messageId, error: sent.error });
    }
  });

  revalidatePath("/outreach");
  revalidatePath("/dashboard");
  if (!sent.ok) return { error: `Send failed: ${sent.error}` };
  return { success: `Sent to ${message.toEmail}.` };
}

export async function cancelMessageAction(messageId: string): Promise<OutreachState> {
  const { user, org, role } = await requireWorkspace();
  if (!canReview(role)) return { error: "Your role cannot cancel drafts." };

  const updated = await withOrg(org.id, async (tx) => {
    const [row] = await tx
      .update(messages)
      .set({ status: "canceled", updatedAt: new Date() })
      .where(and(eq(messages.id, messageId), eq(messages.orgId, org.id), eq(messages.status, "needs_approval")))
      .returning({ id: messages.id });
    if (!row) return null;
    await insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: "message.canceled",
      entityType: "message",
      entityId: messageId,
      metadata: {},
      ip: null,
    });
    return row;
  });

  if (!updated) return { error: "Only drafts awaiting approval can be canceled." };
  revalidatePath("/outreach");
  return { success: "Draft canceled." };
}

/** Global kill switch for outbound email, persisted as an org setting. */
export async function setOutreachPausedAction(paused: boolean): Promise<OutreachState> {
  const { user, org, role } = await requireWorkspace();
  if (role !== "owner" && role !== "admin") return { error: "Only owners and admins can toggle the kill switch." };

  await withOrg(org.id, async (tx) => {
    await tx.execute(
      sql`update orgs set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{outreachPaused}', ${JSON.stringify(paused)}::jsonb, true), updated_at = now() where id = ${org.id}`,
    );
    await insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: paused ? "outreach.paused" : "outreach.resumed",
      entityType: "org",
      entityId: org.id,
      metadata: {},
      ip: await requestIp(),
    });
  });

  revalidatePath("/outreach");
  return { success: paused ? "Outbound sending paused for the whole workspace." : "Outbound sending resumed." };
}

/** Owner/admin control for recording that the sending domain has finished warming up. */
export async function setDomainWarmupCompleteAction(complete: boolean): Promise<OutreachState> {
  const { user, org, role } = await requireWorkspace();
  if (role !== "owner" && role !== "admin") return { error: "Only owners and admins can change warmup status." };

  await withOrg(org.id, async (tx) => {
    await tx.execute(
      sql`update orgs set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{domainWarmupComplete}', ${JSON.stringify(complete)}::jsonb, true), updated_at = now() where id = ${org.id}`,
    );
    await insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: complete ? "outreach.warmup_completed" : "outreach.warmup_reset",
      entityType: "org",
      entityId: org.id,
      metadata: {},
      ip: await requestIp(),
    });
  });

  revalidatePath("/outreach");
  return {
    success: complete
      ? "Domain warmup marked complete. Outbound sending is allowed again."
      : "Domain warmup reset. Sending is blocked again.",
  };
}
