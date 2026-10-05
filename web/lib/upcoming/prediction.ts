import type { BoutPrediction, UpcomingBout } from "./types";

/** An expected rating at or above this looks like a strong watch (same bar as a real 4.0). */
export const HIGH_EXPECTATION = 4;

/** One decimal, like every rating on the site. */
export function formatExpected(stars: number): string {
  return stars.toFixed(1);
}

/**
 * The expected card rating: the average of the expected ratings of the bouts, one decimal.
 * null unless at least half of the announced bouts have one (a short card says too little).
 */
export function expectedCardRating(bouts: readonly UpcomingBout[]): number | null {
  const stars = bouts.flatMap((b) => (b.prediction ? [b.prediction.stars] : []));
  if (stars.length === 0 || stars.length * 2 < bouts.length) return null;
  return Math.round((stars.reduce((sum, s) => sum + s, 0) / stars.length) * 10) / 10;
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
