import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The route only touches three local helpers, so mocking them lets the real
 * POST handler run in Node without a Next request context or a database.
 */
const mocks = vi.hoisted(() => ({
  assertSameOrigin: vi.fn<(request: Request) => void>(),
  clearSessionCookie: vi.fn<() => Promise<void>>(),
  destroySession: vi.fn<() => Promise<void>>(),
  getSessionUser: vi.fn<() => Promise<null>>(),
  error: vi.fn(),
  info: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  clearSessionCookie: mocks.clearSessionCookie,
  destroySession: mocks.destroySession,
  getSessionUser: mocks.getSessionUser,
}));

vi.mock("@/lib/http", () => ({ assertSameOrigin: mocks.assertSameOrigin }));

vi.mock("@/lib/logger", () => ({
  errorMessage: (error: unknown) => String(error),
  logger: { error: mocks.error, info: mocks.info },
}));

const { POST } = await import("../src/app/api/auth/logout/route");
const routeSource = readFileSync(new URL("../src/app/api/auth/logout/route.ts", import.meta.url), "utf8");

function logoutRequest(): Request {
  return new Request("https://app.example.test/api/auth/logout?next=%2Fadmin", {
    method: "POST",
    headers: { origin: "https://app.example.test", host: "app.example.test" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.assertSameOrigin.mockImplementation(() => {});
  mocks.getSessionUser.mockResolvedValue(null);
  mocks.destroySession.mockResolvedValue(undefined);
  mocks.clearSessionCookie.mockResolvedValue(undefined);
});

describe("POST /api/auth/logout", () => {
  it("clears the session cookie and returns a 303 redirect to /login with no query string", async () => {
    const response = await POST(logoutRequest());

    expect(mocks.assertSameOrigin).toHaveBeenCalledOnce();
    expect(mocks.getSessionUser).toHaveBeenCalledOnce();
    expect(mocks.destroySession).toHaveBeenCalledOnce();
    expect(mocks.clearSessionCookie).toHaveBeenCalledOnce();
    expect(response.status).toBe(303);

    const location = response.headers.get("Location");
    expect(location).toBeTruthy();
    const resolved = new URL(String(location), "https://app.example.test/api/auth/logout");
    expect(resolved.origin).toBe("https://app.example.test");
    expect(resolved.pathname).toBe("/login");
    expect(resolved.search).toBe("");
    expect(String(location)).not.toContain("?");
  });

  it("does not return the old JSON success body", async () => {
    const response = await POST(logoutRequest());

    expect(response.headers.get("content-type")).toBeNull();
    expect(await response.text()).toBe("");
    expect(routeSource).not.toContain("Response.json({ ok: true })");
    expect(routeSource).toContain("status: 303");
    expect(routeSource).toContain('Location: "/login"');
  });

  it("returns the same-origin error Response unchanged and skips logout work", async () => {
    const denied = new Response("Cross-origin request refused", { status: 403 });
    mocks.assertSameOrigin.mockImplementation(() => {
      throw denied;
    });

    const response = await POST(logoutRequest());

    expect(response).toBe(denied);
    expect(mocks.getSessionUser).not.toHaveBeenCalled();
    expect(mocks.destroySession).not.toHaveBeenCalled();
    expect(mocks.clearSessionCookie).not.toHaveBeenCalled();
  });
});
