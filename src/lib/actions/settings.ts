"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { db, withOrg } from "@/lib/db";
import { invites, memberships, orgs, sessions, users } from "@/lib/db/schema";
import { requireWorkspace } from "@/lib/auth/session";
import { insertAudit } from "@/lib/audit";
import { hashPassword, passwordIssues, verifyPassword } from "@/lib/auth/password";
import { sha256, randomToken } from "@/lib/crypto";
import { absoluteUrl, slugify } from "@/lib/utils";
import { sendEmail } from "@/lib/email/resend";
import { resendConfigured } from "@/lib/env";
import { logger, errorMessage } from "@/lib/logger";

export type SettingsState = { error?: string; success?: string; fieldErrors?: Record<string, string>; inviteUrl?: string };

async function requestIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

export async function renameOrgAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const { user, org, role } = await requireWorkspace();
  if (role !== "owner" && role !== "admin") return { error: "Only owners and admins can rename the workspace." };

  const parsed = z.string().trim().min(2).max(80).safeParse(String(formData.get("name") ?? ""));
  if (!parsed.success) return { fieldErrors: { name: "Use between 2 and 80 characters." } };

  await withOrg(org.id, async (tx) => {
    await tx.update(orgs).set({ name: parsed.data, updatedAt: new Date() }).where(eq(orgs.id, org.id));
    await insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: "org.renamed",
      entityType: "org",
      entityId: org.id,
      metadata: { from: org.name, to: parsed.data },
      ip: await requestIp(),
    });
  });

  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { success: "Workspace renamed." };
}

export async function updateOrgSlugAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const { user, org, role } = await requireWorkspace();
  if (role !== "owner") return { error: "Only the owner can change the workspace address." };

  const candidate = slugify(String(formData.get("slug") ?? ""));
  if (candidate.length < 3) return { fieldErrors: { slug: "Use at least 3 characters." } };

  const [existing] = await db.select({ id: orgs.id }).from(orgs).where(eq(orgs.slug, candidate)).limit(1);
  if (existing && existing.id !== org.id) return { fieldErrors: { slug: "That address is already taken." } };

  await withOrg(org.id, async (tx) => {
    await tx.update(orgs).set({ slug: candidate, updatedAt: new Date() }).where(eq(orgs.id, org.id));
    await insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: "org.slug_changed",
      entityType: "org",
      entityId: org.id,
      metadata: { from: org.slug, to: candidate },
      ip: await requestIp(),
    });
  });

  revalidatePath("/settings");
  return { success: `Workspace address set to /${candidate}.` };
}

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  role: z.enum(["admin", "operator", "reviewer"]),
});

export async function inviteMemberAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const { user, org, role } = await requireWorkspace();
  if (role !== "owner" && role !== "admin") return { error: "Only owners and admins can invite people." };

  const parsed = inviteSchema.safeParse({
    email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? "operator"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + 7 * 86_400_000);

  await withOrg(org.id, async (tx) => {
    await tx.insert(invites).values({
      orgId: org.id,
      email: parsed.data.email,
      role: parsed.data.role,
      tokenHash: sha256(token),
      expiresAt,
      createdBy: user.id,
    });
    await insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: "member.invited",
      entityType: "invite",
      entityId: parsed.data.email,
      metadata: { role: parsed.data.role, expiresAt: expiresAt.toISOString() },
      ip: await requestIp(),
    });
  });

  const inviteUrl = absoluteUrl(`/invite/${token}`);

  if (resendConfigured) {
    const sent = await sendEmail({
      orgId: org.id,
      to: parsed.data.email,
      subject: `You're invited to ${org.name} on InstaBix`,
      text: `${user.name} invited you to ${org.name} as ${parsed.data.role}.\n\nAccept the invitation: ${inviteUrl}\n\nThis link expires in 7 days. If you were not expecting it, ignore this email.`,
      idempotencyKey: `invite:${sha256(token).slice(0, 32)}`,
    });
    if (sent.ok) {
      revalidatePath("/settings");
      return { success: `Invitation emailed to ${parsed.data.email}.` };
    }
    logger.warn("invite.email_failed", { message: sent.error });
  }

  revalidatePath("/settings");
  return {
    success: "Invitation created. Email is not configured, so copy the link and send it yourself.",
    inviteUrl,
  };
}

export async function revokeInviteAction(inviteId: string): Promise<SettingsState> {
  const { user, org, role } = await requireWorkspace();
  if (role !== "owner" && role !== "admin") return { error: "Only owners and admins can revoke invitations." };

  const revoked = await withOrg(org.id, async (tx) => {
    const [row] = await tx
      .delete(invites)
      .where(and(eq(invites.id, inviteId), eq(invites.orgId, org.id)))
      .returning({ email: invites.email });
    if (!row) return null;
    await insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: "member.invite_revoked",
      entityType: "invite",
      entityId: inviteId,
      metadata: { email: row.email },
      ip: null,
    });
    return row;
  });

  revalidatePath("/settings");
  if (!revoked) return { error: "Invitation not found." };
  return { success: `Invitation for ${revoked.email} revoked.` };
}

export async function changeMemberRoleAction(memberId: string, role: "admin" | "operator" | "reviewer"): Promise<SettingsState> {
  const { user, org, role: myRole } = await requireWorkspace();
  if (myRole !== "owner" && myRole !== "admin") return { error: "Only owners and admins can change roles." };

  const result = await withOrg(org.id, async (tx) => {
    const [row] = await tx
      .update(memberships)
      .set({ role })
      .where(and(eq(memberships.id, memberId), eq(memberships.orgId, org.id)))
      .returning({ id: memberships.id, userId: memberships.userId, role: memberships.role });
    if (!row) return null;
    await insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: "member.role_changed",
      entityType: "membership",
      entityId: memberId,
      metadata: { userId: row.userId, role },
      ip: null,
    });
    return row;
  });

  revalidatePath("/settings");
  if (!result) return { error: "Member not found in this workspace." };
  return { success: `Role updated to ${role}.` };
}

export async function removeMemberAction(memberId: string): Promise<SettingsState> {
  const { user, org, role } = await requireWorkspace();
  if (role !== "owner" && role !== "admin") return { error: "Only owners and admins can remove members." };

  const removed = await withOrg(org.id, async (tx) => {
    const [row] = await tx
      .select({ id: memberships.id, userId: memberships.userId, role: memberships.role, email: users.email })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.id, memberId), eq(memberships.orgId, org.id)))
      .limit(1);
    if (!row) return { error: "Member not found." } as const;
    if (row.userId === user.id) return { error: "You cannot remove yourself. Ask another owner." } as const;
    if (row.role === "owner") return { error: "Transfer ownership before removing an owner." } as const;

    await tx.delete(memberships).where(eq(memberships.id, memberId));
    await tx.update(sessions).set({ orgId: null }).where(and(eq(sessions.userId, row.userId), eq(sessions.orgId, org.id)));
    await insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: "member.removed",
      entityType: "membership",
      entityId: memberId,
      metadata: { userId: row.userId, email: row.email },
      ip: null,
    });
    return { ok: true } as const;
  });

  revalidatePath("/settings");
  if ("error" in removed) return { error: removed.error };
  return { success: "Member removed and their sessions detached from this workspace." };
}

export async function changePasswordAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const { user } = await requireWorkspace();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");

  const issues = passwordIssues(next);
  if (issues.length) return { fieldErrors: { next: issues.join(" ") } };

  const [row] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, user.id)).limit(1);
  if (!row) return { error: "Account not found." };
  if (!(await verifyPassword(current, row.passwordHash))) return { fieldErrors: { current: "Current password is incorrect." } };

  const hash = await hashPassword(next);
  await db.update(users).set({ passwordHash: hash, updatedAt: new Date() }).where(eq(users.id, user.id));

  const { org } = await requireWorkspace();
  await withOrg(org.id, (tx) =>
    insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: "auth.password_changed",
      entityType: "user",
      entityId: user.id,
      metadata: {},
      ip: null,
    }),
  );

  revalidatePath("/settings");
  return { success: "Password changed. Other sessions remain valid until they expire." };
}

export async function exportWorkspaceAction(): Promise<SettingsState> {
  const { user, org } = await requireWorkspace();
  try {
    await withOrg(org.id, (tx) =>
      insertAudit(tx, {
        orgId: org.id,
        actorUserId: user.id,
        action: "org.export_requested",
        entityType: "org",
        entityId: org.id,
        metadata: { format: "json" },
        ip: null,
      }),
    );
  } catch (error) {
    logger.warn("export.audit_failed", { message: errorMessage(error) });
  }
  return { success: "Export request recorded. Download it from /api/export (signed-in owner only)." };
}
