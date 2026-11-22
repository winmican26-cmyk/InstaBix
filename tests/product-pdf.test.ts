import { expect, it, vi } from "vitest";
import { generateProductPdf } from "@/lib/products/pdf";

vi.mock("server-only", () => ({}));

it("writes all pages, Swedish text, and exact PDF offsets", () => {
  const date = new Date("2026-01-01T00:00:00Z");
  const longToken = "abcdefghijklmnopqrstuvwxyz".repeat(15);
  const rows = Array.from({ length: 135 }, (_, index) => `Text line ${index}`);
  const pdf = generateProductPdf({
    product: {
      id: "product",
      orgId: "workspace",
      creatorId: "creator",
      title: "Från idé till färdig bok",
      subtitle: null,
      promise: null,
      priceCents: 4900,
      currency: "sek",
      splitCreatorBps: 6000,
      splitOperatorBps: 4000,
      status: "draft",
      stripeProductId: null,
      stripePriceId: null,
      whopProductId: null,
      createdAt: date,
      updatedAt: date,
    },
    creator: { username: "creator", displayName: "Åsa Öberg" },
    chapters: [{
      id: "chapter",
      orgId: "workspace",
      productId: "product",
      position: 1,
      title: "Så börjar du",
      summary: null,
      content: [longToken, ...rows, "A\u030Asa sa “blåbär” – (färdigt) \\ ö."].join("\r\n"),
      wordCount: 0,
      createdAt: date,
    }],
  }).toString("ascii");

  expect(pdf).toContain("/Count 4");
  expect(pdf).toContain("/Encoding /WinAnsiEncoding");
  const lines = Array.from(pdf.matchAll(/^<([0-9a-f]*)> (?:Tj|')$/gm), ([, hex]) =>
    Buffer.from(hex!, "hex").toString("latin1"),
  );
  const firstRow = lines.indexOf(rows[0]!);
  expect(lines.slice(firstRow - 5, firstRow).join("")).toBe(longToken);
  expect(lines.slice(firstRow, firstRow + rows.length)).toEqual(rows);
  expect(lines[firstRow + rows.length]).toBe("Åsa sa \x93blåbär\x94 \x96 (färdigt) \\ ö.");
  expect(Math.max(...lines.map((line) => line.length))).toBeLessThanOrEqual(86);

  const xrefOffset = Number(pdf.match(/startxref\n(\d+)\n%%EOF/)?.[1]);
  const xref = pdf.slice(xrefOffset);
  expect(xref.startsWith("xref\n")).toBe(true);
  const entries = Array.from(xref.matchAll(/^(\d{10}) 00000 n $/gm));
  expect(entries).toHaveLength(11);
  entries.forEach(([, offset], index) => {
    expect(pdf.slice(Number(offset)).startsWith(`${index + 1} 0 obj\n`)).toBe(true);
  });

  const streams = Array.from(pdf.matchAll(/\/Length (\d+) >>\nstream\n([\s\S]*?)endstream/g));
  expect(streams).toHaveLength(4);
  for (const [, length, stream] of streams) {
    expect(Buffer.byteLength(stream!, "ascii")).toBe(Number(length));
  }
});
