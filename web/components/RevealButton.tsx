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
 * The result, sealed. The seal is a slim strip with a dashed edge, the line you tear along: it looks
 * the same for every fight, so nothing about it can hint at an outcome, and it turns to solid ink
 * under the pointer, like a redaction. The result is only loaded, and only for this fight, after a
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

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={shown ? () => dispatch({ type: "hide" }) : reveal}
        disabled={state.status === "loading"}
        aria-expanded={shown}
        aria-controls={panelId}
        // Many identical buttons on a card: the name says which fight this one is for.
        aria-label={`${label}: ${fighterA.name} versus ${fighterB.name}`}
        className={`flex h-9 w-full items-center justify-between gap-3 border-[1.5px] px-3 text-left text-[0.8rem] font-bold transition-colors disabled:opacity-70 ${
          shown
            ? "border-solid border-[var(--text)] bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--border)]"
            : "border-dashed border-[color-mix(in_srgb,var(--text)_65%,transparent)] text-[var(--text)] hover:border-solid hover:border-[var(--text)] hover:bg-[var(--text)] hover:text-[var(--bg)] focus-visible:bg-[var(--text)] focus-visible:text-[var(--bg)]"
        }`}
      >
        <span>{label}</span>
        {!shown && (
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5 shrink-0 opacity-75"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="5" y="11" width="14" height="10" rx="1" />
            <path d="M8 11V8a4 4 0 018 0v3" />
          </svg>
        )}
      </button>
      <div id={panelId} aria-live="polite">
        {state.status === "error" && (
          <p className="pt-2 text-sm text-[var(--muted)]">Couldn&apos;t load the result. Try again.</p>
        )}
        {state.status === "shown" && (
          <div className="mt-2 space-y-1 bg-[var(--bg)] p-3 sm:p-4">
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
