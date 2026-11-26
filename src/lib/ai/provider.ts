import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { aiModel, aiProvider, env } from "@/lib/env";

/** Run the app's JSON-only generation through OpenAI first, then Anthropic. */
export async function generateJsonText(input: {
  system: string;
  user: string;
  maxTokens: number;
}): Promise<{ text: string; model: string }> {
  if (aiProvider === "openai") {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: aiModel,
        max_completion_tokens: input.maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
      cache: "no-store",
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      throw new Error(payload?.error?.message ?? `OpenAI request failed (${response.status}).`);
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const text = payload.choices?.[0]?.message?.content;
    if (!text) throw new Error("OpenAI returned an empty response.");
    return { text, model: aiModel };
  }

  if (aiProvider === "anthropic" && env.ANTHROPIC_API_KEY) {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 45_000 });
    const message = await client.messages.create({
      model: aiModel,
      max_tokens: input.maxTokens,
      system: input.system,
      messages: [{ role: "user", content: input.user }],
    });
    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");
    if (!text) throw new Error("Anthropic returned an empty response.");
    return { text, model: aiModel };
  }

  throw new Error("AI is not configured. Add OPENAI_API_KEY or ANTHROPIC_API_KEY.");
}
