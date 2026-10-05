import Link from "next/link";
import { formatEventDate } from "@/lib/format";
import { eventStats } from "@/lib/overview/summary";
import type { EventSummary } from "@/lib/overview/types";
import { EventPoster } from "./EventPoster";

/** One event in the overview: poster, name, date, and the card rating (average of its fight ratings). */
export function EventCard({ event, featured = false }: { event: EventSummary; featured?: boolean }) {
  const { cardRating, hiddenGems } = eventStats(event);
  return (
    <Link
      href={`/events/${event.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] transition-colors hover:border-[var(--accent)]"
    >
      <EventPoster event={event} size={featured ? "md" : "sm"} animate={featured} decorative />
      <div className="flex flex-1 items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          {event.mainEvent && (
            <p className="sr-only">
              Main event: {event.mainEvent.a} versus {event.mainEvent.b}
              {event.mainEvent.title ? ", title fight" : ""}
            </p>
          )}
          <h3
            className={`break-words font-[family-name:var(--font-display)] font-bold leading-tight ${featured ? "text-3xl" : "text-xl"}`}
          >
            {event.name}
          </h3>
          <p className="mt-1 text-sm text-[var(--muted)]">{formatEventDate(event.eventDate)}</p>
          {event.location && <p className="text-sm text-[var(--muted)]">{event.location}</p>}
          {cardRating === null && <p className="mt-2 text-sm text-[var(--muted)]">Ratings are on their way</p>}
          {hiddenGems > 0 && (
            <p className="mt-2 inline-block rounded-full bg-[var(--accent)] px-2.5 py-0.5 text-xs font-semibold text-[var(--accent-ink)]">
              {hiddenGems === 1 ? "1 hidden gem" : `${hiddenGems} hidden gems`}
            </p>
          )}
        </div>
        {cardRating !== null && (
          <div
            className="shrink-0 text-right"
            role="img"
            aria-label={`Card rating ${cardRating.toFixed(1)} out of 5`}
          >
            <p
              aria-hidden="true"
              className={`font-[family-name:var(--font-display)] font-bold leading-none tabular-nums ${cardRating >= 3.5 ? "text-[var(--accent)]" : ""} ${featured ? "text-4xl" : "text-3xl"}`}
            >
              {cardRating.toFixed(1)}
            </p>
            <p aria-hidden="true" className="mt-1 text-xs text-[var(--muted)]">
              card rating
            </p>
          </div>
        )}
      </div>
    </Link>
  );
}
