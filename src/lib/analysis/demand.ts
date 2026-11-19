/**
 * Pure, deterministic helpers for demand-gap analysis. No server-only imports,
 * no database, no SDK calls. Literal expectations live in the tests.
 */

export type EvidenceCaption = { id: string; text: string };

/** Fixed case-insensitive request phrases. Each matching text counts at most once. */
const REQUEST_PHRASES = [
  "i wish",
  "i need",
  "how do i",
  "i want",
  "please make",
  "would love",
  "tell me how",
] as const;

/** Count distinct texts that contain at least one request phrase. */
export function countBuyerLanguage(texts: string[]): number {
  let count = 0;
  for (const text of new Set(texts)) {
    const lowered = text.toLowerCase();
    if (REQUEST_PHRASES.some((phrase) => lowered.includes(phrase))) {
      count += 1;
    }
  }
  return count;
}

function clampNonNegative(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

/**
 * Weighted demand score in basis points (0..10000):
 * 4000 * min(requestCount,6)/6 + 3000 * min(hits,3)/3
 * + 3000 * (0 matches => 1, else max(0, 1 - matches/3)).
 * Inputs are clamped to >= 0 and rounding happens only once, at the end.
 */
export function scoreDemandBps(input: {
  requestCount: number;
  buyerLanguageHits: number;
  existingProductMatches: number;
}): number {
  const requestCount = clampNonNegative(input.requestCount);
  const buyerLanguageHits = clampNonNegative(input.buyerLanguageHits);
  const existingProductMatches = clampNonNegative(input.existingProductMatches);

  const requestNorm = Math.min(requestCount, 6) / 6;
  const languageNorm = Math.min(buyerLanguageHits, 3) / 3;
  const competitionNorm =
    existingProductMatches === 0 ? 1 : Math.max(0, 1 - existingProductMatches / 3);

  const raw = 4000 * requestNorm + 3000 * languageNorm + 3000 * competitionNorm;
  return Math.min(10000, Math.max(0, Math.round(raw)));
}

/** Fewer than three observed requests is weak evidence. */
export function demandStrength(requestCount: number): "weak" | "observed" {
  return requestCount < 3 ? "weak" : "observed";
}

function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Deterministic ordering: score descending, then theme ascending. */
export function rankDemandGaps<T extends { scoreBps: number; theme: string }>(
  gaps: T[],
  limit = 3,
): T[] {
  const requested = Number.isFinite(limit) ? Math.floor(limit) : 3;
  const safeLimit = Math.min(10, Math.max(1, requested));
  return [...gaps]
    .sort((a, b) => b.scoreBps - a.scoreBps || compareStrings(a.theme, b.theme))
    .slice(0, safeLimit);
}
