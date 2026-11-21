import { withOrg } from "@/lib/db";
import { readProductExport } from "@/lib/products/export";
import { generateProductPdf } from "@/lib/products/pdf";
import { insertAudit } from "@/lib/audit";
import { getWorkspace } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getWorkspace();
  if (!workspace) return Response.json({ error: "Sign in to export a product PDF." }, { status: 401 });

  const result = await withOrg(workspace.org.id, async (tx) => {
    const exportData = await readProductExport(tx, workspace.org.id, id);
    if (!exportData) return null;

    const pdfBuffer = generateProductPdf(exportData);

    await insertAudit(tx, {
      orgId: workspace.org.id,
      actorUserId: workspace.user.id,
      action: "product.exported",
      entityType: "product",
      entityId: exportData.product.id,
      metadata: { format: "pdf", sizeBytes: pdfBuffer.length },
    });

    return {
      title: exportData.product.title,
      buffer: pdfBuffer,
    };
  });

  if (!result) return Response.json({ error: "Product not found." }, { status: 404 });

  const filename = `${result.title.toLowerCase().replace(/[^a-z0-9_-]/g, "-")}.pdf`;

  return new Response(new Uint8Array(result.buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
