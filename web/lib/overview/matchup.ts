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

/**
 * Font size in cqw (1% of the poster's width): as large as `maxCqw`, smaller for long names.
 * `charWidthEm` is the average width of a capital in the typeface the poster is set in.
 */
export function matchupFontSize(
  names: readonly string[],
  maxCqw: number,
  charWidthEm: number = CAPITAL_WIDTH_EM,
): number {
  const longest = Math.max(1, ...names.map((name) => name.length));
  const fitted = FILL / (longest * charWidthEm);
  return Math.round(Math.min(maxCqw, fitted) * 10) / 10;
}

/** Lower case without accents; also letters that do not decompose (ł, ø, đ, ß, æ, œ, ı). */
const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ł/g, "l")
    .replace(/ø/g, "o")
    .replace(/đ/g, "d")
    .replace(/ı/g, "i")
    .replace(/ß/g, "ss")
    .replace(/æ/g, "ae")
    .replace(/œ/g, "oe");

const tokens = (text: string): string[] => fold(text).match(/[a-z0-9]+/g) ?? [];

/** "Rosas Jr. vs. Barcelos" -> ["Rosas", "Barcelos"]; "Van vs. Pantoja 2" -> ["Van", "Pantoja"]. */
function namesFromEventName(eventName: string): [string, string] | null {
  const title = eventName.includes(":") ? eventName.slice(eventName.lastIndexOf(":") + 1) : eventName;
  const match = /^\s*(.+?)\s+vs\.?\s+(.+?)\s*$/i.exec(title);
  if (!match) return null;
  const clean = (part: string) =>
    part
      .replace(/\(.*?\)/g, "")
      .split(/\s+/)
      .filter((word) => word !== "" && !SUFFIXES.has(word.toLowerCase()) && !/^\d+$/.test(word))
      .join(" ")
      .trim();
  const left = clean(match[1] as string);
  const right = clean(match[2] as string);
  return left !== "" && right !== "" ? [left, right] : null;
}

/** Every word of `shortName` is a word of `fullName` ("Wang" is part of "Wang Cong"). */
function isPartOf(shortName: string, fullName: string): boolean {
  const have = new Set(tokens(fullName));
  const want = tokens(shortName);
  return want.length > 0 && want.every((word) => have.has(word));
}

/**
 * The two names to set on a poster. The event's own name ("Silva vs. Wang") already uses the
 * family names the promotion prints, which a rule on the fighter names gets wrong for names
 * written family name first. It is used only when each half belongs to one of the two main
 * event fighters; otherwise the family names are taken from the fighters' names.
 */
export function posterNames(eventName: string, a: string, b: string): [string, string] {
  const fromEvent = namesFromEventName(eventName);
  if (fromEvent) {
    const [left, right] = fromEvent;
    if (isPartOf(left, a) && isPartOf(right, b)) return [left, right];
    if (isPartOf(left, b) && isPartOf(right, a)) return [left, right];
  }
  return [surname(a), surname(b)];
}

/** The series part of an event name: "UFC 332: Silva vs. Wang" -> "UFC 332". */
export function eventLabel(eventName: string): string {
  const head = eventName.includes(":") ? eventName.slice(0, eventName.indexOf(":")) : eventName;
  return head.trim();
}

/** Font size in cqw for the label line: at most `maxCqw`, smaller for a long label. */
export function labelFontSize(label: string, maxCqw: number, charWidthEm = 0.52): number {
  const fitted = 62 / (Math.max(1, label.length) * charWidthEm);
  return Math.round(Math.min(maxCqw, fitted) * 10) / 10;
}
