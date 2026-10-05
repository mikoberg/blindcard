import { formatEventDate } from "@/lib/format";
import { eventStats } from "@/lib/overview/summary";
import type { EventSummary } from "@/lib/overview/types";
import { EventPoster } from "./EventPoster";

/** The event page's head: the bill, then the name, date, venue and card rating as fields on a form. */
export function EventHeader({ event }: { event: EventSummary }) {
  const { cardRating } = eventStats(event);
  return (
    <header className="border-2 border-[var(--text)] bg-[var(--surface)]">
      <EventPoster event={event} size="lg" />
      <div className="grid gap-x-8 gap-y-4 border-t-2 border-[var(--text)] p-4 sm:grid-cols-[1fr_auto_auto] sm:p-5">
        <div className="field min-w-0">
          <h1 className="display break-words text-2xl leading-tight sm:text-3xl">{event.name}</h1>
          <span className="field-label">Event</span>
        </div>
        <div className="field">
          <p className="display-tight text-lg">{formatEventDate(event.eventDate)}</p>
          <span className="field-label">Date</span>
        </div>
        {cardRating !== null && (
          <div className="field" role="img" aria-label={`Card rating ${cardRating.toFixed(1)} out of 5`}>
            <p aria-hidden="true" className="display-tight text-lg">
              {cardRating.toFixed(1)}
            </p>
            <span aria-hidden="true" className="field-label">
              Card rating
            </span>
          </div>
        )}
        {event.location && (
          <div className="field sm:col-span-3">
            <p className="display-tight text-lg">{event.location}</p>
            <span className="field-label">Venue</span>
          </div>
        )}
      </div>
    </header>
  );
}
