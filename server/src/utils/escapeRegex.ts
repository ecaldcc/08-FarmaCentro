/** Escapes user text before it is used inside a regular expression (prevents ReDoS/regex injection). */
export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
