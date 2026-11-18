import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  Brain,
  CheckCircle2,
  CreditCard,
  Mail,
  Plug,
  RefreshCw,
  ShieldOff,
  Unplug,
} from "lucide-react";
import { Instagram } from "@/components/brand/instagram-glyph";
import { requireWorkspace } from "@/lib/auth/session";
import { getIntegrations } from "@/lib/db/queries";
import { disconnectInstagramAction, sendTestEmailAction, syncInstagramAction } from "@/lib/actions/integrations";
import { aiConfigured, metaConfigured, metaDiscoveryConfigured, resendConfigured, stripeConfigured, env } from "@/lib/env";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/app/action-button";
import { KillSwitch } from "@/app/(app)/outreach/kill-switch";
import { timeAgo, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Integrations" };
export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const { org } = await requireWorkspace();
  const rows = await getIntegrations(org.id);
  const byProvider = new Map(rows.map((row) => [row.provider, row]));

  const instagram = byProvider.get("instagram");
  const connected = instagram?.status === "connected";
  const settings = (org.settings ?? {}) as Record<string, unknown>;
  const paused = settings.outreachPaused === true;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="System"
        title="Integrations"
        description="A key being present is not a working connection. Each provider shows the truth of its last call."
        actions={<KillSwitch paused={paused} />}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-lg border border-line bg-surface-2 text-lime">
                <Instagram className="size-4" strokeWidth={1.75} />
              </span>
              <div>
                <CardTitle>Instagram</CardTitle>
                <CardDescription>Instagram API with Instagram Login</CardDescription>
              </div>
            </div>
            <Badge tone={connected ? "lime" : instagram?.status === "error" ? "danger" : "neutral"}>
              {connected ? "connected" : instagram?.status ?? "disconnected"}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {!metaConfigured ? (
              <Alert tone="warning" title="App credentials missing">
                Add <span className="font-mono">META_APP_ID</span> and <span className="font-mono">META_APP_SECRET</span> to
                enable OAuth. Until then the connect button is intentionally absent.
              </Alert>
            ) : connected ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Account" value={instagram?.externalUsername ? `@${instagram.externalUsername}` : "—"} />
                  <Field label="Account id" value={instagram?.externalAccountId ?? "—"} mono />
                  <Field label="Last sync" value={instagram?.lastSyncAt ? timeAgo(instagram.lastSyncAt) : "never"} />
                  <Field
                    label="Token expires"
                    value={instagram?.tokenExpiresAt ? formatDateTime(instagram.tokenExpiresAt) : "not recorded"}
                  />
                </div>
                {instagram?.lastError ? (
                  <Alert tone="danger" title="Last provider error">
                    <span className="font-mono text-[11.5px]">{instagram.lastError}</span>
                  </Alert>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <ActionButton action={syncInstagramAction} variant="secondary" size="sm">
                    <RefreshCw /> Sync now
                  </ActionButton>
                  <ActionButton
                    action={disconnectInstagramAction}
                    variant="danger"
                    size="sm"
                    confirm="Disconnect Instagram? Stored tokens are deleted. Audit history is kept."
                  >
                    <Unplug /> Disconnect
                  </ActionButton>
                </div>
              </>
            ) : (
              <>
                <p className="text-[12.5px] leading-6 text-muted">
                  Authorise a professional account you control. InstaBix reads your own profile and media, and uses Business
                  Discovery only for public metrics of public professional accounts.
                </p>
                <Button asChild size="sm">
                  <Link href="/api/integrations/instagram/start">
                    <Instagram /> Connect Instagram
                  </Link>
                </Button>
              </>
            )}

            <div className="rounded-lg border border-line bg-surface-2/40 p-3 text-[11.5px] leading-5 text-faint">
              <p className="flex items-center gap-1.5 font-semibold text-muted">
                <ShieldOff className="size-3" aria-hidden /> Hard platform limits
              </p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4">
                <li>Comments, DMs and emails of other accounts are not available.</li>
                <li>Hashtag search is restricted; the product does not depend on it.</li>
                <li>Business Discovery requires a Facebook-Login token: {metaDiscoveryConfigured ? "configured" : "not configured"}.</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-lg border border-line bg-surface-2 text-violet">
                <Mail className="size-4" strokeWidth={1.75} />
              </span>
              <div>
                <CardTitle>Email · Resend</CardTitle>
                <CardDescription>Approved outreach with one-click unsubscribe</CardDescription>
              </div>
            </div>
            <Badge tone={resendConfigured ? "lime" : "neutral"}>{resendConfigured ? "configured" : "not configured"}</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="From" value={env.OUTREACH_FROM ?? "—"} mono />
              <Field label="Reply-to" value={env.OUTREACH_REPLY_TO ?? "—"} mono />
            </div>
            {resendConfigured ? (
              <ActionButton action={sendTestEmailAction} variant="secondary" size="sm">
                <Mail /> Send delivery check to my inbox
              </ActionButton>
            ) : (
              <p className="text-[12px] leading-5 text-muted">
                Add <span className="font-mono">RESEND_API_KEY</span> and <span className="font-mono">OUTREACH_FROM</span>. The
                sending domain must have SPF, DKIM and DMARC before real outreach.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-lg border border-line bg-surface-2 text-lime">
                <CreditCard className="size-4" strokeWidth={1.75} />
              </span>
              <div>
                <CardTitle>Payments · Stripe</CardTitle>
                <CardDescription>Checkout, refunds and webhook-driven ledger</CardDescription>
              </div>
            </div>
            <Badge tone={stripeConfigured ? "lime" : "neutral"}>{stripeConfigured ? "configured" : "not configured"}</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-[12.5px] leading-6 text-muted">
              Platform charges with an immutable split ledger. Creator payouts require Stripe Connect onboarding, which is
              intentionally deferred until the seller entity is confirmed.
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge tone={env.STRIPE_WEBHOOK_SECRET ? "lime" : "amber"}>
                webhook secret {env.STRIPE_WEBHOOK_SECRET ? "set" : "missing"}
              </Badge>
              <Badge tone="outline">mode: {env.STRIPE_SECRET_KEY?.startsWith("sk_live") ? "live" : "test or unset"}</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-lg border border-line bg-surface-2 text-violet">
                <Brain className="size-4" strokeWidth={1.75} />
              </span>
              <div>
                <CardTitle>AI · Anthropic</CardTitle>
                <CardDescription>Structured outlines, human-gated</CardDescription>
              </div>
            </div>
            <Badge tone={aiConfigured ? "lime" : "neutral"}>{aiConfigured ? "configured" : "not configured"}</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Model" value={env.AI_MODEL} mono />
              <Field label="Output contract" value="zod-validated JSON" />
            </div>
            <p className="text-[11.5px] leading-5 text-faint">
              Generation never publishes. It proposes an outline that a person must approve, and drafting remains gated by the
              creator review.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Integration records</CardTitle>
            <CardDescription>Stored rows, including disconnected and failed states.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <Plug className="mx-auto size-6 text-faint" strokeWidth={1.75} />
              <p className="mt-2 text-[12.5px] text-muted">No integration row exists yet. Connect a provider to create one.</p>
            </div>
          ) : (
            <ul className="divide-y divide-line/70">
              {rows.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-medium capitalize text-fg">{row.provider.replace(/_/g, " ")}</span>
                    <span className="block font-mono text-[10px] uppercase tracking-[0.08em] text-faint">
                      scopes: {row.scopes.length ? row.scopes.join(", ") : "none"} · updated {timeAgo(row.updatedAt)}
                    </span>
                  </span>
                  <Badge tone={row.status === "connected" ? "lime" : row.status === "error" ? "danger" : "neutral"}>{row.status}</Badge>
                  {row.lastError ? <span className="w-full truncate font-mono text-[10.5px] text-danger">{row.lastError}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
        <CardFooter>
          <p className="flex items-center gap-1.5 text-[11px] text-faint">
            <CheckCircle2 className="size-3" aria-hidden /> Token values are never rendered. They are encrypted at rest.
          </p>
          <Button asChild variant="ghost" size="sm">
            <Link href="/audit">
              Audit log <ArrowUpRight />
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2/40 p-3">
      <p className="label">{label}</p>
      <p className={mono ? "mt-1 truncate font-mono text-[12px] text-fg" : "mt-1 truncate text-[12.5px] text-fg"}>{value}</p>
    </div>
  );
}
