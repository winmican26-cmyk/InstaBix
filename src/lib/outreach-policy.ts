/**
 * Pure, server-safe policy helpers for Stage 1 outreach safety.
 *
 * These helpers perform no I/O: they either read plain settings objects or
 * compile a Drizzle condition from column definitions. The query condition is
 * kept here so the daily-cap filter can be regression tested without a DB.
 * All gates are fail-closed: unknown or partial settings never permit a send.
 */

import { and, eq, gte } from "drizzle-orm";
import { messages } from "@/lib/db/schema";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** True only when the workspace explicitly set the outbound kill switch. */
export function isOutreachPaused(settings: unknown): boolean {
  return asRecord(settings)?.outreachPaused === true;
}

/** Only an explicit domainWarmupComplete flag counts. A legacy email cap does not. */
export function isWarmupComplete(settings: unknown): boolean {
  return asRecord(settings)?.domainWarmupComplete === true;
}

/**
 * Warmup is deliberately time-independent and fail-closed. The `now` argument is
 * accepted so a future time-based policy can be introduced without changing the
 * call site, but it never relaxes the gate.
 */
export function warmupAllowsSend(settings: unknown, now: Date = new Date()): boolean {
  void now;
  return isWarmupComplete(settings);
}

/** Fixed Stage 1 ceiling: 50 outbound emails per domain per UTC day. */
export function sendCapForDomain(): number {
  return 50;
}

/** The cap decision, kept separate so its boundaries can be tested directly. */
export function dailyCapReached(sentCount: number): boolean {
  return sentCount >= sendCapForDomain();
}

/** Start of the UTC calendar day that `now` falls in. */
export function startOfUtcDay(now: Date = new Date()): Date {
  return new Date(`${utcDayKey(now)}T00:00:00.000Z`);
}

/**
 * Compiles the daily-cap filter used by approveAndSendAction.
 *
 * Stage 1 sends from a single verified domain, so the ceiling applies to every
 * message this org sent today. `toEmail` is the recipient column and must never
 * appear here: filtering on it would count mail to ourselves, not our volume.
 */
export function dailyCapCondition(orgId: string, since: Date) {
  return and(
    eq(messages.orgId, orgId),
    eq(messages.status, "sent"),
    gte(messages.sentAt, since),
  )!;
}

/** Extracts a lowercased domain from a recipient or sender email address. */
export function domainFromEmail(email: string): string | null {
  if (typeof email !== "string") return null;
  const value = email.trim();
  const at = value.indexOf("@");
  if (at <= 0 || at !== value.lastIndexOf("@") || at === value.length - 1) return null;
  if (/\s/.test(value)) return null;
  return value.slice(at + 1).toLowerCase();
}

/** UTC calendar day key used for the daily send cap. */
export function utcDayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
