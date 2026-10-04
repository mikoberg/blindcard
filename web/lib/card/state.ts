import type { CardFight } from "./types";

export type CardStatus = "empty" | "pending" | "rated";

/** empty: no fights listed; pending: fights but no score yet; rated: at least one score. */
export function cardStatus(fights: readonly CardFight[]): CardStatus {
  if (fights.length === 0) return "empty";
  return fights.some((fight) => fight.rating !== null) ? "rated" : "pending";
}
