import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  Calculator,
  ExternalLink,
  Fingerprint,
  Info,
  Mail,
  RefreshCw,
  ShieldOff,
  Trash2,
  Users,
} from "lucide-react";
import { Instagram } from "@/components/brand/instagram-glyph";
import { requireWorkspace } from "@/lib/auth/session";
import { getCreatorDetail } from "@/lib/db/queries";
import {
  deleteCreatorAction,
  enrichCreatorAction,
  grantConsentAction,
  recomputeScoreAction,
  suppressCreatorAction,
} from "@/lib/actions/creators";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { Tooltip } from "@/components/ui/tooltip";
import { ActionButton } from "@/components/app/action-button";
import { StatusSelect } from "./status-select";
import { ContactForm } from "./contact-form";
import { PortalLinkButton } from "./portal-link-button";
import { CREATOR_STATUS_LABEL, MESSAGE_STATUS_LABEL, PRODUCT_STATUS_LABEL, SOURCE_LABEL, CONSENT_LABEL } from "@/lib/constants";
import { formatDateTime, formatNumber, timeAgo } from "@/lib/utils";
import { excerpt } from "@/lib/text";

export const metadata: Metadata = { title: "Creator" };
export const dynamic = "force-dynamic";

export default async function CreatorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { org, role } = await requireWorkspace();
  const { id } = await params;
  const data = await getCreatorDetail(org.id, id);
  if (!data) notFound();

  const { creator, snapshot, score, media, products, messages, agreements, campaigns } = data;
  const canManage = role === "owner" || role === "admin";

  const factors = score
    ? (Object.entries(score.factors) as [string, { value: number; normalized: number; weight: number; detail: string }][])
    : [];

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/creators">
            <ArrowLeft /> All creators
          </Link>
        </Button>
        <PageHeader
          eyebrow={`Creator · ${SOURCE_LABEL[creator.source] ?? creator.source}`}
          title={creator.displayName ?? `@${creator.username}`}
          description={`@${creator.username}${creator.niche ? ` · ${creator.niche}` : ""} · added ${formatDateTime(creator.createdAt)}`}
          actions={
            <>
              <StatusSelect creatorId={creator.id} value={creator.status} />
              <ActionButton
                action={enrichCreatorAction.bind(null, creator.id)}
                variant="secondary"
                size="sm"
                successMessage="Public metrics refreshed through the official API."
              >
                <RefreshCw /> Enrich
              </ActionButton>
              <PortalLinkButton creatorId={creator.id} />
            </>
          }
          meta={
            <div className="flex items-center gap-3">
              <Avatar name={creator.displayName ?? creator.username} src={creator.profilePictureUrl} size="lg" />
            </div>
          }
        />
      </div>

      {creator.consentStatus !== "granted" ? (
        <Alert tone="warning" title="No consent on record">
          <p>
            Outreach and enrichment are blocked until consent exists. Record it only when the creator has actually agreed —
            for example through the application form or a reply in writing.
          </p>
          <ActionButton
            action={grantConsentAction.bind(null, creator.id)}
            variant="secondary"
            size="sm"
            className="mt-3"
            confirm="Confirm this creator gave you permission to contact them and read public metrics?"
          >
            <BadgeCheck /> Record consent
          </ActionButton>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Fingerprint className="size-4 text-lime" strokeWidth={1.75} aria-hidden />
                Explainable score
              </CardTitle>
              <CardDescription>
                {score
                  ? `Model ${score.modelVersion} · ${score.sampleSize} posts · inputs hash ${score.inputsHash.slice(0, 12)}…`
                  : "A score is only produced when the inputs exist. We refuse to invent one."}
              </CardDescription>
            </div>
            <ActionButton action={recomputeScoreAction.bind(null, creator.id)} variant="ghost" size="sm">
              <Calculator /> Recompute
            </ActionButton>
          </CardHeader>
          <CardContent>
            {score ? (
              <div className="space-y-4">
                <div className="flex items-end gap-3">
                  <p className="font-display text-[42px] font-semibold leading-none tracking-[-0.04em] text-fg">
                    {Number(score.total).toFixed(1)}
                  </p>
                  <p className="pb-1 text-[12px] text-faint">out of 100</p>
                  <Badge tone={Number(score.total) >= 70 ? "lime" : Number(score.total) >= 45 ? "amber" : "neutral"} className="mb-1 ml-auto">
                    {Number(score.total) >= 70 ? "Strong fit" : Number(score.total) >= 45 ? "Worth a look" : "Weak signal"}
                  </Badge>
                </div>
                <div className="space-y-3">
                  {factors.map(([key, factor]) => (
                    <div key={key}>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-[12.5px] font-medium capitalize text-fg">{key.replace("_", " ")}</span>
                        <Tooltip content={factor.detail}>
                          <span className="inline-flex items-center gap-1 font-mono text-[10.5px] text-faint">
                            weight {(factor.weight * 100).toFixed(0)}%
                            <Info className="size-3" aria-hidden />
                          </span>
                        </Tooltip>
                      </div>
                      <Progress
                        value={factor.normalized * 100}
                        tone={factor.normalized >= 0.7 ? "lime" : factor.normalized >= 0.4 ? "amber" : "violet"}
                        label={`${key}: ${(factor.normalized * 100).toFixed(0)} of 100`}
                      />
                      <p className="mt-1 text-[11px] leading-4 text-faint">{factor.detail}</p>
                    </div>
                  ))}
                </div>
                <p className="border-t border-line pt-3 font-mono text-[10px] uppercase tracking-[0.08em] text-faint">
                  computed {formatDateTime(score.computedAt)}
                </p>
              </div>
            ) : (
              <EmptyState
                icon={Fingerprint}
                title="Not enough evidence to score"
                description="Scoring needs a follower snapshot and at least 8 recent posts with public engagement. Enrich this creator through Business Discovery first."
              />
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Public snapshot</CardTitle>
                <CardDescription>
                  {snapshot ? `Captured ${timeAgo(snapshot.capturedAt)} · ${snapshot.apiVersion ?? "API version not recorded"}` : "No snapshot captured yet."}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-line bg-surface-2/40 p-3">
                <p className="label">Followers</p>
                <p className="mt-1 font-display text-xl font-semibold text-fg">
                  {snapshot ? formatNumber(snapshot.followers) : "—"}
                </p>
              </div>
              <div className="rounded-lg border border-line bg-surface-2/40 p-3">
                <p className="label">Media count</p>
                <p className="mt-1 font-display text-xl font-semibold text-fg">
                  {snapshot ? formatNumber(snapshot.mediaCount) : "—"}
                </p>
              </div>
            </CardContent>
            <CardFooter>
              <span className="inline-flex items-center gap-1.5 text-[11px] text-faint">
                <Instagram className="size-3" /> Instagram Business Discovery
              </span>
              {snapshot?.requestId ? <span className="font-mono text-[10px] text-faint">req {snapshot.requestId.slice(0, 10)}</span> : null}
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Consent & contact</CardTitle>
                <CardDescription>Consent is a record, not a checkbox in the UI.</CardDescription>
              </div>
              <Badge tone={creator.consentStatus === "granted" ? "lime" : creator.consentStatus === "revoked" ? "danger" : "amber"}>
                {CONSENT_LABEL[creator.consentStatus] ?? creator.consentStatus}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-[12px]">
                <div>
                  <p className="label">Recorded</p>
                  <p className="mt-1 text-muted">{creator.consentAt ? formatDateTime(creator.consentAt) : "—"}</p>
                </div>
                <div>
                  <p className="label">Email source</p>
                  <p className="mt-1 capitalize text-muted">{creator.emailSource.replace(/_/g, " ")}</p>
                </div>
              </div>
              <ContactForm creatorId={creator.id} initialEmail={creator.contactEmail} initialSource={creator.emailSource} />
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Recent public media</CardTitle>
            <CardDescription>
              Captions and engagement counts exactly as the API returned them. Images are hot-linked from Meta&apos;s CDN.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {media.length === 0 ? (
            <EmptyState
              icon={Instagram}
              title="No media stored"
              description="Enrichment stores the latest public posts. Nothing is scraped and nothing is generated."
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {media.map((item) => (
                <li key={item.id} className="rounded-lg border border-line bg-surface-2/30 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <Badge tone="outline">{item.mediaType ?? "MEDIA"}</Badge>
                    {item.permalink ? (
                      <a
                        href={item.permalink}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1 text-[11px] text-faint hover:text-fg"
                      >
                        Open <ExternalLink className="size-3" />
                      </a>
                    ) : null}
                  </div>
                  <p className="mt-2 text-[12px] leading-5 text-muted">{excerpt(item.caption, 160) || "No caption."}</p>
                  <div className="mt-2 flex items-center gap-3 font-mono text-[10.5px] text-faint">
                    <span>{formatNumber(item.likeCount)} likes</span>
                    <span>{formatNumber(item.commentCount)} comments</span>
                    {item.postedAt ? <span className="ml-auto">{timeAgo(item.postedAt)}</span> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Products</CardTitle>
              <CardDescription>{products.length} in this workspace</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {products.length === 0 ? (
              <p className="text-[12px] text-faint">No product yet.</p>
            ) : (
              products.map((product) => (
                <Link
                  key={product.id}
                  href={`/studio/${product.id}`}
                  className="block rounded-md border border-line bg-surface-2/40 px-3 py-2 hover:border-line-2"
                >
                  <p className="truncate text-[12.5px] font-medium text-fg">{product.title}</p>
                  <p className="mt-0.5 text-[11px] text-faint">{PRODUCT_STATUS_LABEL[product.status] ?? product.status}</p>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Messages</CardTitle>
              <CardDescription>{messages.length} recent</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {messages.length === 0 ? (
              <p className="text-[12px] text-faint">No outreach yet.</p>
            ) : (
              messages.map((message) => (
                <div key={message.id} className="rounded-md border border-line bg-surface-2/40 px-3 py-2">
                  <p className="truncate text-[12px] text-fg">{message.subject ?? "(no subject)"}</p>
                  <p className="mt-0.5 flex items-center gap-2 text-[10.5px] text-faint">
                    <Mail className="size-3" aria-hidden />
                    {MESSAGE_STATUS_LABEL[message.status] ?? message.status}
                    {message.sentAt ? ` · ${timeAgo(message.sentAt)}` : ""}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Agreements & campaigns</CardTitle>
              <CardDescription>
                {agreements.length} agreement{agreements.length === 1 ? "" : "s"} · {campaigns.length} campaign
                {campaigns.length === 1 ? "" : "s"}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {agreements.length === 0 && campaigns.length === 0 ? (
              <p className="text-[12px] text-faint">Nothing signed or running yet.</p>
            ) : (
              <>
                {agreements.map((agreement) => (
                  <div key={agreement.id} className="rounded-md border border-line bg-surface-2/40 px-3 py-2">
                    <p className="text-[12px] text-fg">Agreement v{agreement.version}</p>
                    <p className="mt-0.5 text-[10.5px] text-faint">
                      {agreement.signedAt ? `signed ${timeAgo(agreement.signedAt)}` : "awaiting signature"} · hash{" "}
                      {agreement.documentHash.slice(0, 10)}…
                    </p>
                  </div>
                ))}
                {campaigns.map((campaign) => (
                  <div key={campaign.id} className="rounded-md border border-line bg-surface-2/40 px-3 py-2">
                    <p className="text-[12px] text-fg">{campaign.name}</p>
                    <p className="mt-0.5 text-[10.5px] capitalize text-faint">{campaign.status}</p>
                  </div>
                ))}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-danger/25">
        <CardHeader>
          <div>
            <CardTitle>Danger zone</CardTitle>
            <CardDescription>Destructive actions are audited. Suppression is reversible only by an explicit decision.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <ActionButton
            action={suppressCreatorAction.bind(null, creator.id, "operator_suppressed")}
            variant="danger"
            size="sm"
            confirm="Suppress this contact? All future sends will be blocked immediately."
          >
            <ShieldOff /> Suppress contact
          </ActionButton>
          {canManage ? (
            <ActionButton
              action={deleteCreatorAction.bind(null, creator.id)}
              variant="danger"
              size="sm"
              confirm="Delete this creator and all dependent rows? The audit entry is kept, the data is not."
            >
              <Trash2 /> Delete creator
            </ActionButton>
          ) : null}
        </CardContent>
        <CardFooter>
          <p className="flex items-center gap-1.5 text-[11px] text-faint">
            <Users className="size-3" aria-hidden /> Status: {CREATOR_STATUS_LABEL[creator.status] ?? creator.status}
          </p>
          <span className="font-mono text-[10px] text-faint">id {creator.id.slice(0, 8)}</span>
        </CardFooter>
      </Card>
    </div>
  );
}
