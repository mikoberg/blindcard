import { formatEventDate } from "@/lib/format";
import { eventStats } from "@/lib/overview/summary";
import type { EventSummary } from "@/lib/overview/types";
import { EventPoster } from "./EventPoster";

/** The event page's head: the bill, then the name, date, venue and the card rating. */
export function EventHeader({ event }: { event: EventSummary }) {
  const { cardRating } = eventStats(event);
  return (
    <header className="overflow-hidden rounded-lg bg-[var(--surface)]">
      <EventPoster event={event} size="lg" />
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 p-4 sm:p-6">
        <div className="min-w-0">
          <h1 className="display break-words text-2xl leading-tight sm:text-3xl">{event.name}</h1>
          <p className="mt-1 text-[var(--muted)]">
            {formatEventDate(event.eventDate)}
            {event.location ? `, ${event.location}` : ""}
          </p>
        </div>
        {cardRating !== null && (
          <div className="flex items-center gap-3" role="img" aria-label={`Card rating ${cardRating.toFixed(1)} out of 5`}>
            <p aria-hidden="true" className={`scorebox h-14 w-[4.25rem] text-3xl ${cardRating >= 3.5 ? "scorebox-hot" : ""}`}>
              {cardRating.toFixed(1)}
            </p>
            <p aria-hidden="true" className="text-sm leading-tight text-[var(--muted)]">
              card
              <br />
              rating
            </p>
          </div>
        )}
      </div>
    </header>
  );
}
