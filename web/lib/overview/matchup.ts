/** The main event as poster type: family names, sized so the longest one fits the poster. */

const SUFFIXES = new Set(["jr", "jr.", "sr", "sr.", "ii", "iii", "iv"]);
const PARTICLES = new Set(["da", "de", "del", "della", "di", "do", "dos", "du", "la", "le", "van", "von", "der", "den", "bin", "al", "el"]);

/** "Raul Rosas Jr." -> "Rosas", "Mike De La Torre" -> "De La Torre", "Rongzhu" -> "Rongzhu". */
export function surname(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word !== "" && !SUFFIXES.has(word.toLowerCase()));
  if (words.length === 0) return "";
  let start = words.length - 1;
  while (start > 0 && PARTICLES.has((words[start - 1] as string).toLowerCase())) start -= 1;
  return words.slice(start).join(" ");
}

/** Average width of a condensed capital, in em. Used to fit a name to the poster's width. */
const CAPITAL_WIDTH_EM = 0.47;
/** Share of the poster's width the longest name may fill. */
const FILL = 84;

/** Font size in cqw (1% of the poster's width): as large as `maxCqw`, smaller for long names. */
export function matchupFontSize(names: readonly string[], maxCqw: number): number {
  const longest = Math.max(1, ...names.map((name) => name.length));
  const fitted = FILL / (longest * CAPITAL_WIDTH_EM);
  return Math.round(Math.min(maxCqw, fitted) * 10) / 10;
}
