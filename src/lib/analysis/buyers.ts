/**
 * Pure, deterministic buyer-panel validation. No server-only imports, no
 * database, no SDK calls. Error strings are stable and literal.
 */

export type BuyerDraft = { persona: string; objection: string; fix: string };

const COUNT_ERROR = "A buyer panel needs 3 to 5 distinct buyers.";
const PERSONA_ERROR = "Buyer personas must be distinct.";
const OBJECTION_ERROR = "Buyer objections must be distinct.";
const FIX_ERROR = "Every objection needs a concrete fix.";

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Trim every field, require 3..5 distinct buyers, and pair each objection with a fix. */
export function normalizeBuyerDrafts(
  drafts: BuyerDraft[],
): { ok: true; drafts: BuyerDraft[] } | { ok: false; error: string } {
  if (!Array.isArray(drafts) || drafts.length < 3 || drafts.length > 5) {
    return { ok: false, error: COUNT_ERROR };
  }

  const cleaned: BuyerDraft[] = drafts.map((draft) => ({
    persona: (draft.persona ?? "").trim(),
    objection: (draft.objection ?? "").trim(),
    fix: (draft.fix ?? "").trim(),
  }));

  if (cleaned.some((draft) => !draft.persona)) {
    return { ok: false, error: PERSONA_ERROR };
  }
  if (cleaned.some((draft) => !draft.objection)) {
    return { ok: false, error: OBJECTION_ERROR };
  }
  if (cleaned.some((draft) => !draft.fix)) {
    return { ok: false, error: FIX_ERROR };
  }

  const personas = new Set<string>();
  for (const draft of cleaned) {
    const key = draft.persona.toLowerCase();
    if (personas.has(key)) return { ok: false, error: PERSONA_ERROR };
    personas.add(key);
  }

  const objections = new Set<string>();
  for (const draft of cleaned) {
    const key = normalize(draft.objection);
    if (objections.has(key)) return { ok: false, error: OBJECTION_ERROR };
    objections.add(key);
  }

  return { ok: true, drafts: cleaned };
}
