import { describe, expect, it } from "vitest";
import { isLockedSplit, splitForProductOrdinal } from "@/lib/splits";

describe("splitForProductOrdinal", () => {
  it("gives a creator's first product 6000/4000", () => {
    expect(splitForProductOrdinal(1)).toEqual({ creatorBps: 6000, operatorBps: 4000 });
  });

  it("gives every later product 5000/5000", () => {
    expect(splitForProductOrdinal(2)).toEqual({ creatorBps: 5000, operatorBps: 5000 });
    expect(splitForProductOrdinal(5)).toEqual({ creatorBps: 5000, operatorBps: 5000 });
  });

  it("rejects non-integer and non-positive ordinals", () => {
    expect(() => splitForProductOrdinal(0)).toThrow();
    expect(() => splitForProductOrdinal(-1)).toThrow();
    expect(() => splitForProductOrdinal(1.5)).toThrow();
    expect(() => splitForProductOrdinal(Number.NaN)).toThrow();
    expect(() => splitForProductOrdinal(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe("isLockedSplit", () => {
  it("accepts only the locked split for the ordinal", () => {
    expect(isLockedSplit(6000, 4000, 1)).toBe(true);
    expect(isLockedSplit(5000, 5000, 2)).toBe(true);
    expect(isLockedSplit(5000, 5000, 5)).toBe(true);
  });

  it("rejects client-supplied or mismatched basis points", () => {
    expect(isLockedSplit(5000, 5000, 1)).toBe(false);
    expect(isLockedSplit(6000, 4000, 2)).toBe(false);
    expect(isLockedSplit(5999, 4001, 1)).toBe(false);
    expect(isLockedSplit(5000, 5000, 0)).toBe(false);
  });
});
