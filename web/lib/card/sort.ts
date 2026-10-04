import type { CardFight, SortMode } from "./types";

/** Stars desc, then percentile desc, then card position asc. Unrated fights sort last. */
export function compareByRating(a: CardFight, b: CardFight): number {
  const starsA = a.rating?.stars ?? -1;
  const starsB = b.rating?.stars ?? -1;
  if (starsA !== starsB) return starsB - starsA;
  const percentileA = a.rating?.percentile ?? -1;
  const percentileB = b.rating?.percentile ?? -1;
  if (percentileA !== percentileB) return percentileB - percentileA;
  return a.cardPosition - b.cardPosition;
}

/** The only two sorts that exist. Anything else (duration, method) would leak results. */
export function sortFights(fights: readonly CardFight[], mode: SortMode): CardFight[] {
  const copy = [...fights];
  return mode === "rating"
    ? copy.sort(compareByRating)
    : copy.sort((a, b) => a.cardPosition - b.cardPosition);
}
