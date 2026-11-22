import "server-only";

export const productPdfPrivacyHeaders = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
};

export function productPdfResponse(title: string, buffer: Buffer) {
  const filename = `${title.toLowerCase().replace(/[^a-z0-9_-]/g, "-")}.pdf`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      ...productPdfPrivacyHeaders,
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
