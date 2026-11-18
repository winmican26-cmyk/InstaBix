import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, CheckCircle2, FileText, Lock, ScrollText } from "lucide-react";
import { Mark } from "@/components/brand/wordmark";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { PRODUCT_STATUS_LABEL } from "@/lib/constants";
import { loadPortalData, resolvePortalToken } from "@/lib/portal";
import { touchPortalToken } from "./actions";

export const metadata: Metadata = { title: "Creator portal" };
export const dynamic = "force-dynamic";

export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const tokenRow = await resolvePortalToken(token);
  if (!tokenRow) notFound();

  await touchPortalToken(tokenRow.id, tokenRow.orgId);
  const data = await loadPortalData(tokenRow);
  if (!data) notFound();

  const displayName = data.creator.displayName ?? `@${data.creator.username}`;
  const firstName = displayName.split(" ")[0] ?? displayName;
  const signedAgreements = data.products.filter((row) => row.agreement?.signedAt);

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:py-14">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <Mark className="size-8" />
          <span className="leading-none">
            <span className="block font-display text-[16px] font-semibold tracking-[-0.03em] text-fg">InstaBix</span>
            <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.16em] text-faint">{data.org.name}</span>
          </span>
        </div>
        <Badge tone="neutral">
          <Lock className="size-3" /> private link
        </Badge>
      </header>

      <div className="mt-10">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-lime">Creator portal</p>
        <h1 className="mt-2 font-display text-[30px] font-semibold leading-tight tracking-[-0.035em] text-fg">
          Hi {firstName}, this is your record.
        </h1>
        <p className="mt-3 max-w-xl text-[13.5px] leading-6 text-muted">
          {data.org.name} invited you to review and sign the products built with you. This link is personal to
          @{data.creator.username}. Do not forward it. It expires on {formatDate(tokenRow.expiresAt)}.
        </p>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <Summary label="Consent" value={data.creator.consentStatus === "granted" ? "Granted" : "Pending"} />
        <Summary label="Signed terms" value={`${signedAgreements.length} of ${data.products.length}`} />
        <Summary
          label="Awaiting your review"
          value={`${data.products.filter((row) => row.product.status === "review").length}`}
        />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="size-4 text-lime" strokeWidth={1.75} aria-hidden />
              Products
            </CardTitle>
            <CardDescription>
              Only products you are part of appear here. Prices and splits are read from the live record.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {data.products.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="Nothing has been built with you yet"
              description="When a product reaches the outline stage it appears here with its real terms."
            />
          ) : (
            <ul className="divide-y divide-line/70">
              {data.products.map((row) => (
                <li key={row.product.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-fg">{row.product.title}</p>
                      <p className="mt-0.5 text-[11.5px] text-muted">{row.product.subtitle ?? row.product.promise ?? "No subtitle yet."}</p>
                    </div>
                    <Badge tone={row.product.status === "review" ? "amber" : row.product.status === "published" ? "lime" : "neutral"}>
                      {PRODUCT_STATUS_LABEL[row.product.status] ?? row.product.status}
                    </Badge>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-[11.5px] sm:grid-cols-4">
                    <div>
                      <dt className="label">Price</dt>
                      <dd className="mt-0.5 text-fg">{formatCurrency(row.product.priceCents, row.product.currency)}</dd>
                    </div>
                    <div>
                      <dt className="label">Your share</dt>
                      <dd className="mt-0.5 text-fg">{(row.product.splitCreatorBps / 100).toFixed(2)}%</dd>
                    </div>
                    <div>
                      <dt className="label">Chapters</dt>
                      <dd className="mt-0.5 text-fg">{row.chapters.length}</dd>
                    </div>
                    <div>
                      <dt className="label">Terms</dt>
                      <dd className="mt-0.5 text-fg">
                        {row.agreement?.signedAt ? `signed ${formatDate(row.agreement.signedAt)}` : "not signed"}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button asChild variant="secondary" size="sm">
                      <Link href={`/c/${token}/p/${row.product.id}`}>
                        <FileText /> Open product
                      </Link>
                    </Button>
                    {row.product.status === "review" ? (
                      <span className="text-[11px] text-amber">Waiting for your review</span>
                    ) : null}
                    {row.agreement?.signedAt ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-lime">
                        <CheckCircle2 className="size-3" aria-hidden /> terms signed
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <ScrollText className="size-4 text-lime" strokeWidth={1.75} aria-hidden />
              Signatures on file
            </CardTitle>
            <CardDescription>Each signature stores the exact document hash and the signer's name.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {signedAgreements.length === 0 ? (
            <p className="px-5 py-5 text-[12px] text-muted">
              Nothing signed yet. Open a product to read and sign its terms.
            </p>
          ) : (
            <ul className="divide-y divide-line/70">
              {signedAgreements.map((row) => (
                <li key={row.agreement!.id} className="flex flex-wrap items-center gap-2 px-5 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] text-fg">{row.product.title}</span>
                    <span className="block font-mono text-[10px] uppercase tracking-[0.08em] text-faint">
                      v{row.agreement!.version} · hash {row.agreement!.documentHash.slice(0, 16)}… ·{" "}
                      {formatDateTime(row.agreement!.signedAt)}
                    </span>
                  </span>
                  <Badge tone="lime">signed</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <footer className="mt-8 space-y-2 border-t border-line pt-5 text-[11px] leading-5 text-faint">
        <p>
          Questions or a correction? Reply to the email that brought you here, or write to the operator of {data.org.name}.
          Your consent can be revoked in writing at any time.
        </p>
        <p className="font-mono">
          creator {data.creator.id.slice(0, 8)} · link expires {formatDateTime(tokenRow.expiresAt)}
        </p>
      </footer>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-3.5">
      <p className="label">{label}</p>
      <p className="mt-1 font-display text-[17px] font-semibold text-fg">{value}</p>
    </div>
  );
}
