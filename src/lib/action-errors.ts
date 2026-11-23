import { errorMessage, logger } from "@/lib/logger";

/**
 * Only real connectivity/availability failures get the "database unavailable"
 * message. RLS denials, constraint violations, session/cookie bugs and plain
 * programming errors are logged with their code but never presented as an outage.
 */
export const DB_UNAVAILABLE_MESSAGE = "The database is unavailable. Please try again shortly.";

export const ACTION_FAILURE_MESSAGES = {
  signIn: "We couldn't sign you in. Please try again.",
  workspace: "We couldn't create your workspace. Please try again.",
  application: "We couldn't submit your application. Please try again.",
  request: "We couldn't complete your request. Please try again.",
} as const;

// Node/pg network failures and Postgres SQLSTATEs that mean "cannot reach or use the database".
const CONNECTION_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ECONNABORTED",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENETDOWN",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "EPIPE",
]);

const UNAVAILABLE_SQLSTATES = new Set([
  "08000", // connection_exception
  "08001", // sqlclient_unable_to_establish_sqlconnection
  "08003", // connection_does_not_exist
  "08004", // sqlserver_rejected_establishment_of_sqlconnection
  "08006", // connection_failure
  "08007", // transaction_resolution_unknown
  "57P01", // admin_shutdown
  "57P02", // crash_shutdown
  "57P03", // cannot_connect_now
  "53300", // too_many_connections
]);

const UNAVAILABLE_PATTERNS = [
  "connection refused",
  "connection terminated unexpectedly",
  "connection reset by peer",
  "connection timeout",
  "timeout acquiring a connection",
  "socket hang up",
  "could not connect to",
  "getaddrinfo enotfound",
  "too many clients already",
  "remaining connection slots are reserved",
  "the database system is starting up",
  "the database system is shutting down",
  "the database system is in recovery mode",
  "the database system is not accepting connections",
];

const MAX_CAUSE_DEPTH = 4;

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function matchesUnavailable(error: unknown): boolean {
  const code = errorCode(error)?.toUpperCase();
  if (code && (CONNECTION_CODES.has(code) || UNAVAILABLE_SQLSTATES.has(code))) return true;
  const message = errorMessage(error).toLowerCase();
  return UNAVAILABLE_PATTERNS.some((pattern) => message.includes(pattern));
}

/** Walks `cause` because pg/drizzle frequently wrap the underlying connection error. */
export function isDatabaseUnavailableError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth <= MAX_CAUSE_DEPTH; depth += 1) {
    if (matchesUnavailable(current)) return true;
    const cause: unknown = (current as { cause?: unknown }).cause;
    if (!cause || cause === current) break;
    current = cause;
  }
  return false;
}

export function logActionFailure(event: string, error: unknown): void {
  // Drizzle wraps the driver error, so the useful SQLSTATE often lives in `cause`.
  // Keep it server-side and bounded; the client never receives these details.
  const cause = error && typeof error === "object" ? (error as { cause?: unknown }).cause : undefined;
  const causeMessage = errorMessage(cause);
  logger.error(event, {
    message: errorMessage(error),
    name: error instanceof Error ? error.name : typeof error,
    code: errorCode(error) ?? null,
    causeCode: errorCode(cause) ?? null,
    causeMessage: causeMessage === "Unknown error" ? null : causeMessage.slice(0, 300),
    databaseUnavailable: isDatabaseUnavailableError(error),
  });
}

/**
 * Logs the real cause for operators and returns only a vetted message to the client.
 * Callers must pick an operation-specific fallback so non-outage failures stay honest.
 */
export function reportActionFailure(event: string, error: unknown, fallbackMessage: string): string {
  logActionFailure(event, error);
  return isDatabaseUnavailableError(error) ? DB_UNAVAILABLE_MESSAGE : fallbackMessage;
}
