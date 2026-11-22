import "server-only";
import { formatCurrency } from "@/lib/utils";
import type { readProductExport } from "./export";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 48;
const FONT_SIZE = 10;
const LINE_HEIGHT = 14;
const LINES_PER_PAGE = Math.floor((PAGE_HEIGHT - 2 * MARGIN) / LINE_HEIGHT);
// Courier uses a fixed 600-unit advance width for each encoded glyph.
const COLUMNS = Math.floor((PAGE_WIDTH - 2 * MARGIN) / (FONT_SIZE * 0.6));
const WIN_ANSI_EXTENSIONS = "€\0‚ƒ„…†‡ˆ‰Š‹Œ\0Ž\0\0‘’“”•–—˜™š›œ\0žŸ";

function encodePdfLine(line: string): string {
  return Array.from(line.normalize("NFC"), (character) => {
    const code = character.codePointAt(0)!;
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) return character;
    const extension = WIN_ANSI_EXTENSIONS.indexOf(character);
    if (extension >= 0 && code !== 0) return String.fromCharCode(0x80 + extension);
    // Show unsupported characters by code point rather than dropping them.
    return `[U+${code.toString(16).toUpperCase().padStart(4, "0")}]`;
  }).join("");
}

function wrapPdfLines(text: string): string[] {
  return text.split(/\r\n|[\n\r\u2028\u2029]/).flatMap((sourceLine) => {
    const line = encodePdfLine(sourceLine.replace(/\t/g, "    "));
    const wrapped: string[] = [];
    let start = 0;
    while (line.length - start > COLUMNS) {
      const limit = start + COLUMNS;
      const space = line.lastIndexOf(" ", limit - 1);
      // Use a character break for URLs and long unbroken words.
      const end = space > start ? space + 1 : limit;
      wrapped.push(line.slice(start, end));
      start = end;
    }
    wrapped.push(line.slice(start));
    return wrapped;
  });
}

function writePdf(objects: string[]): Buffer {
  // Object syntax and hex-encoded text are ASCII, so string lengths are byte lengths.
  const header = "%PDF-1.4\n";
  const parts = [header];
  let byteOffset = header.length;
  const xref = ["0000000000 65535 f \n"];
  objects.forEach((body, index) => {
    const object = `${index + 1} 0 obj\n${body}\nendobj\n`;
    xref.push(`${String(byteOffset).padStart(10, "0")} 00000 n \n`);
    parts.push(object);
    byteOffset += object.length;
  });
  parts.push(
    `xref\n0 ${xref.length}\n${xref.join("")}`,
    `trailer\n<< /Size ${xref.length} /Root 1 0 R >>\nstartxref\n${byteOffset}\n%%EOF\n`,
  );
  return Buffer.from(parts.join(""), "ascii");
}

/** Generates a printable product export without an external renderer. */
export function generateProductPdf(data: NonNullable<Awaited<ReturnType<typeof readProductExport>>>): Buffer {
  const { product, creator, chapters } = data;
  const lines = [
    "VISTABIX PRODUCT SPECIFICATION",
    "=============================",
    "",
    `TITLE: ${product.title}`,
    `CREATOR: ${creator?.displayName ?? (creator ? `@${creator.username}` : "Unknown Creator")}`,
    `PRICE: ${formatCurrency(product.priceCents, product.currency)}`,
    `SPLIT: Creator ${(product.splitCreatorBps / 100).toFixed(2)}% / Operator ${(product.splitOperatorBps / 100).toFixed(2)}%`,
    `STATUS: ${product.status.toUpperCase()}`,
    `EXPORT DATE: ${new Date().toISOString().slice(0, 10)}`,
    "",
    "PROMISE:",
    product.promise ? `"${product.promise}"` : "(No promise specified)",
    "",
    "TABLE OF CONTENTS:",
    ...chapters.map((chapter) => `  ${chapter.position}. ${chapter.title}`),
    "",
    "=============================",
    "CHAPTER CONTENT & OUTLINES:",
    "=============================",
    "",
  ];

  for (const chapter of chapters) {
    lines.push(`--- CHAPTER ${chapter.position}: ${chapter.title.toUpperCase()} ---`);
    if (chapter.summary) lines.push(`Summary: ${chapter.summary}`);
    lines.push("", chapter.content || "This chapter is unwritten.", "");
  }

  const textLines = lines.flatMap(wrapPdfLines);
  const kids: string[] = [];
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "", // Filled after the page objects are allocated.
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>",
  ];

  for (let start = 0; start < textLines.length; start += LINES_PER_PAGE) {
    const pageId = objects.length + 1;
    const streamId = pageId + 1;
    const pageLines = textLines.slice(start, start + LINES_PER_PAGE);
    const text = pageLines.map((line, index) => {
      const hex = Buffer.from(line, "latin1").toString("hex");
      return `<${hex}> ${index === 0 ? "Tj" : "'"}\n`;
    }).join("");
    const stream = `BT\n/F1 ${FONT_SIZE} Tf\n${LINE_HEIGHT} TL\n${MARGIN} ${PAGE_HEIGHT - MARGIN} Td\n${text}ET\n`;
    kids.push(`${pageId} 0 R`);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${streamId} 0 R >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
    );
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${kids.length} >>`;
  return writePdf(objects);
}
