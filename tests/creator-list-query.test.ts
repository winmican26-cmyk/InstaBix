import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { parseCreatorListParams } from "@/lib/creators/list-params";

// Integration suite against the real Postgres container. Only the two DB URLs
// are read from .env.local so no other credential node is touched.
let localEnv: Record<string, string> = {};
try {
  localEnv = parse(readFileSync(".env.local"));
} catch {
  // Fall back to the ambient environment below.
}
const adminUrl = localEnv.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL_ADMIN;
const runtimeUrl = localEnv.DATABASE_URL ?? process.env.DATABASE_URL;
if (!adminUrl || !runtimeUrl) {
  throw new Error("creator-list-query test requires DATABASE_URL_ADMIN and DATABASE_URL (see .env.local).");
}

// Modules imported below parse env at import time and build the runtime pool.
const originalDatabaseUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL = runtimeUrl;

vi.mock("server-only", () => ({}));

const { listCreators } = await import("@/lib/db/queries");

const suffix = randomUUID().slice(0, 8);
const orgId = randomUUID();
const otherOrgId = randomUUID();
const userId = randomUUID();
const outsiderCreatorId = randomUUID();
const creatorIds = Array.from({ length: 30 }, () => randomUUID());
const baseTime = Date.UTC(2026, 0, 1, 12, 0, 0);
const createdAt = creatorIds.map((_, index) => new Date(baseTime + Math.floor(index / 2) * 60_000));
const capturedAt = creatorIds.map((_, index) => new Date(baseTime + index * 1_000));
const followers = creatorIds.map((_, index) => 1_000 + (index % 5) * 100);
const scoreTotals = creatorIds.map((_, index) => 50 + (index % 4) * 10);
const indexById = new Map(creatorIds.map((id, index) => [id, index]));
const orgIds = [orgId, otherOrgId];

let admin: Client;

beforeAll(async () => {
  admin = new Client({ connectionString: adminUrl });
  await admin.connect();

  await admin.query("begin");
  try {
    await admin.query("insert into orgs (id, name, slug) values ($1, $2, $3), ($4, $5, $6)", [
      orgId,
      `Creator list fixture ${suffix}`,
      `creator-list-${suffix}`,
      otherOrgId,
      `Creator list outsider ${suffix}`,
      `creator-list-outsider-${suffix}`,
    ]);
    await admin.query("insert into users (id, email, name, password_hash) values ($1, $2, $3, $4)", [
      userId,
      `creator-list-${suffix}@example.test`,
      "Creator List Fixture Operator",
      "test-only-hash",
    ]);

    for (let index = 0; index < creatorIds.length; index += 1) {
      await admin.query(
        `insert into creator_accounts
           (id, org_id, username, source, status, consent_status, created_by, created_at)
         values ($1, $2, $3, 'manual', $4, $5, $6, $7)`,
        [
          creatorIds[index],
          orgId,
          `list_creator_${suffix}_${String(index).padStart(2, "0")}`,
          index % 3 === 0 ? "approved" : "new",
          index % 4 === 0 ? "granted" : index % 4 === 1 ? "pending" : "revoked",
          userId,
          createdAt[index],
        ],
      );
      await admin.query(
        `insert into creator_snapshots (org_id, creator_id, followers, media_count, captured_at)
         values ($1, $2, $3, 1, $4)`,
        [orgId, creatorIds[index], followers[index], capturedAt[index]],
      );
      await admin.query(
        `insert into scores (org_id, creator_id, model_version, total, sample_size, factors, inputs_hash, computed_at)
         values ($1, $2, 'test-v1', $3, 10, '{}'::jsonb, $4, $5)`,
        [orgId, creatorIds[index], `${scoreTotals[index]}.00`, `hash-${suffix}-${index}`, capturedAt[index]],
      );
    }

    // An older but larger score must not win the latest-score subquery.
    await admin.query(
      `insert into scores (org_id, creator_id, model_version, total, sample_size, factors, inputs_hash, computed_at)
       values ($1, $2, 'test-v1', '999.00', 10, '{}'::jsonb, $3, $4)`,
      [orgId, creatorIds[0], `stale-hash-${suffix}`, new Date(baseTime - 86_400_000)],
    );

    await admin.query(
      `insert into creator_accounts (id, org_id, username, source, created_at) values ($1, $2, $3, 'manual', $4)`,
      [outsiderCreatorId, otherOrgId, `list_outsider_${suffix}`, new Date(baseTime - 3_600_000)],
    );
    await admin.query("commit");
  } catch (error) {
    await admin.query("rollback");
    throw error;
  }
});

afterAll(async () => {
  if (admin) {
    await admin.query("delete from orgs where id = any($1::uuid[])", [orgIds]);
    await admin.query("delete from users where id = $1", [userId]);
    await admin.end();
  }
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
});

function expectedIds(sort: "created" | "followers" | "score", dir: "asc" | "desc"): string[] {
  return [...creatorIds].sort((left, right) => {
    const a = indexById.get(left)!;
    const b = indexById.get(right)!;
    let primary = 0;
    if (sort === "created") primary = createdAt[a]!.getTime() - createdAt[b]!.getTime();
    if (sort === "followers") primary = followers[a]! - followers[b]!;
    if (sort === "score") primary = scoreTotals[a]! - scoreTotals[b]!;
    if (primary !== 0) return dir === "asc" ? primary : -primary;
    return left.localeCompare(right); // id tiebreaker is always ascending
  });
}

describe("listCreators hardening", () => {
  it("orders by created with an id tiebreaker and repeats byte-stably", async () => {
    const first = await listCreators(orgId, { sort: "created", dir: "desc" });
    const second = await listCreators(orgId, { sort: "created", dir: "desc" });

    expect(first.total).toBe(30);
    expect(first.page).toBe(1);
    expect(first.pageSize).toBe(25);
    expect(first.pageCount).toBe(2);
    expect(first.rows).toHaveLength(25);
    expect(JSON.stringify(first.rows)).toBe(JSON.stringify(second.rows));
    expect(first.rows.map((row) => row.id)).toEqual(expectedIds("created", "desc").slice(0, 25));
    expect(first.rows[0]).toHaveProperty("followers");
    expect(first.rows[0]).toHaveProperty("lastEnrichedAt");
    expect(first.rows[0]).toHaveProperty("score");
  });

  it("honors direction for followers and score sorts", async () => {
    const followersAsc = await listCreators(orgId, { sort: "followers", dir: "asc" });
    const followersDesc = await listCreators(orgId, { sort: "followers", dir: "desc" });
    expect(followersAsc.rows.map((row) => row.id)).toEqual(expectedIds("followers", "asc").slice(0, 25));
    expect(followersDesc.rows.map((row) => row.id)).toEqual(expectedIds("followers", "desc").slice(0, 25));

    const scoreAsc = await listCreators(orgId, { sort: "score", dir: "asc" });
    const scoreDesc = await listCreators(orgId, { sort: "score", dir: "desc" });
    expect(scoreAsc.rows.map((row) => row.id)).toEqual(expectedIds("score", "asc").slice(0, 25));
    expect(scoreDesc.rows.map((row) => row.id)).toEqual(expectedIds("score", "desc").slice(0, 25));
    const scorePageTwo = await listCreators(orgId, { sort: "score", dir: "desc", page: 2 });
    const latestScore = [...scoreDesc.rows, ...scorePageTwo.rows].find((row) => row.id === creatorIds[0]);
    expect(Number(latestScore?.score?.total)).toBe(scoreTotals[0]!);
  });

  it("applies inclusive follower bounds with correct total and pageCount", async () => {
    const result = await listCreators(orgId, { minFollowers: 1_100, maxFollowers: 1_200, sort: "followers" });
    const expected = creatorIds.filter((_, index) => followers[index]! >= 1_100 && followers[index]! <= 1_200);

    expect(result.rows).toHaveLength(12);
    expect(result.rows.every((row) => row.followers !== null && row.followers >= 1_100 && row.followers <= 1_200)).toBe(true);
    expect(new Set(result.rows.map((row) => row.id))).toEqual(new Set(expected));
    expect(result.total).toBe(expected.length);
    expect(result.pageCount).toBe(1);
  });

  it("paginates into disjoint slices", async () => {
    const first = await listCreators(orgId, { page: 1 });
    const second = await listCreators(orgId, { page: 2 });
    const firstIds = first.rows.map((row) => row.id);

    expect(firstIds).toHaveLength(25);
    expect(second.page).toBe(2);
    expect(second.rows).toHaveLength(5);
    expect(second.rows.every((row) => !firstIds.includes(row.id))).toBe(true);
    expect(new Set([...firstIds, ...second.rows.map((row) => row.id)]).size).toBe(30);
    expect(second.total).toBe(30);
    expect(second.pageCount).toBe(2);
  });

  it("never leaks rows from another org", async () => {
    const result = await listCreators(orgId, { page: 2 });
    expect(result.rows.every((row) => row.orgId === orgId)).toBe(true);
    expect(result.rows.some((row) => row.id === outsiderCreatorId)).toBe(false);

    const outsider = await listCreators(otherOrgId, {});
    expect(outsider.rows.map((row) => row.id)).toEqual([outsiderCreatorId]);
  });

  it("falls back from an attacker-supplied sort before reaching SQL", async () => {
    const attack = "created_at asc; drop table creator_accounts; --";
    const parsed = parseCreatorListParams({ sort: attack, dir: attack, page: "1" });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.params.sort).toBe("created");
    expect(parsed.params.dir).toBe("desc");

    const safe = await listCreators(orgId, parsed.params);
    const forced = await listCreators(orgId, { sort: attack as never, dir: attack as never });
    expect(forced.rows.map((row) => row.id)).toEqual(safe.rows.map((row) => row.id));
    expect(safe.rows.map((row) => row.id)).toEqual(expectedIds("created", "desc").slice(0, 25));

    const table = await admin.query<{ regclass: string | null }>("select to_regclass('creator_accounts') as regclass");
    expect(table.rows[0]?.regclass).toBe("creator_accounts");
  });
});
