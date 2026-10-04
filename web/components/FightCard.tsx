import { fightBlurb } from "@/lib/card/blurb";
import { isHiddenGem } from "@/lib/card/hiddenGem";
import { SEGMENT_LABELS } from "@/lib/card/segments";
import { formatStars } from "@/lib/card/stars";
import type { CardFight } from "@/lib/card/types";
import { Monogram } from "./Monogram";
import { RevealButton } from "./RevealButton";
import { StarRating } from "./StarRating";

/** The big number: filled amber from 4.5, outlined amber from 4, quiet below. */
function RatingPlate({ stars }: { stars: number | null }) {
  const tone =
    stars === null
      ? "border-[var(--border)] text-[var(--muted)]"
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
      {stars === null ? "–" : formatStars(stars)}
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
          </div>
          <h3 className="mt-2 flex items-center gap-3 font-[family-name:var(--font-display)] text-2xl font-bold leading-tight">
            <span className="flex shrink-0">
              <Monogram name={fight.fighterA.name} />
              <span className="-ml-1.5 flex">
                <Monogram name={fight.fighterB.name} />
              </span>
            </span>
            <span className="min-w-0 break-words">
              {fight.fighterA.name} <span className="text-[var(--muted)]">vs</span> {fight.fighterB.name}
            </span>
          </h3>
          <p className="mt-1 text-sm text-[var(--muted)]">{fightBlurb(fight)}</p>
          <div className="mt-3">
            <StarRating stars={fight.rating?.stars ?? null} showNumber={false} />
          </div>
        </div>
      </div>
      <RevealButton fightId={fight.id} fighterA={fight.fighterA} fighterB={fight.fighterB} />
    </li>
  );
}
