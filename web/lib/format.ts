import type { CardEvent } from "./card/types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/**
 * "2026-09-26" -> "Sat 26 Sep 2026". Built from UTC parts by hand: an event date has no time
 * zone, and Intl abbreviations differ between ICU versions.
 */
export function formatEventDate(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    throw new RangeError(`not an ISO date: ${isoDate}`);
  }
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`not a valid date: ${isoDate}`);
  }
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function groupEventsByYear(
  events: readonly CardEvent[],
): { year: string; events: CardEvent[] }[] {
  const groups: { year: string; events: CardEvent[] }[] = [];
  for (const event of events) {
    const year = event.eventDate.slice(0, 4);
    const last = groups[groups.length - 1];
    if (last && last.year === year) last.events.push(event);
    else groups.push({ year, events: [event] });
  }
  return groups;
}
