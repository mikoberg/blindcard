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
 * The result, blacked out. The sealed bar is the button: a fixed ink bar that looks the same for
 * every fight, so nothing about it can hint at an outcome. The result is only loaded, and only
 * for this fight, after a click on it.
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

  return (
    <div className="mt-5 border-t-2 border-[var(--text)]">
      <button
        type="button"
        onClick={shown ? () => dispatch({ type: "hide" }) : reveal}
        disabled={state.status === "loading"}
        aria-expanded={shown}
        aria-controls={panelId}
        // Many identical buttons on a card: the name says which fight this one is for.
        aria-label={`${label}: ${fighterA.name} versus ${fighterB.name}`}
        // The ring sits inside the button: the card clips anything drawn outside its edge.
        className={`flex min-h-12 w-full items-center justify-between gap-4 px-4 text-left text-sm font-bold transition-colors focus-visible:outline-offset-[-5px] disabled:opacity-70 sm:px-5 ${
          shown
            ? "bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--border)]"
            : "redact hover:bg-[var(--accent)] hover:text-[var(--accent-ink)] focus-visible:outline-[var(--accent-ink)]"
        }`}
      >
        <span>{label}</span>
        {!shown && (
          <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center border-2 border-current opacity-70">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="11" width="14" height="10" rx="1" />
              <path d="M8 11V8a4 4 0 018 0v3" />
            </svg>
          </span>
        )}
      </button>
      <div id={panelId} aria-live="polite">
        {state.status === "error" && (
          <p className="px-4 py-3 text-sm text-[var(--muted)] sm:px-5">Couldn&apos;t load the result. Try again.</p>
        )}
        {state.status === "shown" && (
          <div className="space-y-1 bg-[var(--bg)] p-4 sm:p-5">
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
    </div>
  );
}
