import Link from "next/link";
import { formatEventDate } from "@/lib/format";
import { eventLabel, posterNames } from "@/lib/overview/matchup";
import { formatExpected, lookOutFor } from "@/lib/upcoming/prediction";
import type { UpcomingEvent } from "@/lib/upcoming/types";
import { countdownLabel, daysUntil } from "@/lib/upcoming/when";
import { startTimes } from "@/lib/upcoming/time";
import { PlaceChip } from "./PlaceChip";
import { StartTimes } from "./StartTimes";
import { TitleBelt } from "./TitleBelt";

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
      className="redact flex w-14 shrink-0 flex-col items-center justify-center py-2 text-center"
    >
      <span className="display text-2xl leading-none">{Number(isoDate.slice(8, 10))}</span>
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
      className="slip group relative flex h-full gap-3 border-2 border-[var(--text)] bg-[var(--surface)] p-3"
    >
      {title && (
        <span className="absolute right-0 top-3 bg-[var(--text)] px-2 py-1 text-[var(--bg)]">
          <TitleBelt className="h-4 w-11" />
        </span>
      )}
      <DateBlock isoDate={event.eventDate} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-extrabold text-[var(--muted)]">{eventLabel(event.name)}</p>
        <h3 className="display-tight break-words text-lg leading-tight group-hover:text-[var(--accent)] sm:text-xl">
          {names ? (
            <>
              {names[0]} <span className="text-base font-bold text-[var(--accent-text)]">vs</span> {names[1]}
            </>
          ) : (
            event.name
          )}
        </h3>
        <p className="sr-only">
          {event.name}, {formatEventDate(event.eventDate)}
        </p>
        <PlaceChip location={event.location} detail={event.location} />
        <StartTimes times={startTimes(event)} variant="tile" />
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="font-bold text-[var(--accent)]">{countdownLabel(days)}</span>
          <span className="text-[var(--muted)]">
            {event.bouts.length > 0 ? `${event.bouts.length} bouts announced` : "Card not announced yet"}
          </span>
        </p>
        {watch.length > 0 && (
          <p className="mt-1.5 text-sm">
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
