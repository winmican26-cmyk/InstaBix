"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { memberships, orgs, sessions } from "@/lib/db/schema";
import { getSessionUser, requireUser } from "@/lib/auth/session";
import { insertAudit } from "@/lib/audit";
import { slugify } from "@/lib/utils";

export async function setActiveOrg(orgId: string): Promise<void> {
  const session = await getSessionUser();
  if (!session) redirect("/login");

  const [membership] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, session.user.id)))
    .limit(1);
  if (!membership) redirect("/dashboard");

  await db.update(sessions).set({ orgId }).where(eq(sessions.tokenHash, session.tokenHash));
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export type OrgState = { error?: string };

export async function createOrgAction(_prev: OrgState, formData: FormData): Promise<OrgState> {
  const user = await requireUser();
  const parsed = z.object({ name: z.string().trim().min(2).max(80) }).safeParse({ name: String(formData.get("name") ?? "") });
  if (!parsed.success) return { error: "Give your workspace a name of at least 2 characters." };

  const slug = `${slugify(parsed.data.name) || "workspace"}-${Math.random().toString(36).slice(2, 6)}`;
  const orgId = await db.transaction(async (tx) => {
    const [org] = await tx.insert(orgs).values({ name: parsed.data.name, slug, settings: {} }).returning({ id: orgs.id });
    if (!org) throw new Error("Could not create workspace.");
    await tx.insert(memberships).values({ orgId: org.id, userId: user.id, role: "owner" });
    await tx.execute(sql`select set_config('app.org_id', ${org.id}, true)`);
    await insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: "org.created",
      entityType: "org",
      entityId: org.id,
      metadata: { name: parsed.data.name },
    });
    return org.id;
  });

  await setActiveOrg(orgId);
  redirect("/dashboard");
}
