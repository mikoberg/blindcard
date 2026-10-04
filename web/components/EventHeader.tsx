import { formatEventDate } from "@/lib/format";
import type { EventSummary } from "@/lib/overview/types";
import { EventPoster } from "./EventPoster";

/** The event page's header: the same poster as in the overview, with the event's name on it. */
export function EventHeader({ event }: { event: EventSummary }) {
  return (
    <header className="overflow-hidden rounded-lg border border-[var(--border)]">
      <EventPoster event={event} size="lg">
        <div className="relative p-5 pb-28 sm:p-6 sm:pb-28">
          <p className="text-base font-semibold text-[var(--text)]/85">{formatEventDate(event.eventDate)}</p>
          <h1 className="mt-1 break-words font-[family-name:var(--font-display)] text-4xl font-bold leading-[0.95] sm:text-6xl">
            {event.name}
          </h1>
          {event.location && <p className="mt-3 text-[var(--text)]/85">{event.location}</p>}
        </div>
      </EventPoster>
    </header>
  );
}
