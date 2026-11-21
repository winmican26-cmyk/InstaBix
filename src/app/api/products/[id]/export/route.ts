import { withOrg } from "@/lib/db";
import { getWorkspace } from "@/lib/auth/session";
import { insertAudit } from "@/lib/audit";
import { clientIp } from "@/lib/http";
import { slugify } from "@/lib/utils";
import { formatProductExport, readProductExport } from "@/lib/products/export";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const workspace = await getWorkspace();
  if (!workspace) return Response.json({ error: "Sign in to export a product." }, { status: 401 });
  const { org, user } = workspace;
  const { id } = await params;

  const data = await withOrg(org.id, async (tx) => {
    const exportData = await readProductExport(tx, org.id, id);
    if (!exportData) return null;

    await insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: "product.exported",
      entityType: "product",
      entityId: exportData.product.id,
      metadata: { format: "markdown", chapters: exportData.chapters.length },
      ip: clientIp(request),
    });

    return exportData;
  });

  if (!data) return Response.json({ error: "Product not found in this workspace." }, { status: 404 });

  return new Response(formatProductExport(data), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="${slugify(data.product.title) || "product"}.md"`,
      "cache-control": "no-store",
    },
  });
}
