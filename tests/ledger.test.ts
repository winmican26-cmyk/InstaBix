import { describe, expect, it } from "vitest";
import { assertBalanced, computeSplit, netFor, refundLines, saleLines } from "@/lib/ledger";

describe("computeSplit", () => {
  it("splits 60/40 to the cent for a $49 sale", () => {
    const split = computeSplit(4900, 6000);
    expect(split.creatorCents).toBe(2940);
    expect(split.operatorCents).toBe(1960);
    expect(assertBalanced(split)).toBe(true);
  });

  it("never loses a cent to rounding", () => {
    for (const gross of [1, 7, 99, 101, 1999, 3333, 12345]) {
      for (const bps of [6000, 5000, 3333, 9999]) {
        const split = computeSplit(gross, bps);
        expect(split.creatorCents + split.operatorCents).toBe(gross);
      }
    }
  });

  it("rejects invalid input", () => {
    expect(() => computeSplit(-1, 6000)).toThrow();
    expect(() => computeSplit(1000, 12_000)).toThrow();
  });
});

describe("ledger lines", () => {
  const split = computeSplit(4900, 6000, 172);
  const sale = saleLines(split, "order_1");
  const refund = refundLines(split, "order_1");

  it("credits both parties and records the processing fee", () => {
    expect(netFor(sale, "creator_payable")).toBe(2940);
    expect(netFor(sale, "operator_revenue")).toBe(1960);
    expect(netFor(sale, "processing_fee")).toBe(-172);
  });

  it("mirrors exactly on refund", () => {
    const combined = [...sale, ...refund];
    expect(netFor(combined, "creator_payable")).toBe(0);
    expect(netFor(combined, "operator_revenue")).toBe(0);
    expect(netFor(combined, "processing_fee")).toBe(0);
  });
});
