import { formatEventDate } from "@/lib/format";
import type { EventSummary } from "@/lib/overview/types";
import { EventPoster } from "./EventPoster";

/** The event page's header: the overview's poster, with the event's date, name and place on it. */
export function EventHeader({ event }: { event: EventSummary }) {
  return (
    <header className="overflow-hidden rounded-lg border border-[var(--border)]">
      <EventPoster
        event={event}
        size="lg"
        header={<p className="text-base font-semibold text-[var(--text)]/85">{formatEventDate(event.eventDate)}</p>}
        footer={
          <>
            <h1 className="break-words font-[family-name:var(--font-display)] text-2xl font-bold leading-tight sm:text-3xl">
              {event.name}
            </h1>
            {event.location && <p className="text-[var(--text)]/85">{event.location}</p>}
          </>
        }
      />
    </header>
  );
}
