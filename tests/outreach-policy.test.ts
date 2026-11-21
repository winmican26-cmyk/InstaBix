import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  dailyCapCondition,
  dailyCapReached,
  domainFromEmail,
  isOutreachPaused,
  isWarmupComplete,
  sendCapForDomain,
  startOfUtcDay,
  utcDayKey,
  warmupAllowsSend,
} from "@/lib/outreach-policy";

describe("isOutreachPaused", () => {
  it("is true only for an explicit boolean true", () => {
    expect(isOutreachPaused({ outreachPaused: true })).toBe(true);
  });

  it("is false for false, missing values and non-objects", () => {
    expect(isOutreachPaused({ outreachPaused: false })).toBe(false);
    expect(isOutreachPaused({})).toBe(false);
    expect(isOutreachPaused({ outreachPaused: "true" })).toBe(false);
    expect(isOutreachPaused(null)).toBe(false);
    expect(isOutreachPaused(undefined)).toBe(false);
    expect(isOutreachPaused([])).toBe(false);
  });
});

describe("warmup gates", () => {
  it("treats only domainWarmupComplete=true as complete", () => {
    expect(isWarmupComplete({ domainWarmupComplete: true })).toBe(true);
  });

  it("does not mistake the legacy email cap for completion", () => {
    expect(isWarmupComplete({ domainWarmupEmailCap: 50 })).toBe(false);
    expect(isWarmupComplete({ domainWarmupComplete: false, domainWarmupEmailCap: 50 })).toBe(false);
  });

  it("is false for missing values and non-objects", () => {
    expect(isWarmupComplete({})).toBe(false);
    expect(isWarmupComplete(null)).toBe(false);
  });

  it("allows a send only after warmup, and fails closed for every other case", () => {
    const now = new Date("2026-11-19T12:00:00.000Z");
    expect(warmupAllowsSend({ domainWarmupComplete: true }, now)).toBe(true);
    expect(warmupAllowsSend({ domainWarmupComplete: false }, now)).toBe(false);
    expect(warmupAllowsSend({ domainWarmupEmailCap: 50 }, now)).toBe(false);
    expect(warmupAllowsSend(undefined, now)).toBe(false);
  });
});

describe("dailyCapReached", () => {
  it("returns the fixed 50 per day ceiling", () => {
    expect(sendCapForDomain()).toBe(50);
  });

  it("blocks at 50 and above, but not at 49", () => {
    expect(dailyCapReached(0)).toBe(false);
    expect(dailyCapReached(49)).toBe(false);
    expect(dailyCapReached(50)).toBe(true);
    expect(dailyCapReached(51)).toBe(true);
  });
});

describe("dailyCapCondition", () => {
  it("counts sent mail for the org since the UTC day start, never by recipient", () => {
    const since = new Date("2026-11-19T00:00:00.000Z");
    const compiled = new PgDialect().sqlToQuery(dailyCapCondition("org-123", since));

    expect(compiled.sql).toContain('"messages"."org_id"');
    expect(compiled.sql).toContain('"messages"."status"');
    expect(compiled.sql).toContain('"messages"."sent_at"');
    expect(compiled.sql).toContain(">=");
    // toEmail is the recipient column; filtering on it made the cap a no-op.
    expect(compiled.sql).not.toContain("to_email");
    expect(compiled.sql).not.toContain("from_email");

    expect(compiled.params).toContain("org-123");
    expect(compiled.params).toContain("sent");
    expect(compiled.params).toContain(since.toISOString());
  });
});

describe("domainFromEmail", () => {
  it("lowercases the domain of a recipient or sender address", () => {
    expect(domainFromEmail("Creator@Example.COM")).toBe("example.com");
    expect(domainFromEmail("mail@sub.vistabix.co.uk")).toBe("sub.vistabix.co.uk");
  });

  it("returns null for malformed addresses", () => {
    expect(domainFromEmail("no-at-sign")).toBeNull();
    expect(domainFromEmail("@example.com")).toBeNull();
    expect(domainFromEmail("creator@")).toBeNull();
    expect(domainFromEmail("a@b@example.com")).toBeNull();
    expect(domainFromEmail("creator @example.com")).toBeNull();
  });
});

describe("UTC day helpers", () => {
  it("formats the UTC calendar day as YYYY-MM-DD", () => {
    expect(utcDayKey(new Date("2026-11-19T23:59:59.000Z"))).toBe("2026-11-19");
    expect(utcDayKey(new Date("2026-11-20T00:00:00.000Z"))).toBe("2026-11-20");
  });

  it("resolves the UTC day start used by the cap query", () => {
    expect(startOfUtcDay(new Date("2026-11-19T23:59:59.000Z")).toISOString()).toBe("2026-11-19T00:00:00.000Z");
  });
});
