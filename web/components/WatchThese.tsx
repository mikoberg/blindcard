import { isClassic } from "@/lib/card/classic";
import { isHiddenGem } from "@/lib/card/hiddenGem";
import type { CardFight } from "@/lib/card/types";
import { ClassicBadge } from "./ClassicBadge";
import { StarRating } from "./StarRating";

export function WatchThese({ fights }: { fights: readonly CardFight[] }) {
  return (
    <section aria-labelledby="watch-these">
      <h2 id="watch-these" className="display border-t-2 border-[var(--text)] pt-3 text-2xl sm:text-3xl">
        Watch these
      </h2>
      {fights.length === 0 ? (
        <p className="mt-3 text-[var(--muted)]">No standout fights on this card</p>
      ) : (
        <ol className="mt-4 border-2 border-[var(--text)] bg-[var(--surface)]">
          {fights.map((fight) => (
            <li key={fight.id} className="border-b-2 border-[var(--text)] last:border-b-0">
              <a
                href={`#fight-${fight.id}`}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 hover:bg-[var(--surface-2)]"
              >
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 break-words font-extrabold">
                  <span>
                    {fight.fighterA.name} <span className="font-semibold text-[var(--accent)]">vs</span>{" "}
                    {fight.fighterB.name}
                  </span>
                  {isClassic(fight.rating?.stars) && <ClassicBadge />}
                  {isHiddenGem(fight) && (
                    <span className="whitespace-nowrap border-2 border-[var(--accent)] px-2 py-0.5 text-xs font-bold text-[var(--accent)]">
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
