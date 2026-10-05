/** A rating as shown: one decimal. Colours and labels use this value, never the unrounded one. */
export function roundRating(value: number): number {
  return Math.round(value * 10) / 10;
}

export function formatRating(value: number): string {
  return roundRating(value).toFixed(1);
}

/** 4.0 and up as shown: "4.0" is always highlighted, even if the average underneath is 3.96. */
export function isHighRating(value: number): boolean {
  return roundRating(value) >= 4;
}
