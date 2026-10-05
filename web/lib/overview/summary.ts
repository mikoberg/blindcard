import { isHiddenGemRating } from "@/lib/card/hiddenGem";
import type { CardEvent, CardFight } from "@/lib/card/types";
import type { EventStats, EventSummary, MainEvent } from "./types";

export function eventStats(event: EventSummary): EventStats {
  const stars = event.ratings.map((slot) => slot.stars);
  return {
    ratedCount: stars.length,
    cardRating: stars.length === 0 ? null : Math.round((stars.reduce((sum, s) => sum + s, 0) / stars.length) * 10) / 10,
    hiddenGems: event.ratings.filter((slot) => isHiddenGemRating(slot.stars, slot.position)).length,
  };
}

/** Screen-reader text for the rating strip: counts and the card rating, nothing else. */
export function stripLabel(event: EventSummary): string {
  const { ratedCount, cardRating } = eventStats(event);
  if (cardRating === null) return "Ratings are on their way";
  return `${ratedCount} ${ratedCount === 1 ? "fight" : "fights"} rated, card rating ${cardRating.toFixed(1)} out of 5`;
}

/**
 * Events ranked by card rating, best first. Ties go to the card with more rated fights, then to
 * the newer event. Events without any rating come last (newest first).
 */
export function rankByCardRating(events: readonly EventSummary[]): EventSummary[] {
  const scored = events.map((event) => ({ event, ...eventStats(event) }));
  return scored
    .sort(
      (a, b) =>
        (b.cardRating ?? -1) - (a.cardRating ?? -1) ||
        b.ratedCount - a.ratedCount ||
        b.event.eventDate.localeCompare(a.event.eventDate) ||
        a.event.id.localeCompare(b.event.id),
    )
    .map((row) => row.event);
}

export function summariesByYear(
  events: readonly EventSummary[],
): { year: string; events: EventSummary[] }[] {
  const groups: { year: string; events: EventSummary[] }[] = [];
  for (const event of events) {
    const year = event.eventDate.slice(0, 4);
    const last = groups[groups.length - 1];
    if (last && last.year === year) last.events.push(event);
    else groups.push({ year, events: [event] });
  }
  return groups;
}

function mainEventOf(fights: readonly CardFight[]): MainEvent | null {
  const first = [...fights].sort((a, b) => a.cardPosition - b.cardPosition)[0];
  if (!first) return null;
  return { a: first.fighterA.name, b: first.fighterB.name, title: first.isTitleFight };
}

/** The overview shape for an event page that already holds the event and its card. */
export function summaryFromCard(event: CardEvent, fights: readonly CardFight[]): EventSummary {
  return {
    id: event.id,
    slug: event.slug,
    name: event.name,
    eventDate: event.eventDate,
    location: event.location,
    mainEvent: mainEventOf(fights),
    ratings: fights
      .filter((fight) => fight.rating !== null)
      .map((fight) => ({ position: fight.cardPosition, stars: (fight.rating as { stars: number }).stars }))
      .sort((a, b) => a.position - b.position),
  };
}
