import "server-only";
import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/lib/env";
import * as schema from "./schema";

type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const globalForDb = globalThis as unknown as {
  __vistabixPool?: Pool;
  __vistabixDb?: Db;
};

function createPool(): Pool {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 12,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: "vistabix",
  });
  pool.on("error", (error) => {
    console.error(JSON.stringify({ level: "error", event: "pg.pool_error", message: error.message }));
  });
  return pool;
}

export const pool: Pool = globalForDb.__vistabixPool ?? createPool();
export const db: Db = globalForDb.__vistabixDb ?? drizzle(pool, { schema });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__vistabixPool = pool;
  globalForDb.__vistabixDb = db;
}

/**
 * Every org-scoped read/write goes through here. It opens a transaction, binds the
 * tenant to the Postgres session (RLS reads `app.org_id`), and guarantees the setting
 * cannot leak to another request because it is transaction-local.
 */
export async function withOrg<T>(orgId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!/^[0-9a-f-]{36}$/i.test(orgId)) throw new Error("Invalid organisation id.");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
    return fn(tx);
  });
}

/** Read-only tenant scope. Kept as a distinct name so intent is obvious at call sites. */
export async function withOrgRead<T>(orgId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withOrg(orgId, fn);
}

/**
 * Resolves one portal token. The caller presents the token; the database policy
 * allows reading exactly the row whose hash matches it. Nothing else is visible.
 * The token hash is transaction-local, so it cannot leak into another request.
 */
export async function withPortalToken<T>(tokenHash: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.portal_token', ${tokenHash}, true)`);
    return fn(tx);
  });
}

/** Same contract as withPortalToken, for workspace invitations. */
export async function withInviteToken<T>(tokenHash: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.invite_token', ${tokenHash}, true)`);
    return fn(tx);
  });
}
