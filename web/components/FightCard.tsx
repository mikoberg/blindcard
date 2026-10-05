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
 * The rating up front: the number set large in the display type (the gold seal for a classic) with
 * the stars beside it. Red from 4, ink below, dashed when there is no rating. The number is
 * decorative; the stars carry the spoken label.
 */
function RatingMark({ stars }: { stars: number | null }) {
  const classic = isClassic(stars);
  const hot = stars !== null && stars >= 4;
  return (
    <div className="flex items-center gap-3">
      {stars !== null &&
        (classic ? (
          <ClassicSeal value={formatStars(stars)} />
        ) : (
          <span
            aria-hidden="true"
            className={`display text-5xl leading-none tabular-nums sm:text-6xl ${hot ? "text-[var(--accent)]" : "text-[var(--text)]"}`}
          >
            {formatStars(stars)}
          </span>
        ))}
      <StarRating stars={stars} showNumber={false} />
    </div>
  );
}

/** One fighter: the name set large, then flag, record going in and style on one line. */
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
    <span className={`block ${mirrored ? "sm:text-right" : ""}`}>
      <span className="display-tight block break-words text-2xl leading-[1.05] sm:text-3xl">{fighter.name}</span>
      <span
        className={`mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 ${mirrored ? "sm:flex-row-reverse sm:justify-start" : ""}`}
      >
        <Monogram name={fighter.name} country={fighter.country} size="md" />
        {parts && (
          <span
            className="leading-none"
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
        {fighter.styles && fighter.styles.length > 0 && (
          <span className="text-sm text-[var(--muted)]">{fighter.styles.join(", ")}</span>
        )}
      </span>
      {note && <span className="mt-1 block text-xs text-[var(--muted)]">{note}</span>}
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
  const stars = fight.rating?.stars ?? null;
  const classic = isClassic(stars);
  // The left edge carries the tier: gold for a classic, red from 4, ink otherwise.
  const edge = classic ? "border-l-[var(--gold-mid)]" : stars !== null && stars >= 4 ? "border-l-[var(--accent)]" : "border-l-[var(--text)]";
  return (
    <li
      id={`fight-${fight.id}`}
      data-fight-id={fight.id}
      className={`scroll-mt-20 overflow-hidden border-2 border-l-[6px] border-[var(--text)] bg-[var(--surface)] ${edge}`}
    >
      {classic && <div aria-hidden="true" className="h-1.5" style={{ backgroundImage: GOLD_FOIL }} />}
      <div className="px-4 pb-5 pt-4 sm:px-6 sm:pt-5">
        <div className="flex items-start gap-x-4 gap-y-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-5 gap-y-3">
            <RatingMark stars={stars} />
            <div className="flex flex-wrap items-center gap-2">
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
          </div>
          <ShareFightButton fightId={fight.id} fighterA={fight.fighterA.name} fighterB={fight.fighterB.name} />
        </div>

        <h3 className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-start sm:gap-6">
          <FighterBlock
            fighter={fight.fighterA}
            record={fight.records?.a ?? null}
            career={fight.career?.a}
            side="left"
          />
          <span className="flex items-center gap-3 sm:flex-col sm:gap-1 sm:pt-1.5">
            <span className="h-px flex-1 bg-[var(--border)] sm:hidden" />
            <span className="display-tight text-base leading-none text-[var(--accent-text)]">vs</span>
            {fight.weightClass && (
              <span aria-hidden="true" className="text-center text-xs font-bold text-[var(--muted)] sm:max-w-[6.5rem]">
                {fight.weightClass}
              </span>
            )}
            <span className="h-px flex-1 bg-[var(--border)] sm:hidden" />
          </span>
          <FighterBlock
            fighter={fight.fighterB}
            record={fight.records?.b ?? null}
            career={fight.career?.b}
            side="right"
          />
        </h3>

        <p className="mt-5 text-sm text-[var(--muted)]">{fightBlurb(fight)}</p>
        {fight.videoId && (
          <WatchButton fighterA={fight.fighterA.name} fighterB={fight.fighterB.name} videoId={fight.videoId} />
        )}
      </div>
      <RevealButton fightId={fight.id} fighterA={fight.fighterA} fighterB={fight.fighterB} />
    </li>
  );
}
