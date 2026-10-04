import { CONFIG } from "@/lib/config";
import type { CardFight } from "./types";

type Options = { minStars: number; minCardPosition: number };

/** The rule itself, on the two public numbers it needs. */
export function isHiddenGemRating(
  stars: number,
  cardPosition: number,
  options: Options = CONFIG.hiddenGem,
): boolean {
  return stars >= options.minStars && cardPosition >= options.minCardPosition;
}

/** Derived only from stars and card position, so it reveals nothing extra. */
export function isHiddenGem(fight: CardFight, options: Options = CONFIG.hiddenGem): boolean {
  return fight.rating !== null && isHiddenGemRating(fight.rating.stars, fight.cardPosition, options);
}
