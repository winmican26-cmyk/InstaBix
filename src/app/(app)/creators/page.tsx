import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Download, RefreshCw, Search, Users } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { listCreators } from "@/lib/db/queries";
import { parseCreatorListParams } from "@/lib/creators/list-params";
import { enrichCreatorAction } from "@/lib/actions/creators";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR, TableShell } from "@/components/ui/table";
import { Avatar } from "@/components/ui/avatar";
import { ActionButton } from "@/components/app/action-button";
import { AddCreatorDialog } from "./add-creator-dialog";
import { BatchImportDialog } from "./batch-import-dialog";
import { CREATOR_STATUS_LABEL, SOURCE_LABEL, CONSENT_LABEL } from "@/lib/constants";
import { formatNumber, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Creators" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "lime" | "violet" | "amber" | "danger" | "neutral" | "info"> = {
  new: "neutral",
  reviewing: "amber",
  qualified: "info",
  approved: "lime",
  contacted: "violet",
  negotiating: "amber",
  partnered: "lime",
  declined: "neutral",
  suppressed: "danger",
};

export default async function CreatorsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; source?: string; add?: string; sort?: string; dir?: string; page?: string; min?: string; max?: string }>;
}) {
  const { org } = await requireWorkspace();
  const params = await searchParams;
  const parsed = parseCreatorListParams(params);
  const error = parsed.ok ? null : parsed.error;
  const listParams = parsed.ok ? parsed.params : null;
  const result = parsed.ok ? await listCreators(org.id, parsed.params) : null;
  const creators = result?.rows ?? [];
  const page = result?.page ?? 1;
  const pageCount = result?.pageCount ?? 1;
  const formStatus = listParams?.status ?? params.status;

  const pageHref = (target: number) => {
    if (!listParams) return "/creators";
    const query = new URLSearchParams();
    if (listParams.q) query.set("q", listParams.q);
    if (listParams.status) query.set("status", listParams.status);
    if (listParams.source) query.set("source", listParams.source);
    query.set("sort", listParams.sort);
    query.set("dir", listParams.dir);
    if (listParams.minFollowers !== undefined) query.set("min", String(listParams.minFollowers));
    if (listParams.maxFollowers !== undefined) query.set("max", String(listParams.maxFollowers));
    query.set("page", String(target));
    return `/creators?${query.toString()}`;
  };

  const filters = [
    { label: "All", value: undefined },
    { label: "New", value: "new" },
    { label: "Reviewing", value: "reviewing" },
    { label: "Qualified", value: "qualified" },
    { label: "Approved", value: "approved" },
    { label: "Partnered", value: "partnered" },
    { label: "Suppressed", value: "suppressed" },
  ];

  const hasFilter = Boolean(params.q || params.status || params.source);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pipeline"
        title="Creators"
        description="VistaBix never scrapes Instagram. You supply handles; we enrich them through official Business Discovery."
        actions={
          <>
            <Button asChild variant="secondary" size="sm">
              <Link href="/api/export/creators">
                <Download /> Export CSV
              </Link>
            </Button>
            <BatchImportDialog />
            <AddCreatorDialog defaultOpen={params.add === "1"} />
          </>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <nav aria-label="Filter by status" className="flex flex-wrap gap-1.5">
          {filters.map((filter) => {
            const active = (params.status ?? undefined) === filter.value;
            const query = new URLSearchParams();
            if (params.q) query.set("q", params.q);
            if (filter.value) query.set("status", filter.value);
            if (params.source) query.set("source", params.source);
            return (
              <Link
                key={filter.label}
                href={`/creators${query.toString() ? `?${query.toString()}` : ""}`}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "rounded-full border border-lime/40 bg-lime/10 px-3 py-1 text-[12px] font-semibold text-lime"
                    : "rounded-full border border-line bg-surface px-3 py-1 text-[12px] font-medium text-muted transition-colors hover:border-line-2 hover:text-fg"
                }
              >
                {filter.label}
              </Link>
            );
          })}
        </nav>

        <form action="/creators" method="get" className="grid w-full grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center lg:max-w-4xl">
          {formStatus ? <input type="hidden" name="status" value={formStatus} /> : null}
          <div className="relative col-span-2 sm:min-w-[200px] sm:flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-faint" aria-hidden />
            <Input
              name="q"
              defaultValue={listParams?.q ?? params.q}
              placeholder="Search handle or name"
              className="pl-9"
              aria-label="Search creators"
            />
          </div>
          <Select name="source" defaultValue={listParams?.source ?? params.source ?? ""} aria-label="Filter by source" className="w-40">
            <option value="">Any source</option>
            <option value="applied">Applied</option>
            <option value="invited">Invited</option>
            <option value="manual">Added by you</option>
            <option value="discovery">Discovery</option>
          </Select>
          <Select name="sort" defaultValue={listParams?.sort ?? "created"} aria-label="Sort creators" className="w-36">
            <option value="created">Newest</option>
            <option value="username">Handle</option>
            <option value="followers">Followers</option>
            <option value="score">Score</option>
            <option value="enriched">Recently enriched</option>
          </Select>
          <Select name="dir" defaultValue={listParams?.dir ?? "desc"} aria-label="Sort direction" className="w-32">
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </Select>
          <Input
            name="min"
            type="number"
            min={0}
            defaultValue={listParams?.minFollowers ?? params.min ?? ""}
            placeholder="Min followers"
            aria-label="Min followers"
            className="w-32"
          />
          <Input
            name="max"
            type="number"
            min={0}
            defaultValue={listParams?.maxFollowers ?? params.max ?? ""}
            placeholder="Max followers"
            aria-label="Max followers"
            className="w-32"
          />
          <Button type="submit" variant="secondary" size="md">
            Filter
          </Button>
        </form>
      </div>

      <Card>
        <CardContent className="p-0">
          {error ? (
            <div role="alert" className="px-4 py-6 text-[13px] text-danger">
              {error}
            </div>
          ) : creators.length === 0 ? (
            hasFilter ? (
              <EmptyState
                icon={Search}
                title="No creator matches that filter"
                description="Try a different handle, status or source. Filters run as SQL against this workspace only."
                action={
                  <Button asChild variant="secondary">
                    <Link href="/creators">Clear filters</Link>
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={Users}
                title="No creators yet"
                description="Add someone you already know, or share the public application link so creators can opt in with a real consent record."
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <AddCreatorDialog />
                    <Button asChild variant="outline">
                      <Link href="/apply" target="_blank">
                        Open application form
                      </Link>
                    </Button>
                  </div>
                }
              />
            )
          ) : (
            <TableShell>
              <Table>
                <THead>
                  <TR>
                    <TH>Creator</TH>
                    <TH>Status</TH>
                    <TH>Consent</TH>
                    <TH className="text-right">Followers</TH>
                    <TH className="text-right">Score</TH>
                    <TH>Source</TH>
                    <TH className="text-right">Enriched</TH>
                    <TH className="text-right">
                      <span className="sr-only">Actions</span>
                    </TH>
                  </TR>
                </THead>
                <TBody>
                  {creators.map((creator) => (
                    <TR key={creator.id} className="hover:bg-surface-2/50">
                      <TD>
                        <Link href={`/creators/${creator.id}`} className="flex items-center gap-3 group">
                          <Avatar name={creator.displayName ?? creator.username} src={creator.profilePictureUrl} size="sm" />
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-semibold text-fg group-hover:text-lime">
                              {creator.displayName ?? `@${creator.username}`}
                            </span>
                            <span className="block truncate font-mono text-[10.5px] text-faint">@{creator.username}</span>
                          </span>
                        </Link>
                      </TD>
                      <TD>
                        <Badge tone={STATUS_TONE[creator.status] ?? "neutral"}>{CREATOR_STATUS_LABEL[creator.status] ?? creator.status}</Badge>
                      </TD>
                      <TD>
                        <span className="text-[12px] text-muted">{CONSENT_LABEL[creator.consentStatus] ?? creator.consentStatus}</span>
                      </TD>
                      <TD className="text-right font-mono text-[12.5px]">
                        {creator.followers === null ? <span className="text-faint">—</span> : formatNumber(creator.followers)}
                      </TD>
                      <TD className="text-right font-mono text-[12.5px]">
                        {creator.score ? (
                          <span className="text-fg">{Number(creator.score.total).toFixed(1)}</span>
                        ) : (
                          <span className="text-faint" title="Not enough data to score">
                            —
                          </span>
                        )}
                      </TD>
                      <TD>
                        <span className="text-[12px] text-muted">{SOURCE_LABEL[creator.source] ?? creator.source}</span>
                      </TD>
                      <TD className="text-right font-mono text-[11px] text-faint">
                        {creator.lastEnrichedAt ? timeAgo(creator.lastEnrichedAt) : "never"}
                      </TD>
                      <TD className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <ActionButton
                            action={enrichCreatorAction.bind(null, creator.id)}
                            variant="ghost"
                            size="icon-sm"
                            title="Refresh public metrics"
                            aria-label={`Refresh public metrics for @${creator.username}`}
                          >
                            <RefreshCw />
                          </ActionButton>
                          <Button asChild variant="ghost" size="icon-sm" aria-label={`Open @${creator.username}`}>
                            <Link href={`/creators/${creator.id}`}>
                              <ArrowRight />
                            </Link>
                          </Button>
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableShell>
          )}
          {result ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3">
              <span className="text-[11.5px] text-muted">Page {page} of {pageCount}</span>
              <div className="flex items-center gap-2">
                {page > 1 ? (
                  <Button asChild variant="secondary" size="sm">
                    <Link href={pageHref(page - 1)}>Previous</Link>
                  </Button>
                ) : null}
                {page < pageCount ? (
                  <Button asChild variant="secondary" size="sm">
                    <Link href={pageHref(page + 1)}>Next</Link>
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <p className="text-[11.5px] leading-5 text-faint">
        Follower counts come from <span className="font-mono">creator_snapshots</span> captured through Instagram Business
        Discovery. A dash means no snapshot exists yet — not zero.
      </p>
    </div>
  );
}
