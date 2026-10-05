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
        <h2 id="full-card" className="section-title">
          Full card
        </h2>
        <div role="group" aria-label="Sort fights" className="flex rounded-full bg-[var(--surface)] p-1">
          {MODES.map((option) => (
            <button
              key={option.mode}
              type="button"
              aria-pressed={mode === option.mode}
              onClick={() => setMode(option.mode)}
              className="min-h-10 rounded-full px-3 text-sm font-bold text-[var(--muted)] hover:text-[var(--text)] aria-pressed:bg-[var(--text)] aria-pressed:text-[var(--ink)]"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {mode === "card" && groups ? (
        groups.map((group) => (
          <div key={group.segment} className="mt-8 first:mt-5">
            <h3 className="display-tight mb-3 flex items-center gap-3 text-lg">
              <span className="redact rounded-sm px-2 py-0.5">{SEGMENT_LABELS[group.segment]}</span>
              <span aria-hidden="true" className="h-px flex-1 bg-[var(--border)]" />
            </h3>
            <ol className="space-y-4">
              {group.fights.map((fight) => (
                <FightCard key={fight.id} fight={fight} />
              ))}
            </ol>
          </div>
        ))
      ) : (
        <ol className="mt-5 space-y-4">
          {sortFights(fights, mode).map((fight) => (
            <FightCard key={fight.id} fight={fight} showSegment={mode === "rating"} />
          ))}
        </ol>
      )}
    </section>
  );
}
