import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { canManage, canReview } from "@/lib/auth/roles";

// No database, Stripe or network access: every server dependency is mocked.
vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireWorkspace: vi.fn(),
  unlockCreator: vi.fn(),
  getQuotaState: vi.fn(),
  revalidatePath: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerDebug: vi.fn(),
  withOrg: vi.fn(),
  weekStartUtc: vi.fn((now: Date = new Date()) => {
    const daysSinceMonday = (now.getUTCDay() + 6) % 7;
    const monday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday),
    );
    return monday.toISOString().slice(0, 10);
  }),
}));

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const CREATOR_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_CREATOR_ID = "44444444-4444-4444-8444-444444444444";
const WEEK = "2026-01-05";

type Quota = {
  plan: string;
  status: string;
  pro: boolean;
  limit: number;
  used: number;
  remaining: number;
  weekStart: string;
};

const freeQuota: Quota = {
  plan: "free",
  status: "inactive",
  pro: false,
  limit: 10,
  used: 3,
  remaining: 7,
  weekStart: WEEK,
};

function quotaWith(overrides: Partial<Quota> = {}): Quota {
  return { ...freeQuota, ...overrides };
}

/** Drizzle SQL objects are nested; look for a bound value anywhere inside. */
function containsValue(node: unknown, target: string, seen = new Set<unknown>()): boolean {
  if (typeof node === "string") return node.includes(target);
  if (!node || typeof node !== "object" || seen.has(node)) return false;
  seen.add(node);
  return Object.values(node as Record<string, unknown>).some((value) => containsValue(value, target, seen));
}

afterAll(() => {
  vi.doUnmock("@/lib/auth/session");
  vi.doUnmock("@/lib/billing/quota");
  vi.doUnmock("@/lib/db");
  vi.doUnmock("next/cache");
  vi.doUnmock("@/lib/logger");
  vi.resetModules();
});

describe("unlockCreatorAction", () => {
  let unlockCreatorAction: (
    creatorId: string,
  ) => Promise<{ error?: string; success?: string; remaining?: number }>;

  beforeAll(async () => {
    vi.doMock("@/lib/auth/session", () => ({
      requireWorkspace: mocks.requireWorkspace,
      canReview,
      canManage,
    }));
    vi.doMock("@/lib/billing/quota", () => ({
      getQuotaState: mocks.getQuotaState,
      unlockCreator: mocks.unlockCreator,
      hasUnlocked: vi.fn(),
      weekStartUtc: mocks.weekStartUtc,
      FREE_WEEKLY_UNLOCKS: 10,
    }));
    vi.doMock("@/lib/db", () => ({ withOrg: mocks.withOrg }));
    vi.doMock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
    vi.doMock("@/lib/logger", () => ({
      logger: {
        debug: mocks.loggerDebug,
        info: mocks.loggerInfo,
        warn: mocks.loggerWarn,
        error: mocks.loggerError,
      },
      errorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
    }));
    vi.resetModules();
    ({ unlockCreatorAction } = await import("@/lib/actions/billing"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireWorkspace.mockResolvedValue({ user: { id: USER_ID }, org: { id: ORG_ID }, role: "owner" });
    mocks.unlockCreator.mockResolvedValue({ ok: true, used: 1, remaining: 9, weekStart: WEEK });
    mocks.getQuotaState.mockResolvedValue(quotaWith({ used: 10, remaining: 0 }));
  });

  it("fails closed when there is no workspace", async () => {
    mocks.requireWorkspace.mockResolvedValue(null);
    const result = await unlockCreatorAction(CREATOR_ID);
    expect(result.error).toMatch(/sign in/i);
    expect(mocks.unlockCreator).not.toHaveBeenCalled();
  });

  it("propagates a thrown authorization failure instead of unlocking", async () => {
    mocks.requireWorkspace.mockRejectedValue(new Error("Unauthorized"));
    await expect(unlockCreatorAction(CREATOR_ID)).rejects.toThrow("Unauthorized");
    expect(mocks.unlockCreator).not.toHaveBeenCalled();
  });

  it("denies operator and reviewer roles", async () => {
    for (const role of ["operator", "reviewer"] as const) {
      mocks.requireWorkspace.mockResolvedValue({ user: { id: USER_ID }, org: { id: ORG_ID }, role });
      const result = await unlockCreatorAction(CREATOR_ID);
      expect(result.error).toMatch(/permission/i);
    }
    expect(mocks.unlockCreator).not.toHaveBeenCalled();
  });

  it("rejects a non-UUID creator id before touching the quota", async () => {
    const result = await unlockCreatorAction("not-a-uuid");
    expect(result).toEqual({ error: "Unknown creator." });
    expect(mocks.unlockCreator).not.toHaveBeenCalled();
    expect(mocks.getQuotaState).not.toHaveBeenCalled();
  });

  it("uses server-derived ids and revalidates both pages on success", async () => {
    const result = await unlockCreatorAction(CREATOR_ID);
    expect(mocks.unlockCreator).toHaveBeenCalledWith(ORG_ID, USER_ID, CREATOR_ID);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/creators");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/creators/${CREATOR_ID}`);
    expect(result).toEqual({ success: "Creator unlocked.", remaining: 9 });
  });

  it("returns a paywall error with refreshed remaining when the cap is hit", async () => {
    mocks.unlockCreator.mockResolvedValue({
      ok: false,
      reason: "quota_exceeded",
      used: 11,
      limit: 10,
      weekStart: WEEK,
    });
    const result = await unlockCreatorAction(CREATOR_ID);
    expect(mocks.getQuotaState).toHaveBeenCalledWith(ORG_ID);
    expect(result.error).toContain("10 free weekly unlocks");
    expect(result.error).toContain("VistaBix Pro");
    expect(result.remaining).toBe(0);
    expect(JSON.stringify(result)).not.toContain("11");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("returns a safe message and logs when the write throws", async () => {
    mocks.unlockCreator.mockRejectedValue(new Error("db write exploded"));
    const result = await unlockCreatorAction(CREATOR_ID);
    expect(result).toEqual({ error: "The unlock could not be recorded. Nothing was charged." });
    expect(mocks.loggerError).toHaveBeenCalled();
  });
});

describe("billing action source boundaries", () => {
  const source = readFileSync(new URL("../src/lib/actions/billing.ts", import.meta.url), "utf8");

  it("is a server-only action with a single creatorId input", () => {
    expect(source.startsWith('"use server";')).toBe(true);
    expect(source).toContain("export async function unlockCreatorAction(");
    expect(source).toContain("creatorId: string");
    expect(source).toContain("requireWorkspace()");
    expect(source).toContain("canReview(role)");
    expect(source).toContain("unlockCreator(org.id, user.id, creatorId)");
  });

  it("never accepts org, user, plan or count from the client", () => {
    expect(source).not.toMatch(/unlockCreatorAction\([^)]*(org|user|plan|count)/i);
    expect(source).toContain("getQuotaState(org.id)");
  });
});

describe("reveal policy", () => {
  let canRevealCreator: (quota: Quota, unlocked: boolean) => boolean;
  let listUnlockedCreatorIds: (orgId: string, now?: Date) => Promise<Set<string>>;

  beforeAll(async () => {
    const access = await import("@/lib/billing/access");
    canRevealCreator = access.canRevealCreator;
    listUnlockedCreatorIds = access.listUnlockedCreatorIds;
  });

  it("reveals for Pro or for an existing unlock, but not for a free visitor", () => {
    expect(canRevealCreator(quotaWith({ pro: true }), false)).toBe(true);
    expect(canRevealCreator(quotaWith({ pro: false }), true)).toBe(true);
    expect(canRevealCreator(quotaWith({ pro: false, remaining: 7 }), false)).toBe(false);
  });

  it("lists only this org's unlocks for the UTC week", async () => {
    const rows = [{ creatorId: CREATOR_ID }, { creatorId: OTHER_CREATOR_ID }];
    let whereArg: unknown;
    mocks.withOrg.mockImplementation(async (_orgId: string, fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        select: () => ({
          from: () => ({
            where: (condition: unknown) => {
              whereArg = condition;
              return Promise.resolve(rows);
            },
          }),
        }),
      }),
    );

    const now = new Date("2026-01-07T12:00:00.000Z");
    const ids = await listUnlockedCreatorIds(ORG_ID, now);
    expect(ids).toEqual(new Set([CREATOR_ID, OTHER_CREATOR_ID]));
    expect(mocks.withOrg).toHaveBeenCalledWith(ORG_ID, expect.any(Function));
    expect(mocks.weekStartUtc).toHaveBeenCalledWith(now);
    expect(containsValue(whereArg, WEEK)).toBe(true);
  });
});

describe("creator teaser projection", () => {
  const source = readFileSync(new URL("../src/lib/creators/teaser.ts", import.meta.url), "utf8");

  it("selects exactly the seven preview columns", async () => {
    let selected: string[] = [];
    mocks.withOrg.mockImplementation(async (_orgId: string, fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        select: (fields: Record<string, unknown>) => {
          selected = Object.keys(fields);
          return {
            from: () => ({
              where: () => ({
                limit: async () => [
                  {
                    id: CREATOR_ID,
                    username: "teaser_handle",
                    displayName: "Teaser Name",
                    niche: "fitness",
                    source: "manual",
                    status: "new",
                    consentStatus: "pending",
                    createdAt: new Date("2026-01-01T00:00:00.000Z"),
                  },
                ],
              }),
            }),
          };
        },
      }),
    );
    vi.resetModules();
    const { getCreatorTeaser } = await import("@/lib/creators/teaser");
    const row = await getCreatorTeaser(ORG_ID, CREATOR_ID);

    expect(selected).toEqual([
      "id",
      "username",
      "displayName",
      "niche",
      "source",
      "status",
      "consentStatus",
      "createdAt",
    ]);
    expect(row?.username).toBe("teaser_handle");
    expect(mocks.withOrg).toHaveBeenCalledWith(ORG_ID, expect.any(Function));
  });

  it("has no access to restricted data in its source", () => {
    expect(source.startsWith('import "server-only";')).toBe(true);
    for (const forbidden of [
      "snapshot",
      "score",
      "media",
      "products",
      "messages",
      "agreements",
      "contactEmail",
      "contact_email",
      "notes",
      "profilePictureUrl",
      "discovery",
    ]) {
      expect(source.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});

describe("page source invariants", () => {
  const detail = readFileSync(new URL("../src/app/(app)/creators/[id]/page.tsx", import.meta.url), "utf8");
  const list = readFileSync(new URL("../src/app/(app)/creators/page.tsx", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../src/app/(app)/creators/unlock-panel.tsx", import.meta.url), "utf8");

  it("gates the detail query behind the reveal decision", () => {
    const gate = detail.indexOf("if (!revealed)");
    const fullRead = detail.indexOf("await getCreatorDetail(");
    expect(gate).toBeGreaterThan(-1);
    expect(fullRead).toBeGreaterThan(gate);
    expect(detail).toContain("canRevealCreator(quota, unlocked)");
    expect(detail).toContain("hasUnlocked(org.id, id)");
    expect(detail).toContain("getCreatorTeaser(org.id, id)");
    expect(detail.slice(gate, fullRead)).toContain("<UnlockPanel");
    expect(detail.slice(gate, fullRead)).toContain("notFound()");
  });

  it("keeps browsing free and derives row labels from unlocked ids", () => {
    expect(list).toContain("getQuotaState(org.id)");
    expect(list).toContain("listUnlockedCreatorIds(org.id)");
    expect(list).toContain("listCreators(org.id");
    expect(list).not.toContain("getCreatorDetail");
    expect(list).toContain('needsUnlock(creator.id) ? "Unlock" : "Open"');
  });

  it("renders the paywall without any secrets", () => {
    expect(panel).not.toContain('"use client"');
    expect(panel).toContain("$29 / month");
    expect(panel).toContain('action="/api/billing/checkout" method="post"');
    expect(panel).toContain("canManage");
    expect(panel).toContain("unlockCreatorAction.bind(null, creatorId)");
    expect(panel).toContain("{remaining}");
  });
});

describe("no secret or client-controlled quota leaks into the UI", () => {
  const files = [
    "../src/lib/actions/billing.ts",
    "../src/lib/billing/access.ts",
    "../src/lib/creators/teaser.ts",
    "../src/app/(app)/creators/unlock-panel.tsx",
    "../src/app/(app)/creators/page.tsx",
    "../src/app/(app)/creators/[id]/page.tsx",
  ];

  it("never reads or renders billing credentials", () => {
    for (const file of files) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      for (const secret of [
        "STRIPE_SECRET_KEY",
        "STRIPE_WEBHOOK_SECRET",
        "DATABASE_URL",
        "process.env",
      ]) {
        expect(source, `${file} must not contain ${secret}`).not.toContain(secret);
      }
    }
  });
});
