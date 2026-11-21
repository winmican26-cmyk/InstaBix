import { withOrg } from "@/lib/db";
import { readProductExport } from "@/lib/products/export";
import { verifyContentOriginality } from "@/lib/ai/plagiarism";
import { getWorkspace } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getWorkspace();
  if (!workspace) return Response.json({ error: "Sign in to verify originality." }, { status: 401 });

  const result = await withOrg(workspace.org.id, async (tx) => {
    const exportData = await readProductExport(tx, workspace.org.id, id);
    if (!exportData) return null;

    const allContent = [
      exportData.product.title,
      exportData.product.promise ?? "",
      ...exportData.chapters.map((c) => `${c.title}\n${c.summary ?? ""}\n${c.content ?? ""}`),
    ].join("\n\n");

    const auditResult = await verifyContentOriginality(allContent);
    return auditResult;
  });

  if (!result) return Response.json({ error: "Product not found." }, { status: 404 });
  return Response.json(result);
}
