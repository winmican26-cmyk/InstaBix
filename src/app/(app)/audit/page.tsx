import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ScrollText, ShieldCheck } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { getAudit } from "@/lib/db/queries";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR, TableShell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { formatDateTime, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Audit log" };
export const dynamic = "force-dynamic";

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string }> }) {
  const { org } = await requireWorkspace();
  const params = await searchParams;
  const events = await getAudit(org.id, 200);
  const filtered = params.action ? events.filter((event) => event.action.startsWith(params.action!)) : events;
  const prefixes = [...new Set(events.map((event) => event.action.split(".")[0] ?? "other"))].sort();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="System"
        title="Audit log"
        description="Every mutation writes here inside the same transaction. The log is append-only from the application's perspective."
        meta={
          <Badge tone="lime">
            <ShieldCheck className="size-3" /> {events.length} events loaded
          </Badge>
        }
      />

      <nav aria-label="Filter audit actions" className="flex flex-wrap gap-1.5">
        <Link
          href="/audit"
          className={
            !params.action
              ? "rounded-full border border-lime/40 bg-lime/10 px-3 py-1 text-[12px] font-semibold text-lime"
              : "rounded-full border border-line bg-surface px-3 py-1 text-[12px] font-medium text-muted hover:text-fg"
          }
        >
          All
        </Link>
        {prefixes.map((prefix) => (
          <Link
            key={prefix}
            href={`/audit?action=${encodeURIComponent(prefix)}`}
            className={
              params.action === prefix
                ? "rounded-full border border-lime/40 bg-lime/10 px-3 py-1 text-[12px] font-semibold text-lime"
                : "rounded-full border border-line bg-surface px-3 py-1 text-[12px] font-medium text-muted hover:text-fg"
            }
          >
            {prefix}
          </Link>
        ))}
      </nav>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Events</CardTitle>
            <CardDescription>Newest first, capped at 200 per view so the page stays fast.</CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard">
              Dashboard <ArrowRight />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <EmptyState
              icon={ScrollText}
              title={events.length === 0 ? "No audit events yet" : "No event matches that filter"}
              description={
                events.length === 0
                  ? "The first real mutation in this workspace will appear here with its actor, IP and metadata."
                  : "Choose another prefix or clear the filter."
              }
            />
          ) : (
            <TableShell>
              <Table>
                <THead>
                  <TR>
                    <TH>When</TH>
                    <TH>Actor</TH>
                    <TH>Action</TH>
                    <TH>Entity</TH>
                    <TH>IP</TH>
                    <TH>Metadata</TH>
                  </TR>
                </THead>
                <TBody>
                  {filtered.map((event) => (
                    <TR key={event.id} className="align-top">
                      <TD className="whitespace-nowrap">
                        <span className="block font-mono text-[11px] text-fg">{timeAgo(event.createdAt)}</span>
                        <span className="block font-mono text-[10px] text-faint">{formatDateTime(event.createdAt)}</span>
                      </TD>
                      <TD>
                        <span className="flex items-center gap-2">
                          <Avatar name={event.actorName ?? "System"} size="sm" />
                          <span className="min-w-0">
                            <span className="block truncate text-[12px] text-fg">{event.actorName ?? "System"}</span>
                            <span className="block truncate text-[10.5px] text-faint">{event.actorEmail ?? "no actor"}</span>
                          </span>
                        </span>
                      </TD>
                      <TD>
                        <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-lime">{event.action}</code>
                      </TD>
                      <TD>
                        <span className="block text-[11.5px] capitalize text-muted">{event.entityType}</span>
                        {event.entityId ? (
                          <span className="block truncate font-mono text-[10px] text-faint">{event.entityId}</span>
                        ) : null}
                      </TD>
                      <TD className="font-mono text-[10.5px] text-faint">{event.ip ?? "—"}</TD>
                      <TD className="max-w-[280px]">
                        {Object.keys(event.metadata ?? {}).length === 0 ? (
                          <span className="text-[11px] text-faint">—</span>
                        ) : (
                          <details>
                            <summary className="cursor-pointer text-[11px] text-muted hover:text-fg">View</summary>
                            <pre className="mt-1 max-h-40 overflow-auto rounded bg-surface-2 p-2 font-mono text-[10px] leading-4 text-muted">
                              {JSON.stringify(event.metadata, null, 2)}
                            </pre>
                          </details>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableShell>
          )}
        </CardContent>
      </Card>

      <p className="text-[11px] leading-5 text-faint">
        Actor ids resolve through <span className="font-mono">users</span>. If a user is deleted, the audit row remains with a
        null actor and the metadata intact — history is not rewritten.
      </p>
    </div>
  );
}
