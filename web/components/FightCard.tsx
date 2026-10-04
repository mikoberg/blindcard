import { fightBlurb } from "@/lib/card/blurb";
import { isHiddenGem } from "@/lib/card/hiddenGem";
import type { CardFight } from "@/lib/card/types";
import { RevealButton } from "./RevealButton";
import { StarRating } from "./StarRating";

export function FightCard({ fight }: { fight: CardFight }) {
  return (
    <li
      id={`fight-${fight.id}`}
      data-fight-id={fight.id}
      className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center gap-2">
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
      <h3 className="mt-2 break-words font-[family-name:var(--font-display)] text-2xl font-bold leading-tight">
        {fight.fighterA.name} <span className="text-[var(--muted)]">vs</span> {fight.fighterB.name}
      </h3>
      <p className="mt-1 text-sm text-[var(--muted)]">{fightBlurb(fight)}</p>
      <div className="mt-3">
        <StarRating stars={fight.rating?.stars ?? null} />
      </div>
      <RevealButton fightId={fight.id} fighterA={fight.fighterA} fighterB={fight.fighterB} />
    </li>
  );
}
