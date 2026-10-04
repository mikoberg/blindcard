import { CONFIG } from "@/lib/config";
import { compareByRating } from "./sort";
import type { CardFight } from "./types";

export function watchThese(
  fights: readonly CardFight[],
  options: { minStars: number; maxItems: number } = CONFIG.watchThese,
): CardFight[] {
  return fights
    .filter((fight) => fight.rating !== null && fight.rating.stars >= options.minStars)
    .sort(compareByRating)
    .slice(0, options.maxItems);
}
