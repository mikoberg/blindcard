import Link from "next/link";
import { formatEventDate, formatMonthYear } from "@/lib/format";
import { isProvisional } from "@/lib/card/elo";
import { formatRating, isHighRating } from "@/lib/leaderboard/format";
import { activeYears } from "@/lib/leaderboard/profile";
import { MIN_FIGHTS, ageOn } from "@/lib/leaderboard/rank";
import type { FighterFight, FighterProfile } from "@/lib/leaderboard/types";
import { barHeight } from "@/lib/overview/poster";
import { FighterFights } from "./FighterFights";
import { RecordButton } from "./RecordButton";
import { FlagChip } from "./FlagChip";

/** One figure of the strip under the name: a number and what it is. */
function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[var(--muted)]">{label}</dt>
      <dd className="display-tight mt-0.5 text-2xl tabular-nums">{children}</dd>
    </div>
  );
}

/**
 * The ratings of all rated fights from the oldest to the newest, one bar each, like the strip on
 * an event poster. Public ratings only.
 */
function RatingStrip({ fights }: { fights: readonly FighterFight[] }) {
  const ordered = [...fights].reverse(); // the profile lists newest first
  const first = ordered[0]?.eventDate.slice(0, 4);
  const last = ordered[ordered.length - 1]?.eventDate.slice(0, 4);
  return (
    <figure className="min-w-0 max-w-sm">
      <div
        role="img"
        aria-label={`Ratings of ${ordered.length} fights, oldest to newest: ${ordered.map((f) => formatRating(f.stars)).join(", ")}`}
        className="flex h-14 items-end gap-[3px] border-b-2 border-[var(--text)]"
      >
        {ordered.map((fight) => (
          <span
            key={`${fight.eventSlug}-${fight.opponent}`}
            aria-hidden="true"
            title={`${formatRating(fight.stars)} vs ${fight.opponent}`}
            className={`bar${fight.stars >= 4 ? " bar-hi" : ""}`}
            style={{ height: `${barHeight(fight.stars)}%` }}
          />
        ))}
      </div>
      {first && last && (
        <figcaption aria-hidden="true" className="mt-1 flex justify-between text-xs text-[var(--muted)]">
          <span>{first}</span>
          {first !== last && <span>{last}</span>}
        </figcaption>
      )}
    </figure>
  );
}

/** A fighter's page: who they are, how their fights rate, and every rated fight. Public data only. */
export function FighterProfileView({ profile }: { profile: FighterProfile }) {
  const { fights, stats, record, elo } = profile;
  const age = profile.born ? ageOn(profile.born, new Date().toISOString().slice(0, 10)) : null;
  // One weight class is said once in the line above the list; a column of it would repeat it.
  const showClass = stats.weightClasses.length > 1;
  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/fighters"
          className="inline-flex min-h-9 items-center text-sm font-semibold text-[var(--muted)] underline underline-offset-4 hover:text-[var(--accent)]"
        >
          All fighters
        </Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 id="fighter" className="display flex flex-wrap items-center gap-x-3 text-4xl leading-none sm:text-5xl">
              <FlagChip country={profile.country} />
              <span className="min-w-0 break-words">{profile.name}</span>
            </h1>
            {profile.styles.length > 0 && (
              <p className="mt-2 flex flex-wrap gap-1.5">
                {profile.styles.map((style) => (
                  <span key={style} className="border-[1.5px] border-[var(--text)]/35 px-1.5 py-px text-xs font-bold">
                    {style}
                  </span>
                ))}
              </p>
            )}
          </div>
          <div
            className="shrink-0 text-center"
            role="img"
            aria-label={`Average rating ${formatRating(profile.average)} out of 5`}
          >
            <p
              aria-hidden="true"
              className={`scorebox h-14 w-[4.5rem] text-3xl ${isHighRating(profile.average) ? "scorebox-hot" : ""}`}
            >
              {formatRating(profile.average)}
            </p>
            <p aria-hidden="true" className="mt-1 text-xs text-[var(--muted)]">
              average
            </p>
          </div>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-y-2 border-[var(--text)] py-3 sm:grid-cols-3 lg:grid-cols-7">
        {record && (
          <Figure label="Record">
            <RecordButton record={record} />
          </Figure>
        )}
        {elo && (
          <Figure label="Elo">
            <span
              aria-label={`Elo ${Math.round(elo.rating)}${isProvisional(elo) ? ", provisional" : ""}`}
              className={isProvisional(elo) ? "italic text-[var(--muted)]" : ""}
              title={
                isProvisional(elo)
                  ? `Provisional: based on ${elo.fights} ${elo.fights === 1 ? "fight" : "fights"}`
                  : undefined
              }
            >
              <span aria-hidden="true">
                {isProvisional(elo) ? "~" : ""}
                {Math.round(elo.rating)}
              </span>
            </span>
            {elo.peak && (
              <span
                className="mt-0.5 block text-xs font-normal text-[var(--muted)]"
                title={`Highest rating, reached ${formatMonthYear(elo.peak.date)}`}
              >
                Peak {Math.round(elo.peak.rating)}
              </span>
            )}
          </Figure>
        )}
        <Figure label="Rated fights">{stats.rated}</Figure>
        {age !== null && profile.born && (
          <Figure label="Age">
            <span title={`Born ${formatEventDate(profile.born)}`}>{age}</span>
          </Figure>
        )}
        {profile.awards && (
          <Figure label="Night bonuses">
            <span
              aria-label={`Fight of the Night bonuses: ${profile.awards.fotn}. Performance of the Night bonuses: ${profile.awards.potn}.`}
              title="Fight of the Night and Performance of the Night bonuses earned since 2015"
            >
              <span aria-hidden="true">
                {profile.awards.fotn}
                <span className="ml-1 mr-3 text-xs font-normal text-[var(--muted)]">FOTN</span>
                {profile.awards.potn}
                <span className="ml-1 text-xs font-normal text-[var(--muted)]">POTN</span>
              </span>
            </span>
          </Figure>
        )}
        <Figure label="Rated 4.0 or higher">
          {stats.fourPlus}
          <span className="ml-1 text-xs font-normal text-[var(--muted)]">of {stats.rated}</span>
        </Figure>
        <Figure label="Rated fights from">
          <span className="text-xl">{activeYears(stats)}</span>
        </Figure>
      </dl>

      {(stats.weightClasses.length > 0 || stats.titleFights > 0) && (
        <p className="text-sm text-[var(--muted)]">
          {stats.weightClasses.length > 0 && <>Fought at {stats.weightClasses.join(", ")}. </>}
          {stats.titleFights > 0 && (
            <>
              {stats.titleFights} {stats.titleFights === 1 ? "title fight" : "title fights"}.
            </>
          )}
        </p>
      )}

      {fights.length > 1 && <RatingStrip fights={fights} />}

      <FighterFights slug={profile.slug} name={profile.name} fights={fights} showClass={showClass} record={record} />

      <p className="max-w-2xl text-xs text-[var(--muted)]">
        The average is the total of these ratings divided by the number of fights
        {fights.length < MIN_FIGHTS && <>; a fighter is listed on the leaderboard from {MIN_FIGHTS} rated fights</>}.
        {record || elo ? " Record and Elo are as they stand today." : ""}
      </p>
    </div>
  );
}
