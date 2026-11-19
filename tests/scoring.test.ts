import { describe, expect, it } from "vitest";
import {
  BIO_SIGNALS,
  POST_SIGNALS,
  SCORE_WEIGHTS,
  rankScoredCreators,
  scoreCreator,
  type ScoreMedia,
} from "@/lib/scoring";
import { SCORE_MODEL_VERSION } from "@/lib/constants";

// Literal spec values, deliberately independent of the implementation arrays.
const EXPECTED_BIO_SIGNALS = [
  "shop",
  "my course",
  "my ebook",
  "link to buy",
  "code [name]10",
  "ambassador",
  "discount code",
] as const;
const EXPECTED_POST_SIGNALS = ["#ad", "#sponsored", "link in bio to buy"] as const;

function media(
  count: number,
  likes = 600,
  comments = 40,
  caption = "A useful post about routines",
  views?: number | null,
): ScoreMedia[] {
  return Array.from({ length: count }, (_, i) => ({
    likes,
    comments,
    caption: i === 0 ? caption : "A useful post about routines",
    postedAt: new Date(Date.now() - i * 86_400_000).toISOString(),
    ...(views === undefined ? {} : { views }),
  }));
}

describe("scoreCreator", () => {
  it("refuses to score with fewer than 8 posts", () => {
    const result = scoreCreator({ followers: 10_000, media: media(7) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("insufficient_data");
  });

  it("produces a reproducible score from the same inputs", () => {
    const input = { followers: 10_000, media: media(10) };
    const a = scoreCreator(input);
    const b = scoreCreator(input);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.total).toBe(b.total);
      expect(a.inputsHash).toBe(b.inputsHash);
    }
  });

  it("weights sum to 1 and total stays within 0-100", () => {
    const result = scoreCreator({ followers: 10_000, media: media(12, 900, 90) });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const weightSum = Object.values(result.factors).reduce((s, f) => s + f.weight, 0);
      expect(weightSum).toBeCloseTo(1, 5);
      expect(result.total).toBeGreaterThanOrEqual(0);
      expect(result.total).toBeLessThanOrEqual(100);
    }
  });

  it("penalises captions that signal off-platform monetisation", () => {
    const clean = scoreCreator({ followers: 10_000, media: media(10) });
    const sold = scoreCreator({
      followers: 10_000,
      media: media(10, 600, 40, "#ad and link in bio to buy"),
    });
    expect(clean.ok && sold.ok).toBe(true);
    if (clean.ok && sold.ok) {
      expect(sold.unmonetizedScore).toBe(33);
      expect(sold.total).toBeLessThan(clean.total);
    }
  });

  it("rewards more consistent engagement", () => {
    const steady = scoreCreator({ followers: 10_000, media: media(10, 500, 50) });
    const spiky: ScoreMedia[] = media(10).map((m, i) => ({
      ...m,
      likes: i === 0 ? 9_000 : 80,
      comments: i === 0 ? 900 : 2,
    }));
    const volatile = scoreCreator({ followers: 10_000, media: spiky });
    expect(steady.ok && volatile.ok).toBe(true);
    if (steady.ok && volatile.ok) expect(steady.total).toBeGreaterThan(volatile.total);
  });
});

describe("exact Stage 1 monetization signals", () => {
  it("keeps the exact spec signal strings", () => {
    expect(BIO_SIGNALS).toEqual([...EXPECTED_BIO_SIGNALS]);
    expect(POST_SIGNALS).toEqual([...EXPECTED_POST_SIGNALS]);
  });

  it("matches every listed bio signal", () => {
    for (const signal of EXPECTED_BIO_SIGNALS) {
      const result = scoreCreator({ followers: 10_000, media: media(10), bio: `Hello ${signal} today` });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.unmonetizedScore).toBe(67);
    }
  });

  it("matches every listed post signal", () => {
    for (const signal of EXPECTED_POST_SIGNALS) {
      const result = scoreCreator({ followers: 10_000, media: media(10, 600, 40, signal) });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.unmonetizedScore).toBe(67);
    }
  });

  it("ignores legacy phrases that are not in the spec", () => {
    const result = scoreCreator({
      followers: 10_000,
      media: media(10, 600, 40, "#partner paid partnership use code SAVE20 shop now buy now"),
      bio: "affiliate / link in bio / swipe up",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.unmonetizedScore).toBe(100);
  });

  it("uses the 0/67/33/0 unmonetized scale", () => {
    const none = scoreCreator({ followers: 10_000, media: media(10) });
    const one = scoreCreator({ followers: 10_000, media: media(10), bio: "shop" });
    const two = scoreCreator({ followers: 10_000, media: media(10), bio: "shop my course" });
    const three = scoreCreator({ followers: 10_000, media: media(10), bio: "shop my course my ebook" });
    if (none.ok && one.ok && two.ok && three.ok) {
      expect([none.unmonetizedScore, one.unmonetizedScore, two.unmonetizedScore, three.unmonetizedScore]).toEqual([
        100, 67, 33, 0,
      ]);
    }
  });
});

describe("view consistency", () => {
  it("counts the last 12 views inside the 10k-100k range", () => {
    const steady = scoreCreator({ followers: 10_000, media: media(12, 300, 0, undefined, 50_000) });
    const outside = scoreCreator({ followers: 10_000, media: media(12, 300, 0, undefined, 500_000) });
    const half = scoreCreator({
      followers: 10_000,
      media: media(12, 300, 0).map((m, i) => (i < 6 ? { ...m, views: 50_000 } : { ...m, views: 500_000 })),
    });
    if (steady.ok && outside.ok && half.ok) {
      expect(steady.viewConsistency).toBe(1);
      expect(outside.viewConsistency).toBe(0);
      expect(half.viewConsistency).toBe(0.5);
      expect(steady.factors.consistency.detail).toContain("view_consistency");
      expect(steady.factors.consistency.detail).toContain("12/12");
    }
  });

  it("divides by 12 even when fewer views are available", () => {
    const result = scoreCreator({
      followers: 10_000,
      media: media(12, 300, 0).map((m, i) => (i < 8 ? { ...m, views: 50_000 } : m)),
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.viewConsistency).toBeCloseTo(8 / 12, 5);
  });
});

describe("shared normalization contract with the Python agent", () => {
  it("divides a percentage-like engagement_rate by 100 (5.5 -> 0.055)", () => {
    const result = scoreCreator({
      followers: 10_000,
      media: media(12, 300, 0, undefined, 50_000),
      engagementRate: 5.5,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.factors.engagement.normalized).toBeCloseTo(0.055, 10);
      // 0.055*0.4 + 1*0.3 + 1*0.3 = 0.622 -> 62.20
      expect(result.total).toBeCloseTo(62.2, 2);
    }
  });

  it("leaves an already-0..1 engagement_rate unchanged (0.055 -> 0.055)", () => {
    const result = scoreCreator({
      followers: 10_000,
      media: media(12, 300, 0, undefined, 50_000),
      engagementRate: 0.055,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.factors.engagement.normalized).toBeCloseTo(0.055, 10);
      expect(result.total).toBeCloseTo(62.2, 2);
    }
  });

  it("matches the Python cross-language parity fixture exactly (50.80)", () => {
    // Mirrors backend/tests/test_agent1.py: engagement 0.02, 8/12 views in
    // range, zero monetization signals. 0.02*0.4 + (8/12)*0.3 + 1.0*0.3 = 0.508.
    const result = scoreCreator({
      followers: 120_000,
      media: media(12, 600, 40).map((m, i) => ({ ...m, views: i < 8 ? 50_000 : 500_000 })),
      engagementRate: 0.02,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.factors.engagement.normalized).toBeCloseTo(0.02, 10);
      expect(result.viewConsistency).toBeCloseTo(8 / 12, 10);
      expect(result.unmonetizedScore).toBe(100);
      expect(result.total).toBeCloseTo(50.8, 2);
    }
  });

  it("has no 6% engagement cap", () => {
    const result = scoreCreator({ followers: 10_000, media: media(12, 300, 0, undefined, 50_000) });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // 0.03*0.4 + 1*0.3 + 1*0.3 = 0.612 -> 61.20, not 0.5*{...} = 80.
      expect(result.factors.engagement.normalized).toBeCloseTo(0.03, 10);
      expect(result.total).toBeCloseTo(61.2, 2);
    }
  });
});

describe("rankScoredCreators", () => {
  it("drops unscoreable inputs and sorts by total descending", () => {
    const low = { followers: 10_000, media: media(12, 100, 10, undefined, 50_000) };
    const high = { followers: 10_000, media: media(12, 900, 90, undefined, 50_000) };
    const invalid = { followers: 10_000, media: media(7) };
    const ranked = rankScoredCreators([low, invalid, high]);
    const highScore = scoreCreator(high);
    expect(ranked).toHaveLength(2);
    expect(ranked[0]?.total).toBeGreaterThan(ranked[1]?.total ?? 0);
    if (highScore.ok) expect(ranked[0]?.total).toBe(highScore.total);
  });
});

describe("locked Stage 1 model", () => {
  it("locks the 0.4 / 0.3 / 0.3 weights and version", () => {
    expect(SCORE_WEIGHTS).toEqual({ engagement: 0.4, consistency: 0.3, unmonetized: 0.3 });
    expect(SCORE_MODEL_VERSION).toBe("ibx-score-v2");
    const result = scoreCreator({ followers: 10_000, media: media(12, 300, 0, undefined, 50_000) });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.factors.engagement.weight).toBe(0.4);
      expect(result.factors.consistency.weight).toBe(0.3);
      expect(result.factors.unmonetized.weight).toBe(0.3);
      // 0.03*0.4 + 1*0.3 + 1*0.3 = 0.612 -> 61.20 (no 6% cap).
      expect(result.total).toBeCloseTo(61.2, 2);
      expect(result.modelVersion).toBe("ibx-score-v2");
      expect(result.factors.engagement.detail).toContain("engagement_rate");
      expect(result.factors.unmonetized.detail).toContain("unmonetized_score");
    }
  });
});
