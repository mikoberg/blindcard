import Link from "next/link";
import { eloGap, isProvisional, type FighterElo } from "@/lib/card/elo";
import { rankSpoken, rankText } from "@/lib/card/rank";
import { recordParts } from "@/lib/card/record";
import type { FighterRecord } from "@/lib/card/types";
import { BillingMark } from "./BillingMark";
import { FlagChip } from "./FlagChip";
import { TitleBelt } from "./TitleBelt";

export interface MatchupFighter {
  name: string;
  /** The profile page, when there is one. */
  slug?: string | null;
  country?: string | null;
  record: FighterRecord | null;
  /** A short note under the line, e.g. "Won 5 in a row". */
  note?: string | null;
  elo?: FighterElo | null;
  /** UFC ranking in the division (0 = champion); null or missing when not ranked. */
  rank?: number | null;
}

/**
 * The size of both names on wide screens, from the longer of the two, so that a long name does not
 * wrap onto a second line and make its card taller than the others. Both fighters share one size.
 */
export function nameSize(longest: number): string {
  if (longest <= 16) return "sm:text-2xl";
  if (longest <= 19) return "sm:text-xl";
  return "sm:text-lg";
}

/** Said to assistive tech, in front of the number: what the rating is the rating OF. */
const ELO_LABEL = { before: "Elo going into the fight", now: "Elo today" } as const;

/** "#3", or "C" for a champion: the official ranking, ink for a place, gold for the champion. */
function RankChip({ rank, when }: { rank: number; when: keyof typeof ELO_LABEL }) {
  return (
    <span
      aria-label={rankSpoken(rank, when === "now" ? "now" : "before")}
      className={`shrink-0 whitespace-nowrap rounded-sm px-1.5 py-0.5 text-xs font-semibold leading-none tabular-nums ${
        rank === 0 ? "bg-[var(--gold-mid)] text-[var(--ink)]" : "bg-[var(--text)] text-[var(--surface)]"
      }`}
    >
      <span aria-hidden="true">{rankText(rank)}</span>
    </span>
  );
}

/** "Elo 1712", quieter than the record; set apart as provisional when it rests on few fights. */
function EloChip({ elo, when }: { elo: FighterElo; when: keyof typeof ELO_LABEL }) {
  const provisional = isProvisional(elo);
  const spoken = `${ELO_LABEL[when]}: ${Math.round(elo.rating)}${
    provisional ? `, provisional, after only ${elo.fights} ${elo.fights === 1 ? "fight" : "fights"}` : ""
  }`;
  return (
    <span
      aria-label={spoken}
      title={provisional ? `Provisional: based on ${elo.fights} ${elo.fights === 1 ? "fight" : "fights"}` : undefined}
      className={`shrink-0 whitespace-nowrap text-xs tabular-nums text-[var(--muted)] ${provisional ? "italic" : ""}`}
    >
      <span aria-hidden="true">
        Elo {provisional ? "~" : ""}
        {Math.round(elo.rating)}
      </span>
    </span>
  );
}

/** The fighter's name, set large and linked to their page when they have one. */
function FighterName({
  fighter,
  side,
  size,
  className,
}: {
  fighter: MatchupFighter;
  side: "left" | "right";
  size: string;
  className: string;
}) {
  return (
    <span
      data-matchup-name
      className={`display-tight block min-w-0 break-words text-balance text-xl leading-tight ${size} ${
        side === "right" ? "sm:text-right" : ""
      } ${className}`}
    >
      {fighter.slug ? (
        <Link
          href={`/fighters/${fighter.slug}`}
          className="underline decoration-[var(--border)] decoration-2 underline-offset-[5px] transition-colors hover:text-[var(--accent)] hover:decoration-[var(--accent)]"
        >
          {fighter.name}
        </Link>
      ) : (
        fighter.name
      )}
    </span>
  );
}

/** Flag, record, Elo and style on one line, with a short note under it. */
function FighterMeta({
  fighter,
  side,
  when,
  className,
}: {
  fighter: MatchupFighter;
  side: "left" | "right";
  when: keyof typeof ELO_LABEL;
  className: string;
}) {
  const parts = fighter.record ? recordParts(fighter.record) : null;
  const caption = parts?.extra ?? null;
  const mirrored = side === "right";
  return (
    <span className={`block min-w-0 ${mirrored ? "sm:text-right" : ""} ${className}`}>
      <span
        data-matchup-meta
        className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm md:flex-nowrap ${mirrored ? "sm:flex-row-reverse" : ""}`}
      >
        <FlagChip country={fighter.country} />
        {typeof fighter.rank === "number" && <RankChip rank={fighter.rank} when={when} />}
        {parts && (
          <span
            className="shrink-0 whitespace-nowrap leading-none"
            aria-label={`Record ${when === "now" ? "going into the fight" : "before the fight"}: ${parts.main}${caption ? ` ${caption}` : ""}`}
          >
            <span aria-hidden="true" className="display-tight tabular-nums">
              {parts.main}
            </span>
            {caption && (
              <span aria-hidden="true" className="ml-1 text-xs font-normal text-[var(--muted)]">
                {caption}
              </span>
            )}
          </span>
        )}
        {fighter.elo && <EloChip elo={fighter.elo} when={when} />}
        {fighter.note && (
          <span className="min-w-0 text-xs text-[var(--muted)] md:truncate" title={fighter.note}>
            {fighter.note}
          </span>
        )}
      </span>
    </span>
  );
}

/**
 * The two fighters facing each other across the "vs": on a phone stacked with the weight class on a
 * line between them, on wide screens side by side. Under the "vs" the weight class and, when both
 * ratings are solid, how far apart the two Elo ratings are ("Evenly matched" under 50 points).
 */
export function Matchup({
  a,
  b,
  weightClass,
  when,
  billing = null,
  titleFight = false,
}: {
  a: MatchupFighter;
  b: MatchupFighter;
  weightClass: string | null;
  when: keyof typeof ELO_LABEL;
  /** Card position of the fight: 1 (main event) and 2 (co-main) get a mark above the "vs". */
  billing?: number | null;
  /** A title fight: the belt stands above the "vs" on wide screens (on a phone it is with the tags). */
  titleFight?: boolean;
}) {
  const gap = eloGap(a.elo, b.elo);
  const size = nameSize(Math.max(a.name.length, b.name.length));
  // Two rows on wide screens, one for the names and one for the line under them, so that the line
  // of both fighters sits at the same height however many lines a name takes. The names sit at the
  // bottom of their row, so the name of the shorter one stands next to the last line of the other.
  // The middle column spans both rows and is centred on them. On a phone it all stacks in this order.
  return (
    <h3 className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[1fr_6.5rem_1fr] sm:grid-rows-[auto_auto]">
      <FighterName fighter={a} side="left" size={size} className="sm:col-start-1 sm:row-start-1 sm:self-end" />
      <FighterMeta fighter={a} side="left" when={when} className="sm:col-start-1 sm:row-start-2" />
      <span className="my-1 flex items-center gap-2 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:my-0 sm:flex-col sm:gap-0.5 sm:self-center">
        <span className="h-px flex-1 bg-[var(--border)] sm:hidden" />
        {titleFight && (
          <span className="hidden sm:-mx-4 sm:mb-0.5 sm:inline-flex">
            <TitleBelt className="h-8 w-[136px]" />
          </span>
        )}
        {(billing === 1 || billing === 2) && (
          <span className="sm:mb-0.5">
            <BillingMark position={billing} />
          </span>
        )}
        <span className="display-tight text-sm leading-none text-[var(--accent-text)]">vs</span>
        {weightClass && (
          <span
            aria-hidden="true"
            className="text-center text-[0.7rem] font-bold leading-tight text-[var(--muted)]"
          >
            {weightClass}
          </span>
        )}
        {gap && (
          <span
            className="text-center text-[0.7rem] leading-tight text-[var(--muted)]"
            aria-label={gap.even ? "Evenly matched on Elo" : `Elo gap of ${gap.points} points`}
          >
            <span aria-hidden="true">{gap.even ? "Evenly matched" : `Elo gap ${gap.points}`}</span>
          </span>
        )}
        <span className="h-px flex-1 bg-[var(--border)] sm:hidden" />
      </span>
      <FighterName fighter={b} side="right" size={size} className="sm:col-start-3 sm:row-start-1 sm:self-end" />
      <FighterMeta fighter={b} side="right" when={when} className="sm:col-start-3 sm:row-start-2" />
    </h3>
  );
}
