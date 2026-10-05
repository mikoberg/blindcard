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
import { RevealButton } from "./RevealButton";
import { WatchButton } from "./WatchButton";
import { StarRating } from "./StarRating";

const TAG = "inline-flex items-center border-2 px-2 py-0.5 text-xs font-bold";

/** The big number in its box: red from 4, gold foil from 5, plain ink below. */
function RatingPlate({ stars }: { stars: number | null }) {
  if (isClassic(stars)) return <ClassicSeal value={formatStars(stars as number)} />;
  const tone =
    stars === null
      ? "border-dashed border-[var(--muted)] bg-transparent text-[var(--muted)]"
      : stars >= 4
        ? "scorebox-hot"
        : "";
  return (
    <div aria-hidden="true" className={`scorebox h-[4.25rem] w-[4.25rem] shrink-0 text-3xl ${tone}`}>
      {stars === null ? "–" : formatStars(stars)}
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
        <span className="block break-words text-xl font-extrabold leading-tight sm:text-2xl">{fighter.name}</span>
        {fighter.styles && fighter.styles.length > 0 && (
          <span className="block text-sm font-normal text-[var(--muted)]">{fighter.styles.join(", ")}</span>
        )}
        {note && <span className="block text-xs font-normal text-[var(--muted)]">{note}</span>}
        {parts && (
          <span aria-hidden="true" className="mt-0.5 block text-sm font-extrabold tabular-nums sm:hidden">
            {parts.main}
          </span>
        )}
      </span>
      {parts && (
        <span
          className="hidden shrink-0 text-right leading-none sm:block"
          aria-label={`Record before the fight: ${parts.main}${caption ? ` ${caption}` : ""}`}
        >
          <span aria-hidden="true" className="block text-2xl font-extrabold tabular-nums">
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
  const classic = isClassic(fight.rating?.stars);
  return (
    <li
      id={`fight-${fight.id}`}
      data-fight-id={fight.id}
      className="scroll-mt-20 overflow-hidden border-2 border-[var(--text)] bg-[var(--surface)]"
    >
      {classic && <div aria-hidden="true" className="h-2 border-b-2 border-[var(--text)]" style={{ backgroundImage: GOLD_FOIL }} />}
      <div className="flex gap-4 p-4 sm:p-5">
        <RatingPlate stars={fight.rating?.stars ?? null} />
        <div className="min-w-0 flex-1">
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
              <span className={`${TAG} border-[var(--accent)] text-[var(--accent)]`}>Hidden gem</span>
            )}
            {pairing && <span className={`${TAG} border-[var(--text)]/35`}>{pairing}</span>}
          </div>
          <h3 className="mt-3">
            <FighterLine
              fighter={fight.fighterA}
              record={fight.records?.a ?? null}
              career={fight.career?.a}
            />
            <span className="-ml-[5.25rem] my-3 flex items-center gap-3">
              <span className="h-px flex-1 bg-[var(--border)]" />
              <span className="display-tight flex items-baseline gap-2 bg-[var(--surface-2)] px-3 py-1 text-base leading-none sm:text-lg">
                <span className="text-sm font-bold text-[var(--accent-text)]">vs</span>
                {fight.weightClass && <span aria-hidden="true">{fight.weightClass}</span>}
              </span>
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
