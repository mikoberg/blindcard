"use client";

import { useState } from "react";
import { SEGMENT_LABELS, groupBySegment } from "@/lib/card/segments";
import { sortFights } from "@/lib/card/sort";
import type { CardFight, SortMode } from "@/lib/card/types";
import { FightCard } from "./FightCard";

const MODES: { mode: SortMode; label: string }[] = [
  { mode: "card", label: "Card order" },
  { mode: "rating", label: "Sort by rating" },
];

/**
 * All data here is public. The only sorts offered are card order and rating. In card order the
 * fights sit under their part of the card (main card, prelims, early prelims) when the event
 * has that information; sorted by rating each card carries its part as a label instead.
 */
export function FightList({ fights }: { fights: readonly CardFight[] }) {
  const [mode, setMode] = useState<SortMode>("card");
  const groups = groupBySegment(fights);
  return (
    <section aria-labelledby="full-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="full-card" className="font-[family-name:var(--font-display)] text-2xl font-bold">
          Full card
        </h2>
        <div role="group" aria-label="Sort fights" className="flex rounded-lg border border-[var(--border)] p-0.5">
          {MODES.map((option) => (
            <button
              key={option.mode}
              type="button"
              aria-pressed={mode === option.mode}
              onClick={() => setMode(option.mode)}
              className="min-h-11 rounded-md px-3 text-sm font-semibold aria-pressed:bg-[var(--accent)] aria-pressed:text-[var(--accent-ink)]"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {mode === "card" && groups ? (
        groups.map((group) => (
          <div key={group.segment} className="mt-6 first:mt-4">
            <h3 className="border-b border-[var(--border)] pb-2 font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--accent)]">
              {SEGMENT_LABELS[group.segment]}
            </h3>
            <ol className="mt-3 space-y-3">
              {group.fights.map((fight) => (
                <FightCard key={fight.id} fight={fight} />
              ))}
            </ol>
          </div>
        ))
      ) : (
        <ol className="mt-4 space-y-3">
          {sortFights(fights, mode).map((fight) => (
            <FightCard key={fight.id} fight={fight} showSegment={mode === "rating"} />
          ))}
        </ol>
      )}
    </section>
  );
}
