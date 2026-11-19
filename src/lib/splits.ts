/**
 * Locked split policy. The server always derives these values; no client-supplied
 * basis points are ever accepted. Tuple order is (creator, InstaBix).
 */

export type ProductSplit = { creatorBps: number; operatorBps: number };

const FIRST_PRODUCT_SPLIT: ProductSplit = { creatorBps: 6000, operatorBps: 4000 };
const STANDARD_SPLIT: ProductSplit = { creatorBps: 5000, operatorBps: 5000 };

/** Ordinal 1 (a creator's first product) is 6000/4000; every later product is 5000/5000. */
export function splitForProductOrdinal(ordinal: number): ProductSplit {
  if (!Number.isInteger(ordinal) || ordinal < 1) {
    throw new RangeError("Product ordinal must be a positive integer.");
  }
  return ordinal === 1 ? { ...FIRST_PRODUCT_SPLIT } : { ...STANDARD_SPLIT };
}

/** True only when the supplied basis points exactly match the locked split for the ordinal. */
export function isLockedSplit(creatorBps: number, operatorBps: number, ordinal: number): boolean {
  if (!Number.isInteger(ordinal) || ordinal < 1) return false;
  const expected = splitForProductOrdinal(ordinal);
  return creatorBps === expected.creatorBps && operatorBps === expected.operatorBps;
}
