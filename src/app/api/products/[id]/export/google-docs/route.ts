import { withOrg } from "@/lib/db";
import { formatProductExport, readProductExport } from "@/lib/products/export";
import { exportToGoogleDocs } from "@/lib/integrations/google-docs";
import { insertAudit } from "@/lib/audit";
import { getWorkspace } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getWorkspace();
  if (!workspace) return Response.json({ error: "Sign in to export a product." }, { status: 401 });

  const result = await withOrg(workspace.org.id, async (tx) => {
    const exportData = await readProductExport(tx, workspace.org.id, id);
    if (!exportData) return null;

    const formatted = formatProductExport(exportData);
    const googleRes = await exportToGoogleDocs({
      title: `${exportData.product.title} (Vistabix)`,
      content: formatted,
    });

    if (googleRes.ok && googleRes.documentUrl) {
      await insertAudit(tx, {
        orgId: workspace.org.id,
        actorUserId: workspace.user.id,
        action: "product.exported",
        entityType: "product",
        entityId: exportData.product.id,
        metadata: { format: "google-docs", documentId: googleRes.documentId, url: googleRes.documentUrl },
      });
    }

    return googleRes;
  });

  if (!result) return Response.json({ error: "Product not found." }, { status: 404 });
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });

  return Response.json(result);
}
