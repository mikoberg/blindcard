import Link from "next/link";
import { formatEventDate } from "@/lib/format";
import { MIN_FIGHTS } from "@/lib/leaderboard/rank";
import type { FighterProfile } from "@/lib/leaderboard/types";
import { Monogram } from "./Monogram";

/**
 * A fighter's average rating and the rated fights it is made of, newest first, so the number can
 * be checked by hand. Only public ratings: no results, no records.
 */
export function FighterProfileView({ profile }: { profile: FighterProfile }) {
  const { fights } = profile;
  return (
    <div className="space-y-6">
      <Link
        href="/fighters"
        className="inline-flex min-h-11 items-center text-sm text-[var(--muted)] hover:text-[var(--text)]"
      >
        All fighters
      </Link>

      <section aria-labelledby="fighter" className="flex items-center gap-4">
        <Monogram name={profile.name} country={profile.country} size="lg" />
        <div className="min-w-0 flex-1">
          <h1
            id="fighter"
            className="break-words font-[family-name:var(--font-display)] text-4xl font-bold leading-tight sm:text-5xl"
          >
            {profile.name}
          </h1>
          <p className="text-[var(--muted)]">
            Average of {fights.length} rated {fights.length === 1 ? "fight" : "fights"}
          </p>
        </div>
        <p
          role="img"
          aria-label={`Average rating ${profile.average.toFixed(1)} out of 5`}
          className={`shrink-0 font-[family-name:var(--font-display)] text-5xl font-bold tabular-nums ${profile.average >= 4 ? "text-[var(--accent)]" : ""}`}
        >
          <span aria-hidden="true">{profile.average.toFixed(1)}</span>
        </p>
      </section>

      <p className="max-w-xl text-[var(--muted)]">
        This average is the total of the ratings below divided by the number of fights.
        {fights.length < MIN_FIGHTS && (
          <> A fighter is listed on the leaderboard from {MIN_FIGHTS} rated fights.</>
        )}
      </p>

      <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--surface)]">
        {fights.map((fight) => (
          <li key={`${fight.eventSlug}-${fight.opponent}`}>
            <Link
              href={`/events/${fight.eventSlug}`}
              className="flex items-center gap-3 px-3 py-3 hover:bg-[var(--surface-2)] sm:px-4"
            >
              <span className="min-w-0 flex-1">
                <span className="block break-words font-[family-name:var(--font-display)] text-xl font-bold leading-tight">
                  vs {fight.opponent}
                </span>
                <span className="block break-words text-sm text-[var(--muted)]">
                  {fight.eventName}, {formatEventDate(fight.eventDate)}
                </span>
              </span>
              <span
                role="img"
                aria-label={`Rated ${fight.stars.toFixed(1)} out of 5`}
                className={`shrink-0 font-[family-name:var(--font-display)] text-3xl font-bold tabular-nums ${fight.stars >= 4 ? "text-[var(--accent)]" : ""}`}
              >
                <span aria-hidden="true">{fight.stars.toFixed(1)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
