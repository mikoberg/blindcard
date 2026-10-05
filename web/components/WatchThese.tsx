import { isClassic } from "@/lib/card/classic";
import { isHiddenGem } from "@/lib/card/hiddenGem";
import type { CardFight } from "@/lib/card/types";
import { ClassicBadge } from "./ClassicBadge";
import { StarRating } from "./StarRating";

export function WatchThese({ fights }: { fights: readonly CardFight[] }) {
  return (
    <section aria-labelledby="watch-these">
      <h2 id="watch-these" className="font-[family-name:var(--font-display)] text-2xl font-bold">
        Watch these
      </h2>
      {fights.length === 0 ? (
        <p className="mt-2 text-[var(--muted)]">No standout fights on this card</p>
      ) : (
        <ol className="mt-3 space-y-2">
          {fights.map((fight) => (
            <li key={fight.id}>
              <a
                href={`#fight-${fight.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 hover:border-[var(--accent)]"
              >
                <span className="break-words font-semibold">
                  {fight.fighterA.name} <span className="text-[var(--muted)]">vs</span> {fight.fighterB.name}
                  {isClassic(fight.rating?.stars) && (
                    <span className="ml-2 inline-block align-middle">
                      <ClassicBadge />
                    </span>
                  )}
                  {isHiddenGem(fight) && (
                    <span className="ml-2 inline-block whitespace-nowrap rounded-full bg-[var(--accent)] px-2 py-0.5 text-xs font-semibold text-[var(--accent-ink)]">
                      Hidden gem
                    </span>
                  )}
                </span>
                <StarRating stars={fight.rating?.stars ?? null} />
              </a>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
