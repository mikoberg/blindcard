import Link from "next/link";
import { formatEventDate } from "@/lib/format";
import { eventLabel, posterNames } from "@/lib/overview/matchup";
import { formatExpected, lookOutFor } from "@/lib/upcoming/prediction";
import type { UpcomingEvent } from "@/lib/upcoming/types";
import { countdownLabel, daysUntil } from "@/lib/upcoming/when";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** The two family names to set on a card, from the main event when it is announced. */
export function headliners(event: UpcomingEvent): [string, string] | null {
  const main = event.bouts[0];
  return main ? posterNames(event.name, main.a.name, main.b.name) : null;
}

/** A tear-off date block: the day large, the month under it. */
export function DateBlock({ isoDate }: { isoDate: string }) {
  const month = MONTHS[Number(isoDate.slice(5, 7)) - 1] ?? "";
  return (
    <div
      aria-hidden="true"
      className="redact flex w-[4.25rem] shrink-0 flex-col items-center justify-center py-3 text-center"
    >
      <span className="display text-3xl leading-none">{Number(isoDate.slice(8, 10))}</span>
      <span className="mt-1 text-xs font-extrabold">{month}</span>
    </div>
  );
}

/** One upcoming event in the overview: date, headliners, place and how far away it is. */
export function UpcomingCard({ event, today }: { event: UpcomingEvent; today: Date }) {
  const names = headliners(event);
  const days = daysUntil(event.eventDate, today);
  const title = event.bouts.some((b) => b.position <= 2 && b.isTitleFight);
  const watch = lookOutFor(event.bouts);
  return (
    <Link
      href={`/upcoming/${event.slug}`}
      className="slip group flex h-full gap-4 border-2 border-[var(--text)] bg-[var(--surface)] p-4"
    >
      <DateBlock isoDate={event.eventDate} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-extrabold text-[var(--muted)]">{eventLabel(event.name)}</p>
        <h3 className="display-tight break-words text-xl leading-tight group-hover:text-[var(--accent)] sm:text-2xl">
          {names ? (
            <>
              {names[0]} <span className="text-base font-bold text-[var(--accent)]">vs</span> {names[1]}
            </>
          ) : (
            event.name
          )}
        </h3>
        <p className="sr-only">
          {event.name}, {formatEventDate(event.eventDate)}
        </p>
        {event.location && <p className="mt-1 text-sm text-[var(--muted)]">{event.location}</p>}
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="font-bold text-[var(--accent)]">{countdownLabel(days)}</span>
          <span className="text-[var(--muted)]">
            {event.bouts.length > 0 ? `${event.bouts.length} bouts announced` : "Card not announced yet"}
          </span>
          {title && <span className="redact px-1.5 text-xs font-bold leading-5">Title fight</span>}
        </p>
        {watch.length > 0 && (
          <p className="mt-3 text-sm">
            <span className="text-[var(--muted)]">Look out for </span>
            {watch.map((bout, index) => {
              const [a, b] = posterNames(event.name, bout.a.name, bout.b.name);
              return (
                <span key={bout.id}>
                  {index > 0 && <span className="text-[var(--muted)]">, </span>}
                  <span className="font-bold">
                    {a} vs {b}
                  </span>{" "}
                  <span className="text-[var(--muted)]">
                    (~{formatExpected(bout.prediction?.stars ?? 0)})
                  </span>
                </span>
              );
            })}
          </p>
        )}
      </div>
    </Link>
  );
}
