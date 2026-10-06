/**
 * Known limitations of this scanner:
 * - /winner/i and /\b\d{2} - \d{2}\b/ can false-positive on harmless text such as
 *   "Winners Circle" or "Sep 26 - 27". If that ever happens, narrow the pattern with evidence;
 *   never delete it.
 * - The Open Graph image is a PNG, so its text cannot be scanned here. It is one static,
 *   generic image (see app/opengraph-image.tsx).
 */

/** Result data that must never appear in anything served before an explicit Reveal. */
export const HTML_LEAK_PATTERNS: readonly RegExp[] = [
  /KO\/TKO/,
  /Doctor(&#x27;|&#39;|')?s Stoppage/i, // React escapes the apostrophe in text nodes
  /\bSubmission\b/,
  /\bwins\b/, // the reveal headline "<name> wins"
  /\bNo contest\b/i,
  /\bDQ\b/,
  /\bDraw\b/, // the reveal headline for a draw (case-sensitive: the formatter's exact word)
  /endRound|endTimeSeconds|end_time_seconds/,
  /"outcome"/,
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
  /Fight of the Night|Performance of the Night|\bFOTN\b|\bPOTN\b/i, // bonuses
  /"bonuses"/, // the reveal JSON key; the client bundle holds it legitimately, so HTML only
  /"method"/, // the reveal JSON key; HTML only, for the same reason
];

/** The bonus wording: a fighter's page shows how many of each bonus they have earned in total. */
const BONUS_WORDING = HTML_LEAK_PATTERNS.find((pattern) => pattern.source.includes("Fight of the Night"));

/**
 * The same patterns for a fighter's own page and the fighters list: they may carry the bonus wording,
 * because they show the career totals of the two bonuses and can order by them (CLAUDE.md). Everything else is still checked; no other page may use it.
 */
export const FIGHTER_PAGE_HTML_LEAK_PATTERNS: readonly RegExp[] = HTML_LEAK_PATTERNS.filter(
  (pattern) => pattern !== BONUS_WORDING,
);

/**
 * The browser bundles may mention generic words, but never a method string or a table name.
 * The words wins / Submission / No contest / DQ / outcome / endRound are NOT listed here:
 * lib/reveal/format.ts and the reveal types legitimately contain them in the client code.
 */
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
