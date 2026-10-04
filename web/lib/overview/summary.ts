import { isHiddenGemRating } from "@/lib/card/hiddenGem";
import type { CardEvent, CardFight } from "@/lib/card/types";
import type { EventStats, EventSummary } from "./types";

export function eventStats(event: EventSummary): EventStats {
  const stars = event.ratings.map((slot) => slot.stars);
  return {
    ratedCount: stars.length,
    bestStars: stars.length === 0 ? null : Math.max(...stars),
    hiddenGems: event.ratings.filter((slot) => isHiddenGemRating(slot.stars, slot.position)).length,
  };
}

/** Screen-reader text for the rating strip: counts and the best rating, nothing else. */
export function stripLabel(event: EventSummary): string {
  const { ratedCount, bestStars } = eventStats(event);
  if (bestStars === null) return "Ratings are on their way";
  return `${ratedCount} ${ratedCount === 1 ? "fight" : "fights"} rated, best ${bestStars.toFixed(1)} out of 5`;
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

/** The overview shape for an event page that already holds the event and its card. */
export function summaryFromCard(event: CardEvent, fights: readonly CardFight[]): EventSummary {
  return {
    id: event.id,
    slug: event.slug,
    name: event.name,
    eventDate: event.eventDate,
    location: event.location,
    ratings: fights
      .filter((fight) => fight.rating !== null)
      .map((fight) => ({ position: fight.cardPosition, stars: (fight.rating as { stars: number }).stars }))
      .sort((a, b) => a.position - b.position),
  };
}
