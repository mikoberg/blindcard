"use client";

import { useEffect, useId, useState } from "react";
import { ELO_STATUSES, fetchEloBoard, type EloEntry, type EloStatus } from "@/lib/elo/board";
import { formatMonthYear } from "@/lib/format";
import { EloHistory } from "./EloHistory";
import { FlagChip } from "./FlagChip";
import { FIGHTS_COL, RANK_COL } from "./FighterRow";
import { ListHeader } from "./FighterLeaderboard";

type State =
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
 * The Elo leaderboard. It is built from who beat whom, so it is never part of the page render: the
 * browser asks for it (a POST, never cached) as soon as the page has opened.
 */
const STATUS_LABEL: Record<EloStatus, string> = { active: "Active", inactive: "Inactive", all: "All" };
const STATUS_NOTE: Record<EloStatus, string> = {
  active: "Fighters who fought in the last two years.",
  inactive: "Fighters on the list who have not fought for two years or more.",
  all: "Everyone on the list, active or not.",
};

export function EloBoard() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [which, setWhich] = useState<EloStatus>("active");
  const panelId = useId();
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  function choose(next: EloStatus) {
    if (next === which) return;
    setOpenSlug(null);
    setState({ status: "loading" });
    setWhich(next);
  }

  function load() {
    setState({ status: "loading" });
    fetchEloBoard(which)
      .then((board) => setState({ status: "shown", board }))
      .catch(() => setState({ status: "error" }));
  }

  useEffect(() => {
    let live = true;
    fetchEloBoard(which)
      .then((board) => live && setState({ status: "shown", board }))
      .catch(() => live && setState({ status: "error" }));
    return () => {
      live = false;
    };
  }, [which]);

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Which fighters" className="inline-flex border-2 border-[var(--text)]">
        {ELO_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            aria-pressed={which === status}
            onClick={() => choose(status)}
            className={`inline-flex min-h-11 items-center px-4 text-sm font-bold ${
              which === status ? "bg-[var(--text)] text-[var(--bg)]" : "text-[var(--text)] hover:bg-[var(--surface-2)]"
            }`}
          >
            {STATUS_LABEL[status]}
          </button>
        ))}
      </div>
      <p className="text-sm text-[var(--muted)]">{STATUS_NOTE[which]}</p>
      <div id={panelId} aria-live="polite">
        {state.status === "loading" && <p className="text-[var(--muted)]">Loading the list…</p>}
        {state.status === "error" && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--muted)]">Could not load the list.</p>
            <button
              type="button"
              onClick={load}
              className="min-h-10 border-2 border-[var(--text)] px-4 text-sm font-bold hover:bg-[var(--surface-2)]"
            >
              Try again
            </button>
          </div>
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
