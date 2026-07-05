/**
 * Ultra-simple placeholder substitution. Replaces every `{{key}}` with the
 * matching value from `vars`. Unknown placeholders are left untouched so a typo
 * in a template is visible rather than silently blanked out.
 *
 * No templating engine on purpose (v1) — plain string replace is enough.
 */
export function render(
  template: string,
  vars: Record<string, string | undefined | null>,
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key: string) => {
    const value = vars[key];
    return value === undefined || value === null ? match : String(value);
  });
}
