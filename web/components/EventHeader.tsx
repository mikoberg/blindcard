import type { CardEvent } from "@/lib/card/types";
import { formatEventDate } from "@/lib/format";

export function EventHeader({ event }: { event: CardEvent }) {
  return (
    <header>
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
        {formatEventDate(event.eventDate)}
      </p>
      <h1 className="mt-1 break-words font-[family-name:var(--font-display)] text-4xl font-bold leading-none sm:text-5xl">
        {event.name}
      </h1>
      {event.location && <p className="mt-2 text-[var(--muted)]">{event.location}</p>}
    </header>
  );
}
