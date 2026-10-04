/** Result data that must never appear in anything served before an explicit Reveal. */
export const HTML_LEAK_PATTERNS: readonly RegExp[] = [
  /KO\/TKO/,
  /Doctor'?s Stoppage/i,
  /Could Not Continue/i,
  /Overturned/i,
  /Decision - (Unanimous|Split|Majority)/i,
  /\b\d{2} - \d{2}\b/, // a scorecard such as "29 - 28"
  /\bRound \d+, \d+:\d{2}\b/, // a finish time such as "Round 2, 1:38"
  /fight_results/,
  /end_round/,
  /end_time/,
  /winner/i,
  /ufcstats\.com/i,
];

/** The browser bundles may mention generic words, but never a method string or a table name. */
export const CHUNK_LEAK_PATTERNS: readonly RegExp[] = [
  /KO\/TKO/,
  /Doctor'?s Stoppage/i,
  /Could Not Continue/i,
  /Overturned/i,
  /Decision - (Unanimous|Split|Majority)/i,
  /fight_results/,
  /ufcstats\.com/i,
];

/** Returns the source of every pattern that matches. Empty means clean. */
export function findLeaks(text: string, patterns: readonly RegExp[]): string[] {
  return patterns.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
}
