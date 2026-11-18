import { and, asc, eq } from "drizzle-orm";
import { withOrg } from "@/lib/db";
import { chapters, creatorAccounts, products } from "@/lib/db/schema";
import { getWorkspace } from "@/lib/auth/session";
import { insertAudit } from "@/lib/audit";
import { clientIp } from "@/lib/http";
import { formatCurrency } from "@/lib/utils";
import { slugify } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const workspace = await getWorkspace();
  if (!workspace) return Response.json({ error: "Sign in to export a product." }, { status: 401 });
  const { org, user } = workspace;
  const { id } = await params;

  const data = await withOrg(org.id, async (tx) => {
    const [product] = await tx
      .select()
      .from(products)
      .where(and(eq(products.id, id), eq(products.orgId, org.id)))
      .limit(1);
    if (!product) return null;

    const [creator] = await tx
      .select({ username: creatorAccounts.username, displayName: creatorAccounts.displayName })
      .from(creatorAccounts)
      .where(eq(creatorAccounts.id, product.creatorId))
      .limit(1);

    const chapterRows = await tx
      .select()
      .from(chapters)
      .where(eq(chapters.productId, product.id))
      .orderBy(asc(chapters.position));

    await insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: "product.exported",
      entityType: "product",
      entityId: product.id,
      metadata: { format: "markdown", chapters: chapterRows.length },
      ip: clientIp(request),
    });

    return { product, creator, chapters: chapterRows };
  });

  if (!data) return Response.json({ error: "Product not found in this workspace." }, { status: 404 });

  const { product, creator, chapters: chapterRows } = data;
  const body = [
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
  ]
    .filter((line) => line !== undefined)
    .join("\n");

  return new Response(body, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="${slugify(product.title) || "product"}.md"`,
      "cache-control": "no-store",
    },
  });
}
