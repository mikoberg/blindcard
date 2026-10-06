import { fightBlurb } from "@/lib/card/blurb";
import { isClassic } from "@/lib/card/classic";
import { isHiddenGem } from "@/lib/card/hiddenGem";
import { SEGMENT_LABELS } from "@/lib/card/segments";
import { formatStars } from "@/lib/card/stars";
import { fighterNote, pairingLabel } from "@/lib/card/story";
import type { CardFight } from "@/lib/card/types";
import { ClassicBadge } from "./ClassicBadge";
import { FightTag } from "./FightTag";
import { Matchup } from "./Matchup";
import { ShareFightButton } from "./ShareFightButton";
import { RevealButton } from "./RevealButton";
import { WatchButton } from "./WatchButton";
import { StarRating } from "./StarRating";

/**
 * The rating: a column of its own with the number in the display type and the stars under it. On a
 * phone it is a strip above the matchup. A hairline separates it; the tier shows in the numeral
 * (red from 4) and, for a classic, a gold tint and a gold numeral. The number is decorative; the
 * stars carry the spoken label.
 */
function RatingMark({ stars }: { stars: number | null }) {
  const classic = isClassic(stars);
  const hot = stars !== null && stars >= 4;
  return (
    <div
      className={`flex items-center gap-3 border-b border-[var(--border)] px-4 py-2 sm:w-[5.5rem] sm:row-span-2 sm:flex-col sm:justify-center sm:gap-1.5 sm:border-b-0 sm:border-r sm:px-0 ${
        classic ? "rating-classic" : ""
      }`}
    >
      {stars !== null && (
        <span
          aria-hidden="true"
          className={`display text-[1.7rem] leading-none tabular-nums sm:text-[2.3rem] ${
            classic ? "text-[var(--gold-lo)]" : hot ? "text-[var(--accent)]" : "text-[var(--text)]"
          }`}
        >
          {formatStars(stars)}
        </span>
      )}
      <StarRating stars={stars} showNumber={false} flat />
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
  return (
    <li
      id={`fight-${fight.id}`}
      data-fight-id={fight.id}
      className="scroll-mt-20 relative border-2 border-[var(--text)] bg-[var(--surface)]"
    >
      <div className="sm:grid sm:grid-cols-[5.5rem_1fr]">
        <RatingMark stars={stars} />
        <div className="min-w-0 px-4 pb-3 pt-2 sm:px-5 sm:pt-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-h-6 flex-wrap items-center gap-1.5">
              {showSegment && fight.cardSegment && (
                <FightTag kind="segment">{SEGMENT_LABELS[fight.cardSegment]}</FightTag>
              )}
              {classic && <ClassicBadge />}
              {fight.isTitleFight && (
                <span className="sm:hidden">
                  <FightTag kind="title">Title fight</FightTag>
                </span>
              )}
              {isHiddenGem(fight) && <FightTag kind="gem">Hidden gem</FightTag>}
              {pairing && <FightTag kind="pairing">{pairing}</FightTag>}
              {/* For screen readers only: the weight class, the title and the rounds are on the card already. */}
              <span className="sr-only">{fightBlurb(fight)}</span>
            </div>
            <ShareFightButton fightId={fight.id} fighterA={fight.fighterA.name} fighterB={fight.fighterB.name} />
          </div>

          <Matchup
            a={{ ...fight.fighterA, record: fight.records?.a ?? null, note: fighterNote(fight.career?.a), elo: fight.elo?.a, rank: fight.ranks?.a }}
            b={{ ...fight.fighterB, record: fight.records?.b ?? null, note: fighterNote(fight.career?.b), elo: fight.elo?.b, rank: fight.ranks?.b }}
            weightClass={fight.weightClass}
            when="before"
            billing={fight.cardPosition}
            titleFight={fight.isTitleFight}
          />

          {fight.videoId && (
            <WatchButton fighterA={fight.fighterA.name} fighterB={fight.fighterB.name} videoId={fight.videoId} />
          )}
        </div>
        <RevealButton fightId={fight.id} fighterA={fight.fighterA} fighterB={fight.fighterB} />
      </div>
    </li>
  );
}
