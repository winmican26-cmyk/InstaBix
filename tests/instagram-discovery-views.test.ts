import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Integration suite against the real container. Read only the two DB URLs from
// .env.local so no other credential node is touched, mirroring rls-cross-tenant.
let localEnv: Record<string, string> = {};
try {
  localEnv = parse(readFileSync(".env.local"));
} catch {
  // Fall back to the ambient environment below.
}
const adminUrl = localEnv.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL_ADMIN;
const runtimeUrl = localEnv.DATABASE_URL ?? process.env.DATABASE_URL;
if (!adminUrl || !runtimeUrl) {
  throw new Error("instagram-discovery-views test requires DATABASE_URL_ADMIN and DATABASE_URL (see .env.local).");
}
// Modules imported below parse env at import time and build the runtime pool.
const originalDatabaseUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL = runtimeUrl;

vi.mock("server-only", () => ({}));

// Discovery credentials must exist before the first import of @/lib/env (via client/sync).
vi.stubEnv("META_DISCOVERY_TOKEN", "test-discovery-token");
vi.stubEnv("META_DISCOVERY_IG_USER_ID", "test-discovery-ig-user-id");

const { enrichCreator, recomputeScore } = await import("@/lib/instagram/sync");

type DiscoveryMedia = {
  id: string;
  caption: string;
  media_type: string;
  permalink: string;
  thumbnail_url: string;
  timestamp: string;
  like_count: number;
  comments_count: number;
  /** Intentionally absent on some items, exactly like the official sample response. */
  view_count?: number;
};

const viewedValues = [24_000, 52_000, 81_000, 15_000, 63_000, 97_000, 38_000, 44_000];
const unviewedIds = ["no_view_1", "no_view_2", "no_view_3", "no_view_4"];

function mediaItem(index: number, id: string, viewCount?: number): DiscoveryMedia {
  const item: DiscoveryMedia = {
    id,
    caption: `Public reel ${index + 1} — discovery views fixture`,
    media_type: "VIDEO",
    permalink: `https://www.instagram.com/reel/fixture_${id}/`,
    thumbnail_url: `https://example.test/${id}.jpg`,
    timestamp: `${new Date(Date.UTC(2026, 0, 21 - index, 12, 0, 0)).toISOString().slice(0, 19)}+0000`,
    like_count: 300 + index * 17,
    comments_count: 9 + index,
  };
  if (viewCount !== undefined) item.view_count = viewCount;
  return item;
}

const mediaItems: DiscoveryMedia[] = [
  ...viewedValues.map((views, index) => mediaItem(index, `discovery_view_${index + 1}`, views)),
  ...unviewedIds.map((id, index) => mediaItem(viewedValues.length + index, id)),
];

// Official-shaped Business Discovery payload: view_count on some media, omitted on others.
const discoveryPayload = {
  id: "17841400000000000",
  business_discovery: {
    followers_count: 125_000,
    media_count: mediaItems.length,
    media: { data: mediaItems },
  },
};

const suffix = randomUUID().slice(0, 8);
const orgId = randomUUID();
const userId = randomUUID();
const creatorId = randomUUID();
const username = `discovery_views_${suffix}`;

let admin: Client;
let fetchedUrls: string[] = [];

beforeAll(async () => {
  admin = new Client({ connectionString: adminUrl });
  await admin.connect();

  await admin.query("begin");
  try {
    await admin.query("insert into orgs (id, name, slug) values ($1, $2, $3)", [
      orgId,
      `Discovery views fixture ${suffix}`,
      `discovery-views-${suffix}`,
    ]);
    await admin.query("insert into users (id, email, name, password_hash) values ($1, $2, $3, $4)", [
      userId,
      `discovery-views-${suffix}@example.test`,
      "Discovery Views Operator",
      "test-only-hash",
    ]);
    await admin.query("insert into memberships (org_id, user_id, role) values ($1, $2, 'admin')", [orgId, userId]);
    await admin.query(
      "insert into creator_accounts (id, org_id, username, source, created_by, consent_status) values ($1, $2, $3, 'discovery', $4, $5)",
      [creatorId, orgId, username, userId, "granted"],
    );
    await admin.query("commit");
  } catch (error) {
    await admin.query("rollback");
    throw error;
  }
});

beforeEach(() => {
  fetchedUrls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      fetchedUrls.push(String(input));
      return new Response(JSON.stringify(discoveryPayload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  if (admin) {
    // org deletion cascades to creator, snapshots, media, scores and membership.
    await admin.query("delete from orgs where id = $1", [orgId]);
    await admin.query("delete from users where id = $1", [userId]);
    await admin.end();
  }
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Instagram Business Discovery view_count", () => {
  it("requests, persists, and scores view counts without coercing missing views to zero", async () => {
    // First call takes the insert path; the second exercises onConflictDoUpdate.
    const first = await enrichCreator(orgId, creatorId);
    expect(first.ok, first.error).toBe(true);
    const second = await enrichCreator(orgId, creatorId);
    expect(second.ok, second.error).toBe(true);
    expect(fetchedUrls.length).toBe(2);

    // The outgoing Graph request asks for view_count inside the media sub-selection.
    const requestUrl = new URL(fetchedUrls[0]!);
    expect(requestUrl.hostname).toBe("graph.facebook.com");
    const fields = requestUrl.searchParams.get("fields") ?? "";
    expect(fields).toContain("view_count");
    expect(fields).toMatch(/media\{[^}]*view_count[^}]*\}/);

    // Stored media: present views are numbers; omitted views stay SQL NULL, never 0.
    type MediaRow = { ig_media_id: string; view_count: number | null; like_count: number; comment_count: number };
    const mediaRows = await admin.query<MediaRow>(
      "select ig_media_id, view_count, like_count, comment_count from media where creator_id = $1",
      [creatorId],
    );
    expect(mediaRows.rows).toHaveLength(mediaItems.length);

    const expectedViews = new Map(mediaItems.map((item) => [item.id, item.view_count ?? null]));
    let presentCount = 0;
    let nullCount = 0;
    for (const row of mediaRows.rows) {
      const expected = expectedViews.get(row.ig_media_id);
      expect(expected, `unexpected media row ${row.ig_media_id}`).toBeDefined();
      expect(row.view_count).toBe(expected ?? null);
      expect(row.like_count).toBeGreaterThan(0);
      expect(row.comment_count).toBeGreaterThan(0);
      if (expected === null) {
        nullCount += 1;
        expect(row.view_count).toBeNull();
        expect(row.view_count).not.toBe(0);
      } else {
        presentCount += 1;
        expect(typeof row.view_count).toBe("number");
      }
    }
    expect(presentCount).toBe(viewedValues.length);
    expect(nullCount).toBe(unviewedIds.length);

    // Scoring reads the stored views through recomputeScore and records real view data.
    const recomputed = await recomputeScore(orgId, creatorId);
    expect(recomputed.ok, recomputed.ok ? undefined : recomputed.message).toBe(true);
    type ScoreRow = { factors: { consistency?: { detail?: string } } };
    const scoreRows = await admin.query<ScoreRow>(
      "select factors from scores where creator_id = $1 order by computed_at desc, id desc limit 1",
      [creatorId],
    );
    const detail = scoreRows.rows[0]?.factors.consistency?.detail;
    expect(detail).toBeDefined();
    expect(detail).toContain("view_consistency:");
    expect(detail).not.toContain("public views unavailable");
    expect(detail).toContain("of the last 12 views are in the");
  });
});
