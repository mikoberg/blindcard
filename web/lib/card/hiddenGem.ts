import { CONFIG } from "@/lib/config";
import type { CardFight } from "./types";

/** Derived only from stars and card position, so it reveals nothing extra. */
export function isHiddenGem(
  fight: CardFight,
  options: { minStars: number; minCardPosition: number } = CONFIG.hiddenGem,
): boolean {
  return (
    fight.rating !== null &&
    fight.rating.stars >= options.minStars &&
    fight.cardPosition >= options.minCardPosition
  );
}
