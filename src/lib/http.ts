import "server-only";

/**
 * Server actions already get an origin check from Next. Route handlers do not,
 * so every mutating handler calls this before touching data.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return; // Non-browser clients (webhooks) authenticate by signature instead.
  const host = request.headers.get("host");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new Response("Invalid origin", { status: 403 });
  }
  if (!host || originHost !== host) {
    throw new Response("Cross-origin request refused", { status: 403 });
  }
}

/**
 * Structural header type so both Next's ReadonlyHeaders and the Web Headers object
 * can be passed in. Netlify injects `x-nf-client-connection-ip` at the edge; the
 * usual forwarding headers are client-controlled and must never be trusted here.
 */
export function clientIpFromHeaders(headers: { get(name: string): string | null }): string | null {
  const ip = headers.get("x-nf-client-connection-ip");
  return ip?.trim() || null;
}

export function clientIp(request: Request): string | null {
  return clientIpFromHeaders(request.headers);
}

export function rateLimitResponse(retryAfterSeconds: number, message = "Too many requests.") {
  return Response.json({ error: message }, {
    status: 429,
    headers: { "Retry-After": String(Math.max(1, Math.ceil(retryAfterSeconds))) },
  });
}

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}
