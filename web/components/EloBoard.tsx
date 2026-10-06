"use client";

import { useId, useState } from "react";
import { fetchEloBoard, type EloEntry } from "@/lib/elo/board";
import { formatMonthYear } from "@/lib/format";
import { EloHistory } from "./EloHistory";
import { FlagChip } from "./FlagChip";
import { FIGHTS_COL, RANK_COL } from "./FighterRow";
import { ListHeader } from "./FighterLeaderboard";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "shown"; board: EloEntry[] };

function lastFought(iso: string): string {
  try {
    return formatMonthYear(iso);
  } catch {
    return iso;
  }
}

/**
 * The Elo leaderboard. It is built from who beat whom, so nothing is loaded until the button is
 * clicked, and the warning stands right above the button.
 */
export function EloBoard() {
  const [state, setState] = useState<State>({ status: "idle" });
  const panelId = useId();
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  async function load() {
    if (state.status === "loading") return;
    setState({ status: "loading" });
    try {
      setState({ status: "shown", board: await fetchEloBoard() });
    } catch {
      setState({ status: "error" });
    }
  }

  const shown = state.status === "shown";
  return (
    <div>
      {!shown && (
        <p className="max-w-xl border-l-4 border-[var(--accent)] pl-4 font-semibold">
          Spoilers ahead. This list is built from who beat whom, so where a fighter stands can tell you how their
          latest fights went. Open it only if you do not mind knowing.
        </p>
      )}
      <button
        type="button"
        onClick={shown ? () => setState({ status: "idle" }) : load}
        disabled={state.status === "loading"}
        aria-expanded={shown}
        aria-controls={panelId}
        className={`mt-4 flex items-center justify-between gap-4 px-4 text-left text-sm font-bold transition-colors focus-visible:outline-offset-[-5px] disabled:opacity-70 ${
          shown
            ? "min-h-10 border-2 border-[var(--text)] hover:bg-[var(--surface-2)]"
            : "min-h-12 w-full max-w-md redact hover:bg-[var(--accent)] hover:text-[var(--accent-ink)] focus-visible:outline-[var(--accent-ink)]"
        }`}
      >
        <span>
          {state.status === "loading"
            ? "Loading…"
            : shown
              ? "Hide the list"
              : state.status === "error"
                ? "Try again"
                : "Show the strongest fighters (spoilers)"}
        </span>
        {!shown && (
          <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center border-2 border-current opacity-70">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="11" width="14" height="10" rx="1" />
              <path d="M8 11V8a4 4 0 018 0v3" />
            </svg>
          </span>
        )}
      </button>

      <div id={panelId} aria-live="polite" className="mt-6">
        {state.status === "error" && (
          <p className="text-sm text-[var(--muted)]">Could not load the list. Try again.</p>
        )}
        {state.status === "shown" && state.board.length === 0 && (
          <p className="text-[var(--muted)]">Nobody qualifies yet.</p>
        )}
        {state.status === "shown" && state.board.length > 0 && (
          <>
            <p className="mb-3 max-w-xl text-sm text-[var(--muted)]">
              Open a fighter to see exactly how the rating was built, fight by fight.
            </p>
            <div className="border-2 border-[var(--text)] bg-[var(--surface)]">
              <ListHeader>
                <span className={RANK_COL}>#</span>
                <span className="w-6 shrink-0" />
                <span className="flex-1">Fighter</span>
                <span className={FIGHTS_COL}>Fights</span>
                <span className="hidden w-24 shrink-0 text-right sm:block">Last fought</span>
                <span className="hidden w-14 shrink-0 text-right sm:block">Peak</span>
                <span className="w-14 shrink-0 text-right">Elo</span>
                <span className="w-4 shrink-0" />
              </ListHeader>
              <ol className="divide-y divide-[var(--border)]">
                {state.board.map((entry) => {
                  const open = entry.slug !== null && openSlug === entry.slug;
                  const row = (
                    <>
                      <span className={`${RANK_COL} text-sm font-bold tabular-nums text-[var(--muted)]`}>
                        {entry.rank}
                      </span>
                      <FlagChip country={entry.country} />
                      <span className="min-w-0 flex-1 text-left">
                        <span className="block break-words font-extrabold leading-tight sm:text-lg">{entry.name}</span>
                        <span className="block text-xs font-normal text-[var(--muted)] sm:hidden">
                          {entry.fights} fights &middot; {lastFought(entry.lastFight)}
                        </span>
                      </span>
                      <span className={`${FIGHTS_COL} text-sm font-normal tabular-nums text-[var(--muted)]`}>
                        {entry.fights}
                      </span>
                      <span className="hidden w-24 shrink-0 text-right text-sm font-normal tabular-nums text-[var(--muted)] sm:block">
                        {lastFought(entry.lastFight)}
                      </span>
                      <span
                        className="hidden w-14 shrink-0 text-right text-sm font-normal tabular-nums text-[var(--muted)] sm:block"
                        title={`Highest rating, reached ${lastFought(entry.peakDate)}`}
                      >
                        {Math.round(entry.peak)}
                      </span>
                      <span
                        role="img"
                        aria-label={`Elo rating ${Math.round(entry.rating)}`}
                        className="display-tight w-14 shrink-0 text-right text-lg tabular-nums"
                      >
                        <span aria-hidden="true">{Math.round(entry.rating)}</span>
                      </span>
                      <span className="flex w-4 shrink-0 justify-end">
                        {entry.slug && (
                          <svg
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                            className={`h-4 w-4 text-[var(--muted)] transition-transform ${open ? "rotate-180" : ""}`}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                        )}
                      </span>
                    </>
                  );
                  const rowClass = "flex min-h-[3.25rem] w-full items-center gap-3 px-3 py-2 sm:px-4";
                  return (
                    <li key={`${entry.rank}-${entry.name}`}>
                      {entry.slug ? (
                        <button
                          type="button"
                          aria-expanded={open}
                          aria-controls={`${panelId}-${entry.slug}`}
                          onClick={() => setOpenSlug(open ? null : entry.slug)}
                          className={`${rowClass} hover:bg-[var(--surface-2)] focus-visible:outline-offset-[-4px] ${open ? "bg-[var(--surface-2)]" : ""}`}
                        >
                          {row}
                        </button>
                      ) : (
                        <div className={rowClass}>{row}</div>
                      )}
                      {open && entry.slug && (
                        <div id={`${panelId}-${entry.slug}`}>
                          <EloHistory slug={entry.slug} name={entry.name} rating={entry.rating} peak={entry.peak} peakDate={entry.peakDate} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
