import { createHash } from "node:crypto";
import { clamp, coefficientOfVariation, median } from "@/lib/utils";
import { MIN_MEDIA_FOR_SCORE, SCORE_MODEL_VERSION } from "@/lib/constants";

export type ScoreMedia = {
  likes: number;
  comments: number;
  caption: string | null;
  postedAt: string | Date | null;
  /** Public view count from an official source, when available. */
  views?: number | null;
};

export type ScoreInput = {
  followers: number;
  media: ScoreMedia[];
  /** Public bio from an official source, used for the exact BIO_SIGNALS check. */
  bio?: string | null;
  /**
   * Optional explicit factors, mirroring the Python agent. All are 0..1 except
   * `unmonetizedScore`, which is 0..100. When omitted they are derived from
   * media (engagement / views) and from the exact signals (unmonetized).
   */
  engagementRate?: number | null;
  viewConsistency?: number | null;
  unmonetizedScore?: number | null;
};

export type ScoreFactor = {
  value: number;
  normalized: number;
  weight: number;
  detail: string;
};

export type ScoreSuccess = {
  ok: true;
  modelVersion: string;
  total: number;
  sampleSize: number;
  medianEngagement: number;
  viewConsistency: number;
  unmonetizedScore: number;
  factors: Record<"engagement" | "consistency" | "unmonetized", ScoreFactor>;
  inputsHash: string;
};

export type ScoreFailure = {
  ok: false;
  reason: "insufficient_data";
  sampleSize: number;
  message: string;
};

export type ScoreResult = ScoreSuccess | ScoreFailure;

/**
 * Exact Stage 1 signals. Substring matching is case-insensitive; no other
 * phrases (for example "#partner" or "affiliate") count as a hit.
 */
export const BIO_SIGNALS = [
  "shop",
  "my course",
  "my ebook",
  "link to buy",
  "code [name]10",
  "ambassador",
  "discount code",
] as const;

export const POST_SIGNALS = ["#ad", "#sponsored", "link in bio to buy"] as const;

export const VIEW_WINDOW = 12;
export const VIEW_MIN = 10_000;
export const VIEW_MAX = 100_000;

/** Locked Stage 1 weights: engagement_rate*0.4 + view_consistency*0.3 + unmonetized_score*0.3. */
export const SCORE_WEIGHTS = { engagement: 0.4, consistency: 0.3, unmonetized: 0.3 } as const;

function countSignals(text: string | null | undefined, signals: readonly string[]): number {
  if (!text) return 0;
  const lowered = text.toLowerCase();
  return signals.reduce(
    (count, signal) => count + (lowered.includes(signal.toLowerCase()) ? 1 : 0),
    0,
  );
}

/**
 * Shared normalization contract (identical in backend/app/agents/agent1.py):
 * engagement_rate, view_consistency and unmonetized_score factors are 0..1.
 *
 * `engagementRate` accepts either a 0..1 ratio (0.055 stays 0.055) or a
 * percentage-like number > 1, which is divided by 100 (5.5 -> 0.055). It is
 * NEVER silently clamped to 1.0. Negatives clamp to 0 and there is no 6% cap.
 */
function normalizeEngagement(value: number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const rate = value > 1 ? value / 100 : value;
  return clamp(rate);
}

/** 0 hits -> 100 (fully unmonetized), 1 -> 67, 2 -> 33, 3+ -> 0. */
export function deriveUnmonetizedScore(hits: number): number {
  return Math.round(100 * (1 - Math.min(hits, 3) / 3));
}

export function scoreCreator(input: ScoreInput): ScoreResult {
  const usable = input.media
    .filter((m) => Number.isFinite(m.likes) && Number.isFinite(m.comments))
    .sort((a, b) => new Date(b.postedAt ?? 0).getTime() - new Date(a.postedAt ?? 0).getTime())
    .slice(0, 12);

  if (input.followers <= 0 || usable.length < MIN_MEDIA_FOR_SCORE) {
    return {
      ok: false,
      reason: "insufficient_data",
      sampleSize: usable.length,
      message: `A score needs at least ${MIN_MEDIA_FOR_SCORE} recent posts with public engagement and a known follower count.`,
    };
  }

  // engagement_rate: median (likes + comments) / followers, or an explicit
  // 0..1 / percentage-like override. No 6% cap.
  const rates = usable.map((m) => (m.likes + m.comments) / input.followers);
  const medianRate = median(rates);
  const cv = coefficientOfVariation(rates);
  const engagementNormalized =
    input.engagementRate !== undefined && input.engagementRate !== null
      ? normalizeEngagement(input.engagementRate)
      : clamp(medianRate);

  // view_consistency: count of the last 12 views in the 10k-100k range / 12.
  const viewWindow = usable.slice(-VIEW_WINDOW).map((m) =>
    typeof m.views === "number" && Number.isFinite(m.views) ? m.views : null,
  );
  const hasViewData = viewWindow.some((view) => view !== null);
  const viewsInRange = viewWindow.filter(
    (view): view is number => view !== null && view >= VIEW_MIN && view <= VIEW_MAX,
  ).length;
  const viewConsistency =
    input.viewConsistency !== undefined && input.viewConsistency !== null
      ? clamp(input.viewConsistency)
      : hasViewData
        ? viewsInRange / VIEW_WINDOW
        : 1 - cv;
  const consistencyNormalized = clamp(viewConsistency);

  // unmonetized_score: exact signals only, no broad monetisation regex.
  const signalHits =
    countSignals(input.bio, BIO_SIGNALS) +
    usable.reduce((total, m) => total + countSignals(m.caption, POST_SIGNALS), 0);
  const unmonetizedScore =
    input.unmonetizedScore !== undefined && input.unmonetizedScore !== null
      ? Math.round(clamp(input.unmonetizedScore / 100) * 100)
      : deriveUnmonetizedScore(signalHits);
  const unmonetizedNormalized = clamp(unmonetizedScore / 100);

  const factors: ScoreSuccess["factors"] = {
    engagement: {
      value: medianRate,
      normalized: engagementNormalized,
      weight: SCORE_WEIGHTS.engagement,
      detail: `engagement_rate: ${(engagementNormalized * 100).toFixed(2)}% factor (median (likes + comments) / followers across ${usable.length} posts, or an explicit 0..1 / percentage input; no cap).`,
    },
    consistency: {
      value: viewConsistency,
      normalized: consistencyNormalized,
      weight: SCORE_WEIGHTS.consistency,
      detail: hasViewData
        ? `view_consistency: ${viewsInRange}/${VIEW_WINDOW} of the last ${VIEW_WINDOW} views are in the ${VIEW_MIN.toLocaleString()}–${VIEW_MAX.toLocaleString()} range.`
        : `view_consistency: public views unavailable; engagement variation of ${(cv * 100).toFixed(1)}% used as a fallback.`,
    },
    unmonetized: {
      value: unmonetizedNormalized,
      normalized: unmonetizedNormalized,
      weight: SCORE_WEIGHTS.unmonetized,
      detail: `unmonetized_score: ${signalHits} exact signal hit(s) across the bio and the last ${usable.length} captions; 0 hits scores 100, 3+ scores 0. Caption heuristics only.`,
    },
  };

  const total =
    (engagementNormalized * SCORE_WEIGHTS.engagement +
      consistencyNormalized * SCORE_WEIGHTS.consistency +
      unmonetizedNormalized * SCORE_WEIGHTS.unmonetized) *
    100;

  return {
    ok: true,
    modelVersion: SCORE_MODEL_VERSION,
    total: Math.round(total * 100) / 100,
    sampleSize: usable.length,
    medianEngagement: medianRate,
    viewConsistency,
    unmonetizedScore,
    factors,
    inputsHash: hashScoreInputs(input, usable),
  };
}

/** Only scoreable creators, highest Stage 1 score first. */
export function rankScoredCreators(inputs: ScoreInput[]): ScoreSuccess[] {
  return inputs
    .map((input) => scoreCreator(input))
    .filter((result): result is ScoreSuccess => result.ok)
    .sort((a, b) => b.total - a.total);
}

export function hashScoreInputs(input: ScoreInput, media: ScoreMedia[] = input.media): string {
  const canonical = JSON.stringify({
    followers: input.followers,
    bio: input.bio ?? null,
    engagementRate: input.engagementRate ?? null,
    viewConsistency: input.viewConsistency ?? null,
    unmonetizedScore: input.unmonetizedScore ?? null,
    media: media.map((m) => ({
      likes: m.likes,
      comments: m.comments,
      caption: m.caption,
      postedAt: m.postedAt ? new Date(m.postedAt).toISOString() : null,
      views: m.views ?? null,
    })),
  });
  return createHash("sha256").update(canonical).digest("hex");
}
