import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Download, FileText, Lock, ScrollText } from "lucide-react";
import { Mark } from "@/components/brand/wordmark";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { PRODUCT_STATUS_LABEL } from "@/lib/constants";
import { agreementText, loadPortalData, resolvePortalToken } from "@/lib/portal";
import { readingMinutes } from "@/lib/text";
import { signAgreementAction } from "../../actions";
import { SignAgreementForm } from "../../sign-form";
import { ReviewActions } from "../../review-actions";

export const metadata: Metadata = { title: "Product review" };
export const dynamic = "force-dynamic";

export default async function PortalProductPage({ params }: { params: Promise<{ token: string; productId: string }> }) {
  const { token, productId } = await params;
  const tokenRow = await resolvePortalToken(token);
  if (!tokenRow) notFound();

  const data = await loadPortalData(tokenRow);
  if (!data) notFound();

  const row = data.products.find((entry) => entry.product.id === productId);
  if (!row) notFound();

  const { product, chapters, agreement } = row;
  const signed = Boolean(agreement?.signedAt);
  const written = chapters.filter((chapter) => (chapter.content ?? "").trim().length > 0);
  const totalWords = written.reduce((sum, chapter) => sum + chapter.wordCount, 0);

  const terms = agreementText({
    orgName: data.org.name,
    creatorName: data.creator.displayName ?? `@${data.creator.username}`,
    email: data.creator.contactEmail,
    products: [
      {
        title: product.title,
        priceCents: product.priceCents,
        currency: product.currency,
        splitCreatorBps: product.splitCreatorBps,
      },
    ],
  });

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:py-14">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <Mark className="size-8" />
          <span className="leading-none">
            <span className="block font-display text-[16px] font-semibold tracking-[-0.03em] text-fg">VistaBix</span>
            <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.16em] text-faint">{data.org.name}</span>
          </span>
        </div>
        <Badge tone="neutral">
          <Lock className="size-3" /> private link
        </Badge>
      </header>

      <div className="mt-8">
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href={`/c/${token}`}>
            <ArrowLeft /> Your portal
          </Link>
        </Button>
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-lime">Product review</p>
        <h1 className="mt-2 font-display text-[28px] font-semibold leading-tight tracking-[-0.035em] text-fg">{product.title}</h1>
        <p className="mt-2 text-[13.5px] leading-6 text-muted">{product.promise ?? product.subtitle ?? "No promise written yet."}</p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Badge tone={product.status === "review" ? "amber" : product.status === "published" ? "lime" : "neutral"}>
          {PRODUCT_STATUS_LABEL[product.status] ?? product.status}
        </Badge>
        <Badge tone={signed ? "lime" : "amber"}>{signed ? "terms signed" : "terms not signed"}</Badge>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-faint">
          {formatCurrency(product.priceCents, product.currency)} · your share {(product.splitCreatorBps / 100).toFixed(2)}%
        </span>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Meta label="Chapters written" value={`${written.length} of ${chapters.length}`} />
        <Meta label="Measured words" value={String(totalWords)} />
        <Meta label="Reading time" value={totalWords ? `${readingMinutes(totalWords)} min` : "—"} />
      </div>

      {product.status === "review" ? (
        <div className="mt-4">
          <Alert tone={signed ? "info" : "warning"} title={signed ? "This product is waiting for your decision" : "Read and sign the terms first"}>
            {signed
              ? "Approving tells the operator the product is accurate and ready to publish. Requesting changes sends it back with your note."
              : "The approval button is blocked until the partnership terms below are signed. That check runs on the server as well."}
          </Alert>
        </div>
      ) : null}

      <Card className="mt-6">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="size-4 text-lime" strokeWidth={1.75} aria-hidden />
                The product
              </CardTitle>
              <CardDescription>
                {chapters.length === 0
                  ? "No chapter exists yet."
                  : "Written by the operator in your voice. Your captions are cited, never invented."}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <a href={`/c/${token}/p/${product.id}/pdf`} target="_blank" rel="noopener noreferrer">
                  <Download className="mr-1.5 size-3.5" />
                  Download PDF
                </a>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {chapters.length === 0 ? (
            <p className="text-[12.5px] text-muted">Nothing has been written yet. Check back after the operator drafts the product.</p>
          ) : (
            chapters.map((chapter) => (
              <article key={chapter.id} className="border-t border-line pt-5 first:border-0 first:pt-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                  Chapter {chapter.position} · {chapter.wordCount} words
                </p>
                <h2 className="mt-1 font-display text-[18px] font-semibold text-fg">{chapter.title}</h2>
                {chapter.summary ? <p className="mt-1 text-[12px] text-muted">{chapter.summary}</p> : null}
                {chapter.content ? (
                  <div className="mt-3 whitespace-pre-wrap text-[13px] leading-7 text-fg/90">{chapter.content}</div>
                ) : (
                  <p className="mt-3 text-[12px] italic text-faint">Still empty. This chapter is not written yet.</p>
                )}
              </article>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <ScrollText className="size-4 text-lime" strokeWidth={1.75} aria-hidden />
              Partnership terms
            </CardTitle>
            <CardDescription>Version 2026-01. The exact text below is hashed when you sign.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <pre className="whitespace-pre-wrap rounded-lg border border-line bg-surface-2/40 p-4 font-sans text-[12px] leading-6 text-muted">
            {terms}
          </pre>

          {agreement?.signedAt ? (
            <div className="rounded-lg border border-lime/25 bg-lime/5 p-3.5 text-[12px] leading-5 text-lime">
              <p className="inline-flex items-center gap-1.5 font-semibold">
                <CheckCircle2 className="size-3.5" aria-hidden /> Signed by {agreement.signerName ?? "the creator"}
              </p>
              <p className="mt-1 font-mono text-[10.5px]">version {agreement.version} · {formatDateTime(agreement.signedAt)}</p>
              <p className="mt-1 break-all font-mono text-[10px] opacity-80">{agreement.documentHash}</p>
            </div>
          ) : (
            <SignAgreementForm
              action={signAgreementAction.bind(null, token, product.id)}
              defaultName={data.creator.displayName ?? ""}
            />
          )}
        </CardContent>
      </Card>

      {product.status === "review" ? (
        <Card className="mt-4">
          <CardHeader>
            <div>
              <CardTitle>Your decision</CardTitle>
              <CardDescription>Recorded against your creator record, with the time and the note.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ReviewActions token={token} productId={product.id} />
          </CardContent>
        </Card>
      ) : null}

      <footer className="mt-8 border-t border-line pt-5 text-[11px] leading-5 text-faint">
        <p>
          This link expires {formatDateTime(tokenRow.expiresAt)}. If something is wrong with your name or your share, do not
          sign — reply to the operator instead.
        </p>
      </footer>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-3.5">
      <p className="label">{label}</p>
      <p className="mt-1 font-display text-[17px] font-semibold text-fg">{value}</p>
    </div>
  );
}
