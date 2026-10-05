import type { BoutPrediction, UpcomingBout } from "./types";

/** An expected rating at or above this looks like a strong watch (same bar as a real 4.0). */
export const HIGH_EXPECTATION = 4;

/** One decimal, like every rating on the site. */
export function formatExpected(stars: number): string {
  return stars.toFixed(1);
}

/** At least this expected rating to be pointed out on an event tile. */
export const LOOK_OUT_MIN = 3.5;

/**
 * The bouts that promise the most, best first: at most `limit`, and only those expected at
 * LOOK_OUT_MIN or more. A card average was tried and dropped: it hardly differs between cards.
 */
export function lookOutFor(bouts: readonly UpcomingBout[], limit = 2): UpcomingBout[] {
  return bouts
    .filter((b) => b.prediction !== null && b.prediction.stars >= LOOK_OUT_MIN)
    .sort((x, y) => (y.prediction?.stars ?? 0) - (x.prediction?.stars ?? 0) || x.position - y.position)
    .slice(0, limit);
}

/** What the expectation rests on, in words. */
export function basisSentence(basis: BoutPrediction["basis"]): string {
  switch (basis) {
    case "both":
      return "Based on the earlier rated fights of both fighters and where this bout sits on the card.";
    case "one":
      return "Only one fighter has earlier rated fights, so this leans on that fighter and on the card.";
    case "none":
      return "Neither fighter has earlier rated fights here, so this only reflects the card and the division.";
  }
}

/** "+0.3" or "-0.2" stars. */
export function formatAmount(amount: number): string {
  const rounded = Math.round(amount * 10) / 10;
  return `${rounded > 0 ? "+" : rounded < 0 ? "\u2212" : ""}${Math.abs(rounded).toFixed(1)}`;
}
