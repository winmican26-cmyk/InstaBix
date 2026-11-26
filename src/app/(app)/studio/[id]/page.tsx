import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  Download,
  FileCheck2,
  PenLine,
  Quote,
  Send,
  Sparkles,
} from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { getProductDetail } from "@/lib/db/queries";
import { approveOutlineAction, generateOutlineAction, publishProductAction, submitForCreatorReviewAction } from "@/lib/actions/studio";
import {
  generateDemandGapsAction,
  generateVoiceDnaAction,
  lockVoiceDnaAction,
  runBuyerPanelAction,
  setBuyerObjectionStatusAction,
} from "@/lib/actions/analysis";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { ActionButton } from "@/components/app/action-button";
import { checkVoiceText } from "@/lib/analysis/voice";
import { aiConfigured } from "@/lib/env";
import { ChapterList } from "./chapter-list";
import { AddChapterForm } from "./add-chapter";
import { DeleteProductButton } from "./delete-product";
import { PRODUCT_STATUS_LABEL } from "@/lib/constants";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Product" };
export const dynamic = "force-dynamic";

const STAGES = ["outline", "approved", "written", "review", "published"] as const;

function stageIndex(status: string): number {
  if (status === "outline_pending" || status === "draft") return 0;
  if (status === "outline_approved" || status === "generating") return 1;
  if (status === "review") return 3;
  if (status === "approved") return 3;
  if (status === "published") return 4;
  return 0;
}

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { org, role } = await requireWorkspace();
  const { id } = await params;
  const data = await getProductDetail(org.id, id);
  if (!data) notFound();

  const { product, creator, chapters, drafts, agreements, orders, analysis } = data;
  const { gaps, voiceDna, panel } = analysis;
  const written = chapters.filter((c) => (c.content ?? "").trim().length > 0);
  const totalWords = written.reduce((sum, c) => sum + c.wordCount, 0);
  const stage = stageIndex(product.status);
  const canManage = role === "owner" || role === "admin";
  const voiceCheck = voiceDna
    ? checkVoiceText(
        written
          .map((chapter) => [chapter.title, chapter.summary, chapter.content].filter(Boolean).join(" "))
          .join(" "),
        voiceDna,
      )
    : null;

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/studio">
            <ArrowLeft /> All products
          </Link>
        </Button>
        <PageHeader
          eyebrow={`Product · @${creator.username}`}
          title={product.title}
          description={product.promise ?? product.subtitle ?? "No promise written yet."}
          actions={
            <>
              <Badge tone={product.status === "published" ? "lime" : product.status === "review" ? "amber" : "neutral"}>
                {PRODUCT_STATUS_LABEL[product.status] ?? product.status}
              </Badge>
              {product.status === "published" ? (
                <Button asChild variant="secondary" size="sm">
                  <Link href={`/api/products/${product.id}/export`}>
                    <Download /> Export
                  </Link>
                </Button>
              ) : null}
              {canManage ? <DeleteProductButton productId={product.id} title={product.title} /> : null}
            </>
          }
        />
      </div>

      <Card>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {STAGES.map((label, index) => (
              <div key={label} className="flex items-center gap-2">
                <span
                  className={
                    index <= stage
                      ? "rounded-full border border-lime/40 bg-lime/10 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-lime"
                      : "rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-faint"
                  }
                >
                  {label}
                </span>
                {index < STAGES.length - 1 ? <span className="h-px w-3 bg-line" aria-hidden /> : null}
              </div>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <Meta label="Creator share" value={`${product.splitCreatorBps / 100}%`} />
            <Meta label="Operator share" value={`${product.splitOperatorBps / 100}%`} />
            <Meta label="Price" value={formatCurrency(product.priceCents, product.currency)} />
            <Meta label="Measured words" value={String(totalWords)} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Outline</CardTitle>
              <CardDescription>
                {chapters.length === 0
                  ? "No outline exists yet."
                  : `${chapters.length} chapters · generated from public captions and the creator's own words.`}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <ActionButton
                action={generateOutlineAction.bind(null, product.id)}
                variant="secondary"
                size="sm"
                confirm="Generate an outline? This replaces the current chapter list. It refuses to run without AI configured."
              >
                <Sparkles /> Generate
              </ActionButton>
              {chapters.length >= 8 && product.status === "outline_pending" ? (
                <ActionButton action={approveOutlineAction.bind(null, product.id)} size="sm">
                  <BadgeCheck /> Approve outline
                </ActionButton>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {chapters.length === 0 ? (
              <EmptyState
                icon={Sparkles}
                title="Outline is empty"
                description="Generation needs an AI provider key, a consented creator and public captions. OpenAI is preferred when configured; Anthropic remains available as fallback."
              />
            ) : (
              <ChapterList
                chapters={chapters.map((chapter) => ({
                  id: chapter.id,
                  position: chapter.position,
                  title: chapter.title,
                  summary: chapter.summary,
                  content: chapter.content,
                  wordCount: chapter.wordCount,
                }))}
              />
            )}
            {product.status === "draft" || product.status === "outline_pending" || product.status === "outline_approved" ? (
              <div className="border-t border-line px-4 py-4">
                <details className="rounded-lg border border-line bg-surface-2/30 p-3">
                  <summary className="cursor-pointer text-[12.5px] font-medium text-fg">
                    Add a chapter manually
                  </summary>
                  <div className="pt-3">
                    <AddChapterForm productId={product.id} />
                  </div>
                </details>
              </div>
            ) : null}
          </CardContent>
          <CardFooter>
            <span className="text-[11px] text-faint">
              {written.length} of {chapters.length} chapters written
            </span>
            <div className="w-40">
              <Progress
                value={chapters.length ? (written.length / chapters.length) * 100 : 0}
                label={`${written.length} of ${chapters.length} chapters written`}
              />
            </div>
          </CardFooter>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Gates</CardTitle>
                <CardDescription>The server refuses to skip any of these.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <Gate
                done={chapters.length >= 8}
                title="Outline approved"
                body="Needs at least 8 chapters before approval."
              />
              <Gate
                done={written.length === chapters.length && chapters.length >= 8}
                title="Every chapter written"
                body="Empty chapters block the review submission."
              />
              <Gate done={agreements.some((a) => a.signedAt)} title="Creator agreement signed" body="Signature stores a document hash and audit metadata." />
              <Gate done={product.status === "published"} title="Published" body="Requires owner or admin, plus completed review." />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Citations</CardTitle>
                <CardDescription>Drafts must cite real source ids, not vibes.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {drafts.length === 0 ? (
                <p className="text-[12px] leading-5 text-faint">
                  No draft snapshot yet. Citations attach to a draft after the first review submission.
                </p>
              ) : (
                <ul className="space-y-2">
                  {drafts.map((draft) => (
                    <li key={draft.id} className="rounded-md border border-line bg-surface-2/40 px-3 py-2">
                      <p className="flex items-center gap-1.5 text-[12px] text-fg">
                        <Quote className="size-3 text-lime" aria-hidden />
                        {draft.wordCount} words · {draft.status}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] text-faint">{formatDateTime(draft.createdAt)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Commerce</CardTitle>
                <CardDescription>{orders.length} order{orders.length === 1 ? "" : "s"} recorded.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {orders.length === 0 ? (
                <p className="text-[12px] leading-5 text-faint">
                  No order yet. Checkout requires Stripe to be configured and the product published.
                </p>
              ) : (
                orders.slice(0, 5).map((order) => (
                  <div key={order.id} className="flex items-center justify-between rounded-md border border-line bg-surface-2/40 px-3 py-2">
                    <span className="font-mono text-[11px] text-muted">{order.id.slice(0, 8)}</span>
                    <span className="font-mono text-[11.5px] text-fg">{formatCurrency(order.amountCents, order.currency)}</span>
                    <Badge tone={order.status === "paid" ? "lime" : order.status === "refunded" ? "amber" : "neutral"}>{order.status}</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Next gate</CardTitle>
            <CardDescription>
              {product.status === "outline_pending"
                ? "Approve the outline, then write every chapter."
                : product.status === "outline_approved"
                  ? "Write every chapter, then submit for creator review."
                  : product.status === "review"
                    ? "Creator reviews on their portal. Publication waits for them."
                    : product.status === "published"
                      ? "The product is live. Orders write to the ledger."
                      : "Review the current stage."}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {product.status === "outline_approved" ? (
              <ActionButton action={submitForCreatorReviewAction.bind(null, product.id)} size="sm">
                <Send /> Submit for creator review
              </ActionButton>
            ) : null}
            {(product.status === "review" || product.status === "approved") && canManage ? (
              <ActionButton
                action={publishProductAction.bind(null, product.id)}
                size="sm"
                confirm="Publish this product? It becomes purchasable as soon as Stripe is connected."
              >
                <FileCheck2 /> Publish
              </ActionButton>
            ) : null}
            <Button asChild variant="outline" size="sm">
              <Link href={`/creators/${creator.id}`}>
                <PenLine /> Creator record
              </Link>
            </Button>
          </div>
        </CardHeader>
        {product.status === "review" ? (
          <CardContent>
            <Alert tone="info" title="Waiting on the creator">
              The review link lives on the creator portal. There is no bypass button here, and publication is audited.
            </Alert>
          </CardContent>
        ) : null}
      </Card>

      <section className="space-y-4" aria-labelledby="studio-analysis-heading">
        <div>
          <h2 id="studio-analysis-heading" className="font-display text-lg font-semibold text-fg">
            Analysis, for humans to judge
          </h2>
          <p className="mt-1 text-[12px] leading-5 text-muted">
            Every figure here is read from stored records. Proposals stay proposals until a person reviews them.
          </p>
        </div>

        {!aiConfigured ? (
          <Alert tone="warning" title="AI analysis is disabled">
            Add OPENAI_API_KEY (preferred) or ANTHROPIC_API_KEY to configure AI. Until then, generation is refused and no analysis is fabricated on this
            page.
          </Alert>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Demand Gaps</CardTitle>
                <CardDescription>
                  Proposals derived only from stored real captions and in-workspace product titles.
                </CardDescription>
              </div>
              <ActionButton
                action={generateDemandGapsAction.bind(null, creator.id)}
                variant="secondary"
                size="sm"
                confirm="Generate demand gaps? This replaces the current list. Only stored captions and product titles are read."
                disabled={!aiConfigured}
              >
                <Sparkles /> Generate gaps
              </ActionButton>
            </CardHeader>
            <CardContent>
              {gaps.length === 0 ? (
                <EmptyState
                  icon={Sparkles}
                  title="No demand gaps yet"
                  description="Nothing has been generated for this creator. Generation reads stored captions and product titles only."
                />
              ) : (
                <ol className="space-y-3">
                  {gaps.map((gap) => {
                    const score = `${Math.round(gap.scoreBps / 100)} / 100`;
                    return (
                      <li key={gap.id} className="rounded-lg border border-line bg-surface-2/40 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[12.5px] font-semibold leading-5 text-fg">
                            <span className="mr-1.5 font-mono text-[11px] text-faint">#{gap.rank}</span>
                            {gap.theme}
                          </p>
                          <Badge tone="neutral">{score}</Badge>
                        </div>
                        <p className="mt-1 text-[11.5px] leading-4 text-muted">{gap.productConcept}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Badge tone="lime">{gap.strength}</Badge>
                          <Badge tone="neutral">{gap.requestCount} requests</Badge>
                          <Badge tone="neutral">{gap.buyerLanguageHits} buyer-language hits</Badge>
                          <Badge tone="neutral">{gap.existingProductMatches} existing matches</Badge>
                        </div>
                        {gap.examplePhrasing ? (
                          <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-4 text-faint">
                            <Quote className="mt-0.5 size-3 shrink-0 text-lime" aria-hidden />
                            {gap.examplePhrasing}
                          </p>
                        ) : null}
                        <p className="mt-2 text-[10px] leading-4 text-faint">
                          Provenance: {gap.captionsUsed} captions · {gap.model}
                        </p>
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Voice DNA</CardTitle>
                <CardDescription>Extracted from stored captions. Only a person can lock it.</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <ActionButton
                  action={generateVoiceDnaAction.bind(null, creator.id)}
                  variant="secondary"
                  size="sm"
                  confirm="Extract Voice DNA? This replaces the current profile and clears its lock."
                  disabled={!aiConfigured}
                >
                  <Sparkles /> Extract voice
                </ActionButton>
                <ActionButton
                  action={lockVoiceDnaAction.bind(null, creator.id)}
                  size="sm"
                  confirm="Lock this Voice DNA profile? Locking is a human decision and is recorded in the audit log."
                  disabled={!voiceDna}
                >
                  <BadgeCheck /> Lock voice
                </ActionButton>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {!voiceDna ? (
                <EmptyState
                  icon={Quote}
                  title="No Voice DNA profile"
                  description="Extract it from stored captions, review it, then lock it before running a buyer panel."
                />
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={voiceDna.lockedAt ? "lime" : "amber"}>
                      {voiceDna.lockedAt ? "locked" : "not locked"}
                    </Badge>
                    {voiceDna.tone.map((tone, index) => (
                      <Badge key={`tone-${index}`} tone="violet">
                        {tone}
                      </Badge>
                    ))}
                  </div>
                  <TextList label="Top phrases" items={voiceDna.topPhrases} />
                  <TextList label="Signature stories" items={voiceDna.signatureStories} />
                  <TextList label="Never says" items={voiceDna.neverSays} />
                  {voiceCheck ? (
                    <div className="rounded-md border border-line bg-surface-2/40 p-3">
                      <p className="flex items-center gap-1.5 text-[12px] font-semibold text-fg">
                        <BadgeCheck
                          className={voiceCheck.passed ? "size-3.5 text-lime" : "size-3.5 text-amber"}
                          aria-hidden
                        />
                        {voiceCheck.passed ? "Voice check passed" : "Voice check blocked"}
                      </p>
                      {written.length === 0 ? (
                        <p className="mt-1 text-[11px] leading-4 text-faint">
                          No written chapters yet, so there was no text to compare against the profile.
                        </p>
                      ) : null}
                      {voiceCheck.banned.length > 0 ? (
                        <div className="mt-1.5">
                          <p className="text-[11px] leading-4 text-muted">
                            Banned phrases found in written titles, summaries or content:
                          </p>
                          <ul className="mt-1 flex flex-wrap gap-1.5">
                            {voiceCheck.banned.map((phrase, index) => (
                              <li key={`banned-${index}`}>
                                <Badge tone="danger">{phrase}</Badge>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <p className="text-[10px] leading-4 text-faint">
                    Provenance: {voiceDna.captionsUsed} captions · {voiceDna.model}
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Test Buyer Panel</CardTitle>
                <CardDescription>Objections are proposals for review. Nothing here publishes automatically.</CardDescription>
              </div>
              <ActionButton
                action={runBuyerPanelAction.bind(null, product.id)}
                variant="secondary"
                size="sm"
                confirm="Run a new buyer panel? This creates a new run for human review."
                disabled={!aiConfigured || !voiceDna?.lockedAt}
              >
                <Sparkles /> Run buyer panel
              </ActionButton>
            </CardHeader>
            <CardContent>
              {!panel ? (
                <EmptyState
                  icon={Quote}
                  title="No buyer panel run"
                  description="A run requires locked Voice DNA and stored chapters. Nothing is generated until both are present."
                />
              ) : (
                <div className="space-y-3">
                  <p className="text-[10px] leading-4 text-faint">
                    Latest run · {panel.objectionsCount} recorded · {panel.model} · {formatDateTime(panel.createdAt)}
                  </p>
                  {panel.objections.length === 0 ? (
                    <p className="text-[12px] leading-5 text-faint">No objections were recorded in this run.</p>
                  ) : (
                    <ul className="space-y-3">
                      {panel.objections.map((objection) => (
                        <li key={objection.id} className="rounded-lg border border-line bg-surface-2/40 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-[12.5px] font-semibold leading-5 text-fg">{objection.persona}</p>
                            <Badge
                              tone={
                                objection.status === "fixed"
                                  ? "lime"
                                  : objection.status === "dismissed"
                                    ? "neutral"
                                    : "amber"
                              }
                            >
                              {objection.status}
                            </Badge>
                          </div>
                          <p className="mt-1 text-[11.5px] leading-4 text-muted">{objection.objection}</p>
                          <p className="mt-1 text-[11.5px] leading-4 text-faint">Fix: {objection.fix}</p>
                          {objection.status === "open" ? (
                            <div className="mt-2">
                              <ActionButton
                                action={setBuyerObjectionStatusAction.bind(null, objection.id, "fixed")}
                                variant="outline"
                                size="sm"
                                confirm="Mark this objection fixed? This is a human review decision and is audited."
                              >
                                <BadgeCheck /> Mark fixed
                              </ActionButton>
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <p className="text-[11px] leading-5 text-faint">
        Words are counted on save. Order counts are read from <span className="font-mono">orders</span>. Nothing on this page
        is a placeholder.
      </p>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2/40 p-3">
      <p className="label">{label}</p>
      <p className="mt-1 font-display text-lg font-semibold text-fg">{value}</p>
    </div>
  );
}

function Gate({ done, title, body }: { done: boolean; title: string; body: string }) {
  return (
    <div className="flex gap-2.5 rounded-md border border-line bg-surface-2/40 px-3 py-2">
      <span
        className={
          done
            ? "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-lime text-accent-fg"
            : "mt-0.5 size-4 shrink-0 rounded-full border border-line-2 bg-surface-3"
        }
        aria-hidden
      >
        {done ? <BadgeCheck className="size-3" /> : null}
      </span>
      <div>
        <p className="text-[12px] font-medium text-fg">{title}</p>
        <p className="mt-0.5 text-[11px] leading-4 text-faint">{body}</p>
      </div>
    </div>
  );
}

function TextList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="label">{label}</p>
      {items.length === 0 ? (
        <p className="mt-1 text-[11px] leading-4 text-faint">None recorded.</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {items.map((item, index) => (
            <li key={`${label}-${index}`} className="flex items-start gap-1.5 text-[11.5px] leading-4 text-muted">
              <Quote className="mt-0.5 size-3 shrink-0 text-lime" aria-hidden />
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
