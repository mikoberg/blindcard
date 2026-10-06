import { fightBlurb } from "@/lib/card/blurb";
import { isClassic } from "@/lib/card/classic";
import { isHiddenGem } from "@/lib/card/hiddenGem";
import { SEGMENT_LABELS } from "@/lib/card/segments";
import { formatStars } from "@/lib/card/stars";
import { fighterNote, pairingLabel } from "@/lib/card/story";
import type { CardFight } from "@/lib/card/types";
import { ClassicBadge, GOLD_FOIL } from "./ClassicBadge";
import { ClassicSeal } from "./ClassicSeal";
import { Matchup } from "./Matchup";
import { ShareFightButton } from "./ShareFightButton";
import { RevealButton } from "./RevealButton";
import { WatchButton } from "./WatchButton";
import { StarRating } from "./StarRating";

const TAG = "inline-flex items-center border-[1.5px] px-1.5 py-px text-[0.7rem] font-bold leading-4";

/**
 * The rating, kept small: the number in the display type (the gold seal for a classic) with the
 * stars under it. On a phone it sits in a row above the matchup, on wide screens in a column of its
 * own beside it. Red from 4, ink below. The number is decorative; the stars carry the spoken label.
 */
function RatingMark({ stars }: { stars: number | null }) {
  const classic = isClassic(stars);
  const hot = stars !== null && stars >= 4;
  return (
    <div className="flex items-center gap-3 px-4 pt-3 sm:w-[6.25rem] sm:flex-col sm:justify-center sm:gap-1.5 sm:border-r sm:border-[var(--border)] sm:px-0 sm:py-3">
      {stars !== null &&
        (classic ? (
          <ClassicSeal size="sm" value={formatStars(stars)} />
        ) : (
          <span
            aria-hidden="true"
            className={`display text-3xl leading-none tabular-nums sm:text-4xl ${hot ? "text-[var(--accent)]" : "text-[var(--text)]"}`}
          >
            {formatStars(stars)}
          </span>
        ))}
      <StarRating stars={stars} showNumber={false} small />
    </div>
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
  const hasTags = (showSegment && fight.cardSegment) || classic || fight.isTitleFight || isHiddenGem(fight) || pairing;
  // The left edge carries the tier: gold for a classic, red from 4, ink otherwise.
  const edge = classic ? "border-l-[var(--gold-mid)]" : stars !== null && stars >= 4 ? "border-l-[var(--accent)]" : "border-l-[var(--text)]";
  return (
    <li
      id={`fight-${fight.id}`}
      data-fight-id={fight.id}
      className={`scroll-mt-20 overflow-hidden border-2 border-l-[6px] border-[var(--text)] bg-[var(--surface)] ${edge}`}
    >
      {classic && <div aria-hidden="true" className="h-1" style={{ backgroundImage: GOLD_FOIL }} />}
      <div className="sm:flex">
        <RatingMark stars={stars} />
        <div className="min-w-0 flex-1 px-4 pb-3 pt-2 sm:px-5 sm:pt-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-h-6 flex-wrap items-center gap-1.5">
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
              <span className={`text-xs text-[var(--muted)] ${hasTags ? "ml-1" : ""}`}>{fightBlurb(fight)}</span>
            </div>
            <ShareFightButton fightId={fight.id} fighterA={fight.fighterA.name} fighterB={fight.fighterB.name} />
          </div>

          <Matchup
            a={{ ...fight.fighterA, record: fight.records?.a ?? null, note: fighterNote(fight.career?.a), elo: fight.elo?.a }}
            b={{ ...fight.fighterB, record: fight.records?.b ?? null, note: fighterNote(fight.career?.b), elo: fight.elo?.b }}
            weightClass={fight.weightClass}
            when="before"
          />

          {fight.videoId && (
            <WatchButton fighterA={fight.fighterA.name} fighterB={fight.fighterB.name} videoId={fight.videoId} />
          )}
        </div>
      </div>
      <RevealButton fightId={fight.id} fighterA={fight.fighterA} fighterB={fight.fighterB} />
    </li>
  );
}
