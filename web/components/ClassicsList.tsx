import Link from "next/link";
import { formatEventDate } from "@/lib/format";
import { isValidSlug } from "@/lib/slug";
import type { ClassicYear } from "@/lib/classics/types";
import { FightTag } from "./FightTag";
import { WatchButton } from "./WatchButton";
import { YearNav } from "./YearNav";

/**
 * The five-star fights as a ledger: a year column, then one bill per fight between ink rules.
 * Every fight here is a 5.0, so the number is not repeated on each row; the names carry the
 * weight. The whole row opens the card; the watch link sits above it.
 */
export function ClassicsList({ years }: { years: readonly ClassicYear[] }) {
  return (
    <div>
      <YearNav years={years.map((group) => group.year)} />
      {years.map((group) => (
        <section
          key={group.year}
          id={`year-${group.year}`}
          aria-labelledby={`heading-${group.year}`}
          className="scroll-mt-16 pt-10 sm:grid sm:grid-cols-[10.5rem_1fr] sm:gap-8 lg:grid-cols-[13rem_1fr]"
        >
          <h2
            id={`heading-${group.year}`}
            className="display text-5xl leading-none sm:sticky sm:top-20 sm:self-start sm:text-5xl lg:text-6xl"
          >
            {group.year}
          </h2>
          <ul className="mt-4 border-t-[3px] border-[var(--text)] sm:mt-0">
            {group.fights.map((fight) => {
              const open = isValidSlug(fight.eventSlug)
                ? `/events/${fight.eventSlug}#fight-${fight.id}`
                : null;
              const names = (
                <>
                  <span className="display-tight block break-words text-[1.7rem] leading-[1.05] sm:text-4xl">
                    {fight.fighterA}
                  </span>
                  <span className="display-tight block break-words text-[1.7rem] leading-[1.05] sm:text-4xl">
                    <span className="mr-2 text-base font-bold text-[var(--accent)] sm:text-lg">vs</span>
                    {fight.fighterB}
                  </span>
                </>
              );
              return (
                <li
                  key={fight.id}
                  className="group relative flex items-start gap-4 border-b-2 border-[var(--text)] py-5 pr-1 transition-colors hover:bg-[var(--surface)]"
                >
                  <div className="min-w-0 flex-1 md:grid md:grid-cols-[minmax(0,1fr)_17rem] md:items-center md:gap-8">
                    {open ? (
                      <Link
                        href={open}
                        className="block after:absolute after:inset-0 after:content-[''] group-hover:text-[var(--accent)]"
                      >
                        {names}
                      </Link>
                    ) : (
                      <div>{names}</div>
                    )}
                    <div className="mt-2 md:mt-0">
                      <p className="break-words text-sm font-semibold">{fight.eventName}</p>
                      <p className="text-sm text-[var(--muted)]">{formatEventDate(fight.eventDate)}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-[var(--muted)]">
                        {fight.weightClass && <span>{fight.weightClass}</span>}
                        {fight.isTitleFight && (
                          <FightTag kind="title">Title fight</FightTag>
                        )}
                      </p>
                    </div>
                  </div>
                  {fight.videoId && (
                    <div className="relative z-10 shrink-0 pt-0.5">
                      <WatchButton
                        compact
                        fighterA={fight.fighterA}
                        fighterB={fight.fighterB}
                        videoId={fight.videoId}
                      />
                    </div>
                  )}
                  {!fight.videoId && <div aria-hidden="true" className="hidden w-11 shrink-0 md:block" />}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
