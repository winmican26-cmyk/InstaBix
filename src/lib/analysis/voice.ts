/**
 * Pure, deterministic voice checks. All matching is done on normalized text;
 * no phrases are ever invented or rewritten internally.
 */

export type VoiceProfile = {
  tone: string[];
  topPhrases: string[];
  signatureStories: string[];
  neverSays: string[];
};

const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

/** Trim, lowercase, collapse whitespace, then strip only edge punctuation. */
export function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(EDGE_PUNCTUATION, "");
}

/** Keep trimmed, deduped phrases that actually appear verbatim in the source. */
export function onlyVerbatimPhrases(phrases: string[], source: string[]): string[] {
  const joinedSource = normalizeText(source.join(" "));
  const kept: string[] = [];
  const seen = new Set<string>();

  for (const phrase of phrases) {
    const candidate = phrase.trim();
    if (seen.has(candidate)) continue;
    seen.add(candidate);

    const normalized = normalizeText(candidate);
    if (!normalized) continue;
    if (joinedSource.includes(normalized)) {
      kept.push(candidate);
    }
  }
  return kept;
}

/** Report banned/observed entries found in the text; an empty voice always passes. */
export function checkVoiceText(
  text: string,
  voice: VoiceProfile,
): { passed: boolean; banned: string[]; observed: string[] } {
  const normalized = normalizeText(text);
  const banned: string[] = [];
  const observed: string[] = [];

  for (const entry of voice.neverSays ?? []) {
    const needle = normalizeText(entry);
    if (needle && normalized.includes(needle)) {
      banned.push(entry.trim());
    }
  }
  for (const entry of voice.topPhrases ?? []) {
    const needle = normalizeText(entry);
    if (needle && normalized.includes(needle)) {
      observed.push(entry.trim());
    }
  }

  return { passed: banned.length === 0, banned, observed };
}
