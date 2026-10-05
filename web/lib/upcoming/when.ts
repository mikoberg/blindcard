const DAY_MS = 86_400_000;

/** Whole days from `today` (a UTC date) to an event date; 0 on the day itself. */
export function daysUntil(isoDate: string, today: Date): number {
  const event = Date.parse(`${isoDate}T00:00:00Z`);
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((event - start) / DAY_MS);
}

/** "today", "tomorrow", "in 6 days", "in 3 weeks", "in 2 months". */
export function countdownLabel(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 14) return `in ${days} days`;
  if (days < 60) return `in ${Math.round(days / 7)} weeks`;
  return `in ${Math.round(days / 30)} months`;
}
