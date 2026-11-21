import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { BookOpen, CheckCircle2, CreditCard, Lock, ShieldCheck } from "lucide-react";
import { db, withOrg } from "@/lib/db";
import { chapters, creatorAccounts, orgs, products } from "@/lib/db/schema";
import { stripeConfigured } from "@/lib/env";
import { Mark } from "@/components/brand/wordmark";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { readingMinutes } from "@/lib/text";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata: Metadata = { title: "Product" };

export default async function PublicProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { id } = await params;
  const { checkout } = await searchParams;
  if (!UUID.test(id)) notFound();

  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, id), eq(products.status, "published")))
    .limit(1);
  if (!product) notFound();

  const chapterRows = await db
    .select({
      id: chapters.id,
      position: chapters.position,
      title: chapters.title,
      summary: chapters.summary,
      wordCount: chapters.wordCount,
    })
    .from(chapters)
    .where(eq(chapters.productId, product.id))
    .orderBy(asc(chapters.position));

  const [creator] = await withOrg(product.orgId, (tx) =>
    tx
      .select({ username: creatorAccounts.username, displayName: creatorAccounts.displayName })
      .from(creatorAccounts)
      .where(eq(creatorAccounts.id, product.creatorId))
      .limit(1),
  );
  const [org] = await db.select({ name: orgs.name }).from(orgs).where(eq(orgs.id, product.orgId)).limit(1);

  const totalWords = chapterRows.reduce((sum, chapter) => sum + chapter.wordCount, 0);

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:py-14">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <Mark className="size-8" />
          <span className="leading-none">
            <span className="block font-display text-[16px] font-semibold tracking-[-0.03em] text-fg">VistaBix</span>
            <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.16em] text-faint">{org?.name ?? "Storefront"}</span>
          </span>
        </div>
        <Badge tone="neutral">
          <Lock className="size-3" /> secure checkout
        </Badge>
      </header>

      {checkout === "success" ? (
        <div className="mt-8">
          <Alert tone="info" title="Payment received">
            Stripe confirmed the checkout. The order and its split appear in the workspace ledger as soon as the signed
            webhook lands. This page is public, so it does not show the receipt; Stripe emails it to the buyer.
          </Alert>
        </div>
      ) : null}
      {checkout === "cancelled" ? (
        <div className="mt-8">
          <Alert tone="warning" title="Checkout cancelled">
            Nothing was charged. You can start again when you are ready.
          </Alert>
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-lime">
            {creator ? `with @${creator.username}` : "Product"}
          </p>
          <h1 className="mt-2 font-display text-[30px] font-semibold leading-tight tracking-[-0.035em] text-fg">{product.title}</h1>
          <p className="mt-3 text-[14px] leading-7 text-muted">{product.promise ?? product.subtitle ?? ""}</p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Badge tone="lime">published</Badge>
            <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-faint">
              {chapterRows.length} chapters · {totalWords} words
              {totalWords ? ` · ${readingMinutes(totalWords)} min read` : ""}
            </span>
          </div>

          <Card className="mt-6">
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="size-4 text-lime" strokeWidth={1.75} aria-hidden />
                  Contents
                </CardTitle>
                <CardDescription>Written with the creator, from their own material.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {chapterRows.length === 0 ? (
                <p className="px-5 py-6 text-[12.5px] text-muted">The chapter list is not available yet.</p>
              ) : (
                <ol className="divide-y divide-line/70">
                  {chapterRows.map((chapter) => (
                    <li key={chapter.id} className="flex items-start gap-3 px-5 py-3.5">
                      <span className="grid size-6 shrink-0 place-items-center rounded bg-surface-3 font-mono text-[10px] text-muted">
                        {chapter.position}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium text-fg">{chapter.title}</span>
                        {chapter.summary ? <span className="mt-0.5 block text-[11.5px] leading-5 text-muted">{chapter.summary}</span> : null}
                      </span>
                      <span className="ml-auto shrink-0 font-mono text-[10px] text-faint">{chapter.wordCount} w</span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>{formatCurrency(product.priceCents, product.currency)}</CardTitle>
                <CardDescription>One-time purchase. Lifetime access to this edition.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {stripeConfigured ? (
                <form method="post" action="/api/checkout">
                  <input type="hidden" name="productId" value={product.id} />
                  <Button type="submit" className="w-full">
                    <CreditCard /> Buy with Stripe
                  </Button>
                </form>
              ) : (
                <p className="rounded-md border border-amber/25 bg-amber/5 p-3 text-[12px] leading-5 text-amber">
                  Checkout is disabled because Stripe is not configured in this deployment. Nothing can be charged.
                </p>
              )}
              <ul className="space-y-1.5 text-[11.5px] leading-5 text-muted">
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-lime" aria-hidden /> Creator royalty is recorded on every
                  settled sale.
                </li>
                <li className="flex items-start gap-1.5">
                  <ShieldCheck className="mt-0.5 size-3 shrink-0 text-lime" aria-hidden /> Payment runs through Stripe. VistaBix
                  never sees card details.
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle className="text-[14px]">Why this exists</CardTitle>
                <CardDescription>Built with {creator?.displayName ?? (creator ? `@${creator.username}` : "the creator")}, not about them.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-[11.5px] leading-5 text-faint">
                Chapters are written from the creator&apos;s public captions and their own stated expertise. The revenue split
                shown in the workspace ledger is the one the creator signed.
              </p>
              <Button asChild variant="ghost" size="sm" className="mt-3 -ml-2">
                <Link href="/legal/privacy">Privacy</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <footer className="mt-10 border-t border-line pt-5 text-[11px] leading-5 text-faint">
        <p>
          Sold by {org?.name ?? "the workspace"} through VistaBix. Refunds follow the published policy; a refund reverses the
          creator and operator ledger lines exactly.
        </p>
      </footer>
    </div>
  );
}
