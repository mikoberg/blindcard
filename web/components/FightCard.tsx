import { fightBlurb } from "@/lib/card/blurb";
import { isClassic } from "@/lib/card/classic";
import { isHiddenGem } from "@/lib/card/hiddenGem";
import { recordParts } from "@/lib/card/record";
import { SEGMENT_LABELS } from "@/lib/card/segments";
import { formatStars } from "@/lib/card/stars";
import { fighterNote, pairingLabel } from "@/lib/card/story";
import type { CardFight, CardFighter, FighterCareer, FighterRecord } from "@/lib/card/types";
import { ClassicBadge } from "./ClassicBadge";
import { Monogram } from "./Monogram";
import { RevealButton } from "./RevealButton";
import { StarRating } from "./StarRating";

/** The big number: filled amber from 4.5, outlined amber from 4, quiet below. */
function RatingPlate({ stars }: { stars: number | null }) {
  const tone =
    stars === null
      ? "border-[var(--border)] text-[var(--muted)]"
      : isClassic(stars)
        ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)] ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--surface)] shadow-[0_0_16px_rgb(255_176_32/0.5)]"
        : stars >= 4.5
        ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
        : stars >= 4
          ? "border-[var(--accent)] text-[var(--accent)]"
          : "border-[var(--border)] bg-[var(--surface-2)]";
  return (
    <div
      aria-hidden="true"
      className={`flex h-16 w-14 shrink-0 items-center justify-center rounded-md border font-[family-name:var(--font-display)] text-3xl font-bold tabular-nums ${tone}`}
    >
      {stars === null ? "\u2013" : formatStars(stars)}
    </div>
  );
}

/** One fighter: flag, name, what was known before (unbeaten, streak) and the record going in. */
function FighterLine({
  fighter,
  record,
  career,
}: {
  fighter: CardFighter;
  record: FighterRecord | null;
  career: FighterCareer | null | undefined;
}) {
  const note = fighterNote(career);
  const parts = record ? recordParts(record) : null;
  const caption = parts?.extra ?? null;
  return (
    <span className="flex items-center gap-3">
      <Monogram name={fighter.name} country={fighter.country} size="lg" />
      <span className="min-w-0 flex-1">
        <span className="block break-words text-2xl font-bold leading-tight">{fighter.name}</span>
        {note && <span className="block text-xs font-normal text-[var(--muted)]">{note}</span>}
      </span>
      {parts && (
        <span
          className="shrink-0 text-right leading-none"
          aria-label={`Record before the fight: ${parts.main}${caption ? ` ${caption}` : ""}`}
        >
          <span aria-hidden="true" className="block text-3xl font-bold tabular-nums">
            {parts.main}
          </span>
          {caption && (
            <span aria-hidden="true" className="mt-1 block text-xs font-normal text-[var(--muted)]">
              {caption}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

export function FightCard({
  fight,
  showSegment = false,
}: {
  fight: CardFight;
  /** Label the card with its part of the card (used when the list is not grouped). */
  showSegment?: boolean;
}) {
  const pairing = pairingLabel(fight);
  return (
    <li
      id={`fight-${fight.id}`}
      data-fight-id={fight.id}
      className={`rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 ${fight.isTitleFight ? "border-l-4 border-l-[var(--accent)]" : ""}`}
    >
      <div className="flex gap-4">
        <RatingPlate stars={fight.rating?.stars ?? null} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {showSegment && fight.cardSegment && (
              <span className="rounded-full border border-[var(--border)] px-2.5 py-0.5 text-xs font-semibold text-[var(--muted)]">
                {SEGMENT_LABELS[fight.cardSegment]}
              </span>
            )}
            {isClassic(fight.rating?.stars) && <ClassicBadge />}
            {fight.isTitleFight && (
              <span className="rounded-full border border-[var(--accent)] px-2.5 py-0.5 text-xs font-semibold text-[var(--accent)]">
                Title fight
              </span>
            )}
            {isHiddenGem(fight) && (
              <span className="rounded-full bg-[var(--accent)] px-2.5 py-0.5 text-xs font-semibold text-[var(--accent-ink)]">
                Hidden gem
              </span>
            )}
            {pairing && (
              <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-0.5 text-xs font-semibold text-[var(--text)]/90">
                {pairing}
              </span>
            )}
          </div>
          <h3 className="mt-3 font-[family-name:var(--font-display)]">
            <FighterLine
              fighter={fight.fighterA}
              record={fight.records?.a ?? null}
              career={fight.career?.a}
            />
            <span className="my-1.5 flex items-center gap-3 text-sm font-semibold text-[var(--muted)]">
              <span className="w-11 text-center">vs</span>
              <span className="h-px flex-1 bg-[var(--border)]" />
            </span>
            <FighterLine
              fighter={fight.fighterB}
              record={fight.records?.b ?? null}
              career={fight.career?.b}
            />
          </h3>
          <p className="mt-3 text-sm text-[var(--muted)]">{fightBlurb(fight)}</p>
          <div className="mt-3">
            <StarRating stars={fight.rating?.stars ?? null} showNumber={false} />
          </div>
        </div>
      </div>
      <RevealButton fightId={fight.id} fighterA={fight.fighterA} fighterB={fight.fighterB} />
    </li>
  );
}
