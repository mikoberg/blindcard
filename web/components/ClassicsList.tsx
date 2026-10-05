import Link from "next/link";
import { formatEventDate } from "@/lib/format";
import { isValidSlug } from "@/lib/slug";
import type { ClassicYear } from "@/lib/classics/types";
import { ClassicBadge } from "./ClassicBadge";
import { YearNav } from "./YearNav";

/** The five-star fights, grouped by year, each linking to its card. */
export function ClassicsList({ years }: { years: readonly ClassicYear[] }) {
  return (
    <div>
      <YearNav years={years.map((group) => group.year)} />
      {years.map((group) => (
        <section
          key={group.year}
          id={`year-${group.year}`}
          aria-labelledby={`heading-${group.year}`}
          className="scroll-mt-16 pt-8"
        >
          <h2
            id={`heading-${group.year}`}
            className="font-[family-name:var(--font-display)] text-4xl font-bold text-[var(--accent)]"
          >
            {group.year}
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {group.fights.map((fight) => {
              const body = (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words font-[family-name:var(--font-display)] text-xl font-bold leading-tight">
                      {fight.fighterA} <span className="text-[var(--muted)]">vs</span> {fight.fighterB}
                    </span>
                    <span className="block break-words text-sm text-[var(--muted)]">
                      {fight.eventName}, {formatEventDate(fight.eventDate)}
                    </span>
                    {(fight.weightClass || fight.isTitleFight) && (
                      <span className="block text-sm text-[var(--muted)]">
                        {[fight.weightClass, fight.isTitleFight ? "Title fight" : null]
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                    )}
                  </span>
                  <ClassicBadge label="5.0" />
                </>
              );
              const className =
                "flex items-start gap-3 rounded-lg border border-[var(--accent)]/60 bg-[var(--surface)] p-4 hover:border-[var(--accent)]";
              return (
                <li key={fight.id}>
                  {isValidSlug(fight.eventSlug) ? (
                    <Link href={`/events/${fight.eventSlug}#fight-${fight.id}`} className={className}>
                      {body}
                    </Link>
                  ) : (
                    <div className={className}>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
