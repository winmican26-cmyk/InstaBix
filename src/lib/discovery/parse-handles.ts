import { normalizeUsername } from "@/lib/utils";

/** Operator-facing cap. The orchestrator and the route both enforce it. */
export const DISCOVERY_BATCH_LIMIT = 50;

/**
 * Splits operator-supplied text into normalized handles. This module is pure:
 * it performs no I/O and never decides whether a Meta API call may be made.
 */
export function parseHandles(input: string | string[]): { handles: string[]; rejected: string[] } {
  const tokens = (Array.isArray(input) ? input : [input]).flatMap((value) => String(value).split(/[\s,;]+/));
  const handles: string[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    if (!token) continue;
    const cleaned = token
      .replace(/^https?:\/\/(?:www\.)?instagram\.com\//i, "")
      .replace(/[?#].*$/, "")
      .replace(/\/+$/, "");
    const handle = normalizeUsername(cleaned);
    if (!handle) {
      rejected.push(token);
      continue;
    }
    if (seen.has(handle)) continue;
    seen.add(handle);
    handles.push(handle);
  }

  return { handles, rejected };
}
