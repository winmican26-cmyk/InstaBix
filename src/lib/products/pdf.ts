import "server-only";
import { formatCurrency } from "@/lib/utils";
import type { readProductExport } from "./export";

function escapePdfText(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/**
 * Generates a clean, valid standard PDF document from product export data
 * without requiring heavy external binaries or chromium.
 */
export function generateProductPdf(data: NonNullable<Awaited<ReturnType<typeof readProductExport>>>): Buffer {
  const { product, creator, chapters } = data;

  const lines: string[] = [
    `VISTABIX PRODUCT SPECIFICATION`,
    `=============================`,
    ``,
    `TITLE: ${product.title}`,
    `CREATOR: ${creator?.displayName ?? (creator ? `@${creator.username}` : "Unknown Creator")}`,
    `PRICE: ${formatCurrency(product.priceCents, product.currency)}`,
    `SPLIT: Creator ${(product.splitCreatorBps / 100).toFixed(2)}% / Operator ${(product.splitOperatorBps / 100).toFixed(2)}%`,
    `STATUS: ${product.status.toUpperCase()}`,
    `EXPORT DATE: ${new Date().toISOString().split("T")[0]}`,
    ``,
    `PROMISE:`,
    product.promise ? `"${product.promise}"` : "(No promise specified)",
    ``,
    `TABLE OF CONTENTS:`,
    ...chapters.map((c) => `  ${c.position}. ${c.title}`),
    ``,
    `=============================`,
    `CHAPTER CONTENT & OUTLINES:`,
    `=============================`,
    ``,
  ];

  for (const ch of chapters) {
    lines.push(`--- CHAPTER ${ch.position}: ${ch.title.toUpperCase()} ---`);
    if (ch.summary) lines.push(`Summary: ${ch.summary}`);
    lines.push(``);
    lines.push(ch.content || "Draft content pending completion in studio.");
    lines.push(``);
  }

  // Construct valid PDF stream
  let streamContent = "BT\n/F1 10 Tf\n14 TL\n40 760 Td\n";
  for (const rawLine of lines) {
    const safeLine = escapePdfText(rawLine.substring(0, 100));
    streamContent += `(${safeLine}) '\n`;
  }
  streamContent += "ET";

  const streamLength = Buffer.byteLength(streamContent, "utf8");

  const pdfParts = [
    "%PDF-1.4\n",
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamContent}\nendstream\nendobj\n`,
    "xref\n0 6\n0000000000 65535 f \n",
    "0000000010 00000 n \n",
    "0000000060 00000 n \n",
    "0000000117 00000 n \n",
    "0000000228 00000 n \n",
    "0000000305 00000 n \n",
    "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n",
    `${380 + streamLength}\n%%EOF\n`,
  ];

  return Buffer.from(pdfParts.join(""), "utf8");
}
