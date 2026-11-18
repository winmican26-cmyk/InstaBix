import { db } from "@/lib/db";
import { webhookEvents } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { hmacSha256, safeEqual } from "@/lib/crypto";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !challenge) {
    return Response.json({ error: "Unsupported verification request." }, { status: 400 });
  }
  if (!env.META_WEBHOOK_VERIFY_TOKEN) {
    return Response.json({ error: "META_WEBHOOK_VERIFY_TOKEN is not configured." }, { status: 503 });
  }
  if (!token || !safeEqual(token, env.META_WEBHOOK_VERIFY_TOKEN)) {
    return Response.json({ error: "Verification token does not match." }, { status: 403 });
  }
  return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
}

export async function POST(request: Request) {
  if (!env.META_APP_SECRET) {
    return Response.json({ error: "META_APP_SECRET is not configured." }, { status: 503 });
  }

  const raw = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const expected = `sha256=${hmacSha256(env.META_APP_SECRET, raw)}`;
  if (!signature || !safeEqual(signature, expected)) {
    return Response.json({ error: "Signature verification failed." }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Body is not JSON." }, { status: 400 });
  }

  const object = typeof payload.object === "string" ? payload.object : "instagram";
  const entries = Array.isArray(payload.entry) ? (payload.entry as Record<string, unknown>[]) : [];
  const externalId = `${object}:${String(entries[0]?.id ?? "unknown")}:${String(entries[0]?.time ?? Date.now())}`;

  try {
    await db
      .insert(webhookEvents)
      .values({ provider: "instagram", externalId, payload })
      .onConflictDoNothing({ target: [webhookEvents.provider, webhookEvents.externalId] });
  } catch (error) {
    logger.error("instagram.webhook_store_failed", { message: error instanceof Error ? error.message : "unknown" });
    return Response.json({ error: "Event could not be stored." }, { status: 500 });
  }

  // Events are stored, not invented into product state. A deauthorize callback uses
  // the dedicated endpoint Meta requires, and media refreshes come from the sync job.
  return Response.json({ received: true });
}

export async function PUT(request: Request) {
  // Meta retries with the same body; storing is idempotent, so delegate.
  return POST(request);
}
