import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, FileText, Sparkles } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { listCreatorOptions, listProducts } from "@/lib/db/queries";
import { aiConfigured } from "@/lib/env";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR, TableShell } from "@/components/ui/table";
import { NewProductDialog } from "./new-product-dialog";
import { PRODUCT_STATUS_LABEL } from "@/lib/constants";
import { formatCurrency, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Product Studio" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "lime" | "violet" | "amber" | "neutral" | "info"> = {
  draft: "neutral",
  outline_pending: "amber",
  outline_approved: "info",
  generating: "violet",
  review: "amber",
  approved: "lime",
  published: "lime",
  paused: "neutral",
};

export default async function StudioPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { org } = await requireWorkspace();
  const params = await searchParams;
  const [products, creators] = await Promise.all([listProducts(org.id), listCreatorOptions(org.id)]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Product studio"
        title="Products"
        description="Outline, approval, chapters, citations, creator review. Every stage is a gate, not a suggestion."
        actions={<NewProductDialog creators={creators} defaultOpen={params.new === "1"} />}
      />

      {!aiConfigured ? (
        <p className="rounded-lg border border-amber/25 bg-amber/5 p-3.5 text-[12px] leading-5 text-amber">
          Anthropic is not configured, so outline generation is disabled. Products can still be created and written by hand —
          the workspace will never fabricate a draft.
        </p>
      ) : null}

      <Card>
        <CardContent className="p-0">
          {products.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No products yet"
              description="A product starts as a commercial frame and a real creator consent record. The outline comes from their own captions, never from a template library."
              action={creators.length ? <NewProductDialog creators={creators} /> : undefined}
            />
          ) : (
            <TableShell>
              <Table>
                <THead>
                  <TR>
                    <TH>Product</TH>
                    <TH>Creator</TH>
                    <TH>Status</TH>
                    <TH className="text-right">Price</TH>
                    <TH className="text-right">Split</TH>
                    <TH className="text-right">Chapters</TH>
                    <TH className="text-right">Words</TH>
                    <TH className="text-right">Updated</TH>
                    <TH className="text-right">
                      <span className="sr-only">Open</span>
                    </TH>
                  </TR>
                </THead>
                <TBody>
                  {products.map(({ product, creatorUsername, creatorName, chapterCount, wordCount }) => (
                    <TR key={product.id} className="hover:bg-surface-2/50">
                      <TD>
                        <Link href={`/studio/${product.id}`} className="group block min-w-0">
                          <span className="block truncate text-[13px] font-semibold text-fg group-hover:text-lime">{product.title}</span>
                          <span className="block truncate text-[11px] text-faint">{product.subtitle ?? "No subtitle yet"}</span>
                        </Link>
                      </TD>
                      <TD>
                        <span className="text-[12px] text-muted">@{creatorUsername}</span>
                        {creatorName ? <span className="ml-1 text-[11px] text-faint">{creatorName}</span> : null}
                      </TD>
                      <TD>
                        <Badge tone={STATUS_TONE[product.status] ?? "neutral"}>
                          {PRODUCT_STATUS_LABEL[product.status] ?? product.status}
                        </Badge>
                      </TD>
                      <TD className="text-right font-mono text-[12.5px]">{formatCurrency(product.priceCents, product.currency)}</TD>
                      <TD className="text-right font-mono text-[12px] text-muted">
                        {product.splitCreatorBps / 100}% / {product.splitOperatorBps / 100}%
                      </TD>
                      <TD className="text-right font-mono text-[12.5px]">{chapterCount}</TD>
                      <TD className="text-right font-mono text-[12.5px]">{wordCount}</TD>
                      <TD className="text-right font-mono text-[11px] text-faint">{timeAgo(product.updatedAt)}</TD>
                      <TD className="text-right">
                        <Button asChild variant="ghost" size="icon-sm" aria-label={`Open ${product.title}`}>
                          <Link href={`/studio/${product.id}`}>
                            <ArrowRight />
                          </Link>
                        </Button>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableShell>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: Sparkles, title: "Outline from evidence", body: "Generated from the creator's public captions and their own words, then approved by a person." },
          { icon: FileText, title: "Word count measured", body: "Counts are computed on save, not typed into a field. No 7,850-word fiction." },
          { icon: BookOpen, title: "Creator gate", body: "Publication requires review and a signed agreement, both stored with hashes." },
        ].map((item) => (
          <div key={item.title} className="rounded-lg border border-line bg-surface p-3.5">
            <p className="flex items-center gap-2 text-[12.5px] font-semibold text-fg">
              <item.icon className="size-3.5 text-lime" strokeWidth={1.75} aria-hidden />
              {item.title}
            </p>
            <p className="mt-1.5 text-[11.5px] leading-5 text-muted">{item.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
