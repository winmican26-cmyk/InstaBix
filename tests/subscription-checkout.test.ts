import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { canManage } from "@/lib/auth/roles";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getWorkspace: vi.fn(),
  stripe: vi.fn(),
  stripeCreate: vi.fn(),
  withOrg: vi.fn(),
  insertAudit: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
}));

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "cs_test_subscription_123";
const USER_EMAIL = "pro-owner@example.test";
const FAKE_STRIPE_KEY = "fake-stripe-key-do-not-log";
const CHECKOUT_URL = "https://checkout.example.test/cs/subscription";

type SessionOptions = {
  mode?: string;
  line_items?: Array<{
    quantity?: number;
    price_data?: {
      currency?: string;
      unit_amount?: number;
      product_data?: { name?: string; description?: string };
      recurring?: { interval?: string };
    };
  }>;
  customer_email?: string;
  client_reference_id?: string;
  metadata?: Record<string, string>;
  subscription_data?: { metadata?: Record<string, string> };
  success_url?: string;
  cancel_url?: string;
};

describe("POST /api/billing/checkout (Pro subscription)", () => {
  let POST: (request: Request) => Promise<Response>;
  let subscription:
    | {
        PRO_PRICE_CENTS: number;
        PRO_CURRENCY: string;
        PRO_PRODUCT_NAME: string;
        PRO_KIND: string;
      }
    | undefined;
  const routeSource = readFileSync(new URL("../src/app/api/billing/checkout/route.ts", import.meta.url), "utf8");

  beforeAll(async () => {
    vi.stubEnv("APP_URL", "https://billing.example.test/");
    vi.stubEnv("STRIPE_SECRET_KEY", FAKE_STRIPE_KEY);
    vi.doMock("@/lib/auth/session", () => ({ getWorkspace: mocks.getWorkspace, canManage }));
    vi.doMock("@/lib/logger", () => ({
      logger: { error: mocks.loggerError, info: mocks.loggerInfo, warn: mocks.loggerWarn, debug: vi.fn() },
      errorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
    }));
    vi.doMock("@/lib/stripe/client", () => ({ stripe: mocks.stripe }));
    vi.doMock("@/lib/db", () => ({ withOrg: mocks.withOrg }));
    vi.doMock("@/lib/audit", () => ({ insertAudit: mocks.insertAudit }));
    vi.resetModules();
    ({ POST } = await import("@/app/api/billing/checkout/route"));
    subscription = await import("@/lib/billing/subscription");
  });

  afterAll(() => {
    vi.doUnmock("@/lib/auth/session");
    vi.doUnmock("@/lib/logger");
    vi.doUnmock("@/lib/stripe/client");
    vi.doUnmock("@/lib/db");
    vi.doUnmock("@/lib/audit");
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getWorkspace.mockResolvedValue({
      user: { id: USER_ID, email: USER_EMAIL },
      org: { id: ORG_ID, name: "Billing org", slug: "billing-org" },
      role: "owner",
    });
    mocks.stripe.mockReturnValue({ checkout: { sessions: { create: mocks.stripeCreate } } });
    mocks.stripeCreate.mockResolvedValue({ id: SESSION_ID, url: CHECKOUT_URL });
    mocks.withOrg.mockImplementation(async (_orgId: string, fn: (tx: unknown) => Promise<unknown>) => fn({}));
    mocks.insertAudit.mockResolvedValue(undefined);
  });

  function checkoutRequest(origin = "https://billing.example.test"): Request {
    return new Request("https://billing.example.test/api/billing/checkout", {
      method: "POST",
      headers: { origin, host: "billing.example.test" },
    });
  }

  it("redirects to the Stripe URL with exact subscription options and one audit event", async () => {
    expect(subscription).toBeDefined();
    expect(subscription?.PRO_PRICE_CENTS).toBe(2900);
    expect(subscription?.PRO_CURRENCY).toBe("usd");
    expect(subscription?.PRO_PRODUCT_NAME).toBe("VistaBix Pro");
    expect(subscription?.PRO_KIND).toBe("vistabix_pro_subscription");

    const response = await POST(checkoutRequest());
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(CHECKOUT_URL);
    expect(mocks.stripeCreate).toHaveBeenCalledTimes(1);

    const options = mocks.stripeCreate.mock.calls[0]?.[0] as SessionOptions | undefined;
    expect(options).toBeDefined();
    if (!options) throw new Error("Stripe create options were not captured");
    expect(options).toEqual(
      expect.objectContaining({
        mode: "subscription",
        line_items: [
          expect.objectContaining({
            quantity: 1,
            price_data: expect.objectContaining({
              currency: "usd",
              unit_amount: 2900,
              product_data: expect.objectContaining({
                name: "VistaBix Pro",
                description: expect.stringMatching(/10 free weekly unlocks/i),
              }),
              recurring: expect.objectContaining({ interval: "month" }),
            }),
          }),
        ],
        customer_email: USER_EMAIL,
        client_reference_id: ORG_ID,
        metadata: { orgId: ORG_ID, userId: USER_ID, kind: "vistabix_pro_subscription" },
        subscription_data: { metadata: { orgId: ORG_ID, userId: USER_ID, kind: "vistabix_pro_subscription" } },
        success_url: "https://billing.example.test/creators?billing=success",
        cancel_url: "https://billing.example.test/creators?billing=cancelled",
      }),
    );
    expect(options.mode).toBe("subscription");
    expect(options.line_items?.[0]?.price_data?.currency).toBe("usd");
    expect(options.line_items?.[0]?.price_data?.unit_amount).toBe(2900);
    expect(options.line_items?.[0]?.price_data?.recurring?.interval).toBe("month");
    expect(options.line_items?.[0]?.quantity).toBe(1);
    expect(options.metadata).toEqual({ orgId: ORG_ID, userId: USER_ID, kind: "vistabix_pro_subscription" });

    expect(mocks.withOrg).toHaveBeenCalledWith(ORG_ID, expect.any(Function));
    expect(mocks.insertAudit).toHaveBeenCalledTimes(1);
    const auditInput = mocks.insertAudit.mock.calls[0]?.[1] as Record<string, unknown> | undefined;
    expect(auditInput).toEqual(
      expect.objectContaining({
        orgId: ORG_ID,
        actorUserId: USER_ID,
        action: "billing.checkout_created",
        entityId: SESSION_ID,
        metadata: expect.objectContaining({
          sessionId: SESSION_ID,
          amountCents: 2900,
          kind: "vistabix_pro_subscription",
        }),
      }),
    );
    const auditJson = JSON.stringify(auditInput);
    expect(auditJson).not.toContain(USER_EMAIL);
    expect(auditJson).not.toContain(FAKE_STRIPE_KEY);
    expect(mocks.loggerError).not.toHaveBeenCalled();
  });

  it("returns 401 without a workspace and never starts a session", async () => {
    mocks.getWorkspace.mockResolvedValue(null);
    const response = await POST(checkoutRequest());
    expect(response.status).toBe(401);
    expect(mocks.stripe).not.toHaveBeenCalled();
    expect(mocks.stripeCreate).not.toHaveBeenCalled();
    expect(mocks.insertAudit).not.toHaveBeenCalled();
  });

  it.each(["operator", "reviewer"] as const)("returns 403 for %s without starting a session", async (role) => {
    mocks.getWorkspace.mockResolvedValue({
      user: { id: USER_ID, email: USER_EMAIL },
      org: { id: ORG_ID, name: "Billing org", slug: "billing-org" },
      role,
    });
    const response = await POST(checkoutRequest());
    expect(response.status).toBe(403);
    expect(mocks.stripe).not.toHaveBeenCalled();
    expect(mocks.stripeCreate).not.toHaveBeenCalled();
    expect(mocks.insertAudit).not.toHaveBeenCalled();
  });

  it("returns 503 when Stripe is unconfigured and creates no session", async () => {
    mocks.stripe.mockReturnValue(null);
    const response = await POST(checkoutRequest());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Payments are not configured." });
    expect(mocks.stripeCreate).not.toHaveBeenCalled();
    expect(mocks.insertAudit).not.toHaveBeenCalled();
  });

  it("returns the same-origin 403 response before resolving a workspace", async () => {
    const response = await POST(checkoutRequest("https://evil.example.test"));
    expect(response.status).toBe(403);
    expect(mocks.getWorkspace).not.toHaveBeenCalled();
    expect(mocks.stripe).not.toHaveBeenCalled();
    expect(mocks.stripeCreate).not.toHaveBeenCalled();
  });

  it("returns a safe 502 when Stripe omits the checkout URL", async () => {
    mocks.stripeCreate.mockResolvedValue({ id: SESSION_ID, url: null });
    const response = await POST(checkoutRequest());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "Stripe did not return a checkout URL." });
    expect(mocks.stripeCreate).toHaveBeenCalledTimes(1);
    expect(mocks.insertAudit).not.toHaveBeenCalled();
  });

  it("returns 502 and logs when Stripe create fails", async () => {
    mocks.stripeCreate.mockRejectedValue(new Error("stripe down"));
    const response = await POST(checkoutRequest());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Subscription checkout could not be started. Nothing was charged.",
    });
    expect(mocks.loggerError).toHaveBeenCalledWith(
      "billing.checkout_failed",
      expect.objectContaining({ message: "stripe down" }),
    );
    expect(mocks.insertAudit).not.toHaveBeenCalled();
  });

  it("keeps creator-sale ledger code out of the subscription route", () => {
    expect(routeSource).not.toContain("saleLines");
    expect(routeSource).not.toContain("computeSplit");
    expect(routeSource).not.toContain("ledgerEntries");
    expect(routeSource).not.toMatch(/from\s+["']@\/app\/api\/checkout["']/);
  });
});
