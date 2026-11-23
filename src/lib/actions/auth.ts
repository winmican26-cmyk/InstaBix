"use server";

import { headers } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, withOrg } from "@/lib/db";
import { memberships, orgs, users, type User } from "@/lib/db/schema";
import { clearSessionCookie, createSession, destroySession, getSessionUser } from "@/lib/auth/session";
import { hashPassword, passwordIssues, verifyPassword } from "@/lib/auth/password";
import { checkRateLimit } from "@/lib/rate-limit";
import { insertAudit } from "@/lib/audit";
import { clientIpFromHeaders } from "@/lib/http";
import { logger } from "@/lib/logger";
import { ACTION_FAILURE_MESSAGES, logActionFailure, reportActionFailure } from "@/lib/action-errors";
import { slugify } from "@/lib/utils";

export type AuthState = { error?: string; fieldErrors?: Record<string, string> };

const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.");

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return { fieldErrors: { email: "Enter a valid email address." } };
  if (!password) return { fieldErrors: { password: "Enter your password." } };

  const ip = clientIpFromHeaders(await headers()) ?? "local";

  let limit: Awaited<ReturnType<typeof checkRateLimit>>;
  try {
    limit = await checkRateLimit(`login:${ip}:${parsed.data}`, 8, 15 * 60);
  } catch (error) {
    return { error: reportActionFailure("auth.login.rate_limit_failed", error, ACTION_FAILURE_MESSAGES.signIn) };
  }
  if (!limit.ok) return { error: `Too many attempts. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.` };

  let user: User | undefined;
  try {
    [user] = await db.select().from(users).where(eq(users.email, parsed.data)).limit(1);
  } catch (error) {
    return { error: reportActionFailure("auth.login.lookup_failed", error, ACTION_FAILURE_MESSAGES.signIn) };
  }
  const generic = { error: "Email or password is incorrect." };
  if (!user) return generic;

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return generic;

  let hasMembership = false;
  let orgId: string | null = null;
  try {
    const rows = await db
      .select({ orgId: memberships.orgId })
      .from(memberships)
      .where(eq(memberships.userId, user.id))
      .limit(1);

    hasMembership = rows.length > 0;
    orgId = rows[0]?.orgId ?? null;
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    await createSession(user.id, orgId);
    await createSessionAudit(orgId, user.id, ip);
  } catch (error) {
    return { error: reportActionFailure("auth.login.session_failed", error, ACTION_FAILURE_MESSAGES.signIn) };
  }
  redirect(hasMembership ? "/dashboard" : "/onboarding");
}

async function createSessionAudit(orgId: string | null, userId: string, ip: string) {
  if (!orgId) return;
  try {
    await withOrg(orgId, async (tx) => {
      await insertAudit(tx, { orgId, actorUserId: userId, action: "auth.login", entityType: "session", ip });
    });
  } catch (error) {
    logger.warn("audit.login_failed", { message: error instanceof Error ? error.message : "unknown" });
  }
}

const signupSchema = z.object({
  name: z.string().trim().min(2, "Tell us your name.").max(80),
  email: emailSchema,
  password: z.string().min(1, "Choose a password."),
  orgName: z.string().trim().min(2, "Name your workspace.").max(80),
});

export async function signupAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (formData.get("terms") !== "on") {
    return { fieldErrors: { terms: "You must accept the terms to create a workspace." } };
  }

  const raw = {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    orgName: String(formData.get("orgName") ?? ""),
  };
  const parsed = signupSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const issues = passwordIssues(parsed.data.password);
  if (issues.length) return { fieldErrors: { password: issues.join(" ") } };

  let existing: { id: string }[];
  try {
    existing = await db.select({ id: users.id }).from(users).where(eq(users.email, parsed.data.email)).limit(1);
  } catch (error) {
    return { error: reportActionFailure("auth.signup.lookup_failed", error, ACTION_FAILURE_MESSAGES.workspace) };
  }
  if (existing.length) return { fieldErrors: { email: "An account already exists for this email." } };

  const ip = clientIpFromHeaders(await headers()) ?? "local";
  let limit: Awaited<ReturnType<typeof checkRateLimit>>;
  try {
    limit = await checkRateLimit(`signup:${ip}`, 5, 60 * 60);
  } catch (error) {
    return { error: reportActionFailure("auth.signup.rate_limit_failed", error, ACTION_FAILURE_MESSAGES.workspace) };
  }
  if (!limit.ok) return { error: "Too many workspaces created from this network. Try again later." };

  const passwordHash = await hashPassword(parsed.data.password);
  const baseSlug = slugify(parsed.data.orgName) || "workspace";
  const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;

  let userId: string;
  try {
    userId = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ email: parsed.data.email, name: parsed.data.name, passwordHash })
        .returning({ id: users.id });
      if (!user) throw new Error("User insert failed.");

      const [org] = await tx
        .insert(orgs)
        .values({ name: parsed.data.orgName, slug, settings: { onboardingComplete: false, defaultSplitCreatorBps: 6000 } })
        .returning({ id: orgs.id });
      if (!org) throw new Error("Organisation insert failed.");

      await tx.insert(memberships).values({ orgId: org.id, userId: user.id, role: "owner" });
      await tx.execute(sql`select set_config('app.org_id', ${org.id}, true)`);
      await insertAudit(tx, {
        orgId: org.id,
        actorUserId: user.id,
        action: "org.created",
        entityType: "org",
        entityId: org.id,
        metadata: { name: parsed.data.orgName },
        ip,
      });
      return user.id;
    });
  } catch (error) {
    return { error: reportActionFailure("signup.failed", error, ACTION_FAILURE_MESSAGES.workspace) };
  }

  try {
    await createSession(userId, null);
    const [membership] = await db.select({ orgId: memberships.orgId }).from(memberships).where(eq(memberships.userId, userId)).limit(1);
    if (membership) {
      // Re-issue with the org bound so the first render is already tenant-scoped.
      await destroySession();
      await createSession(userId, membership.orgId);
    }
  } catch (error) {
    return { error: reportActionFailure("auth.signup.session_failed", error, ACTION_FAILURE_MESSAGES.signIn) };
  }
  redirect("/onboarding");
}

export async function signOutAction(): Promise<void> {
  let session: Awaited<ReturnType<typeof getSessionUser>> = null;
  try {
    session = await getSessionUser();
  } catch (error) {
    logActionFailure("auth.logout.session_lookup_failed", error);
  }

  try {
    await destroySession();
  } catch (error) {
    logActionFailure("auth.logout.session_destroy_failed", error);
  }
  await clearSessionCookie();

  if (session) logger.info("auth.logout", { userId: session.user.id });
  redirect("/login");
}
