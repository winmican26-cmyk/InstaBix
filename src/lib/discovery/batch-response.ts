export type BatchStatus = "pending" | "enriched" | "not_found" | "not_eligible" | "rate_limited" | "error";

export type BatchItem = {
  handle: string;
  status: BatchStatus;
  creatorId?: string;
  message?: string;
  retryAfterSeconds?: number;
};

export type BatchResponse = {
  items: BatchItem[];
  rejected: string[];
  rateLimit?: { seconds: number; message: string };
  error?: string;
};

/** The route wraps a normal batch result inside a 429 error body. */
export type RateLimitedBatchResponse = { error: string; results: BatchResponse };

const FALLBACK_ERROR = "Import failed. Try again.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(value: unknown): string | null {
  return isRecord(value) && typeof value.error === "string" && value.error.trim() ? value.error : null;
}

function asBatchResponse(value: unknown): BatchResponse | null {
  if (!isRecord(value) || !Array.isArray(value.items)) return null;

  const result: BatchResponse = {
    items: value.items as BatchItem[],
    rejected: Array.isArray(value.rejected)
      ? value.rejected.filter((token): token is string => typeof token === "string")
      : [],
  };
  const innerError = errorMessage(value);
  if (innerError) result.error = innerError;
  if (isRecord(value.rateLimit) && typeof value.rateLimit.seconds === "number" && typeof value.rateLimit.message === "string") {
    result.rateLimit = { seconds: value.rateLimit.seconds, message: value.rateLimit.message };
  }
  return result;
}

/**
 * Accepts both the flat 200 body and the nested 429 body, so callers can always
 * show per-handle statuses even when the request was rate limited.
 */
export function normalizeBatchPayload(
  payload: unknown,
  ok: boolean,
): { error: string | null; result: BatchResponse | null } {
  if (!isRecord(payload)) return { error: FALLBACK_ERROR, result: null };

  const nested = isRecord(payload.results) ? asBatchResponse(payload.results) : null;
  if (nested) {
    return { error: errorMessage(payload) ?? nested.error ?? (ok ? null : FALLBACK_ERROR), result: nested };
  }

  const direct = asBatchResponse(payload);
  if (direct) {
    return { error: ok ? null : (direct.error ?? FALLBACK_ERROR), result: direct };
  }

  return { error: ok ? FALLBACK_ERROR : (errorMessage(payload) ?? FALLBACK_ERROR), result: null };
}
