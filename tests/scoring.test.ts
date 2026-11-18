import { describe, expect, it } from "vitest";
import { scoreCreator, type ScoreMedia } from "@/lib/scoring";

function media(count: number, likes = 600, comments = 40, caption = "A useful post about routines"): ScoreMedia[] {
  return Array.from({ length: count }, (_, i) => ({
    likes,
    comments,
    caption: i === 0 ? caption : "A useful post about routines",
    postedAt: new Date(Date.now() - i * 86_400_000).toISOString(),
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
      media: media(10).map((m) => ({ ...m, caption: "Use code SAVE20 and shop now" })),
    });
    expect(clean.ok && sold.ok).toBe(true);
    if (clean.ok && sold.ok) expect(sold.total).toBeLessThan(clean.total);
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
