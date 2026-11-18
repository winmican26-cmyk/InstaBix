import "server-only";

import type {
  ApiResult,
  HealthResponse,
  ListResponse,
  Creator,
  OutreachMessage,
  Product,
  RevenueResponse,
  SettingsResponse,
  WhopStatus,
} from "./types";

const DEFAULT_API_URL = "http://localhost:8000";
const REQUEST_TIMEOUT_MS = 5000;

function apiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL).replace(/\/+$/, "");
}

/** Server-only GET. Failures are values, never thrown page errors. */
async function getJson<T>(path: string): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { Accept: "application/json" };

  // API_KEY is deliberately not prefixed with NEXT_PUBLIC_ and never leaves
  // the server. It is sent only when the backend is configured to require it.
  const apiKey = process.env.API_KEY;
  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }

  try {
    const response = await fetch(`${apiBaseUrl()}${path}`, {
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      return { ok: false, error: `Request to ${path} was rejected.` };
    }

    const payload: unknown = await response.json();
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      return { ok: false, error: `Unexpected response from ${path}.` };
    }

    return { ok: true, data: payload as T };
  } catch {
    return { ok: false, error: "Backend unreachable" };
  }
}

export const api = {
  health: () => getJson<HealthResponse>("/api/health"),
  scout: () => getJson<ListResponse<Creator>>("/api/scout"),
  outreach: () => getJson<ListResponse<OutreachMessage>>("/api/outreach"),
  products: () => getJson<ListResponse<Product>>("/api/products"),
  whop: () => getJson<WhopStatus>("/api/whop"),
  revenue: () => getJson<RevenueResponse>("/api/revenue"),
  settings: () => getJson<SettingsResponse>("/api/settings"),
};
