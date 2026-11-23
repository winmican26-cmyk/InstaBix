import "server-only";
import { and, asc, eq } from "drizzle-orm";
import type { Tx } from "@/lib/db";
import { chapters, creatorAccounts, products } from "@/lib/db/schema";
import { formatCurrency } from "@/lib/utils";

export async function readProductExport(tx: Tx, orgId: string, productId: string) {
  const [product] = await tx
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.orgId, orgId)))
    .limit(1);
  if (!product) return null;

  const [creator] = await tx
    .select({ username: creatorAccounts.username, displayName: creatorAccounts.displayName })
    .from(creatorAccounts)
    .where(and(eq(creatorAccounts.id, product.creatorId), eq(creatorAccounts.orgId, orgId), eq(creatorAccounts.consentStatus, "granted")))
    .limit(1);

  const chapterRows = await tx
    .select()
    .from(chapters)
    .where(and(eq(chapters.productId, product.id), eq(chapters.orgId, orgId)))
    .orderBy(asc(chapters.position));

  return { product, creator, chapters: chapterRows };
}

export function formatProductExport({ product, creator, chapters: chapterRows }: NonNullable<Awaited<ReturnType<typeof readProductExport>>>) {
  return [
    `# ${product.title}`,
    "",
    product.promise ? `> ${product.promise}` : "",
    "",
    `- Creator: ${creator?.displayName ?? (creator ? `@${creator.username}` : "unknown")}`,
    `- Price: ${formatCurrency(product.priceCents, product.currency)}`,
    `- Split: creator ${(product.splitCreatorBps / 100).toFixed(2)}% / operator ${(product.splitOperatorBps / 100).toFixed(2)}%`,
    `- Status: ${product.status}`,
    `- Exported: ${new Date().toISOString()}`,
    "",
    ...chapterRows.flatMap((chapter) => [
      `## ${chapter.position}. ${chapter.title}`,
      "",
      chapter.summary ?? "",
      "",
      chapter.content ?? "_This chapter is not written yet._",
      "",
    ]),
  ].join("\n");
}
