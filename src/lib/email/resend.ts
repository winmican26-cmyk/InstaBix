import "server-only";
import { createHmac } from "node:crypto";
import { env, resendConfigured } from "@/lib/env";

export type SendResult = { ok: true; id?: string } | { ok: false; error: string };

export async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
  orgId: string;
  replyTo?: string;
  idempotencyKey?: string;
}): Promise<SendResult> {
  if (!resendConfigured) {
    return {
      ok: false,
      error: "Email is not configured. Add RESEND_API_KEY, OUTREACH_FROM, EMAIL_FROM_DOMAIN and OUTREACH_PHYSICAL_ADDRESS.",
    };
  }

  // Sender/domain alignment must be exact: a mismatched domain breaks SPF/DKIM
  // alignment and is a compliance risk. Report domains only, never credentials.
  const fromDomain = env.OUTREACH_FROM?.match(/@([^\s>]+)/)?.[1]?.toLowerCase();
  const configuredDomain = env.EMAIL_FROM_DOMAIN?.trim().toLowerCase();
  if (!fromDomain || fromDomain !== configuredDomain) {
    return {
      ok: false,
      error: `OUTREACH_FROM domain (${fromDomain ?? "missing"}) must match EMAIL_FROM_DOMAIN (${configuredDomain ?? "missing"}).`,
    };
  }

  const unsubscribe = unsubscribeUrl(input.orgId, input.to);
  const address = env.OUTREACH_PHYSICAL_ADDRESS ?? "";
  const complianceLine =
    "You are receiving this because you applied to partner with VistaBix or published a business contact for partnership enquiries.";
  const textWithFooter = `${input.text.trimEnd()}\n\n—\n${complianceLine}\nUnsubscribe: ${unsubscribe}\n${address}`;

  const html = `<!doctype html><html><body style="margin:0;background:#f6f6f8;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#16161d">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <div style="background:#fff;border:1px solid #e6e6ee;border-radius:14px;padding:28px">
      ${input.text
        .split("\n")
        .map((line) => (line.trim() ? `<p style="margin:0 0 14px;font-size:15px;line-height:1.6">${escapeHtml(line)}</p>` : ""))
        .join("")}
    </div>
    <p style="margin:18px 4px 0;font-size:11px;line-height:1.6;color:#77778a">
      ${complianceLine}<br />
      Unsubscribe: <a href="${escapeHtml(unsubscribe)}" style="color:#55556a">${escapeHtml(unsubscribe)}</a><br />
      ${escapeHtml(address)}
    </p>
  </div></body></html>`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
        ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: env.OUTREACH_FROM,
        to: [input.to],
        subject: input.subject,
        text: textWithFooter,
        html,
        reply_to: input.replyTo ?? env.OUTREACH_REPLY_TO ?? undefined,
        headers: {
          "List-Unsubscribe": `<${unsubscribe}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const data = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!response.ok) return { ok: false, error: data.message ?? `Resend returned ${response.status}.` };
    return { ok: true, id: data.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Email delivery failed." };
  }
}

function signature(orgId: string, email: string): string {
  return createHmac("sha256", env.AUTH_SECRET).update(`${orgId}:${email.toLowerCase()}`).digest("base64url");
}

export function unsubscribeUrl(orgId: string, email: string): string {
  const payload = `${Buffer.from(orgId).toString("base64url")}.${Buffer.from(email.toLowerCase()).toString("base64url")}`;
  return `${env.APP_URL.replace(/\/$/, "")}/api/unsubscribe?token=${encodeURIComponent(`${payload}.${signature(orgId, email)}`)}`;
}

export function verifyUnsubscribeToken(token: string): { orgId: string; email: string } | null {
  const [orgB64, emailB64, sig] = token.split(".");
  if (!orgB64 || !emailB64 || !sig) return null;
  let orgId: string;
  let email: string;
  try {
    orgId = Buffer.from(orgB64, "base64url").toString("utf8");
    email = Buffer.from(emailB64, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expected = signature(orgId, email);
  if (expected.length !== sig.length) return null;
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (!a.equals(b)) return null;
  if (!/^[0-9a-f-]{36}$/i.test(orgId) || !email.includes("@")) return null;
  return { orgId, email };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}
