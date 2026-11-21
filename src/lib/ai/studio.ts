import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { env, aiConfigured } from "@/lib/env";
import { logger, errorMessage } from "@/lib/logger";

const outlineSchema = z.object({
  title: z.string().min(3).max(90),
  subtitle: z.string().min(3).max(140),
  promise: z.string().min(10).max(280),
  priceCents: z.union([z.literal(1900), z.literal(2900), z.literal(4900), z.literal(9700)]),
  chapters: z
    .array(
      z.object({
        title: z.string().min(2).max(90),
        summary: z.string().min(10).max(240),
      }),
    )
    .min(8)
    .max(12),
});

export type Outline = z.infer<typeof outlineSchema>;

export type OutlineInput = {
  creatorName: string;
  username: string;
  niche: string | null;
  audienceAsk: string | null;
  captions: string[];
  splitCreatorBps: number;
};

const SYSTEM = `You are the product architect inside VistaBix, a creator partnership platform.

Hard rules:
- Work only from the supplied material. Do not invent audience size, revenue, testimonials or research.
- The product must answer the repeated request in the creator's own audience language.
- Write in the creator's voice: practical, specific, no hype, no guru claims.
- The outline is a proposal for a human to approve, not a published product.
- Price must be one of 1900, 2900, 4900, 9700 (US cents).
- 8 to 12 chapters, each with a concrete promise and no filler.
- Do not promise medical, legal or financial outcomes.

Return JSON only, matching this shape:
{"title":string,"subtitle":string,"promise":string,"priceCents":number,"chapters":[{"title":string,"summary":string}]}`;

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("The model did not return JSON.");
  return JSON.parse(candidate.slice(start, end + 1));
}

export async function generateOutline(input: OutlineInput): Promise<{ ok: true; outline: Outline; model: string } | { ok: false; error: string }> {
  if (!aiConfigured) return { ok: false, error: "AI is not configured. Add ANTHROPIC_API_KEY to enable generation." };

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 45_000 });

  const material = [
    `Creator: ${input.creatorName} (@${input.username})`,
    `Niche: ${input.niche ?? "not supplied"}`,
    `What the audience keeps asking for (creator's own words): ${input.audienceAsk ?? "not supplied"}`,
    `Creator share: ${(input.splitCreatorBps / 100).toFixed(0)}% of gross.`,
    "",
    "Recent captions (public posts; use for voice and topic, never quote as testimonials):",
    ...input.captions.slice(0, 12).map((c, i) => `${i + 1}. ${c.slice(0, 400)}`),
  ].join("\n");

  try {
    const message = await client.messages.create({
      model: env.AI_MODEL,
      max_tokens: 2200,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Design one product for this creator. Return JSON only.\n\n${material}`,
        },
      ],
    });

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    const parsed = outlineSchema.safeParse(extractJson(text));
    if (!parsed.success) {
      logger.warn("ai.outline_invalid", { issues: parsed.error.issues.map((i) => i.path.join(".")) });
      return { ok: false, error: "The model returned an invalid outline. Nothing was saved. Try again." };
    }

    return { ok: true, outline: parsed.data, model: env.AI_MODEL };
  } catch (error) {
    const message = errorMessage(error);
    logger.error("ai.outline_failed", { message });
    return { ok: false, error: `Generation failed: ${message}` };
  }
}
