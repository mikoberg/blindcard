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
    <div className="mt-5">
      <button
        type="button"
        onClick={shown ? () => dispatch({ type: "hide" }) : reveal}
        disabled={state.status === "loading"}
        aria-expanded={shown}
        aria-controls={panelId}
        className={`flex min-h-11 w-full items-center justify-between gap-4 px-4 text-left text-sm font-bold transition-colors disabled:opacity-70 sm:px-5 ${
          shown
            ? "bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--border)]"
            : "redact hover:bg-[var(--accent)] hover:text-[var(--accent-ink)]"
        }`}
      >
        <span>{label}</span>
        {!shown && (
          <span aria-hidden="true" className="flex items-center gap-1.5">
            <span className="h-2 w-10 bg-current opacity-40" />
            <span className="h-2 w-6 bg-current opacity-40" />
            <span className="h-2 w-14 bg-current opacity-40" />
          </span>
        )}
      </button>
      <div id={panelId} aria-live="polite">
        {state.status === "error" && (
          <p className="px-4 py-3 text-sm text-[var(--muted)] sm:px-5">Couldn&apos;t load the result. Try again.</p>
        )}
        {state.status === "shown" && (
          <div className="space-y-1 bg-[var(--bg)]/60 p-4 sm:p-5">
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
