export type Split = {
  grossCents: number;
  feeCents: number;
  creatorCents: number;
  operatorCents: number;
  creatorBps: number;
  currency: string;
};

/**
 * Splits are computed on gross, rounded to the cent, and the operator absorbs the
 * rounding remainder so the two sides always sum to exactly the gross amount.
 */
export function computeSplit(grossCents: number, creatorBps: number, feeCents = 0, currency = "usd"): Split {
  if (!Number.isInteger(grossCents) || grossCents < 0) throw new Error("Gross amount must be a non-negative integer (cents).");
  if (!Number.isInteger(creatorBps) || creatorBps < 0 || creatorBps > 10_000) throw new Error("Split must be between 0 and 10000 basis points.");

  const creatorCents = Math.round((grossCents * creatorBps) / 10_000);
  const operatorCents = grossCents - creatorCents;
  return {
    grossCents,
    feeCents: Math.max(0, Math.min(feeCents, grossCents)),
    creatorCents,
    operatorCents,
    creatorBps,
    currency,
  };
}

export type LedgerLine = {
  account: "creator_payable" | "operator_revenue" | "processing_fee";
  direction: "credit" | "debit";
  amountCents: number;
  memo: string;
};

export function saleLines(split: Split, reference: string): LedgerLine[] {
  const lines: LedgerLine[] = [
    { account: "creator_payable", direction: "credit", amountCents: split.creatorCents, memo: `Creator share · ${reference}` },
    { account: "operator_revenue", direction: "credit", amountCents: split.operatorCents, memo: `Operator share · ${reference}` },
  ];
  if (split.feeCents > 0) {
    lines.push({
      account: "processing_fee",
      direction: "debit",
      amountCents: split.feeCents,
      memo: `Processing fee · ${reference}`,
    });
  }
  return lines;
}

/** A refund is the exact mirror of the sale lines, so balances return to zero. */
export function refundLines(split: Split, reference: string): LedgerLine[] {
  return saleLines(split, reference).map((line) => ({
    ...line,
    direction: line.direction === "credit" ? "debit" : "credit",
    memo: `Refund · ${line.memo}`,
  }));
}

export function netFor(lines: LedgerLine[], account: LedgerLine["account"]): number {
  return lines.reduce((sum, line) => {
    if (line.account !== account) return sum;
    return sum + (line.direction === "credit" ? line.amountCents : -line.amountCents);
  }, 0);
}

export function assertBalanced(split: Split): boolean {
  return split.creatorCents + split.operatorCents === split.grossCents;
}
