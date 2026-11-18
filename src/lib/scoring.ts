import { createHash } from "node:crypto";
import { clamp, coefficientOfVariation, median } from "@/lib/utils";
import { MIN_MEDIA_FOR_SCORE, SCORE_MODEL_VERSION } from "@/lib/constants";

export type ScoreMedia = {
  likes: number;
  comments: number;
  caption: string | null;
  postedAt: string | Date | null;
};

export type ScoreInput = {
  followers: number;
  media: ScoreMedia[];
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
 * Monetisation is inferred from captions only. That is a heuristic, not a fact, and the
 * UI must say so. We never claim to know whether a creator has a product off-platform.
 */
const MONETISATION_SIGNALS =
  /(#ad\b|#sponsored\b|#partner\b|paid partnership|link in bio|shop now|use code|discount code|my course|buy now|affiliate|swipe up)/i;

export const SCORE_WEIGHTS = { engagement: 0.4, consistency: 0.3, unmonetized: 0.3 } as const;

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

  const rates = usable.map((m) => (m.likes + m.comments) / input.followers);
  const medianRate = median(rates);
  const cv = coefficientOfVariation(rates);
  const flagged = usable.filter((m) => m.caption && MONETISATION_SIGNALS.test(m.caption)).length;
  const cleanShare = 1 - flagged / usable.length;

  const engagementNormalized = clamp(medianRate / 0.06);
  const consistencyNormalized = clamp(1 - cv);
  const unmonetizedNormalized = clamp(cleanShare / 0.85);

  const factors: ScoreSuccess["factors"] = {
    engagement: {
      value: medianRate,
      normalized: engagementNormalized,
      weight: SCORE_WEIGHTS.engagement,
      detail: `Median engagement of ${(medianRate * 100).toFixed(2)}% across ${usable.length} posts (6% or better scores full marks).`,
    },
    consistency: {
      value: 1 - cv,
      normalized: consistencyNormalized,
      weight: SCORE_WEIGHTS.consistency,
      detail: `Variation between posts is ${(cv * 100).toFixed(1)}%. Lower variation means more predictable reach.`,
    },
    unmonetized: {
      value: cleanShare,
      normalized: unmonetizedNormalized,
      weight: SCORE_WEIGHTS.unmonetized,
      detail: `${flagged} of ${usable.length} captions contain a monetisation signal (ad, shop, course, affiliate, link in bio). Caption heuristics only.`,
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
    total: Math.round(total * 10) / 10,
    sampleSize: usable.length,
    medianEngagement: medianRate,
    factors,
    inputsHash: hashScoreInputs(input, usable),
  };
}

export function hashScoreInputs(input: ScoreInput, media: ScoreMedia[] = input.media): string {
  const canonical = JSON.stringify({
    followers: input.followers,
    media: media.map((m) => ({
      likes: m.likes,
      comments: m.comments,
      caption: m.caption,
      postedAt: m.postedAt ? new Date(m.postedAt).toISOString() : null,
    })),
  });
  return createHash("sha256").update(canonical).digest("hex");
}
