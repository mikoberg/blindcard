import Link from "next/link";
import { eloGap, isProvisional, type FighterElo } from "@/lib/card/elo";
import { recordParts } from "@/lib/card/record";
import type { FighterRecord } from "@/lib/card/types";
import { Monogram } from "./Monogram";

export interface MatchupFighter {
  name: string;
  /** The profile page, when there is one. */
  slug?: string | null;
  country?: string | null;
  styles?: string[];
  record: FighterRecord | null;
  /** A short note under the line, e.g. "Won 5 in a row". */
  note?: string | null;
  elo?: FighterElo | null;
}

/** Said to assistive tech, in front of the number: what the rating is the rating OF. */
const ELO_LABEL = { before: "Elo going into the fight", now: "Elo today" } as const;

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
      className={`whitespace-nowrap text-xs tabular-nums text-[var(--muted)] ${provisional ? "italic" : ""}`}
    >
      <span aria-hidden="true">
        Elo {provisional ? "~" : ""}
        {Math.round(elo.rating)}
      </span>
    </span>
  );
}

/** The fighter's name, set large and linked to their page when they have one. */
function FighterName({ fighter, side, className }: { fighter: MatchupFighter; side: "left" | "right"; className: string }) {
  return (
    <span
      data-matchup-name
      className={`display-tight block min-w-0 break-words text-balance text-xl leading-tight sm:text-2xl ${
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
        className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm ${mirrored ? "sm:flex-row-reverse" : ""}`}
      >
        <Monogram name={fighter.name} country={fighter.country} size="sm" />
        {parts && (
          <span
            className="leading-none"
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
        {fighter.styles && fighter.styles.length > 0 && (
          <span className="text-xs text-[var(--muted)]">{fighter.styles.join(", ")}</span>
        )}
        {fighter.note && <span className="text-xs text-[var(--muted)]">{fighter.note}</span>}
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
}: {
  a: MatchupFighter;
  b: MatchupFighter;
  weightClass: string | null;
  when: keyof typeof ELO_LABEL;
}) {
  const gap = eloGap(a.elo, b.elo);
  // Two rows on wide screens, one for the names and one for the line under them, so that the line
  // of both fighters sits at the same height however many lines a name takes. The names sit at the
  // bottom of their row, so the name of the shorter one stands next to the last line of the other.
  // The middle column spans both rows and is centred on them. On a phone it all stacks in this order.
  return (
    <h3 className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[1fr_6.5rem_1fr] sm:grid-rows-[auto_auto]">
      <FighterName fighter={a} side="left" className="sm:col-start-1 sm:row-start-1 sm:self-end" />
      <FighterMeta fighter={a} side="left" when={when} className="sm:col-start-1 sm:row-start-2" />
      <span className="my-1 flex items-center gap-2 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:my-0 sm:flex-col sm:gap-0.5 sm:self-center">
        <span className="h-px flex-1 bg-[var(--border)] sm:hidden" />
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
      <FighterName fighter={b} side="right" className="sm:col-start-3 sm:row-start-1 sm:self-end" />
      <FighterMeta fighter={b} side="right" when={when} className="sm:col-start-3 sm:row-start-2" />
    </h3>
  );
}
