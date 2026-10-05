import { formatEventDate } from "@/lib/format";
import { eventStats } from "@/lib/overview/summary";
import type { EventSummary } from "@/lib/overview/types";
import { EventPoster } from "./EventPoster";

/** The event page's head: the bill, then the name with date and venue, and the card rating on a plate. */
export function EventHeader({ event }: { event: EventSummary }) {
  const { cardRating } = eventStats(event);
  return (
    <header className="border-2 border-[var(--text)] bg-[var(--surface)]">
      <EventPoster event={event} size="lg" />
      <div className="flex items-center justify-between gap-4 border-t-2 border-[var(--text)] p-4 sm:p-5">
        <div className="min-w-0">
          <h1 className="display break-words text-2xl leading-tight sm:text-3xl">{event.name}</h1>
          <p className="mt-2 text-[var(--muted)]">
            <span className="font-semibold text-[var(--text)]">{formatEventDate(event.eventDate)}</span>
            {event.location && (
              <span className="block sm:inline">
                <span aria-hidden="true" className="hidden sm:inline">
                  {" · "}
                </span>
                {event.location}
              </span>
            )}
          </p>
        </div>
        {cardRating !== null && (
          <div className="shrink-0 text-center" role="img" aria-label={`Card rating ${cardRating.toFixed(1)} out of 5`}>
            <p
              aria-hidden="true"
              className={`scorebox h-14 w-[4.25rem] text-3xl ${cardRating >= 3.5 ? "scorebox-hot" : ""}`}
            >
              {cardRating.toFixed(1)}
            </p>
            <p aria-hidden="true" className="mt-1.5 text-xs text-[var(--muted)]">
              card rating
            </p>
          </div>
        )}
      </div>
    </header>
  );
}
