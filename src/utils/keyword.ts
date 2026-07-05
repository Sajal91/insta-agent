/**
 * Case-insensitive keyword gating. A comment "matches" if its text contains any
 * of the accepted keywords (substring match, case-insensitive, trimmed).
 *
 * Kept lenient on purpose: e.g. keyword "Interested" matches "I'm interested!",
 * "INTERESTED", "interested??".
 */
export function containsAnyKeyword(text: string, keywords: string[]): boolean {
  if (keywords.length === 0) return true; // no gate configured -> accept all
  const haystack = text.toLowerCase();
  return keywords.some((kw) => {
    const needle = kw.trim().toLowerCase();
    return needle.length > 0 && haystack.includes(needle);
  });
}

/** Parse a comma/newline separated keyword string into a trimmed, non-empty list. */
export function parseKeywordList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
