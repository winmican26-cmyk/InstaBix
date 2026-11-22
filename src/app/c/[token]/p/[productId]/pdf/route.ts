import { loadPortalData, resolvePortalToken } from "@/lib/portal";
import { generateProductPdf } from "@/lib/products/pdf";
import { productPdfPrivacyHeaders, productPdfResponse } from "@/lib/products/pdf-response";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string; productId: string }> }) {
  const { token, productId } = await params;
  const tokenRow = await resolvePortalToken(token);
  const portal = tokenRow ? await loadPortalData(tokenRow) : null;
  const product = portal?.products.find((entry) => entry.product.id === productId);

  if (!portal || !product) {
    return Response.json({ error: "Product not found." }, { status: 404, headers: productPdfPrivacyHeaders });
  }

  const buffer = generateProductPdf({
    product: product.product,
    creator: portal.creator,
    chapters: product.chapters,
  });
  return productPdfResponse(product.product.title, buffer);
}
