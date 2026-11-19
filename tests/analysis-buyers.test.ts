import { describe, expect, it } from "vitest";
import { normalizeBuyerDrafts, type BuyerDraft } from "@/lib/analysis/buyers";

// Literal expectations, deliberately independent of the implementation.
function threeValid(): BuyerDraft[] {
  return [
    { persona: "Busy founder", objection: "No time to test", fix: "Offer a 10-minute setup" },
    { persona: "Skeptical buyer", objection: "Worried about cost", fix: "Show a price breakdown" },
    { persona: "Small creator", objection: "Too complex", fix: "Provide a guided first run" },
  ];
}

describe("normalizeBuyerDrafts", () => {
  it("returns trimmed drafts in order for a valid three-buyer panel", () => {
    const drafts: BuyerDraft[] = [
      { persona: "  Busy founder  ", objection: " No time to test ", fix: " Offer a 10-minute setup " },
      { persona: "Skeptical buyer", objection: "Worried about cost", fix: "Show a price breakdown" },
      { persona: "Small creator", objection: "Too complex", fix: "Provide a guided first run" },
    ];
    expect(normalizeBuyerDrafts(drafts)).toEqual({
      ok: true,
      drafts: [
        { persona: "Busy founder", objection: "No time to test", fix: "Offer a 10-minute setup" },
        { persona: "Skeptical buyer", objection: "Worried about cost", fix: "Show a price breakdown" },
        { persona: "Small creator", objection: "Too complex", fix: "Provide a guided first run" },
      ],
    });
  });

  it("accepts a five-buyer panel", () => {
    const drafts: BuyerDraft[] = [
      ...threeValid(),
      { persona: "Fourth buyer", objection: "Fourth objection", fix: "Fix four" },
      { persona: "Fifth buyer", objection: "Fifth objection", fix: "Fix five" },
    ];
    const result = normalizeBuyerDrafts(drafts);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.drafts).toHaveLength(5);
  });

  it("rejects panels outside 3 to 5 buyers", () => {
    const error = { ok: false, error: "A buyer panel needs 3 to 5 distinct buyers." };
    expect(normalizeBuyerDrafts([])).toEqual(error);
    expect(normalizeBuyerDrafts(threeValid().slice(0, 2))).toEqual(error);
    expect(normalizeBuyerDrafts([...threeValid(), ...threeValid()])).toEqual(error);
  });

  it("rejects duplicate personas case-insensitively", () => {
    const drafts: BuyerDraft[] = [
      { persona: "Busy founder", objection: "One", fix: "Fix one" },
      { persona: "busy FOUNDER", objection: "Two", fix: "Fix two" },
      { persona: "Small creator", objection: "Three", fix: "Fix three" },
    ];
    expect(normalizeBuyerDrafts(drafts)).toEqual({
      ok: false,
      error: "Buyer personas must be distinct.",
    });
  });

  it("rejects duplicate objections after normalization", () => {
    const drafts: BuyerDraft[] = [
      { persona: "A", objection: "No  time to test", fix: "Fix one" },
      { persona: "B", objection: "no time to test", fix: "Fix two" },
      { persona: "C", objection: "Different", fix: "Fix three" },
    ];
    expect(normalizeBuyerDrafts(drafts)).toEqual({
      ok: false,
      error: "Buyer objections must be distinct.",
    });
  });

  it("rejects an objection without a concrete fix", () => {
    const drafts: BuyerDraft[] = [
      { persona: "A", objection: "One", fix: "Fix one" },
      { persona: "B", objection: "Two", fix: "   " },
      { persona: "C", objection: "Three", fix: "Fix three" },
    ];
    expect(normalizeBuyerDrafts(drafts)).toEqual({
      ok: false,
      error: "Every objection needs a concrete fix.",
    });
  });

  it("rejects empty persona and empty objection fields", () => {
    expect(
      normalizeBuyerDrafts([
        { persona: "  ", objection: "One", fix: "Fix one" },
        { persona: "B", objection: "Two", fix: "Fix two" },
        { persona: "C", objection: "Three", fix: "Fix three" },
      ]),
    ).toEqual({ ok: false, error: "Buyer personas must be distinct." });

    expect(
      normalizeBuyerDrafts([
        { persona: "A", objection: "  ", fix: "Fix one" },
        { persona: "B", objection: "Two", fix: "Fix two" },
        { persona: "C", objection: "Three", fix: "Fix three" },
      ]),
    ).toEqual({ ok: false, error: "Buyer objections must be distinct." });
  });

  it("does not mutate the input drafts", () => {
    const drafts: BuyerDraft[] = [
      { persona: "  A  ", objection: " One ", fix: " Fix one " },
      { persona: "B", objection: "Two", fix: "Fix two" },
      { persona: "C", objection: "Three", fix: "Fix three" },
    ];
    normalizeBuyerDrafts(drafts);
    expect(drafts[0]).toEqual({ persona: "  A  ", objection: " One ", fix: " Fix one " });
  });
});
