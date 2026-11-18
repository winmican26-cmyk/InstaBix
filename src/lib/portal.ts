import "server-only";
import { and, asc, desc, eq, gt, inArray } from "drizzle-orm";
import { withOrg, withPortalToken } from "@/lib/db";
import {
  agreements,
  chapters,
  creatorAccounts,
  drafts,
  orgs,
  portalTokens,
  products,
} from "@/lib/db/schema";
import { sha256 } from "@/lib/crypto";

export type PortalTokenRow = typeof portalTokens.$inferSelect;

/** Resolves a portal link by its hash. Only that one row is visible to the query. */
export async function resolvePortalToken(rawToken: string): Promise<PortalTokenRow | null> {
  if (!rawToken || rawToken.length < 20 || rawToken.length > 200) return null;
  const tokenHash = sha256(rawToken);
  return withPortalToken(tokenHash, async (tx) => {
    const [row] = await tx
      .select()
      .from(portalTokens)
      .where(and(eq(portalTokens.tokenHash, tokenHash), gt(portalTokens.expiresAt, new Date())))
      .limit(1);
    return row ?? null;
  });
}

export type PortalData = {
  org: { id: string; name: string; slug: string };
  creator: typeof creatorAccounts.$inferSelect;
  products: {
    product: typeof products.$inferSelect;
    chapters: (typeof chapters.$inferSelect)[];
    agreement: typeof agreements.$inferSelect | null;
    draft: typeof drafts.$inferSelect | null;
  }[];
};

export async function loadPortalData(token: PortalTokenRow): Promise<PortalData | null> {
  const scoped = await withOrg(token.orgId, async (tx) => {
    const [org] = await tx.select({ id: orgs.id, name: orgs.name, slug: orgs.slug }).from(orgs).where(eq(orgs.id, token.orgId)).limit(1);
    const [creator] = await tx
      .select()
      .from(creatorAccounts)
      .where(and(eq(creatorAccounts.id, token.creatorId), eq(creatorAccounts.orgId, token.orgId)))
      .limit(1);
    if (!org || !creator) return null;

    const productRows = await tx
      .select()
      .from(products)
      .where(and(eq(products.creatorId, creator.id), inArray(products.status, ["outline_approved", "review", "approved", "published", "paused"])))
      .orderBy(desc(products.updatedAt));

    const ids = productRows.map((row) => row.id);
    const chapterRows = ids.length
      ? await tx.select().from(chapters).where(inArray(chapters.productId, ids)).orderBy(asc(chapters.position))
      : [];
    const agreementRows = await tx.select().from(agreements).where(eq(agreements.creatorId, creator.id)).orderBy(desc(agreements.createdAt));
    const draftRows = ids.length
      ? await tx.select().from(drafts).where(inArray(drafts.productId, ids)).orderBy(desc(drafts.createdAt))
      : [];

    return {
      org,
      creator,
      products: productRows.map((product) => ({
        product,
        chapters: chapterRows.filter((chapter) => chapter.productId === product.id),
        agreement:
          agreementRows.find((agreement) => agreement.productId === product.id) ??
          agreementRows.find((agreement) => agreement.productId === null) ??
          null,
        draft: draftRows.find((draft) => draft.productId === product.id) ?? null,
      })),
    };
  });

  return scoped;
}

/** Plain-language summary of what the creator is signing. Every number is real. */
export function agreementText(input: {
  orgName: string;
  creatorName: string;
  email: string | null;
  products: { title: string; priceCents: number; currency: string; splitCreatorBps: number }[];
}): string {
  const lines = input.products.map(
    (product) =>
      `• ${product.title} — ${(product.priceCents / 100).toFixed(2)} ${product.currency.toUpperCase()}, creator share ${(
        product.splitCreatorBps / 100
      ).toFixed(2)}%`,
  );
  return [
    `Partnership terms between ${input.orgName} and ${input.creatorName}.`,
    input.email ? `Contact of record: ${input.email}.` : "No contact email is on file.",
    "",
    "The creator confirms that:",
    "1. They created or have the right to use all material supplied for this product.",
    "2. Their name, likeness and public content may be used only for the products listed below.",
    "3. Revenue is split exactly as listed, calculated in cents on each settled sale, and reported in the ledger.",
    "4. They may revoke this permission in writing at any time; already settled sales keep their original split.",
    "",
    lines.length ? "Products in scope:" : "No product is in scope yet.",
    ...lines,
  ].join("\n");
}
