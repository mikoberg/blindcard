import { fightBlurb } from "@/lib/card/blurb";
import { isClassic } from "@/lib/card/classic";
import { isHiddenGem } from "@/lib/card/hiddenGem";
import { recordParts } from "@/lib/card/record";
import { SEGMENT_LABELS } from "@/lib/card/segments";
import { formatStars } from "@/lib/card/stars";
import { fighterNote, pairingLabel } from "@/lib/card/story";
import type { CardFight, CardFighter, FighterCareer, FighterRecord } from "@/lib/card/types";
import { ClassicBadge, GOLD_FOIL } from "./ClassicBadge";
import { ClassicSeal } from "./ClassicSeal";
import { Monogram } from "./Monogram";
import { ShareFightButton } from "./ShareFightButton";
import { RevealButton } from "./RevealButton";
import { WatchButton } from "./WatchButton";
import { StarRating } from "./StarRating";

const TAG = "inline-flex items-center border-2 px-2 py-0.5 text-xs font-bold";

/**
 * The rating, as a panel down the left side of the card: ink with the gold seal for a classic, red
 * from 4, plain paper below, dashed when there is no rating. The number is decorative; the stars
 * beside it carry the spoken label.
 */
function RatingPanel({ stars }: { stars: number | null }) {
  const classic = isClassic(stars);
  const hot = stars !== null && stars >= 4;
  const tone = classic
    ? "bg-[var(--text)] text-[var(--bg)]"
    : hot
      ? "bg-[var(--accent)] text-[var(--accent-ink)]"
      : stars === null
        ? "bg-transparent text-[var(--muted)]"
        : "bg-[var(--surface-2)] text-[var(--text)]";
  return (
    <div
      className={`flex items-center gap-4 border-b-2 px-4 py-3 sm:flex-col sm:justify-center sm:gap-3 sm:border-b-0 sm:border-r-2 sm:px-3 sm:py-6 ${
        stars === null ? "border-dashed border-[var(--muted)]" : "border-[var(--text)]"
      } ${tone}`}
    >
      {stars !== null &&
        (classic ? (
          <ClassicSeal value={formatStars(stars)} />
        ) : (
          <span aria-hidden="true" className="display text-5xl leading-none tabular-nums sm:text-6xl">
            {formatStars(stars)}
          </span>
        ))}
      <StarRating stars={stars} showNumber={false} onDark={classic || hot} />
    </div>
  );
}

/** One fighter: flag, name, style, what was known before (unbeaten, streak) and the record going in. */
function FighterBlock({
  fighter,
  record,
  career,
  side,
}: {
  fighter: CardFighter;
  record: FighterRecord | null;
  career: FighterCareer | null | undefined;
  /** On wide screens the second fighter is mirrored, so the pair faces each other across the "vs". */
  side: "left" | "right";
}) {
  const note = fighterNote(career);
  const parts = record ? recordParts(record) : null;
  const caption = parts?.extra ?? null;
  const mirrored = side === "right";
  return (
    <span className={`flex items-center gap-3 ${mirrored ? "sm:flex-row-reverse sm:text-right" : ""}`}>
      <Monogram name={fighter.name} country={fighter.country} size="lg" />
      <span className="min-w-0 flex-1">
        <span className="block break-words text-xl font-extrabold leading-tight sm:text-2xl">{fighter.name}</span>
        {fighter.styles && fighter.styles.length > 0 && (
          <span className="block text-sm font-normal text-[var(--muted)]">{fighter.styles.join(", ")}</span>
        )}
        {note && <span className="block text-xs font-normal text-[var(--muted)]">{note}</span>}
        {parts && (
          <span
            className="mt-1 block leading-none"
            aria-label={`Record before the fight: ${parts.main}${caption ? ` ${caption}` : ""}`}
          >
            <span aria-hidden="true" className="display-tight text-lg tabular-nums">
              {parts.main}
            </span>
            {caption && (
              <span aria-hidden="true" className="ml-1.5 text-xs font-normal text-[var(--muted)]">
                {caption}
              </span>
            )}
          </span>
        )}
      </span>
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
  const classic = isClassic(fight.rating?.stars);
  return (
    <li
      id={`fight-${fight.id}`}
      data-fight-id={fight.id}
      className="scroll-mt-20 overflow-hidden border-2 border-[var(--text)] bg-[var(--surface)]"
    >
      {classic && <div aria-hidden="true" className="h-2 border-b-2 border-[var(--text)]" style={{ backgroundImage: GOLD_FOIL }} />}
      <div className="grid sm:grid-cols-[9rem_1fr]">
        <RatingPanel stars={fight.rating?.stars ?? null} />
        <div className="min-w-0 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-h-7 flex-wrap items-center gap-2">
              {showSegment && fight.cardSegment && (
                <span className={`${TAG} border-[var(--border)] text-[var(--muted)]`}>
                  {SEGMENT_LABELS[fight.cardSegment]}
                </span>
              )}
              {classic && <ClassicBadge />}
              {fight.isTitleFight && (
                <span className={`${TAG} border-[var(--text)] bg-[var(--text)] text-[var(--bg)]`}>Title fight</span>
              )}
              {isHiddenGem(fight) && (
                <span className={`${TAG} border-[var(--accent)] text-[var(--accent-text)]`}>Hidden gem</span>
              )}
              {pairing && <span className={`${TAG} border-[var(--text)]/35`}>{pairing}</span>}
            </div>
            <ShareFightButton fightId={fight.id} fighterA={fight.fighterA.name} fighterB={fight.fighterB.name} />
          </div>

          <h3 className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-5">
            <FighterBlock
              fighter={fight.fighterA}
              record={fight.records?.a ?? null}
              career={fight.career?.a}
              side="left"
            />
            <span className="flex items-center gap-3 sm:flex-col sm:gap-1.5">
              <span className="h-px flex-1 bg-[var(--border)] sm:hidden" />
              <span className="display-tight flex flex-col items-center bg-[var(--surface-2)] px-3 py-1 leading-none">
                <span className="text-sm font-bold text-[var(--accent-text)]">vs</span>
                {fight.weightClass && (
                  <span aria-hidden="true" className="mt-1 text-center text-sm sm:max-w-[7.5rem]">
                    {fight.weightClass}
                  </span>
                )}
              </span>
              <span className="h-px flex-1 bg-[var(--border)] sm:hidden" />
            </span>
            <FighterBlock
              fighter={fight.fighterB}
              record={fight.records?.b ?? null}
              career={fight.career?.b}
              side="right"
            />
          </h3>

          <p className="mt-4 text-sm text-[var(--muted)]">{fightBlurb(fight)}</p>
          {fight.videoId && (
            <WatchButton
              fighterA={fight.fighterA.name}
              fighterB={fight.fighterB.name}
              videoId={fight.videoId}
            />
          )}
        </div>
      </div>
      <RevealButton fightId={fight.id} fighterA={fight.fighterA} fighterB={fight.fighterB} />
    </li>
  );
}
