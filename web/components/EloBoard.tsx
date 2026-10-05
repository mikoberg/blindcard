"use client";

import { useId, useState } from "react";
import { fetchEloBoard, type EloEntry } from "@/lib/elo/board";
import { formatEventDate } from "@/lib/format";
import { EloHistory } from "./EloHistory";
import { Monogram } from "./Monogram";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "shown"; board: EloEntry[] };

function lastFought(iso: string): string {
  try {
    return formatEventDate(iso);
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
        className={`mt-4 flex min-h-12 w-full max-w-md items-center justify-between gap-4 px-4 text-left text-sm font-bold transition-colors focus-visible:outline-offset-[-5px] disabled:opacity-70 ${
          shown
            ? "border-2 border-[var(--text)] hover:bg-[var(--surface-2)]"
            : "redact hover:bg-[var(--accent)] hover:text-[var(--accent-ink)] focus-visible:outline-[var(--accent-ink)]"
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
            <ol className="divide-y-2 divide-[var(--text)] border-2 border-[var(--text)] bg-[var(--surface)]">
              {state.board.map((entry) => {
                const open = entry.slug !== null && openSlug === entry.slug;
                const row = (
                  <>
                    <span className="display-tight w-9 shrink-0 text-right text-2xl tabular-nums text-[var(--muted)]">
                      {entry.rank}
                    </span>
                    <Monogram name={entry.name} country={entry.country} size="md" />
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block break-words text-lg font-extrabold leading-tight sm:text-xl">
                        {entry.name}
                      </span>
                      <span className="block text-sm font-normal text-[var(--muted)]">
                        {entry.fights} fights, last fought {lastFought(entry.lastFight)}
                      </span>
                    </span>
                    <span
                      role="img"
                      aria-label={`Elo rating ${Math.round(entry.rating)}`}
                      className="scorebox h-11 w-[4.5rem] shrink-0 text-xl"
                    >
                      <span aria-hidden="true">{Math.round(entry.rating)}</span>
                    </span>
                    {entry.slug && (
                      <svg
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        className={`h-5 w-5 shrink-0 text-[var(--muted)] transition-transform ${open ? "rotate-180" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    )}
                  </>
                );
                const rowClass = "flex w-full items-center gap-3 px-3 py-3 sm:gap-4 sm:px-4";
                return (
                  <li key={`${entry.rank}-${entry.name}`}>
                    {entry.slug ? (
                      <button
                        type="button"
                        aria-expanded={open}
                        aria-controls={`${panelId}-${entry.slug}`}
                        onClick={() => setOpenSlug(open ? null : entry.slug)}
                        className={`${rowClass} hover:bg-[var(--surface-2)] focus-visible:outline-offset-[-4px]`}
                      >
                        {row}
                      </button>
                    ) : (
                      <div className={rowClass}>{row}</div>
                    )}
                    {open && entry.slug && (
                      <div id={`${panelId}-${entry.slug}`}>
                        <EloHistory slug={entry.slug} name={entry.name} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </div>
    </div>
  );
}
