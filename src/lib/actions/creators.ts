"use server";

import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withOrg } from "@/lib/db";
import { creatorAccounts, portalTokens, suppressions } from "@/lib/db/schema";
import { requireWorkspace, canReview } from "@/lib/auth/session";
import { insertAudit } from "@/lib/audit";
import { enrichCreator, recomputeScore } from "@/lib/instagram/sync";
import { absoluteUrl, normalizeUsername } from "@/lib/utils";
import { randomToken, sha256 } from "@/lib/crypto";
import { env } from "@/lib/env";
import { logger, errorMessage } from "@/lib/logger";
import { clientIpFromHeaders } from "@/lib/http";

export type CreatorActionState = { error?: string; success?: string; fieldErrors?: Record<string, string>; portalUrl?: string };

const createSchema = z.object({
  username: z.string().trim().min(2, "Enter an Instagram handle.").max(40),
  displayName: z.string().trim().max(80).optional(),
  contactEmail: z.string().trim().toLowerCase().email("Enter a valid email.").optional().or(z.literal("")),
  niche: z.string().trim().max(60).optional(),
  source: z.enum(["manual", "invited", "applied", "discovery"]),
  notes: z.string().trim().max(2000).optional(),
});

async function requestIp() {
  return clientIpFromHeaders(await headers());
}

export async function createCreatorAction(_prev: CreatorActionState, formData: FormData): Promise<CreatorActionState> {
  const { user, org, role } = await requireWorkspace();
  if (!canReview(role)) return { error: "Your role cannot add creators." };

  const parsed = createSchema.safeParse({
    username: String(formData.get("username") ?? ""),
    displayName: String(formData.get("displayName") ?? ""),
    contactEmail: String(formData.get("contactEmail") ?? ""),
    niche: String(formData.get("niche") ?? ""),
    source: String(formData.get("source") ?? "manual"),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const username = normalizeUsername(parsed.data.username);
  if (!username) return { fieldErrors: { username: "Use letters, numbers, dots or underscores (max 30)." } };

  const email = parsed.data.contactEmail || null;
  const consentGranted = parsed.data.source === "applied";

  try {
    const created = await withOrg(org.id, async (tx) => {
      const [row] = await tx
        .insert(creatorAccounts)
        .values({
          orgId: org.id,
          username,
          displayName: parsed.data.displayName || null,
          niche: parsed.data.niche || null,
          contactEmail: email,
          emailSource: email ? (parsed.data.source === "applied" ? "creator_provided" : "operator_entered") : "none",
          source: parsed.data.source,
          consentStatus: consentGranted ? "granted" : "pending",
          consentAt: consentGranted ? new Date() : null,
          notes: parsed.data.notes || null,
          createdBy: user.id,
          status: "new",
        })
        .onConflictDoNothing({ target: [creatorAccounts.orgId, creatorAccounts.username] })
        .returning({ id: creatorAccounts.id });
      if (!row) return null;

      await insertAudit(tx, {
        orgId: org.id,
        actorUserId: user.id,
        action: "creator.created",
        entityType: "creator",
        entityId: row.id,
        metadata: { username, source: parsed.data.source },
        ip: await requestIp(),
      });
      return row.id;
    });

    if (!created) return { fieldErrors: { username: "That handle is already in this workspace." } };

    revalidatePath("/creators");
    revalidatePath("/dashboard");
    return { success: `@${username} added. Enrich it to pull public metrics through the official API.` };
  } catch (error) {
    logger.error("creator.create_failed", { message: errorMessage(error) });
    return { error: "Could not add the creator. Check the database connection and try again." };
  }
}

export async function enrichCreatorAction(creatorId: string): Promise<CreatorActionState> {
  const { user, org, role } = await requireWorkspace();
  if (!canReview(role)) return { error: "Your role cannot enrich creators." };

  const [creator] = await withOrg(org.id, (tx) =>
    tx.select().from(creatorAccounts).where(eq(creatorAccounts.id, creatorId)).limit(1),
  );
  if (!creator) return { error: "Creator not found in this workspace." };

  const result = await enrichCreator(org.id, creatorId);

  await withOrg(org.id, (tx) =>
    insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: result.ok ? "creator.enriched" : "creator.enrich_failed",
      entityType: "creator",
      entityId: creatorId,
      metadata: { message: result.message ?? result.error ?? null },
      ip: null,
    }),
  );

  revalidatePath("/creators");
  revalidatePath(`/creators/${creatorId}`);
  if (!result.ok) return { error: result.error ?? "Enrichment failed." };
  return { success: result.message ?? "Public metrics refreshed." };
}

export async function recomputeScoreAction(creatorId: string): Promise<CreatorActionState> {
  const { user, org, role } = await requireWorkspace();
  if (!canReview(role)) return { error: "Your role cannot recompute scores." };

  const result = await recomputeScore(org.id, creatorId);
  await withOrg(org.id, (tx) =>
    insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: "creator.scored",
      entityType: "creator",
      entityId: creatorId,
      metadata: result.ok ? { total: result.total, sampleSize: result.sampleSize } : { reason: result.message },
      ip: null,
    }),
  );
  revalidatePath(`/creators/${creatorId}`);
  if (!result.ok) return { error: result.message };
  return { success: `Score recomputed: ${result.total} from ${result.sampleSize} posts.` };
}

const statusSchema = z.enum(["new", "reviewing", "qualified", "approved", "contacted", "negotiating", "partnered", "declined", "suppressed"]);

export async function setCreatorStatusAction(creatorId: string, nextStatus: string): Promise<CreatorActionState> {
  const { user, org, role } = await requireWorkspace();
  if (!canReview(role)) return { error: "Your role cannot change creator status." };

  const parsed = statusSchema.safeParse(nextStatus);
  if (!parsed.success) return { error: "Unknown status." };

  const updated = await withOrg(org.id, async (tx) => {
    const [row] = await tx
      .update(creatorAccounts)
      .set({ status: parsed.data, updatedAt: new Date() })
      .where(and(eq(creatorAccounts.id, creatorId), eq(creatorAccounts.orgId, org.id)))
      .returning({ id: creatorAccounts.id, status: creatorAccounts.status });
    if (!row) return null;
    await insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: "creator.status_changed",
      entityType: "creator",
      entityId: creatorId,
      metadata: { status: parsed.data },
      ip: null,
    });
    return row;
  });

  if (!updated) return { error: "Creator not found." };
  revalidatePath("/creators");
  revalidatePath(`/creators/${creatorId}`);
  return { success: `Status set to ${parsed.data}.` };
}

export async function setCreatorEmailAction(
  creatorId: string,
  email: string,
  emailSource: "creator_provided" | "public_business" | "operator_entered" | "none",
): Promise<CreatorActionState> {
  const { user, org, role } = await requireWorkspace();
  if (!canReview(role)) return { error: "Your role cannot edit contact details." };

  const parsed = z.string().trim().toLowerCase().email().safeParse(email);
  if (!parsed.success) return { error: "Enter a valid email address." };
  const source = emailSource === "none" ? "operator_entered" : emailSource;

  const updated = await withOrg(org.id, async (tx) => {
    const [row] = await tx
      .update(creatorAccounts)
      .set({ contactEmail: parsed.data, emailSource: source, updatedAt: new Date() })
      .where(and(eq(creatorAccounts.id, creatorId), eq(creatorAccounts.orgId, org.id)))
      .returning({ id: creatorAccounts.id });
    if (!row) return null;
    await insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: "creator.email_updated",
      entityType: "creator",
      entityId: creatorId,
      metadata: { emailSource: source },
      ip: await requestIp(),
    });
    return row;
  });

  if (!updated) return { error: "Creator not found." };
  revalidatePath(`/creators/${creatorId}`);
  return { success: "Contact email saved with its provenance." };
}

export async function grantConsentAction(creatorId: string): Promise<CreatorActionState> {
  const { user, org, role } = await requireWorkspace();
  if (!canReview(role)) return { error: "Your role cannot record consent." };

  const updated = await withOrg(org.id, async (tx) => {
    const [row] = await tx
      .update(creatorAccounts)
      .set({ consentStatus: "granted", consentAt: new Date(), updatedAt: new Date() })
      .where(and(eq(creatorAccounts.id, creatorId), eq(creatorAccounts.orgId, org.id)))
      .returning({ id: creatorAccounts.id });
    if (!row) return null;
    await insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: "creator.consent_recorded",
      entityType: "creator",
      entityId: creatorId,
      metadata: { basis: "operator_recorded_inbound_consent" },
      ip: await requestIp(),
    });
    return row;
  });

  if (!updated) return { error: "Creator not found." };
  revalidatePath(`/creators/${creatorId}`);
  revalidatePath("/outreach");
  return { success: "Consent recorded with a timestamp and audit entry." };
}

export async function createPortalLinkAction(creatorId: string): Promise<CreatorActionState> {
  const { user, org, role } = await requireWorkspace();
  if (!canReview(role)) return { error: "Your role cannot create portal links." };

  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + 14 * 86_400_000);

  const created = await withOrg(org.id, async (tx) => {
    const [creator] = await tx
      .select({ id: creatorAccounts.id, username: creatorAccounts.username })
      .from(creatorAccounts)
      .where(and(eq(creatorAccounts.id, creatorId), eq(creatorAccounts.orgId, org.id)))
      .limit(1);
    if (!creator) return null;

    await tx.insert(portalTokens).values({
      orgId: org.id,
      creatorId,
      tokenHash: sha256(token),
      expiresAt,
    });
    await insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: "creator.portal_link_created",
      entityType: "creator",
      entityId: creatorId,
      metadata: { expiresAt: expiresAt.toISOString() },
      ip: await requestIp(),
    });
    return creator;
  });

  if (!created) return { error: "Creator not found." };
  revalidatePath(`/creators/${creatorId}`);

  if (!env.APP_URL) return { error: "APP_URL is not configured, so the portal URL cannot be built." };
  const portalUrl = absoluteUrl(`/c/${token}`);
  return { success: "Portal link created. It expires in 14 days.", portalUrl };
}

export async function suppressCreatorAction(creatorId: string, reason: string): Promise<CreatorActionState> {
  const { user, org, role } = await requireWorkspace();
  if (!canReview(role)) return { error: "Your role cannot suppress contacts." };

  const result = await withOrg(org.id, async (tx) => {
    const [creator] = await tx
      .select({ email: creatorAccounts.contactEmail })
      .from(creatorAccounts)
      .where(and(eq(creatorAccounts.id, creatorId), eq(creatorAccounts.orgId, org.id)))
      .limit(1);
    if (!creator) return null;

    if (creator.email) {
      await tx
        .insert(suppressions)
        .values({ orgId: org.id, email: creator.email, reason: reason.slice(0, 120) || "manual_suppression" })
        .onConflictDoNothing({ target: [suppressions.orgId, suppressions.email] });
    }

    await tx
      .update(creatorAccounts)
      .set({ status: "suppressed", updatedAt: new Date() })
      .where(eq(creatorAccounts.id, creatorId));

    await insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: "creator.suppressed",
      entityType: "creator",
      entityId: creatorId,
      metadata: { hadEmail: Boolean(creator.email) },
      ip: await requestIp(),
    });
    return true;
  });

  if (!result) return { error: "Creator not found." };
  revalidatePath("/creators");
  revalidatePath(`/creators/${creatorId}`);
  return { success: "Contact suppressed. All future sends are blocked." };
}

export async function deleteCreatorAction(creatorId: string): Promise<CreatorActionState> {
  const { user, org, role } = await requireWorkspace();
  if (role !== "owner" && role !== "admin") return { error: "Only owners and admins can delete a creator." };

  const deleted = await withOrg(org.id, async (tx) => {
    const [row] = await tx
      .delete(creatorAccounts)
      .where(and(eq(creatorAccounts.id, creatorId), eq(creatorAccounts.orgId, org.id)))
      .returning({ id: creatorAccounts.id, username: creatorAccounts.username });
    if (!row) return null;
    await insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: "creator.deleted",
      entityType: "creator",
      entityId: creatorId,
      metadata: { username: row.username, hardDelete: true },
      ip: await requestIp(),
    });
    return row;
  });

  if (!deleted) return { error: "Creator not found." };
  revalidatePath("/creators");
  return { success: `@${deleted.username} and its dependent rows were deleted.` };
}
