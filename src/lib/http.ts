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

export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return request.headers.get("x-real-ip");
}

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}
