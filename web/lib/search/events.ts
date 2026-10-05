import { foldName, SEARCH_MIN_LENGTH } from "@/lib/leaderboard/search";

/** An event found by the search: completed ones link to the card, announced ones to the preview. */
export interface EventSearchResult {
  name: string;
  date: string;
  href: string;
}

const MAX_WORDS = 4;

/**
 * The words to look for in an event name, folded like the stored `search_name` (migration 0021: case,
 * accents and punctuation ignored), each one searched on its own so that
 * "van pantoja" finds "UFC 331: Van vs. Pantoja 2". Folding drops every LIKE pattern character.
 * Words shorter than the minimum are ignored unless they are numbers: "331" is a fine search.
 */
export function eventSearchWords(raw: string): string[] {
  return foldName(raw)
    .split(" ")
    .filter((word) => word.length >= SEARCH_MIN_LENGTH || /^\d+$/.test(word))
    .slice(0, MAX_WORDS);
}

export function isEventSearchResult(value: unknown): value is EventSearchResult {
  const v = value as Record<string, unknown> | null;
  return (
    typeof v === "object" &&
    v !== null &&
    typeof v.name === "string" &&
    typeof v.date === "string" &&
    typeof v.href === "string" &&
    /^\/(?!\/)/.test(v.href)
  );
}
