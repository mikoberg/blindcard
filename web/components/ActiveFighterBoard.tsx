"use client";

import { useState } from "react";
import { activeOnly } from "@/lib/leaderboard/active";
import type { LeaderboardEntry } from "@/lib/leaderboard/types";
import { FighterLeaderboard } from "./FighterLeaderboard";

/** How many rows are shown, however long the list is. */
const SHOWN = 100;

/**
 * The leaderboard with a switch between the fighters who fought in the last two years and everyone
 * since 2001. The list opens on the active fighters: a fighter of 2007 is not who you want to
 * watch tonight. Ranks are those of the list on show.
 */
export function ActiveFighterBoard({ entries, today }: { entries: readonly LeaderboardEntry[]; today: string }) {
  const [activeFilter, setActiveFilter] = useState(true);
  const active = activeOnly(entries, today);
  const shown = (activeFilter ? active : entries).slice(0, SHOWN);

  const option = (on: boolean, label: string, count: number, onClick: () => void) => (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center gap-2 px-4 text-sm font-bold ${
        on ? "bg-[var(--text)] text-[var(--bg)]" : "text-[var(--text)] hover:bg-[var(--surface-2)]"
      }`}
    >
      {label}
      <span className={`text-xs font-semibold tabular-nums ${on ? "opacity-80" : "text-[var(--muted)]"}`}>{count}</span>
    </button>
  );

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Which fighters" className="inline-flex border-2 border-[var(--text)]">
        {option(activeFilter, "Active", active.length, () => setActiveFilter(true))}
        {option(!activeFilter, "All since 2001", entries.length, () => setActiveFilter(false))}
      </div>
      <p className="text-sm text-[var(--muted)]">
        {activeFilter
          ? "Fighters who fought in the last two years."
          : "Everyone with enough rated fights, retired or not."}
      </p>
      {shown.length === 0 ? (
        <p className="text-[var(--muted)]">No active fighters to rank yet.</p>
      ) : (
        <FighterLeaderboard entries={shown} />
      )}
    </div>
  );
}
