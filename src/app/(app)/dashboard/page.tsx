import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CircleDollarSign,
  Clock3,
  Mail,
  Send,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";
import { Instagram } from "@/components/brand/instagram-glyph";
import { requireWorkspace } from "@/lib/auth/session";
import { getDashboard } from "@/lib/db/queries";
import { metaConfigured, resendConfigured, stripeConfigured, aiConfigured } from "@/lib/env";
import { PageHeader } from "@/components/ui/page-header";
import { Stat } from "@/components/ui/stat";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { Avatar } from "@/components/ui/avatar";
import { CREATOR_STATUS_LABEL } from "@/lib/constants";
import { formatCurrency, formatDateTime, formatNumber, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const ACTION_COPY: Record<string, string> = {
  "auth.login": "signed in",
  "auth.logout": "signed out",
  "auth.password_changed": "changed their password",
  "org.created": "created the workspace",
  "org.renamed": "renamed the workspace",
  "creator.created": "added a creator",
  "creator.enriched": "refreshed public metrics",
  "creator.enrich_failed": "attempted enrichment",
  "creator.scored": "recomputed a score",
  "creator.status_changed": "changed a creator status",
  "creator.consent_recorded": "recorded consent",
  "creator.portal_link_created": "created a portal link",
  "creator.suppressed": "suppressed a contact",
  "creator.deleted": "deleted a creator",
  "creator.email_updated": "updated a contact email",
  "creator.applied": "applied through the public form",
  "message.queued_for_approval": "queued an outreach draft",
  "message.sent": "approved and sent outreach",
  "message.send_failed": "had a send fail",
  "message.edited": "edited a draft",
  "message.canceled": "canceled a draft",
  "sequence.step_updated": "edited a sequence step",
  "sequence.status_changed": "changed a sequence status",
  "product.created": "opened a product",
  "product.outline_generated": "generated an outline",
  "product.outline_approved": "approved an outline",
  "product.submitted_for_review": "submitted a product for review",
  "product.published": "published a product",
  "instagram.synced": "synced Instagram",
  "instagram.disconnected": "disconnected Instagram",
  "outreach.paused": "paused outbound sending",
  "outreach.resumed": "resumed outbound sending",
  "email.test_sent": "sent a delivery check",
};

export default async function DashboardPage() {
  const { user, org } = await requireWorkspace();
  const data = await getDashboard(org.id);

  const settings = (org.settings ?? {}) as Record<string, unknown>;
  const paused = settings.outreachPaused === true;

  const instagram = data.integrations.find((i) => i.provider === "instagram");
  const instagramConnected = instagram?.status === "connected";

  const firstName = user.name.split(" ")[0] ?? user.name;
  const isEmpty = data.creators.total === 0;

  const pipeline: { label: string; count: number; tone: string }[] = [
    { label: CREATOR_STATUS_LABEL.new ?? "New", count: data.creators.review, tone: "bg-amber" },
    { label: "Qualified", count: data.creators.approved, tone: "bg-lime" },
    { label: "Partnered", count: data.creators.partnered, tone: "bg-violet" },
  ];

  const capability = [
    { key: "Instagram", configured: metaConfigured, connected: instagramConnected, href: "/integrations" },
    { key: "Email", configured: resendConfigured, connected: resendConfigured, href: "/integrations" },
    { key: "Payments", configured: stripeConfigured, connected: stripeConfigured, href: "/integrations" },
    { key: "AI studio", configured: aiConfigured, connected: aiConfigured, href: "/integrations" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operator console"
        title={`Good to see you, ${firstName}.`}
        description={`${org.name} · every figure below is read from this workspace's rows at ${formatDateTime(new Date())}.`}
        actions={
          <>
            <Button asChild variant="secondary" size="sm">
              <Link href="/integrations">
                <Instagram /> Integrations
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/creators?add=1">
                <UserPlus /> Add creator
              </Link>
            </Button>
          </>
        }
      />

      {!instagramConnected ? (
        <Alert tone="warning" title="Instagram is not connected in this workspace">
          <p>
            Creator metrics cannot be enriched until a professional account is authorised. Nothing here is simulated, so the
            creator charts stay empty on purpose.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="secondary">
              <Link href="/integrations">
                Open integrations <ArrowRight />
              </Link>
            </Button>
            {!metaConfigured ? <Badge tone="amber">META_APP_ID / META_APP_SECRET missing</Badge> : null}
          </div>
        </Alert>
      ) : null}

      {paused ? (
        <Alert tone="danger" title="Outbound sending is paused">
          The workspace kill switch is on. Approval buttons will refuse to send until an owner resumes sending in{" "}
          <Link href="/outreach" className="underline underline-offset-4">
            Outreach
          </Link>
          .
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Creators tracked"
          value={formatNumber(data.creators.total)}
          hint={`${data.creators.consented} with recorded consent`}
          icon={Users}
          tone="lime"
          provenance="creator_accounts"
        />
        <Stat
          label="Awaiting approval"
          value={formatNumber(data.messages.pending)}
          hint={data.messages.pending === 0 ? "Nothing waiting on a human" : "Drafts blocked at the human gate"}
          icon={Send}
          tone={data.messages.pending > 0 ? "amber" : "default"}
          provenance="messages · needs_approval"
        />
        <Stat
          label="Partnered creators"
          value={formatNumber(data.creators.partnered)}
          hint={`${data.creators.approved} approved and ready`}
          icon={ShieldCheck}
          tone="violet"
          provenance="creator_accounts · status"
        />
        <Stat
          label="Creator payable"
          value={formatCurrency(data.ledger.creatorPayable)}
          hint={`${data.ledger.entries} ledger entries · sums net of refunds`}
          icon={CircleDollarSign}
          tone="lime"
          provenance="ledger_entries"
        />
      </div>

      {isEmpty ? (
        <Card>
          <EmptyState
            icon={Sparkles}
            title="An empty workspace, exactly as promised"
            description="There is no sample data hiding behind this screen. Add a creator you already know, or share the public application link so someone can opt in."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild>
                  <Link href="/creators?add=1">
                    <UserPlus /> Add your first creator
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/apply" target="_blank">
                    Open the application page
                  </Link>
                </Button>
              </div>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Pipeline</CardTitle>
                <CardDescription>Counts come from creator status, not a cached summary table.</CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href="/creators">
                  All creators <ArrowRight />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {pipeline.map((row) => (
                <div key={row.label}>
                  <div className="mb-1.5 flex items-baseline justify-between">
                    <span className="text-[12.5px] font-medium text-fg">{row.label}</span>
                    <span className="font-mono text-[11px] text-faint">{formatNumber(row.count)}</span>
                  </div>
                  <Progress
                    value={data.creators.total ? (row.count / data.creators.total) * 100 : 0}
                    tone={row.tone === "bg-violet" ? "violet" : row.tone === "bg-amber" ? "amber" : "lime"}
                    label={`${row.label}: ${row.count} of ${data.creators.total}`}
                  />
                </div>
              ))}
              <div className="grid grid-cols-3 gap-3 border-t border-line pt-4">
                <div>
                  <p className="label">Messages sent</p>
                  <p className="mt-1 font-display text-lg font-semibold text-fg">{formatNumber(data.messages.sent)}</p>
                </div>
                <div>
                  <p className="label">Replies</p>
                  <p className="mt-1 font-display text-lg font-semibold text-fg">{formatNumber(data.messages.replied)}</p>
                </div>
                <div>
                  <p className="label">Products live</p>
                  <p className="mt-1 font-display text-lg font-semibold text-fg">{formatNumber(data.products.live)}</p>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <p className="text-[11.5px] text-faint">
                Reply counts include only classified inbound replies stored in <span className="font-mono">replies</span>.
              </p>
              <Button asChild variant="ghost" size="sm">
                <Link href="/outreach">Open outreach</Link>
              </Button>
            </CardFooter>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Integration health</CardTitle>
                  <CardDescription>Configured keys are not the same as a working connection.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {capability.map((row) => (
                  <div key={row.key} className="flex items-center justify-between rounded-md border border-line bg-surface-2/40 px-3 py-2">
                    <span className="text-[12.5px] text-fg">{row.key}</span>
                    {row.connected ? (
                      <Badge tone="lime">connected</Badge>
                    ) : row.configured ? (
                      <Badge tone="amber">keys present</Badge>
                    ) : (
                      <Badge tone="neutral">not configured</Badge>
                    )}
                  </div>
                ))}
                <div className="flex items-center justify-between rounded-md border border-line bg-surface-2/40 px-3 py-2">
                  <span className="text-[12.5px] text-fg">Last provider sync</span>
                  <span className="font-mono text-[11px] text-faint">{data.lastSync ? timeAgo(data.lastSync) : "never"}</span>
                </div>
              </CardContent>
              <CardFooter>
                <p className="text-[11px] text-faint">Freshness is shown on every metric that depends on it.</p>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/integrations">Manage</Link>
                </Button>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Next real action</CardTitle>
                  <CardDescription>One step that moves the workspace forward.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.messages.pending > 0 ? (
                  <NextStep
                    icon={Send}
                    title={`${data.messages.pending} draft${data.messages.pending === 1 ? "" : "s"} waiting`}
                    body="A human has to approve each message. Nothing sends on its own."
                    href="/outreach"
                    cta="Review queue"
                  />
                ) : data.creators.review > 0 ? (
                  <NextStep
                    icon={Users}
                    title={`${data.creators.review} creator${data.creators.review === 1 ? "" : "s"} to review`}
                    body="Qualify or decline, then record consent before any outreach is possible."
                    href="/creators?status=new"
                    cta="Open review"
                  />
                ) : data.products.inReview > 0 ? (
                  <NextStep
                    icon={BookOpen}
                    title={`${data.products.inReview} product${data.products.inReview === 1 ? "" : "s"} in review`}
                    body="A product cannot publish without creator sign-off."
                    href="/studio"
                    cta="Open studio"
                  />
                ) : (
                  <NextStep
                    icon={Mail}
                    title="Queue the next outreach"
                    body="Pick a consented creator and one sequence step. The draft lands in the approval queue."
                    href="/outreach"
                    cta="Queue a message"
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Written by the same transaction that performed the change.</CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/audit">
              Full audit log <ArrowRight />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {data.activity.length === 0 ? (
            <EmptyState
              icon={Clock3}
              title="No activity recorded yet"
              description="Audit events appear here the moment the first real mutation happens in this workspace."
            />
          ) : (
            <ul className="divide-y divide-line/70">
              {data.activity.map((event) => (
                <li key={event.id} className="flex items-start gap-3 px-5 py-3">
                  <Avatar name={event.actorName ?? "System"} size="sm" className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] leading-5 text-fg">
                      <span className="font-semibold">{event.actorName ?? "System"}</span>{" "}
                      {ACTION_COPY[event.action] ?? event.action}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.08em] text-faint">
                      {event.entityType}
                      {event.entityId ? ` · ${event.entityId.slice(0, 8)}` : ""}
                    </p>
                  </div>
                  <time className="shrink-0 font-mono text-[10.5px] text-faint" dateTime={new Date(event.createdAt).toISOString()}>
                    {timeAgo(event.createdAt)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function NextStep({
  icon: Icon,
  title,
  body,
  href,
  cta,
}: {
  icon: typeof Send;
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface-2/40 p-3.5">
      <p className="flex items-center gap-2 text-[13px] font-semibold text-fg">
        <Icon className="size-4 text-lime" strokeWidth={1.75} aria-hidden />
        {title}
      </p>
      <p className="mt-1.5 text-[12px] leading-5 text-muted">{body}</p>
      <Button asChild variant="secondary" size="sm" className="mt-3">
        <Link href={href}>
          {cta} <ArrowRight />
        </Link>
      </Button>
    </div>
  );
}
