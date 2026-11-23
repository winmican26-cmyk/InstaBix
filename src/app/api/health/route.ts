import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** Liveness plus a real database round-trip. No secrets, no version numbers. */
export async function GET() {
  const started = Date.now();
  try {
    await db.execute(sql`select 1`);
    return Response.json(
      {
        status: "ok",
        database: "reachable",
        latencyMs: Date.now() - started,
        checkedAt: new Date().toISOString(),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    logger.warn("health.database_unreachable", {
      code: typeof code === "string" && /^[A-Z0-9_]{1,48}$/.test(code) ? code : "UNKNOWN",
    });
    return Response.json(
      { status: "degraded", database: "unreachable", checkedAt: new Date().toISOString() },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
