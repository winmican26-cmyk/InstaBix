import { describe, expect, it } from "vitest";
import {
  countBuyerLanguage,
  demandStrength,
  rankDemandGaps,
  scoreDemandBps,
  type EvidenceCaption,
} from "@/lib/analysis/demand";

// Literal expectations, deliberately independent of the implementation.
describe("countBuyerLanguage", () => {
  it("counts a text once even when several request phrases match", () => {
    expect(countBuyerLanguage(["I wish this existed and I need it badly"])).toBe(1);
  });

  it("matches request phrases case-insensitively", () => {
    expect(countBuyerLanguage(["HOW DO I do this?", "please make a version", "Tell me how"])).toBe(3);
  });

  it("ignores texts with no request phrase", () => {
    expect(countBuyerLanguage(["Just browsing", "Looks nice", ""])).toBe(0);
  });

  it("counts distinct texts only once", () => {
    expect(countBuyerLanguage(["I want this", "I want this", "would love a fix"])).toBe(2);
  });

  it("works with plain evidence-caption data", () => {
    const captions: EvidenceCaption[] = [{ id: "c1", text: "I need this" }];
    expect(countBuyerLanguage(captions.map((caption) => caption.text))).toBe(1);
  });
});

describe("scoreDemandBps", () => {
  it("caps at 10000 when every signal is saturated", () => {
    expect(scoreDemandBps({ requestCount: 6, buyerLanguageHits: 3, existingProductMatches: 0 })).toBe(
      10000,
    );
    expect(scoreDemandBps({ requestCount: 99, buyerLanguageHits: 99, existingProductMatches: 0 })).toBe(
      10000,
    );
  });

  it("returns zero with no demand and existing competition", () => {
    expect(scoreDemandBps({ requestCount: 0, buyerLanguageHits: 0, existingProductMatches: 3 })).toBe(0);
    expect(scoreDemandBps({ requestCount: -5, buyerLanguageHits: -2, existingProductMatches: 9 })).toBe(0);
  });

  it("applies the documented 4000/3000/3000 weights for a mixed case", () => {
    // 3/6*4000 = 2000, 1/3*3000 = 1000, (1-1/3)*3000 = 2000 -> 5000.
    expect(scoreDemandBps({ requestCount: 3, buyerLanguageHits: 1, existingProductMatches: 1 })).toBe(
      5000,
    );
  });

  it("rounds only the final value", () => {
    // 1/6*4000 = 666.666..., 2/3*3000 = 2000, 0 matches => 3000 -> 5667.
    expect(scoreDemandBps({ requestCount: 1, buyerLanguageHits: 2, existingProductMatches: 0 })).toBe(
      5667,
    );
  });

  it("gives full competition credit only at zero in-workspace matches", () => {
    const base = { requestCount: 6, buyerLanguageHits: 3 };
    expect(scoreDemandBps({ ...base, existingProductMatches: 0 })).toBe(10000);
    expect(scoreDemandBps({ ...base, existingProductMatches: 1 })).toBe(9000);
    expect(scoreDemandBps({ ...base, existingProductMatches: 2 })).toBe(8000);
    expect(scoreDemandBps({ ...base, existingProductMatches: 3 })).toBe(7000);
    expect(scoreDemandBps({ ...base, existingProductMatches: 10 })).toBe(7000);
  });

  it("always returns an integer within 0..10000", () => {
    for (const requestCount of [-1, 0, 1, 6, 100]) {
      for (const buyerLanguageHits of [-1, 0, 3, 50]) {
        for (const existingProductMatches of [-1, 0, 3, 50]) {
          const score = scoreDemandBps({ requestCount, buyerLanguageHits, existingProductMatches });
          expect(Number.isInteger(score)).toBe(true);
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(10000);
        }
      }
    }
  });
});

describe("demandStrength", () => {
  it("marks fewer than three requests as weak", () => {
    expect(demandStrength(0)).toBe("weak");
    expect(demandStrength(2)).toBe("weak");
  });

  it("marks three or more requests as observed", () => {
    expect(demandStrength(3)).toBe("observed");
    expect(demandStrength(10)).toBe("observed");
  });
});

describe("rankDemandGaps", () => {
  const gaps = [
    { theme: "zeta", scoreBps: 5000, marker: "a" },
    { theme: "alpha", scoreBps: 5000, marker: "b" },
    { theme: "mid", scoreBps: 8000, marker: "c" },
    { theme: "beta", scoreBps: 5000, marker: "d" },
  ];

  it("sorts by score descending then theme ascending", () => {
    expect(rankDemandGaps(gaps, 10).map((gap) => gap.theme)).toEqual(["mid", "alpha", "beta", "zeta"]);
    expect(rankDemandGaps(gaps)[0]?.marker).toBe("c");
  });

  it("returns three by default and honors a custom limit", () => {
    expect(rankDemandGaps(gaps)).toHaveLength(3);
    expect(rankDemandGaps(gaps, 2).map((gap) => gap.theme)).toEqual(["mid", "alpha"]);
  });

  it("clamps the limit into 1..10", () => {
    expect(rankDemandGaps(gaps, 0)).toHaveLength(1);
    expect(rankDemandGaps(gaps, -5)).toHaveLength(1);
    expect(rankDemandGaps(gaps, 99)).toHaveLength(4);
  });

  it("does not mutate the input array", () => {
    const before = gaps.map((gap) => gap.theme);
    rankDemandGaps(gaps);
    expect(gaps.map((gap) => gap.theme)).toEqual(before);
  });
});
