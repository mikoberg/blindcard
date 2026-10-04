/**
 * Tunable thresholds for the card page. The `revalidate` interval is NOT here: Next requires
 * it as a literal in each page file (300 seconds).
 */
export const CONFIG = {
  watchThese: { minStars: 4.0, maxItems: 3 },
  hiddenGem: { minStars: 4.0, minCardPosition: 6 },
} as const;
