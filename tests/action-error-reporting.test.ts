import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ACTION_FAILURE_MESSAGES,
  DB_UNAVAILABLE_MESSAGE,
  isDatabaseUnavailableError,
  logActionFailure,
  reportActionFailure,
} from "@/lib/action-errors";

afterEach(() => vi.restoreAllMocks());

function codedError(code: string, message: string): Error & { code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

describe("database unavailability classification", () => {
  it("classifies Node network failures", () => {
    for (const code of ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET", "EPIPE"]) {
      expect(isDatabaseUnavailableError(codedError(code, "connect failed"))).toBe(true);
    }
  });

  it("classifies Postgres availability SQLSTATEs", () => {
    for (const code of ["08000", "08001", "08003", "08004", "08006", "08007", "57P01", "57P02", "57P03", "53300"]) {
      expect(isDatabaseUnavailableError(codedError(code, "query failed"))).toBe(true);
    }
  });

  it("finds a wrapped connection error in the cause chain", () => {
    const root = codedError("ECONNREFUSED", "connect ECONNREFUSED 127.0.0.1:55432");
    expect(isDatabaseUnavailableError(new Error("query failed", { cause: root }))).toBe(true);
    expect(isDatabaseUnavailableError(new Error("outer", { cause: new Error("middle", { cause: root }) }))).toBe(true);
  });

  it("classifies pool-exhaustion and shutdown messages", () => {
    expect(isDatabaseUnavailableError(new Error("remaining connection slots are reserved"))).toBe(true);
    expect(isDatabaseUnavailableError(new Error("timeout acquiring a connection from the pool"))).toBe(true);
    expect(isDatabaseUnavailableError(new Error("the database system is starting up"))).toBe(true);
  });

  it("does not classify ordinary SQL or application errors as an outage", () => {
    expect(isDatabaseUnavailableError(codedError("42501", "permission denied for table creators"))).toBe(false);
    expect(isDatabaseUnavailableError(codedError("23505", "duplicate key value violates unique constraint"))).toBe(false);
    expect(isDatabaseUnavailableError(codedError("P0001", "RLS policy violation"))).toBe(false);
    expect(isDatabaseUnavailableError(new Error("Invalid organisation id."))).toBe(false);
    expect(isDatabaseUnavailableError(new Error("Session cookie is invalid"))).toBe(false);
    expect(isDatabaseUnavailableError(new Error("Your session has timed out"))).toBe(false);
    expect(isDatabaseUnavailableError(null)).toBe(false);
    expect(isDatabaseUnavailableError("boom")).toBe(false);
  });
});

describe("action failure reporting", () => {
  it("returns the outage message only for a real outage", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(reportActionFailure("auth.login.lookup_failed", codedError("ECONNREFUSED", "connect failed"), ACTION_FAILURE_MESSAGES.signIn)).toBe(DB_UNAVAILABLE_MESSAGE);
    expect(reportActionFailure("auth.login.lookup_failed", new Error("cookie secret is missing"), ACTION_FAILURE_MESSAGES.signIn)).toBe(ACTION_FAILURE_MESSAGES.signIn);
  });

  it("never returns raw error detail to the client", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const detail = "password=super-secret in connection detail";
    const result = reportActionFailure("auth.signup.lookup_failed", new Error(detail), ACTION_FAILURE_MESSAGES.workspace);
    expect(result).not.toContain(detail);
    expect(result).not.toContain("super-secret");
  });

  it("logs the code and classification for operators", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logActionFailure("creator.signup.failed", codedError("42501", "permission denied for table creators"));
    expect(spy).toHaveBeenCalledTimes(1);
    const firstCall = spy.mock.calls[0];
    if (!firstCall) return;
    const entry = JSON.parse(String(firstCall[0])) as Record<string, unknown>;
    expect(entry.level).toBe("error");
    expect(entry.event).toBe("creator.signup.failed");
    expect(entry.code).toBe("42501");
    expect(entry.databaseUnavailable).toBe(false);
    expect(entry.message).toContain("permission denied");
  });

  it("logs the wrapped driver error for operators without changing the client message", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const root = codedError("42P01", 'relation "rate_limits" does not exist');
    const wrapped = new Error("Failed query: insert into rate_limits", { cause: root });
    const clientMessage = reportActionFailure("auth.login.rate_limit_failed", wrapped, ACTION_FAILURE_MESSAGES.signIn);

    expect(clientMessage).toBe(ACTION_FAILURE_MESSAGES.signIn);
    const entry = JSON.parse(String(spy.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(entry.code).toBeNull();
    expect(entry.causeCode).toBe("42P01");
    expect(entry.causeMessage).toContain("rate_limits");
  });
});
