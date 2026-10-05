export const SEARCH_MIN_LENGTH = 2;
const SEARCH_MAX_LENGTH = 50;

/**
 * The text to search for: single spaces, bounded, and null when it is too short to search.
 * Pattern characters (% _ * and the backslash) are removed: no name contains them, and they must
 * not widen the search.
 */
export function cleanSearchTerm(raw: string): string | null {
  const term = raw
    .replace(/[%_*\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SEARCH_MAX_LENGTH)
    .trim();
  return term.length >= SEARCH_MIN_LENGTH ? term : null;
}

/** An ILIKE pattern for "contains `term`" (the term was cleaned, so it has no pattern characters). */
export function containsPattern(term: string): string {
  return `%${term}%`;
}
