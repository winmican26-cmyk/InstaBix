"use server";

import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { withOrg, type Tx } from "@/lib/db";
import {
  buyerObjections,
  buyerPanelRuns,
  chapters,
  creatorAccounts,
  demandGaps,
  media,
  products,
  voiceDnas,
} from "@/lib/db/schema";
import { canReview, requireWorkspace } from "@/lib/auth/session";
import { insertAudit } from "@/lib/audit";
import { analyzeDemand, createBuyerPanel, extractVoiceDna } from "@/lib/ai/analysis";
import { aiConfigured } from "@/lib/env";
import {
  countBuyerLanguage,
  demandStrength,
  rankDemandGaps,
  scoreDemandBps,
  type EvidenceCaption,
} from "@/lib/analysis/demand";
import { normalizeText, onlyVerbatimPhrases } from "@/lib/analysis/voice";
import { normalizeBuyerDrafts } from "@/lib/analysis/buyers";

type AnalysisState = { error?: string; success?: string };

const AI_NOT_CONFIGURED = "AI is not configured. Add ANTHROPIC_API_KEY, then try again. Nothing was generated.";

async function requestIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

async function loadCreatorCaptions(tx: Tx, orgId: string, creatorId: string) {
  const [creator] = await tx
    .select()
    .from(creatorAccounts)
    .where(and(eq(creatorAccounts.id, creatorId), eq(creatorAccounts.orgId, orgId)))
    .limit(1);
  if (!creator) return null;

  const rows = await tx
    .select({ id: media.id, text: media.caption })
    .from(media)
    .where(and(eq(media.orgId, orgId), eq(media.creatorId, creatorId), isNotNull(media.caption)))
    .orderBy(asc(media.postedAt))
    .limit(12);
  const captions = rows.filter((row): row is EvidenceCaption => Boolean(row.text));
  return { creator, captions };
}

export async function generateDemandGapsAction(creatorId: string): Promise<AnalysisState> {
  const { user, org, role } = await requireWorkspace();
  if (!canReview(role)) return { error: "Your role cannot generate demand gaps." };

  if (!aiConfigured) return { error: AI_NOT_CONFIGURED };

  const data = await withOrg(org.id, async (tx) => {
    const loaded = await loadCreatorCaptions(tx, org.id, creatorId);
    if (!loaded) return null;
    const titleRows = await tx
      .select({ title: products.title })
      .from(products)
      .where(eq(products.orgId, org.id))
      .orderBy(desc(products.createdAt))
      .limit(20);
    return { ...loaded, existingProductTitles: titleRows.map((row) => row.title) };
  });

  if (!data || data.captions.length === 0) {
    return { error: "No real captions are stored for this creator. Nothing was generated." };
  }

  const generated = await analyzeDemand({
    captions: data.captions.map((caption) => caption.text),
    notes: data.creator.notes ?? null,
    existingProductTitles: data.existingProductTitles,
  });
  if (!generated.ok) return { error: generated.error };

  const scored = generated.data.map((draft) => {
    const evidence = draft.evidenceIndexes
      .map((index) => data.captions[index])
      .filter((caption): caption is EvidenceCaption => Boolean(caption));
    const requestCount = new Set(evidence.map((caption) => caption.id)).size;
    const buyerLanguageHits = countBuyerLanguage(evidence.map((caption) => caption.text));
    const existingProductMatches = data.existingProductTitles.filter(
      (title) => normalizeText(title).includes(normalizeText(draft.theme)),
    ).length;
    const scoreBps = scoreDemandBps({ requestCount, buyerLanguageHits, existingProductMatches });
    return {
      orgId: org.id,
      creatorId,
      productId: null,
      theme: draft.theme,
      rank: 0,
      requestCount,
      buyerLanguageHits,
      existingProductMatches,
      scoreBps,
      strength: demandStrength(requestCount),
      examplePhrasing: draft.examplePhrasing,
      productConcept: draft.productConcept,
      evidenceCaptionIds: evidence.map((caption) => caption.id),
      model: generated.model,
      captionsUsed: data.captions.length,
    };
  });
  const ranked = rankDemandGaps(scored).map((gap, index) => ({ ...gap, rank: index + 1 }));

  await withOrg(org.id, async (tx) => {
    await tx
      .delete(demandGaps)
      .where(and(eq(demandGaps.orgId, org.id), eq(demandGaps.creatorId, creatorId)));
    if (ranked.length > 0) await tx.insert(demandGaps).values(ranked);
    await insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: "demand_gaps.generated",
      entityType: "creator",
      entityId: creatorId,
      metadata: { count: ranked.length, captionsUsed: data.captions.length, model: generated.model },
      ip: await requestIp(),
    });
  });

  revalidatePath("/studio");
  revalidatePath(`/creators/${creatorId}`);
  return {
    success: `Generated ${ranked.length} demand gaps from ${data.captions.length} real captions. These are proposals for human review.`,
  };
}

export async function generateVoiceDnaAction(creatorId: string): Promise<AnalysisState> {
  const { user, org, role } = await requireWorkspace();
  if (!canReview(role)) return { error: "Your role cannot generate Voice DNA." };

  if (!aiConfigured) return { error: AI_NOT_CONFIGURED };

  const data = await withOrg(org.id, async (tx) => loadCreatorCaptions(tx, org.id, creatorId));
  if (!data || data.captions.length === 0) {
    return { error: "No real captions are stored for this creator. Nothing was saved." };
  }

  const captions = data.captions.map((caption) => caption.text);
  const generated = await extractVoiceDna({
    creatorName: data.creator.displayName ?? data.creator.username,
    username: data.creator.username,
    captions,
  });
  if (!generated.ok) return { error: generated.error };

  const topPhrases = onlyVerbatimPhrases(generated.data.topPhrases, captions);
  if (topPhrases.length < 3) {
    return { error: "The model could not ground three phrases in real captions. Nothing was saved." };
  }

  const saved = await withOrg(org.id, async (tx) => {
    const [row] = await tx
      .insert(voiceDnas)
      .values({
        orgId: org.id,
        creatorId,
        tone: generated.data.tone,
        topPhrases,
        signatureStories: generated.data.signatureStories,
        neverSays: generated.data.neverSays,
        captionsUsed: data.captions.length,
        model: generated.model,
        lockedAt: null,
        lockedBy: null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [voiceDnas.orgId, voiceDnas.creatorId],
        set: {
          tone: generated.data.tone,
          topPhrases,
          signatureStories: generated.data.signatureStories,
          neverSays: generated.data.neverSays,
          captionsUsed: data.captions.length,
          model: generated.model,
          lockedAt: null,
          lockedBy: null,
          updatedAt: new Date(),
        },
      })
      .returning({ id: voiceDnas.id });
    if (!row) return null;

    await insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: "voice_dna.generated",
      entityType: "voice_dna",
      entityId: row.id,
      metadata: { captionsUsed: data.captions.length, phrases: topPhrases.length, model: generated.model },
      ip: await requestIp(),
    });
    return row;
  });

  revalidatePath("/studio");
  revalidatePath(`/creators/${creatorId}`);
  if (!saved) return { error: "Voice DNA could not be saved." };
  return {
    success: `Voice DNA extracted from ${data.captions.length} real captions with ${topPhrases.length} verbatim phrases. Lock it before running the buyer panel.`,
  };
}

export async function lockVoiceDnaAction(creatorId: string): Promise<AnalysisState> {
  const { user, org, role } = await requireWorkspace();
  if (!canReview(role)) return { error: "Your role cannot lock Voice DNA." };

  const locked = await withOrg(org.id, async (tx) => {
    const [voice] = await tx
      .select({ id: voiceDnas.id })
      .from(voiceDnas)
      .where(and(eq(voiceDnas.orgId, org.id), eq(voiceDnas.creatorId, creatorId)))
      .limit(1);
    if (!voice) return null;

    await tx
      .update(voiceDnas)
      .set({ lockedAt: new Date(), lockedBy: user.id, updatedAt: new Date() })
      .where(eq(voiceDnas.id, voice.id));

    await insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: "voice_dna.locked",
      entityType: "voice_dna",
      entityId: voice.id,
      metadata: { creatorId },
      ip: await requestIp(),
    });
    return voice;
  });

  revalidatePath("/studio");
  revalidatePath(`/creators/${creatorId}`);
  if (!locked) return { error: "Voice DNA not found. Generate it before locking." };
  return { success: "Voice DNA locked. The buyer panel can now be run." };
}

export async function runBuyerPanelAction(productId: string): Promise<AnalysisState> {
  const { user, org, role } = await requireWorkspace();
  if (!canReview(role)) return { error: "Your role cannot run the buyer panel." };

  if (!aiConfigured) return { error: AI_NOT_CONFIGURED };

  const data = await withOrg(org.id, async (tx) => {
    const [row] = await tx
      .select({ product: products, creator: creatorAccounts })
      .from(products)
      .innerJoin(creatorAccounts, eq(creatorAccounts.id, products.creatorId))
      .where(
        and(
          eq(products.id, productId),
          eq(products.orgId, org.id),
          eq(creatorAccounts.orgId, org.id),
        ),
      )
      .limit(1);
    if (!row) return null;

    const chapterRows = await tx
      .select({ title: chapters.title, summary: chapters.summary })
      .from(chapters)
      .where(and(eq(chapters.orgId, org.id), eq(chapters.productId, productId)))
      .orderBy(asc(chapters.position));
    const [voice] = await tx
      .select()
      .from(voiceDnas)
      .where(and(eq(voiceDnas.orgId, org.id), eq(voiceDnas.creatorId, row.creator.id)))
      .limit(1);
    const gaps = await tx
      .select({ theme: demandGaps.theme, productConcept: demandGaps.productConcept })
      .from(demandGaps)
      .where(and(eq(demandGaps.orgId, org.id), eq(demandGaps.creatorId, row.creator.id)))
      .orderBy(asc(demandGaps.rank))
      .limit(3);

    return { product: row.product, chapters: chapterRows, voice: voice ?? null, gaps };
  });

  if (!data) return { error: "Product not found." };
  if (!data.voice?.lockedAt) return { error: "Lock Voice DNA before running the buyer panel." };
  if (data.chapters.length === 0) return { error: "No chapters are stored for this product. Nothing was generated." };

  const generated = await createBuyerPanel({
    title: data.product.title,
    promise: data.product.promise,
    chapters: data.chapters.map((chapter) => ({ title: chapter.title, summary: chapter.summary })),
    gaps: data.gaps.map((gap) => ({ theme: gap.theme, productConcept: gap.productConcept })),
    voice: { tone: data.voice.tone, neverSays: data.voice.neverSays },
  });
  if (!generated.ok) return { error: generated.error };

  const normalized = normalizeBuyerDrafts(generated.data);
  if (!normalized.ok) return { error: normalized.error };

  const saved = await withOrg(org.id, async (tx) => {
    const [run] = await tx
      .insert(buyerPanelRuns)
      .values({
        orgId: org.id,
        productId,
        model: generated.model,
        objectionsCount: normalized.drafts.length,
      })
      .returning({ id: buyerPanelRuns.id });
    if (!run) return null;

    await tx.insert(buyerObjections).values(
      normalized.drafts.map((draft) => ({
        orgId: org.id,
        productId,
        runId: run.id,
        persona: draft.persona,
        objection: draft.objection,
        fix: draft.fix,
        status: "open",
      })),
    );

    await insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: "buyer_panel.run",
      entityType: "buyer_panel_run",
      entityId: run.id,
      metadata: { objections: normalized.drafts.length, model: generated.model },
      ip: await requestIp(),
    });
    return run;
  });

  revalidatePath(`/studio/${productId}`);
  revalidatePath("/studio");
  if (!saved) return { error: "The buyer panel could not be saved." };
  return { success: `Buyer panel run saved with ${normalized.drafts.length} objections for human review.` };
}

export async function setBuyerObjectionStatusAction(
  objectionId: string,
  status: "open" | "fixed" | "dismissed",
): Promise<AnalysisState> {
  const { user, org, role } = await requireWorkspace();
  if (!canReview(role)) return { error: "Your role cannot change buyer objections." };

  const allowed = ["open", "fixed", "dismissed"] as const;
  if (!allowed.includes(status)) return { error: "Invalid buyer objection status." };

  const updated = await withOrg(org.id, async (tx) => {
    const [row] = await tx
      .update(buyerObjections)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(buyerObjections.id, objectionId), eq(buyerObjections.orgId, org.id)))
      .returning({ productId: buyerObjections.productId });
    if (!row) return null;

    await insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: "buyer_objection.status_changed",
      entityType: "buyer_objection",
      entityId: objectionId,
      metadata: { status },
      ip: await requestIp(),
    });
    return row;
  });

  if (!updated) return { error: "Buyer objection not found." };
  revalidatePath(`/studio/${updated.productId}`);
  revalidatePath("/studio");
  return { success: `Buyer objection marked ${status}.` };
}
