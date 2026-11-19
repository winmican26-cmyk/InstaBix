/**
 * Templates are plain text with {{variables}}. Unknown variables are left visible
 * on purpose: a send with an unresolved placeholder should look wrong to the
 * operator rather than silently become an empty string.
 */
export type TemplateVars = Record<string, string>;

export const ALLOWED_VARIABLES = [
  "first_name",
  "username",
  "handle",
  "operator_name",
  "niche",
  "reel_title",
  "audience_insight",
  "reel_url",
  "product_idea",
  "calendly_url",
  "one_pager_url",
] as const;

export function renderTemplate(subject: string, body: string, vars: TemplateVars): { subject: string; body: string } {
  const replace = (input: string) =>
    input.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (match, key: string) => {
      const value = vars[key];
      return value !== undefined && value !== "" ? value : match;
    });

  return { subject: replace(subject), body: replace(body) };
}

export function unresolvedVariables(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gi)) {
    if (match[1]) found.add(match[1]);
  }
  return [...found];
}

export function lengthWithoutPlaceholders(text: string): number {
  return text.replace(/\{\{\s*[a-z_]+\s*\}\}/gi, "").trim().length;
}
