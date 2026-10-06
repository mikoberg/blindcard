/**
 * A fighter's official UFC ranking going INTO a bout (for a coming bout: today's ranking). Taken from
 * the ranking in force before the event, so it is pre-fight context like the record going in and
 * never says anything about a result. 0 = champion, 1 to 15 = the place in the division.
 */
export const CHAMPION = 0;
export const MAX_RANK = 15;

/** A rank from the database; anything unexpected is unknown, never a guess. */
export function toRank(value: unknown): number | null {
  const rank = typeof value === "string" ? Number(value) : value;
  if (typeof rank !== "number" || !Number.isInteger(rank)) return null;
  return rank >= CHAMPION && rank <= MAX_RANK ? rank : null;
}

/** Both sides of `fights.ranks`; a side that does not have the expected shape is unranked. */
export function toRanks(value: unknown): { a: number | null; b: number | null } | null {
  if (typeof value !== "object" || value === null) return null;
  const o = value as { a?: unknown; b?: unknown };
  const a = toRank(o.a);
  const b = toRank(o.b);
  return a === null && b === null ? null : { a, b };
}

/** What is shown: "C" for the champion, "#3" for the third place. */
export function rankText(rank: number): string {
  return rank === CHAMPION ? "C" : `#${rank}`;
}

/** What is said: the same, in words. */
export function rankSpoken(rank: number, when: "before" | "now"): string {
  const stand = when === "now" ? "Ranked" : "Ranked going into the fight:";
  return rank === CHAMPION
    ? `${when === "now" ? "Champion" : "Champion going into the fight"}`
    : `${stand} number ${rank} in the division`;
}
