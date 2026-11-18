import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Inbox, MailWarning, Pause, Send, ShieldCheck, ShieldOff, Users } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { getOutreach, listCreatorOptions } from "@/lib/db/queries";
import { setSequenceStatusAction } from "@/lib/actions/outreach";
import { resendConfigured } from "@/lib/env";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionButton } from "@/components/app/action-button";
import { KillSwitch } from "./kill-switch";
import { QueueComposer } from "./queue-composer";
import { DraftCard } from "./draft-card";
import { SequenceSteps } from "./sequence-steps";
import { MESSAGE_STATUS_LABEL } from "@/lib/constants";
import { timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Outreach" };
export const dynamic = "force-dynamic";

export default async function OutreachPage() {
  const { org } = await requireWorkspace();
  const [data, creators] = await Promise.all([getOutreach(org.id), listCreatorOptions(org.id)]);

  const settings = (org.settings ?? {}) as Record<string, unknown>;
  const paused = settings.outreachPaused === true;

  const sequences = data.sequences.map((sequence) => ({
    ...sequence,
    steps: data.steps.filter((step) => step.sequenceId === sequence.id),
  }));

  const consentedWithoutEmail = creators.filter((c) => c.consentStatus === "granted" && !c.contactEmail).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Human-approved outreach"
        title="Outreach"
        description="Drafts are free. Sending is not: every message needs a consent record, a suppression check and a human press."
        actions={
          <>
            <KillSwitch paused={paused} />
            <Badge tone={resendConfigured ? "lime" : "amber"}>
              {resendConfigured ? "Resend configured" : "Resend not configured"}
            </Badge>
          </>
        }
      />

      {!resendConfigured ? (
        <Alert tone="warning" title="Email delivery is not connected">
          Approval buttons will refuse to send until <span className="font-mono">RESEND_API_KEY</span> and{" "}
          <span className="font-mono">OUTREACH_FROM</span> are set. Drafts still work, and the server enforces the same gate.
        </Alert>
      ) : null}

      {paused ? (
        <Alert tone="danger" title="Sending is paused">
          The workspace kill switch is on. Queued drafts stay queued and approval is blocked in the server action too.
        </Alert>
      ) : null}

      {consentedWithoutEmail > 0 ? (
        <Alert tone="info" title={`${consentedWithoutEmail} consented creator${consentedWithoutEmail === 1 ? "" : "s"} without an email`}>
          Add a contact address on each creator record before they can be queued. InstaBix does not guess or harvest addresses.
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_1.25fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Queue a message</CardTitle>
              <CardDescription>Variables are rendered from stored fields. Unresolved placeholders stay visible.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <QueueComposer creators={creators} sequences={sequences} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Approval queue</CardTitle>
              <CardDescription>
                {data.pending.length === 0 ? "Nothing is waiting on a human." : `${data.pending.length} draft${data.pending.length === 1 ? "" : "s"} blocked at the gate.`}
              </CardDescription>
            </div>
            <Badge tone={data.pending.length ? "amber" : "lime"}>{data.pending.length} pending</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.pending.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="Queue is clear"
                description="Queued drafts appear here. Nothing leaves the workspace without an explicit approval, even when a sequence is active."
              />
            ) : (
              data.pending.map((row) => (
                <DraftCard
                  key={row.message.id}
                  messageId={row.message.id}
                  username={row.creatorUsername}
                  displayName={row.creatorName}
                  consent={row.consent}
                  toEmail={row.message.toEmail}
                  subject={row.message.subject}
                  body={row.message.body}
                  createdAt={new Date(row.message.createdAt).toISOString()}
                  paused={paused}
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Sequences</CardTitle>
            <CardDescription>
              Steps are stored drafts. Marking a sequence active does not bypass the approval gate.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {sequences.length === 0 ? (
            <EmptyState
              icon={Send}
              title="No sequences yet"
              description="Seed the database to create the three-step default, or add a sequence through the database migration. Empty is honest."
            />
          ) : (
            <div className="divide-y divide-line">
              {sequences.map((sequence) => (
                <div key={sequence.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <div>
                      <p className="text-[13px] font-semibold text-fg">{sequence.name}</p>
                      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-faint">
                        {sequence.steps.length} steps · cap {sequence.dailyCap}/day · window {sequence.windowStartHour}:00–
                        {sequence.windowEndHour}:00 local
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={sequence.status === "active" ? "lime" : sequence.status === "paused" ? "amber" : "neutral"}>
                        {sequence.status}
                      </Badge>
                      {sequence.status === "active" ? (
                        <ActionButton
                          action={setSequenceStatusAction.bind(null, sequence.id, "paused" as const)}
                          variant="secondary"
                          size="sm"
                        >
                          <Pause /> Pause
                        </ActionButton>
                      ) : (
                        <ActionButton
                          action={setSequenceStatusAction.bind(null, sequence.id, "active" as const)}
                          variant="secondary"
                          size="sm"
                        >
                          <ShieldCheck /> Mark active
                        </ActionButton>
                      )}
                    </div>
                  </div>
                  <SequenceSteps steps={sequence.steps} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Recent sends</CardTitle>
            <CardDescription>Provider state as returned by Resend. Bounces and complaints are never hidden.</CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/audit">
              Audit trail <Inbox />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {data.recent.length === 0 ? (
            <EmptyState
              icon={MailWarning}
              title="No message has been sent yet"
              description="Once a draft is approved, its provider id, timestamps and any failure land here."
            />
          ) : (
            <ul className="divide-y divide-line/70">
              {data.recent.map((row) => (
                <li key={row.message.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] text-fg">
                      @{row.creatorUsername} · {row.message.subject ?? "(no subject)"}
                    </span>
                    <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.08em] text-faint">
                      {row.message.toEmail ?? "no address"} · {row.message.providerId ?? "no provider id"}
                    </span>
                  </span>
                  <Badge
                    tone={
                      row.message.status === "replied"
                        ? "lime"
                        : row.message.status === "failed" || row.message.status === "bounced" || row.message.status === "complained"
                          ? "danger"
                          : "neutral"
                    }
                  >
                    {MESSAGE_STATUS_LABEL[row.message.status] ?? row.message.status}
                  </Badge>
                  <span className="font-mono text-[10.5px] text-faint">
                    {row.message.sentAt ? timeAgo(row.message.sentAt) : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Policy icon={ShieldCheck} title="Consent re-checked at send" body="The action re-reads the creator row. A revoked consent blocks the send." />
        <Policy icon={ShieldOff} title="Suppression wins" body="One unsubscribe blocks the address across every sequence in the workspace." />
        <Policy icon={Users} title="One press per message" body="There is no auto-send path in the product, regardless of sequence status." />
      </div>
    </div>
  );
}

function Policy({ icon: Icon, title, body }: { icon: typeof ShieldCheck; title: string; body: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-3.5">
      <p className="flex items-center gap-2 text-[12.5px] font-semibold text-fg">
        <Icon className="size-3.5 text-lime" strokeWidth={1.75} aria-hidden />
        {title}
      </p>
      <p className="mt-1.5 text-[11.5px] leading-5 text-muted">{body}</p>
    </div>
  );
}
