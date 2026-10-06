import Link from "next/link";
import { formatEventDate } from "@/lib/format";
import { eventStats } from "@/lib/overview/summary";
import type { EventSummary } from "@/lib/overview/types";
import { ClassicBadge } from "./ClassicBadge";
import { EventPoster } from "./EventPoster";

/** One event in the overview: a slip with the bill, the date and the card rating (average of its fight ratings). */
export function EventCard({ event, featured = false }: { event: EventSummary; featured?: boolean }) {
  const { cardRating, classics, hiddenGems } = eventStats(event);
  return (
    <Link
      href={`/events/${event.slug}`}
      className="slip group flex h-full flex-col overflow-hidden border-2 border-[var(--text)] bg-[var(--surface)]"
    >
      <EventPoster event={event} size={featured ? "md" : "sm"} animate={featured} decorative />
      <div className="flex flex-1 items-stretch justify-between gap-3 border-t-2 border-[var(--text)] p-4">
        <div className="flex min-w-0 flex-col">
          {event.mainEvent && (
            <p className="sr-only">
              Main event: {event.mainEvent.a} versus {event.mainEvent.b}
              {event.mainEvent.title ? ", title fight" : ""}
            </p>
          )}
          <h3
            className={`break-words display-tight leading-tight group-hover:text-[var(--accent)] ${featured ? "text-2xl" : "text-lg"}`}
          >
            {event.name}
          </h3>
          <p className="mt-1 text-sm text-[var(--muted)]">{formatEventDate(event.eventDate)}</p>
          {event.location && <p className="text-sm text-[var(--muted)]">{event.location}</p>}
          {cardRating === null && <p className="mt-2 text-sm text-[var(--muted)]">Ratings are on their way</p>}
          {(classics > 0 || hiddenGems > 0) && (
            <p className="mt-auto flex flex-wrap items-center gap-2 pt-3">
              {classics > 0 && <ClassicBadge label={classics === 1 ? "1 classic" : `${classics} classics`} />}
              {hiddenGems > 0 && (
                <span className="border-2 border-[var(--accent)] px-2 py-0.5 text-xs font-bold text-[var(--accent)]">
                  {hiddenGems === 1 ? "1 hidden gem" : `${hiddenGems} hidden gems`}
                </span>
              )}
            </p>
          )}
        </div>
        {cardRating !== null && (
          <div
            className="shrink-0 self-start text-center"
            role="img"
            aria-label={`Card rating ${cardRating.toFixed(1)} out of 5`}
          >
            <p
              aria-hidden="true"
              className={`scorebox ${cardRating >= 3.5 ? "scorebox-hot" : ""} ${featured ? "h-14 w-[4.25rem] text-3xl" : "h-12 w-14 text-2xl"}`}
            >
              {cardRating.toFixed(1)}
            </p>
            <p aria-hidden="true" className="mt-1.5 text-xs text-[var(--muted)]">
              card rating
            </p>
          </div>
        )}
      </div>
    </Link>
  );
}
