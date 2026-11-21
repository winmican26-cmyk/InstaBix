import { and, eq } from "drizzle-orm";
import { db, withOrg } from "@/lib/db";
import { creatorAccounts, orgs, suppressions } from "@/lib/db/schema";
import { insertAudit } from "@/lib/audit";
import { verifyUnsubscribeToken } from "@/lib/email/resend";
import { clientIp } from "@/lib/http";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

function page(input: { title: string; body: string; token?: string; confirm?: boolean; status?: number }) {
  const action = input.confirm && input.token
    ? `<form method="post" action="/api/unsubscribe?token=${encodeURIComponent(input.token)}">
         <button type="submit" style="background:#16161d;color:#fff;border:0;border-radius:8px;padding:12px 18px;font-size:14px;font-weight:600;cursor:pointer">
           Unsubscribe this address
         </button>
       </form>`
    : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${input.title} · VistaBix</title></head>
  <body style="margin:0;background:#f6f6f8;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#16161d">
    <main style="max-width:520px;margin:0 auto;padding:64px 20px">
      <div style="background:#fff;border:1px solid #e6e6ee;border-radius:14px;padding:28px">
        <p style="margin:0 0 6px;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#77778a">VistaBix · email preferences</p>
        <h1 style="margin:0 0 12px;font-size:22px;letter-spacing:-.02em">${input.title}</h1>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#55556a">${input.body}</p>
        ${action}
      </div>
    </main>
  </body></html>`;
  return new Response(html, {
    status: input.status ?? 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const parsed = verifyUnsubscribeToken(token);
  if (!parsed) {
    return page({
      title: "This link is not valid",
      body: "The unsubscribe link is malformed or has been altered. Reply to the email and a person will remove you manually.",
      status: 400,
    });
  }

  const [org] = await db.select({ name: orgs.name }).from(orgs).where(eq(orgs.id, parsed.orgId)).limit(1);
  return page({
    title: "Unsubscribe from outreach?",
    body: `This stops all partnership email from ${org?.name ?? "this workspace"} to ${parsed.email}. It takes effect immediately and is recorded.`,
    token,
    confirm: true,
  });
}

export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const parsed = verifyUnsubscribeToken(token);
  if (!parsed) {
    return page({
      title: "This link is not valid",
      body: "Nothing was changed. The unsubscribe link is malformed or has been altered.",
      status: 400,
    });
  }

  try {
    await withOrg(parsed.orgId, async (tx) => {
      await tx
        .insert(suppressions)
        .values({ orgId: parsed.orgId, email: parsed.email, reason: "unsubscribe_link" })
        .onConflictDoNothing({ target: [suppressions.orgId, suppressions.email] });

      await tx
        .update(creatorAccounts)
        .set({ status: "suppressed", updatedAt: new Date() })
        .where(and(eq(creatorAccounts.orgId, parsed.orgId), eq(creatorAccounts.contactEmail, parsed.email)));

      await insertAudit(tx, {
        orgId: parsed.orgId,
        actorUserId: null,
        action: "suppression.created",
        entityType: "suppression",
        entityId: parsed.email,
        metadata: { reason: "unsubscribe_link", channel: "email" },
        ip: clientIp(request),
      });
    });
  } catch (error) {
    logger.error("unsubscribe.failed", { message: error instanceof Error ? error.message : "unknown" });
    return page({
      title: "Something went wrong",
      body: "The request could not be stored. Please reply to the email and a person will remove you.",
      status: 500,
    });
  }

  logger.info("unsubscribe.recorded", { orgId: parsed.orgId });
  return page({
    title: "You are unsubscribed",
    body: `${parsed.email} will not receive partnership outreach from this workspace again. This is recorded in the audit log.`,
  });
}
