"use client";

import { useState } from "react";
import { sortFights } from "@/lib/card/sort";
import type { CardFight, SortMode } from "@/lib/card/types";
import { FightCard } from "./FightCard";

const MODES: { mode: SortMode; label: string }[] = [
  { mode: "card", label: "Card order" },
  { mode: "rating", label: "Sort by rating" },
];

/** All data here is public. The only sorts offered are card order and rating. */
export function FightList({ fights }: { fights: readonly CardFight[] }) {
  const [mode, setMode] = useState<SortMode>("card");
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
      <ol className="mt-4 space-y-3">
        {sortFights(fights, mode).map((fight) => (
          <FightCard key={fight.id} fight={fight} />
        ))}
      </ol>
    </section>
  );
}
