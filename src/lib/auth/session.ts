import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db";
import { memberships, orgs, sessions, users } from "@/lib/db/schema";
import { randomToken, sha256 } from "@/lib/crypto";
import type { Org, User } from "@/lib/db/schema";

const COOKIE = "ibx_session";
const SESSION_DAYS = 30;

export type Role = "owner" | "admin" | "operator" | "reviewer" | "creator";
export type Workspace = { user: User; org: Org; role: Role; sessionTokenHash: string };

export async function createSession(userId: string, orgId: string | null): Promise<void> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  const h = await headers();

  await db.insert(sessions).values({
    tokenHash: sha256(token),
    userId,
    orgId,
    expiresAt,
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent")?.slice(0, 400) ?? null,
  });

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
  jar.delete(COOKIE);
}

export const getSessionUser = cache(async (): Promise<{ user: User; orgId: string | null; tokenHash: string } | null> => {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;

  const tokenHash = sha256(token);
  const rows = await db
    .select({ user: users, session: sessions })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return { user: row.user, orgId: row.session.orgId, tokenHash };
});

export const getMemberships = cache(async (userId: string) => {
  return db
    .select({ org: orgs, role: memberships.role, membershipId: memberships.id })
    .from(memberships)
    .innerJoin(orgs, eq(orgs.id, memberships.orgId))
    .where(eq(memberships.userId, userId))
    .orderBy(orgs.createdAt);
});

export async function getWorkspace(): Promise<Workspace | null> {
  const session = await getSessionUser();
  if (!session) return null;

  const rows = await getMemberships(session.user.id);
  if (rows.length === 0) return null;

  const active = rows.find((r) => r.org.id === session.orgId) ?? rows[0];
  if (!active) return null;

  return {
    user: session.user,
    org: active.org,
    role: active.role,
    sessionTokenHash: session.tokenHash,
  };
}

export async function requireUser() {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  return session.user;
}

export async function requireWorkspace(): Promise<Workspace> {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  const workspace = await getWorkspace();
  if (!workspace) redirect("/onboarding");
  return workspace;
}

export function canManage(role: Role): boolean {
  return role === "owner" || role === "admin";
}

export function canReview(role: Role): boolean {
  return role === "owner" || role === "admin" || role === "operator" || role === "reviewer";
}
