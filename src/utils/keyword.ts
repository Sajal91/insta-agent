/**
 * Lenient confirmation matching. Because the follow-gate is honor-system anyway,
 * we bias heavily toward accepting a user's "I followed" reply rather than being
 * strict. We accept:
 *   - the configured keyword (case-insensitive, punctuation/emoji tolerant)
 *   - a built-in set of common affirmative variants
 *   - a check-mark emoji on its own
 */
const BUILT_IN_VARIANTS = new Set([
  'done',
  'done✅',
  'followed',
  'following',
  'follow',
  'followedyou',
  'followed✅',
  'did',
  'didit',
  'doneit',
  'yes',
  'yep',
  'yeah',
  'ok',
  'okay',
  'k',
  '✅',
  '✔',
  '✔️',
  '👍',
]);

/** Emoji that count as a confirmation even when surrounded by other text. */
const CONFIRM_EMOJI = ['✅', '✔️', '✔', '👍'];

/**
 * Normalize free-form comment text: lowercase, strip anything that isn't a
 * letter or digit (drops spaces, punctuation, most emoji). Keeps it comparable
 * against our keyword/variant set.
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

export function matchesConfirmation(text: string, keyword: string): boolean {
  const rawTrimmed = text.trim();
  if (rawTrimmed.length === 0) return false;

  // Direct emoji confirmation anywhere in the text.
  if (CONFIRM_EMOJI.some((e) => rawTrimmed.includes(e))) return true;

  const normalizedText = normalize(text);
  if (normalizedText.length === 0) return false;

  const normalizedKeyword = normalize(keyword);

  // Exact / substring match against the configured keyword.
  if (normalizedKeyword.length > 0 && normalizedText.includes(normalizedKeyword)) {
    return true;
  }

  // Built-in affirmative variants (exact match on the normalized whole text,
  // to avoid false positives from long sentences that merely contain "ok").
  if (BUILT_IN_VARIANTS.has(normalizedText)) return true;

  // Also accept when a short reply is *mostly* an affirmative token.
  const tokens = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  if (tokens.length <= 3 && tokens.some((t) => BUILT_IN_VARIANTS.has(t))) {
    return true;
  }

  return false;
}
