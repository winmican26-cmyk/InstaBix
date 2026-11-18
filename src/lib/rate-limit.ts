import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export type RateLimitResult = { ok: boolean; remaining: number; retryAfterSeconds: number };

/**
 * Postgres-backed fixed-window limiter. Atomic upsert, so it holds across instances
 * and serverless invocations without a Redis dependency.
 */
export async function checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const rows = await db.execute<{ count: number; window_start: Date }>(sql`
    insert into rate_limits (key, count, window_start)
    values (${key}, 1, now())
    on conflict (key) do update set
      count = case
        when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) then 1
        else rate_limits.count + 1
      end,
      window_start = case
        when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) then now()
        else rate_limits.window_start
      end
    returning count, window_start
  `);

  const row = rows.rows[0];
  if (!row) return { ok: true, remaining: limit - 1, retryAfterSeconds: 0 };

  const elapsed = Math.floor((Date.now() - new Date(row.window_start).getTime()) / 1000);
  const retryAfterSeconds = Math.max(0, windowSeconds - elapsed) || windowSeconds;
  return { ok: row.count <= limit, remaining: Math.max(0, limit - row.count), retryAfterSeconds };
}
