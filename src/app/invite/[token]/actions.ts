"use server";

import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, withOrg } from "@/lib/db";
import { invites, memberships, orgs, users } from "@/lib/db/schema";
import { createSession, getSessionUser } from "@/lib/auth/session";
import { hashPassword, passwordIssues, verifyPassword } from "@/lib/auth/password";
import { insertAudit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { sha256 } from "@/lib/crypto";
import { logger, errorMessage } from "@/lib/logger";
import { resolveInvite } from "@/lib/invites";

export type InviteState = { error?: string; success?: string; fieldErrors?: Record<string, string> };

const acceptSchema = z.object({
  name: z.string().trim().max(80).optional(),
  password: z.string().min(1, "Enter your password.").max(200),
});

export async function acceptInviteAction(token: string, _prev: InviteState, formData: FormData): Promise<InviteState> {
  const invite = await resolveInvite(token);
  if (!invite) return { error: "This invitation is invalid or has expired. Ask an owner for a new one." };
  if (invite.acceptedAt) return { error: "This invitation has already been used." };

  const parsed = acceptSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const limit = await checkRateLimit(`invite:${ip}:${sha256(token).slice(0, 16)}`, 10, 15 * 60);
  if (!limit.ok) return { error: "Too many attempts. Try again in a few minutes." };

  const session = await getSessionUser();
  const [existingUser] = await db.select().from(users).where(eq(users.email, invite.email)).limit(1);

  let userId: string;

  if (existingUser) {
    const signedInAsInvitee = session?.user.id === existingUser.id;
    if (!signedInAsInvitee) {
      const valid = await verifyPassword(parsed.data.password, existingUser.passwordHash);
      if (!valid) return { fieldErrors: { password: "That password does not match the account for this email." } };
    }
    userId = existingUser.id;
  } else {
    const name = (parsed.data.name ?? "").trim();
    if (name.length < 2) return { fieldErrors: { name: "Tell us your name." } };
    const issues = passwordIssues(parsed.data.password);
    if (issues.length) return { fieldErrors: { password: issues.join(" ") } };

    const passwordHash = await hashPassword(parsed.data.password);
    try {
      const [created] = await db
        .insert(users)
        .values({ email: invite.email, name, passwordHash, lastLoginAt: new Date() })
        .returning({ id: users.id });
      if (!created) return { error: "The account could not be created." };
      userId = created.id;
    } catch (error) {
      logger.error("invite.user_create_failed", { message: errorMessage(error) });
      return { error: "An account for this email may already exist. Sign in first and open the link again." };
    }
  }

  try {
    const joined = await withOrg(invite.orgId, async (tx) => {
      const [fresh] = await tx
        .select()
        .from(invites)
        .where(and(eq(invites.id, invite.id), eq(invites.orgId, invite.orgId)))
        .limit(1);
      if (!fresh || fresh.acceptedAt) return { error: "This invitation has already been used." } as const;

      const [existingMembership] = await tx
        .select({ id: memberships.id, role: memberships.role })
        .from(memberships)
        .where(and(eq(memberships.orgId, invite.orgId), eq(memberships.userId, userId)))
        .limit(1);

      if (existingMembership) {
        if (existingMembership.role !== "owner") {
          await tx.update(memberships).set({ role: invite.role }).where(eq(memberships.id, existingMembership.id));
        }
      } else {
        await tx.insert(memberships).values({ orgId: invite.orgId, userId, role: invite.role });
      }

      await tx.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, invite.id));

      await insertAudit(tx, {
        orgId: invite.orgId,
        actorUserId: userId,
        action: existingMembership ? "member.role_changed" : "member.joined",
        entityType: "membership",
        entityId: existingMembership?.id ?? userId,
        metadata: { invitedEmail: invite.email, role: invite.role, via: "invite_link" },
        ip,
      });

      const [org] = await tx.select({ name: orgs.name }).from(orgs).where(eq(orgs.id, invite.orgId)).limit(1);
      return { ok: true, orgName: org?.name ?? "the workspace" } as const;
    });

    if ("error" in joined) return { error: joined.error };
    logger.info("invite.accepted", { orgId: invite.orgId, userId });
  } catch (error) {
    logger.error("invite.accept_failed", { message: errorMessage(error) });
    return { error: "The invitation could not be accepted. Nothing was changed." };
  }

  await createSession(userId, invite.orgId);
  redirect("/dashboard");
}
