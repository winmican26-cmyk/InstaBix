import { insertAudit } from "@/lib/audit";
import { canManage, getWorkspace } from "@/lib/auth/session";
import { PRO_CURRENCY, PRO_KIND, PRO_PRICE_CENTS, PRO_PRODUCT_NAME } from "@/lib/billing/subscription";
import { withOrg } from "@/lib/db";
import { env } from "@/lib/env";
import { assertSameOrigin } from "@/lib/http";
import { errorMessage, logger } from "@/lib/logger";
import { stripe } from "@/lib/stripe/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }

  const workspace = await getWorkspace();
  if (!workspace) return Response.json({ error: "Unauthorized." }, { status: 401 });
  if (!canManage(workspace.role)) return Response.json({ error: "Forbidden." }, { status: 403 });

  const client = stripe();
  if (!client) return Response.json({ error: "Payments are not configured." }, { status: 503 });

  const orgId = workspace.org.id;
  const userId = workspace.user.id;
  const baseUrl = env.APP_URL.replace(/\/$/, "");
  const metadata = { orgId, userId, kind: PRO_KIND };

  try {
    const session = await client.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: PRO_CURRENCY,
            unit_amount: PRO_PRICE_CENTS,
            product_data: {
              name: PRO_PRODUCT_NAME,
              description: "Pro includes 10 free weekly unlocks and unlimited creator discovery.",
            },
            recurring: { interval: "month" },
          },
        },
      ],
      customer_email: workspace.user.email,
      client_reference_id: orgId,
      metadata,
      subscription_data: { metadata },
      success_url: `${baseUrl}/creators?billing=success`,
      cancel_url: `${baseUrl}/creators?billing=cancelled`,
    });

    if (!session.url) return Response.json({ error: "Stripe did not return a checkout URL." }, { status: 502 });

    await withOrg(orgId, (tx) =>
      insertAudit(tx, {
        orgId,
        actorUserId: userId,
        action: "billing.checkout_created",
        entityType: "subscription_checkout",
        entityId: session.id,
        metadata: {
          sessionId: session.id,
          amountCents: PRO_PRICE_CENTS,
          currency: PRO_CURRENCY,
          kind: PRO_KIND,
          provider: "stripe",
        },
        ip: null,
      }),
    );

    return Response.redirect(session.url, 303);
  } catch (error) {
    logger.error("billing.checkout_failed", { orgId, userId, message: errorMessage(error) });
    return Response.json({ error: "Subscription checkout could not be started. Nothing was charged." }, { status: 502 });
  }
}
