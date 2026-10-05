export const SEARCH_MIN_LENGTH = 2;
const SEARCH_MAX_LENGTH = 50;

/** The text to search for: single spaces, bounded, and null when it is too short to search. */
export function cleanSearchTerm(raw: string): string | null {
  const term = raw.replace(/\s+/g, " ").trim().slice(0, SEARCH_MAX_LENGTH);
  return term.length >= SEARCH_MIN_LENGTH ? term : null;
}

/** An ILIKE pattern for "contains `term`", with the pattern characters of the term escaped. */
export function containsPattern(term: string): string {
  return `%${term.replace(/[\%_]/g, "\$&")}%`;
}
