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

/** Letters that do not split into a base letter and an accent. */
const SPECIAL_LETTERS: Readonly<Record<string, string>> = {
  ß: "ss",
  æ: "ae",
  œ: "oe",
  đ: "d",
  ð: "d",
  ø: "o",
  ł: "l",
  ı: "i",
};

/**
 * The same folding as `public.fold_name` in the database (migration 0020): lower case, accents
 * removed, apostrophes dropped, anything else that is not a letter or digit becomes one space.
 * "Sean O’Malley", "sean o'malley" and "SEAN OMALLEY" all fold to "sean omalley". A test keeps the two
 * in step.
 */
export function foldName(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ßæœđðøłı]/g, (letter) => SPECIAL_LETTERS[letter] ?? letter)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’ʼ‘`´]/g, "")
    .replace(/[^a-z0-9\u0080-￿]+/g, " ")
    .trim();
}

/**
 * An ILIKE pattern on the folded name for "contains `term`", or null when nothing is left to search
 * for after folding (a term of only apostrophes, say, would match everybody). The term was cleaned,
 * and folding removes every pattern character.
 */
export function containsPattern(term: string): string | null {
  const folded = foldName(term);
  return folded.length >= SEARCH_MIN_LENGTH ? `%${folded}%` : null;
}
