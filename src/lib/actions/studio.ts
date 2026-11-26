"use server";

import { and, asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { withOrg } from "@/lib/db";
import { agreements, buyerObjections, chapters, citations, creatorAccounts, drafts, media, products, voiceDnas } from "@/lib/db/schema";
import { requireWorkspace, canReview } from "@/lib/auth/session";
import { checkVoiceText } from "@/lib/analysis/voice";
import { insertAudit } from "@/lib/audit";
import { generateOutline } from "@/lib/ai/studio";
import { aiConfigured } from "@/lib/env";
import { splitForProductOrdinal } from "@/lib/splits";
import { logger } from "@/lib/logger";
import { wordCount } from "@/lib/text";

export type StudioState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
  productId?: string;
};

async function requestIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

const createSchema = z.object({
  creatorId: z.string().uuid("Choose a creator."),
  title: z.string().trim().min(3, "Give the product a working title.").max(90),
  priceCents: z.coerce.number().int().min(1900).max(9700),
});

export async function createProductAction(_prev: StudioState, formData: FormData): Promise<StudioState> {
  const { user, org, role } = await requireWorkspace();
  if (!canReview(role)) return { error: "Your role cannot create products." };

  const parsed = createSchema.safeParse({
    creatorId: String(formData.get("creatorId") ?? ""),
    title: String(formData.get("title") ?? ""),
    priceCents: String(formData.get("priceCents") ?? "4900"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const created = await withOrg(org.id, async (tx) => {
    const [creator] = await tx
      .select({ id: creatorAccounts.id, consentStatus: creatorAccounts.consentStatus })
      .from(creatorAccounts)
      .where(and(eq(creatorAccounts.id, parsed.data.creatorId), eq(creatorAccounts.orgId, org.id)))
      .limit(1);
    if (!creator) return { error: "Creator not found." } as const;
    if (creator.consentStatus !== "granted") return { error: "That creator has not granted consent yet." } as const;

    const [countRow] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(products)
      .where(and(eq(products.orgId, org.id), eq(products.creatorId, creator.id)));
    const ordinal = (countRow?.count ?? 0) + 1;
    const split = splitForProductOrdinal(ordinal);

    const [row] = await tx
      .insert(products)
      .values({
        orgId: org.id,
        creatorId: creator.id,
        title: parsed.data.title,
        priceCents: parsed.data.priceCents,
        splitCreatorBps: split.creatorBps,
        splitOperatorBps: split.operatorBps,
        status: "outline_pending",
      })
      .returning({ id: products.id });
    if (!row) return { error: "Could not create the product." } as const;

    await insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: "product.created",
      entityType: "product",
      entityId: row.id,
      metadata: {
        creatorId: creator.id,
        title: parsed.data.title,
        ordinal,
        splitCreatorBps: split.creatorBps,
        splitOperatorBps: split.operatorBps,
      },
      ip: await requestIp(),
    });
    return { id: row.id } as const;
  });

  revalidatePath("/studio");
  if ("error" in created) return { error: created.error };
  return { success: "Product opened. Generate an outline when you are ready.", productId: created.id };
}

export async function generateOutlineAction(productId: string): Promise<StudioState> {
  const { user, org, role } = await requireWorkspace();
  if (!canReview(role)) return { error: "Your role cannot generate outlines." };

  if (!aiConfigured) {
    return { error: "AI is not configured. Add OPENAI_API_KEY or ANTHROPIC_API_KEY, then try again. Nothing was generated." };
  }

  const data = await withOrg(org.id, async (tx) => {
    const [row] = await tx
      .select({ product: products, creator: creatorAccounts })
      .from(products)
      .innerJoin(creatorAccounts, eq(creatorAccounts.id, products.creatorId))
      .where(and(eq(products.id, productId), eq(products.orgId, org.id)))
      .limit(1);
    if (!row) return null;
    const captions = await tx
      .select({ caption: media.caption })
      .from(media)
      .where(eq(media.creatorId, row.creator.id))
      .orderBy(asc(media.postedAt))
      .limit(12);
    return { ...row, captions: captions.map((c) => c.caption).filter((c): c is string => Boolean(c)) };
  });

  if (!data) return { error: "Product not found." };
  if (data.product.status !== "draft" && data.product.status !== "outline_pending") {
    return { error: "This product already has an outline or is further along." };
  }

  const generated = await generateOutline({
    creatorName: data.creator.displayName ?? data.creator.username,
    username: data.creator.username,
    niche: data.creator.niche,
    audienceAsk: data.creator.notes,
    captions: data.captions,
    splitCreatorBps: data.product.splitCreatorBps,
  });

  if (!generated.ok) return { error: generated.error };

  await withOrg(org.id, async (tx) => {
    await tx
      .update(products)
      .set({
        subtitle: generated.outline.subtitle,
        promise: generated.outline.promise,
        priceCents: generated.outline.priceCents,
        status: "outline_pending",
        updatedAt: new Date(),
      })
      .where(eq(products.id, productId));

    await tx.delete(chapters).where(eq(chapters.productId, productId));
    await tx.insert(chapters).values(
      generated.outline.chapters.map((chapter, index) => ({
        orgId: org.id,
        productId,
        position: index + 1,
        title: chapter.title,
        summary: chapter.summary,
      })),
    );

    await insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: "product.outline_generated",
      entityType: "product",
      entityId: productId,
      metadata: { model: generated.model, chapters: generated.outline.chapters.length, citationsAvailable: data.captions.length },
      ip: await requestIp(),
    });
  });

  revalidatePath(`/studio/${productId}`);
  revalidatePath("/studio");
  return { success: `Outline generated with ${generated.outline.chapters.length} chapters from ${data.captions.length} real captions. Review it before drafting.` };
}

export async function approveOutlineAction(productId: string): Promise<StudioState> {
  const { user, org, role } = await requireWorkspace();
  if (!canReview(role)) return { error: "Your role cannot approve outlines." };

  const result = await withOrg(org.id, async (tx) => {
    const chapterRows = await tx.select({ id: chapters.id }).from(chapters).where(eq(chapters.productId, productId));
    if (chapterRows.length < 8) return { error: `An outline needs at least 8 chapters. This one has ${chapterRows.length}.` } as const;

    const [row] = await tx
      .update(products)
      .set({ status: "outline_approved", updatedAt: new Date() })
      .where(and(eq(products.id, productId), eq(products.orgId, org.id)))
      .returning({ id: products.id });
    if (!row) return { error: "Product not found." } as const;

    await insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: "product.outline_approved",
      entityType: "product",
      entityId: productId,
      metadata: { chapters: chapterRows.length },
      ip: await requestIp(),
    });
    return { ok: true } as const;
  });

  revalidatePath(`/studio/${productId}`);
  if ("error" in result) return { error: result.error };
  return { success: "Outline approved. Drafting is the next gate." };
}

const chapterSchema = z.object({
  title: z.string().trim().min(2).max(90),
  summary: z.string().trim().max(240).optional(),
  content: z.string().trim().max(60_000),
});

const newChapterSchema = z.object({
  title: z.string().trim().min(2, "Give the chapter a title.").max(90),
  summary: z.string().trim().max(240).optional(),
});

/** Manual authoring path. A workspace without an AI key can still build a product. */
export async function addChapterAction(
  productId: string,
  _prev: StudioState,
  formData: FormData,
): Promise<StudioState> {
  const { user, org, role } = await requireWorkspace();
  if (!canReview(role)) return { error: "Your role cannot add chapters." };

  const parsed = newChapterSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    summary: String(formData.get("summary") ?? ""),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const result = await withOrg(org.id, async (tx) => {
    const [product] = await tx
      .select({ id: products.id, status: products.status })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.orgId, org.id)))
      .limit(1);
    if (!product) return { error: "Product not found." } as const;
    if (product.status !== "draft" && product.status !== "outline_pending" && product.status !== "outline_approved") {
      return { error: "The outline is locked once the product is in review or published." } as const;
    }

    const positionRows = await tx
      .select({ next: sql<number>`coalesce(max(${chapters.position}), 0) + 1` })
      .from(chapters)
      .where(eq(chapters.productId, productId));
    const next = positionRows[0]?.next ?? 1;

    const [row] = await tx
      .insert(chapters)
      .values({
        orgId: org.id,
        productId,
        position: next,
        title: parsed.data.title,
        summary: parsed.data.summary || null,
      })
      .returning({ id: chapters.id, position: chapters.position });

    if (!row) return { error: "The chapter could not be added." } as const;

    await insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: "chapter.added",
      entityType: "chapter",
      entityId: row.id,
      metadata: { productId, position: row.position, source: "operator_authored" },
      ip: await requestIp(),
    });

    return { ok: true, position: row.position } as const;
  });

  revalidatePath(`/studio/${productId}`);
  if ("error" in result) return { error: result.error };
  return { success: `Chapter ${result.position} added. Write it, then save.` };
}


export async function saveChapterAction(chapterId: string, formData: FormData): Promise<StudioState> {
  const { user, org, role } = await requireWorkspace();
  if (!canReview(role)) return { error: "Your role cannot edit chapters." };

  const parsed = chapterSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    summary: String(formData.get("summary") ?? ""),
    content: String(formData.get("content") ?? ""),
  });
  if (!parsed.success) return { error: "Chapter title or content is invalid." };

  const updated = await withOrg(org.id, async (tx) => {
    const [row] = await tx
      .update(chapters)
      .set({
        title: parsed.data.title,
        summary: parsed.data.summary || null,
        content: parsed.data.content || null,
        wordCount: wordCount(parsed.data.content),
      })
      .where(and(eq(chapters.id, chapterId), eq(chapters.orgId, org.id)))
      .returning({ id: chapters.id, productId: chapters.productId });
    if (!row) return null;
    await insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: "chapter.saved",
      entityType: "chapter",
      entityId: chapterId,
      metadata: { words: wordCount(parsed.data.content) },
      ip: null,
    });
    return row;
  });

  if (!updated) return { error: "Chapter not found." };
  revalidatePath(`/studio/${updated.productId}`);
  return { success: `Chapter saved · ${wordCount(parsed.data.content)} words measured.` };
}

export async function submitForCreatorReviewAction(productId: string): Promise<StudioState> {
  const { user, org, role } = await requireWorkspace();
  if (!canReview(role)) return { error: "Your role cannot submit for review." };

  const result = await withOrg(org.id, async (tx) => {
    const [product] = await tx.select().from(products).where(eq(products.id, productId)).limit(1);
    if (!product) return { error: "Product not found." } as const;
    if (product.status !== "outline_approved") return { error: "Approve the outline before submitting for creator review." } as const;

    const chapterRows = await tx.select().from(chapters).where(eq(chapters.productId, productId));
    const written = chapterRows.filter((c) => (c.content ?? "").trim().length > 0);
    if (written.length < chapterRows.length) {
      return { error: `Every chapter needs content before review. ${written.length} of ${chapterRows.length} written.` } as const;
    }
    if (written.length < 8) return { error: "At least 8 written chapters are required." } as const;

    const [voice] = await tx
      .select()
      .from(voiceDnas)
      .where(and(eq(voiceDnas.orgId, org.id), eq(voiceDnas.creatorId, product.creatorId)))
      .limit(1);
    if (voice?.lockedAt) {
      const draftText = written
        .map((c) => `${c.title}\n${c.summary ?? ""}\n${c.content ?? ""}`)
        .join("\n");
      const voiceCheck = checkVoiceText(draftText, voice);
      if (!voiceCheck.passed) {
        return { error: "Voice check failed. Remove banned phrasing: " + voiceCheck.banned.join(", ") } as const;
      }
    }

    const [openObjections] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(buyerObjections)
      .where(
        and(
          eq(buyerObjections.orgId, org.id),
          eq(buyerObjections.productId, productId),
          eq(buyerObjections.status, "open"),
        ),
      );
    const openCount = openObjections?.count ?? 0;
    if (openCount > 0) {
      return { error: `Resolve ${openCount} open buyer objection(s) before creator review.` } as const;
    }

    const totalWords = written.reduce((sum, c) => sum + c.wordCount, 0);

    await tx.insert(drafts).values({
      orgId: org.id,
      productId,
      status: "review",
      wordCount: totalWords,
      model: "operator-authored",
      promptVersion: "n/a",
      content: written.map((c) => `## ${c.title}\n\n${c.content ?? ""}`).join("\n\n"),
    });

    await tx.update(products).set({ status: "review", updatedAt: new Date() }).where(eq(products.id, productId));

    await insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: "product.submitted_for_review",
      entityType: "product",
      entityId: productId,
      metadata: { chapters: written.length, words: totalWords },
      ip: await requestIp(),
    });
    return { ok: true, words: totalWords } as const;
  });

  revalidatePath(`/studio/${productId}`);
  revalidatePath("/studio");
  if ("error" in result) return { error: result.error };
  return { success: `Submitted for creator review · ${result.words} measured words.` };
}

export async function addCitationAction(draftId: string, formData: FormData): Promise<StudioState> {
  const { user, org, role } = await requireWorkspace();
  if (!canReview(role)) return { error: "Your role cannot add citations." };

  const parsed = z
    .object({
      passage: z.string().trim().min(10).max(400),
      sourceType: z.enum(["media", "comment", "creator_statement"]),
      sourceId: z.string().trim().min(3).max(120),
    })
    .safeParse({
      passage: String(formData.get("passage") ?? ""),
      sourceType: String(formData.get("sourceType") ?? "media"),
      sourceId: String(formData.get("sourceId") ?? ""),
    });
  if (!parsed.success) return { error: "A citation needs a passage, a source type and a source id." };

  await withOrg(org.id, async (tx) => {
    await tx.insert(citations).values({
      orgId: org.id,
      draftId,
      passage: parsed.data.passage,
      sourceType: parsed.data.sourceType,
      sourceId: parsed.data.sourceId,
    });
    await insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: "citation.added",
      entityType: "draft",
      entityId: draftId,
      metadata: { sourceType: parsed.data.sourceType, sourceId: parsed.data.sourceId },
      ip: null,
    });
  });

  return { success: "Citation recorded against a real source id." };
}

export async function publishProductAction(productId: string): Promise<StudioState> {
  const { user, org, role } = await requireWorkspace();
  if (role !== "owner" && role !== "admin") return { error: "Only owners and admins can publish." };

  const result = await withOrg(org.id, async (tx) => {
    const [product] = await tx.select().from(products).where(eq(products.id, productId)).limit(1);
    if (!product) return { error: "Product not found." } as const;
    if (product.status !== "approved") {
      return { error: "The creator must approve the product before it can be published." } as const;
    }

    const signed = await tx
      .select({ id: agreements.id })
      .from(agreements)
      .where(and(eq(agreements.creatorId, product.creatorId), sql`${agreements.signedAt} is not null`))
      .limit(1);
    if (signed.length === 0) {
      return { error: "The creator has not signed the partnership terms. Publishing is blocked." } as const;
    }

    await tx.update(products).set({ status: "published", updatedAt: new Date() }).where(eq(products.id, productId));
    await insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: "product.published",
      entityType: "product",
      entityId: productId,
      metadata: { priceCents: product.priceCents },
      ip: await requestIp(),
    });
    return { ok: true } as const;
  });

  revalidatePath(`/studio/${productId}`);
  revalidatePath("/studio");
  if ("error" in result) return { error: result.error };
  logger.info("studio.product_published", { productId });
  return { success: "Product published." };
}

export async function deleteProductAction(productId: string): Promise<StudioState> {
  const { user, org, role } = await requireWorkspace();
  if (role !== "owner" && role !== "admin") return { error: "Only owners and admins can delete products." };

  const deleted = await withOrg(org.id, async (tx) => {
    const [row] = await tx
      .delete(products)
      .where(and(eq(products.id, productId), eq(products.orgId, org.id)))
      .returning({ id: products.id, title: products.title });
    if (!row) return null;
    await insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: "product.deleted",
      entityType: "product",
      entityId: productId,
      metadata: { title: row.title },
      ip: null,
    });
    return row;
  });

  revalidatePath("/studio");
  if (!deleted) return { error: "Product not found." };
  return { success: "Product deleted." };
}
