import Link from "next/link";
import { formatEventDate } from "@/lib/format";
import type { UpcomingEvent } from "@/lib/upcoming/types";
import { UpcomingCard } from "./UpcomingCard";

/** Cards shown in full on the home page; later events are listed under them. */
const SHOWN = 2;

/** The coming events, soonest first. Renders nothing when none is announced. */
export function UpcomingSection({ events, today }: { events: readonly UpcomingEvent[]; today: Date }) {
  if (events.length === 0) return null;
  const later = events.slice(SHOWN);
  return (
    <section aria-labelledby="upcoming">
      <h2 id="upcoming" className="display border-t-2 border-[var(--text)] pt-3 text-2xl sm:text-3xl">
        Upcoming
      </h2>
      <p className="mt-2 max-w-xl text-[var(--muted)]">
        Announced cards. Fights can still change before the event.
      </p>
      <ul className="mt-5 grid gap-5 sm:grid-cols-2">
        {events.slice(0, SHOWN).map((event) => (
          <li key={event.id}>
            <UpcomingCard event={event} today={today} />
          </li>
        ))}
      </ul>
      {later.length > 0 && (
        <ul className="mt-4 divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {later.map((event) => (
            <li key={event.id}>
              <Link
                href={`/upcoming/${event.slug}`}
                className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 py-2 hover:text-[var(--accent)]"
              >
                <span className="font-bold">{event.name}</span>
                <span className="text-sm text-[var(--muted)]">{formatEventDate(event.eventDate)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link
        href="/upcoming"
        className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4 hover:text-[var(--accent)]"
      >
        All announced cards
      </Link>
    </section>
  );
}
