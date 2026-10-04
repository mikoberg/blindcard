/**
 * Up to two letters for a fighter's monogram: first and last word of the name, so
 * "Raul Rosas Jr." gives "RR": generational suffixes are skipped.
 */
const SUFFIXES = new Set(["jr", "jr.", "sr", "sr.", "ii", "iii", "iv"]);

export function initials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word !== "" && !SUFFIXES.has(word.toLowerCase()));
  if (words.length === 0) return "?";
  const letter = (word: string) => (Array.from(word.replace(/^[^\p{L}\p{N}]+/u, ""))[0] ?? "").toUpperCase();
  const first = letter(words[0] as string);
  const last = words.length > 1 ? letter(words[words.length - 1] as string) : "";
  return `${first}${last}` || "?";
}
