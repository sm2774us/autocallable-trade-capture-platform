/**
 * Scores how well a query matches a text as an in-order subsequence.
 * Consecutive characters and word starts score higher; no match is -1.
 *
 * @param query What the user typed.
 * @param text A candidate label.
 * @return A score (higher is better), or -1.
 */
export function fuzzyScore(query: string, text: string): number {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return 0;
  }
  const haystack = text.toLowerCase();
  let score = 0;
  let from = 0;
  let previous = -2;
  for (const ch of needle) {
    const at = haystack.indexOf(ch, from);
    if (at < 0) {
      return -1;
    }
    score += 1;
    if (at === previous + 1) {
      score += 3;
    }
    if (at === 0 || /[\s\-_/:]/.test(haystack[at - 1])) {
      score += 2;
    }
    previous = at;
    from = at + 1;
  }
  return score - haystack.length * 0.01;
}

/**
 * Predicate form for the command palette's filter input.
 *
 * @param value Candidate label.
 * @param search The query.
 * @return True when the query matches.
 */
export function fuzzyMatch(value: string, search: string): boolean {
  return fuzzyScore(search, value) >= 0;
}
