import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { env, aiConfigured } from "@/lib/env";
import { logger, errorMessage } from "@/lib/logger";

const demandDraftSchema = z.object({
  theme: z.string().trim().min(3).max(80),
  evidenceIndexes: z
    .array(z.number().int().min(0).max(11))
    .min(1)
    .max(6)
    .refine((indexes) => new Set(indexes).size === indexes.length, { message: "evidenceIndexes must be unique" }),
  examplePhrasing: z.string().trim().max(200),
  productConcept: z.string().trim().min(10).max(240),
});

const demandResponseSchema = z.object({
  gaps: z.array(demandDraftSchema).min(1).max(3),
});

export type DemandDraft = z.infer<typeof demandDraftSchema>;

const voiceDraftSchema = z.object({
  tone: z.array(z.string().trim().min(2).max(24)).min(2).max(4),
  topPhrases: z.array(z.string().trim().min(4).max(160)).min(3).max(10),
  signatureStories: z.array(z.string().trim().min(8).max(200)).min(2).max(5),
  neverSays: z.array(z.string().trim().min(4).max(160)).min(2).max(8),
});

export type VoiceDraft = z.infer<typeof voiceDraftSchema>;

const buyerDraftSchema = z.object({
  persona: z.string().trim().min(4).max(80),
  objection: z.string().trim().min(8).max(200),
  fix: z.string().trim().min(8).max(240),
});

const buyerResponseSchema = z.object({
  panel: z.array(buyerDraftSchema).min(3).max(5),
});

export type BuyerDraft = z.infer<typeof buyerDraftSchema>;

export type Result<T> = { ok: true; data: T; model: string } | { ok: false; error: string };

const DEMAND_SYSTEM = `You are the demand-gap analyst inside InstaBix, a creator partnership platform.

Hard rules:
- Work only from the supplied material. Do not invent audience size, revenue, prices, research, testimonials or metrics.
- evidenceIndexes must point only to numbered supplied captions and are 0-based: 0 is caption 1, 1 is caption 2, and so on (valid range 0..11).
- Do not invent comment counts or engagement numbers.
- Return 1 to 3 gaps. Each gap has 1 to 6 unique evidenceIndexes.
- Return JSON only, matching this shape:
{"gaps":[{"theme":string,"evidenceIndexes":number[],"examplePhrasing":string,"productConcept":string}]}
- theme 3..80 characters, examplePhrasing at most 200 characters, productConcept 10..240 characters.`;

const VOICE_SYSTEM = `You are the voice-DNA analyst inside InstaBix, a creator partnership platform.

Hard rules:
- Work only from the supplied creator profile and captions. Do not invent audience size, revenue, prices, research, testimonials or metrics.
- topPhrases must be verbatim from the supplied material. Never invent a phrase.
- Return JSON only, matching this shape:
{"tone":string[],"topPhrases":string[],"signatureStories":string[],"neverSays":string[]}
- 2..4 tone entries (2..24 characters each), 3..10 topPhrases (4..160 characters each), 2..5 signatureStories (8..200 characters each), 2..8 neverSays (4..160 characters each).`;

const BUYER_SYSTEM = `You are the test-buyer-panel designer inside InstaBix, a creator partnership platform.

Hard rules:
- Work only from the supplied product material. Do not invent audience size, revenue, prices, research, testimonials or metrics.
- Return 3 to 5 distinct personas, each with exactly one objection and one concrete fix.
- Make no claims that are not supported by the supplied material.
- Return JSON only, matching this shape:
{"panel":[{"persona":string,"objection":string,"fix":string}]}
- persona 4..80 characters, objection 8..200 characters, fix 8..240 characters.`;

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("The model did not return JSON.");
  return JSON.parse(candidate.slice(start, end + 1));
}

export async function analyzeDemand(input: {
  captions: string[];
  notes: string | null;
  existingProductTitles: string[];
}): Promise<Result<DemandDraft[]>> {
  if (!aiConfigured) return { ok: false, error: "AI is not configured. Add ANTHROPIC_API_KEY to enable analysis." };

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 45_000 });

  const captions = input.captions.slice(0, 12).map((caption) => caption.slice(0, 400));
  const notes = (input.notes ?? "").slice(0, 400);
  const titles = input.existingProductTitles.slice(0, 20).map((title) => title.slice(0, 80));

  const material = [
    `Existing product titles (already covered; do not repeat): ${titles.length ? titles.join(" | ") : "none supplied"}`,
    `Creator notes: ${notes || "not supplied"}`,
    "",
    "Recent captions (numbered 1..12 for reference):",
    ...captions.map((caption, index) => `${index + 1}. ${caption}`),
    "",
    "evidenceIndexes are 0-based: 0 refers to caption 1, 1 refers to caption 2, and so on (valid range 0..11).",
  ].join("\n");

  try {
    const message = await client.messages.create({
      model: env.AI_MODEL,
      max_tokens: 2200,
      system: DEMAND_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Identify demand gaps for this creator. Return JSON only.\n\n${material}`,
        },
      ],
    });

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    const parsed = demandResponseSchema.safeParse(extractJson(text));
    if (!parsed.success) {
      logger.warn("ai.demand_invalid", { issues: parsed.error.issues.map((issue) => issue.path.join(".")) });
      return { ok: false, error: "The model returned invalid demand gaps. Nothing was saved. Try again." };
    }

    return { ok: true, data: parsed.data.gaps, model: env.AI_MODEL };
  } catch (error) {
    const message = errorMessage(error);
    logger.error("ai.demand_failed", { message });
    return { ok: false, error: `Generation failed: ${message}` };
  }
}

export async function extractVoiceDna(input: {
  creatorName: string;
  username: string;
  captions: string[];
}): Promise<Result<VoiceDraft>> {
  if (!aiConfigured) return { ok: false, error: "AI is not configured. Add ANTHROPIC_API_KEY to enable analysis." };

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 45_000 });

  const captions = input.captions.slice(0, 12).map((caption) => caption.slice(0, 400));

  const material = [
    `Creator: ${input.creatorName}`,
    `Username: @${input.username}`,
    "",
    "Recent captions (numbered 1..12 for reference; quote phrases verbatim):",
    ...captions.map((caption, index) => `${index + 1}. ${caption}`),
  ].join("\n");

  try {
    const message = await client.messages.create({
      model: env.AI_MODEL,
      max_tokens: 1800,
      system: VOICE_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Extract the voice DNA for this creator. Return JSON only.\n\n${material}`,
        },
      ],
    });

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    const parsed = voiceDraftSchema.safeParse(extractJson(text));
    if (!parsed.success) {
      logger.warn("ai.voice_invalid", { issues: parsed.error.issues.map((issue) => issue.path.join(".")) });
      return { ok: false, error: "The model returned an invalid voice profile. Nothing was saved. Try again." };
    }

    return { ok: true, data: parsed.data, model: env.AI_MODEL };
  } catch (error) {
    const message = errorMessage(error);
    logger.error("ai.voice_failed", { message });
    return { ok: false, error: `Generation failed: ${message}` };
  }
}

export async function createBuyerPanel(input: {
  title: string;
  promise: string | null;
  chapters: { title: string; summary: string | null }[];
  gaps: { theme: string; productConcept: string }[];
  voice: { tone: string[]; neverSays: string[] };
}): Promise<Result<BuyerDraft[]>> {
  if (!aiConfigured) return { ok: false, error: "AI is not configured. Add ANTHROPIC_API_KEY to enable analysis." };

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 45_000 });

  const chapters = input.chapters.slice(0, 12).map((chapter) => ({
    title: chapter.title,
    summary: chapter.summary?.slice(0, 240) ?? null,
  }));
  const gaps = input.gaps.slice(0, 3);
  const tone = input.voice.tone.slice(0, 10);
  const neverSays = input.voice.neverSays.slice(0, 10);

  const material = [
    `Product title: ${input.title}`,
    `Promise: ${input.promise ?? "not supplied"}`,
    "",
    "Chapters:",
    ...chapters.map((chapter, index) => `${index + 1}. ${chapter.title}: ${chapter.summary ?? "no summary supplied"}`),
    "",
    "Demand gaps:",
    ...gaps.map((gap) => `- ${gap.theme}: ${gap.productConcept}`),
    "",
    `Voice tone: ${tone.length ? tone.join(", ") : "not supplied"}`,
    `Never says: ${neverSays.length ? neverSays.join(", ") : "not supplied"}`,
  ].join("\n");

  try {
    const message = await client.messages.create({
      model: env.AI_MODEL,
      max_tokens: 2200,
      system: BUYER_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Build a test buyer panel for this product. Return JSON only.\n\n${material}`,
        },
      ],
    });

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    const parsed = buyerResponseSchema.safeParse(extractJson(text));
    if (!parsed.success) {
      logger.warn("ai.buyer_panel_invalid", { issues: parsed.error.issues.map((issue) => issue.path.join(".")) });
      return { ok: false, error: "The model returned an invalid buyer panel. Nothing was saved. Try again." };
    }

    return { ok: true, data: parsed.data.panel, model: env.AI_MODEL };
  } catch (error) {
    const message = errorMessage(error);
    logger.error("ai.buyer_panel_failed", { message });
    return { ok: false, error: `Generation failed: ${message}` };
  }
}
