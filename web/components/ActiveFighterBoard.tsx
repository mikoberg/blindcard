"use client";

import { useId, useState } from "react";
import { activeOnly } from "@/lib/leaderboard/active";
import { BOARD_GROUPS, BOARD_ORDERS, orderById, orderEntries, type BoardOrder } from "@/lib/leaderboard/order";
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
  const [order, setOrder] = useState<BoardOrder>("rating");
  const orderId = useId();
  const active = activeOnly(entries, today);
  const option = orderById(order);
  const shown = orderEntries(activeFilter ? active : entries, order).slice(0, SHOWN);

  const choice = (on: boolean, label: string, count: number, onClick: () => void) => (
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
        {choice(activeFilter, "Active", active.length, () => setActiveFilter(true))}
        {choice(!activeFilter, "All since 2001", entries.length, () => setActiveFilter(false))}
      </div>
      <div className="flex max-w-md items-center gap-3 border-2 border-[var(--text)] bg-[var(--surface)] px-3">
        <label htmlFor={orderId} className="shrink-0 text-sm font-bold text-[var(--muted)]">
          Order by
        </label>
        <select
          id={orderId}
          value={order}
          onChange={(e) => setOrder(orderById(e.target.value).id)}
          className="min-h-11 min-w-0 flex-1 bg-transparent text-sm font-bold text-[var(--text)]"
        >
          {BOARD_GROUPS.map((group) => (
            <optgroup key={group} label={group}>
              {BOARD_ORDERS.filter((o) => o.group === group).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <p className="text-sm text-[var(--muted)]">
        {activeFilter
          ? "Fighters who fought in the last two years."
          : "Everyone with enough rated fights, retired or not."}
      </p>
      {shown.length === 0 ? (
        <p className="text-[var(--muted)]">No active fighters to rank yet.</p>
      ) : (
        <FighterLeaderboard
          entries={shown}
          extra={option.column ? { label: option.column, value: option.value, format: option.format } : null}
        />
      )}
    </div>
  );
}
