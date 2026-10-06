import Link from "next/link";
import type { UpcomingEvent } from "@/lib/upcoming/types";
import { UpcomingCard } from "./UpcomingCard";

/** Cards shown in full on the home page; the rest is on the Upcoming tab. */
const SHOWN = 2;

/** The next events, soonest first, with a link to all of them. Renders nothing when none is announced. */
export function UpcomingSection({ events, today }: { events: readonly UpcomingEvent[]; today: Date }) {
  if (events.length === 0) return null;
  const more = events.length - SHOWN;
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
      <Link
        href="/upcoming"
        className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4 hover:text-[var(--accent)]"
      >
        {more > 0 ? `All ${events.length} announced cards` : "All announced cards"}
      </Link>
    </section>
  );
}
