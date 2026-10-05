const MAX_NAME = 80;

/** A name that is safe to put in a search: no control characters, bounded. */
function clean(name: string): string | null {
  const text = name.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
  return text.length > 0 ? text : null;
}

/**
 * A YouTube search for the fight: fighter names and year, nothing else. We link to the search
 * (no embedded player, no thumbnail, no video title), so the card itself shows no result.
 */
export function watchUrl(fighterA: string, fighterB: string, year: string | number): string | null {
  const a = clean(fighterA);
  const b = clean(fighterB);
  const y = String(year);
  if (a === null || b === null || !/^\d{4}$/.test(y)) return null;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${a} vs ${b} full fight ${y}`)}`;
}
