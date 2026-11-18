type Level = "debug" | "info" | "warn" | "error";

const REDACT = /(secret|password|token|authorization|api[_-]?key|cookie)/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[depth]";
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, REDACT.test(k) ? "[redacted]" : redact(v, depth + 1)]),
    );
  }
  return value;
}

function emit(level: Level, event: string, data?: Record<string, unknown>) {
  const payload = {
    level,
    event,
    ts: new Date().toISOString(),
    ...(data ? (redact(data) as Record<string, unknown>) : {}),
  };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (event: string, data?: Record<string, unknown>) => emit("debug", event, data),
  info: (event: string, data?: Record<string, unknown>) => emit("info", event, data),
  warn: (event: string, data?: Record<string, unknown>) => emit("warn", event, data),
  error: (event: string, data?: Record<string, unknown>) => emit("error", event, data),
};

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "Unknown error";
}
