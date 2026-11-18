export function wordCount(text: string | null | undefined): number {
  if (!text) return 0;
  const matches = text.trim().match(/[A-Za-z0-9'’-]+/g);
  return matches ? matches.length : 0;
}

export function readingMinutes(words: number, wordsPerMinute = 220): number {
  if (words <= 0) return 0;
  return Math.max(1, Math.round(words / wordsPerMinute));
}

export function excerpt(text: string | null | undefined, length = 180): string {
  if (!text) return "";
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > length ? `${clean.slice(0, length - 1).trimEnd()}…` : clean;
}
