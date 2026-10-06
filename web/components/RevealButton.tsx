"use client";

import { ScorecardLine } from "./ScorecardLine";
import { useId, useReducer } from "react";
import type { CardFighter } from "@/lib/card/types";
import { fetchReveal } from "@/lib/reveal/client";
import { formatReveal } from "@/lib/reveal/format";
import { revealReducer } from "@/lib/reveal/state";
import { ScoreBreakdown } from "./ScoreBreakdown";

interface Props {
  fightId: string;
  fighterA: CardFighter;
  fighterB: CardFighter;
}

/**
 * The result, sealed: one quiet row along the foot of the card, a hairline above it and a lock on
 * the right. It looks the same for every fight, so nothing about it can hint at an outcome, and it
 * turns to solid ink under the pointer. The result is only loaded, and only for this fight, after a
 * click on it.
 */
export function RevealButton({ fightId, fighterA, fighterB }: Props) {
  const [state, dispatch] = useReducer(revealReducer, { status: "hidden" });
  const panelId = useId();

  async function reveal() {
    if (state.status === "loading" || state.status === "shown") return;
    dispatch({ type: "request" });
    try {
      const response = await fetchReveal(fightId);
      dispatch({ type: "success", view: formatReveal(response, fighterA, fighterB) });
    } catch {
      dispatch({ type: "failure" });
    }
  }

  const shown = state.status === "shown";
  const label =
    state.status === "loading"
      ? "Loading…"
      : shown
        ? "Hide result"
        : state.status === "error"
          ? "Try again"
          : "Reveal result";

  // Two grid cells of the fight card: the row under the matchup, and the panel across the full width
  // below it, so the rating column keeps its place when the result opens.
  return (
    <>
      <div className="border-t border-[var(--border)] sm:col-start-2">
        <button
          type="button"
          onClick={shown ? () => dispatch({ type: "hide" }) : reveal}
          disabled={state.status === "loading"}
          aria-expanded={shown}
          aria-controls={panelId}
          // Many identical buttons on a card: the name says which fight this one is for.
          aria-label={`${label}: ${fighterA.name} versus ${fighterB.name}`}
          className={`flex h-9 w-full items-center justify-between gap-3 px-4 text-left text-[0.8rem] font-bold transition-colors focus-visible:-outline-offset-4 disabled:opacity-70 sm:px-5 ${
            shown
              ? "bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--border)]"
              : "text-[var(--text)] hover:bg-[var(--text)] hover:text-[var(--surface)] focus-visible:bg-[var(--text)] focus-visible:text-[var(--surface)]"
          }`}
        >
          <span>{label}</span>
          {!shown && (
            <span aria-hidden="true" className="flex items-center gap-1.5 font-semibold opacity-70">
              Spoiler
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="5" y="11" width="14" height="10" rx="1" />
                <path d="M8 11V8a4 4 0 018 0v3" />
              </svg>
            </span>
          )}
        </button>
      </div>
      <div id={panelId} aria-live="polite" className="sm:col-span-2">
        {state.status === "error" && (
          <p className="px-4 pb-2 text-sm text-[var(--muted)] sm:px-5">Couldn&apos;t load the result. Try again.</p>
        )}
        {state.status === "shown" && (
          <div className="space-y-1 border-t-2 border-[var(--text)] bg-[var(--bg)] px-4 py-3 sm:px-5">
            <p className="display break-words text-xl">{state.view.headline}</p>
            <p className="break-words text-sm">{state.view.method}</p>
            <p className="text-sm text-[var(--muted)]">{state.view.when}</p>
            {state.view.scorecards.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-sm text-[var(--muted)]">
                {state.view.scorecards.map((card, index) => (
                  <li key={index}>
                    <ScorecardLine text={card} />
                  </li>
                ))}
              </ul>
            )}
            {state.view.score && <ScoreBreakdown score={state.view.score} />}
          </div>
        )}
      </div>
    </>
  );
}
