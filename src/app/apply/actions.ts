"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { db, withOrg } from "@/lib/db";
import { consents, creatorAccounts, orgs } from "@/lib/db/schema";
import { insertAudit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { normalizeUsername } from "@/lib/utils";

export type ApplyState = {
  ok?: boolean;
  applicantName?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
};

const schema = z.object({
  fullName: z.string().trim().min(2, "Tell us your name.").max(80),
  username: z.string().trim().min(2, "Enter your Instagram handle.").max(40),
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  niche: z.string().trim().max(60).optional(),
  audienceAsk: z.string().trim().min(12, "Give us a sentence or two.").max(1200),
});

export async function applyAction(_prev: ApplyState, formData: FormData): Promise<ApplyState> {
  if (formData.get("consent") !== "on") {
    return { fieldErrors: { consent: "We need your consent to review the application." } };
  }
  if (formData.get("terms") !== "on") {
    return { fieldErrors: { terms: "Please confirm you have read the partnership terms." } };
  }

  const parsed = schema.safeParse({
    fullName: String(formData.get("fullName") ?? ""),
    username: String(formData.get("username") ?? ""),
    email: String(formData.get("email") ?? ""),
    niche: String(formData.get("niche") ?? ""),
    audienceAsk: String(formData.get("audienceAsk") ?? ""),
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
  if (!username) return { fieldErrors: { username: "Use a valid Instagram handle (letters, numbers, dots, underscores)." } };

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const limit = await checkRateLimit(`apply:${ip}`, 5, 60 * 60);
  if (!limit.ok) return { error: "Too many applications from this network. Try again later." };

  const slug = process.env.PUBLIC_ORG_SLUG ?? "vistabix-hq";
  const [org] = await db.select({ id: orgs.id }).from(orgs).where(eq(orgs.slug, slug)).limit(1);
  if (!org) {
    return { error: "Applications are not open yet. The workspace operator still needs to finish setup." };
  }

  try {
    await withOrg(org.id, async (tx) => {
      const [creator] = await tx
        .insert(creatorAccounts)
        .values({
          orgId: org.id,
          username,
          displayName: parsed.data.fullName,
          niche: parsed.data.niche || null,
          contactEmail: parsed.data.email,
          emailSource: "creator_provided",
          source: "applied",
          consentStatus: "granted",
          consentAt: new Date(),
          status: "new",
          notes: parsed.data.audienceAsk,
        })
        .onConflictDoNothing({ target: [creatorAccounts.orgId, creatorAccounts.username] })
        .returning({ id: creatorAccounts.id });

      if (!creator) return; // Already on file — return the same success state on purpose.

      await tx.insert(consents).values({
        orgId: org.id,
        creatorId: creator.id,
        kind: "partnership_application",
        granted: true,
        documentVersion: "2026-01",
        ip,
        userAgent: h.get("user-agent")?.slice(0, 400) ?? null,
      });

      await insertAudit(tx, {
        orgId: org.id,
        action: "creator.applied",
        entityType: "creator",
        entityId: creator.id,
        metadata: { username, niche: parsed.data.niche ?? null },
        ip,
      });
    });
  } catch (error) {
    logger.error("apply.failed", { message: error instanceof Error ? error.message : "unknown" });
    return { error: "Something went wrong saving the application. Please try again." };
  }

  return { ok: true, applicantName: parsed.data.fullName.split(" ")[0] ?? "there" };
}
