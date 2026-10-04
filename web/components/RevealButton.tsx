"use client";

import { useId, useReducer } from "react";
import type { CardFighter } from "@/lib/card/types";
import { fetchReveal } from "@/lib/reveal/client";
import { formatReveal } from "@/lib/reveal/format";
import { revealReducer } from "@/lib/reveal/state";

interface Props {
  fightId: string;
  fighterA: CardFighter;
  fighterB: CardFighter;
}

/** The only client-side holder of a result, and only after an explicit click on this fight. */
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
    <div className="mt-4">
      <button
        type="button"
        onClick={shown ? () => dispatch({ type: "hide" }) : reveal}
        disabled={state.status === "loading"}
        aria-expanded={shown}
        aria-controls={panelId}
        className="min-h-11 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 text-sm font-semibold transition-colors hover:border-[var(--accent)] disabled:opacity-60"
      >
        {label}
      </button>
      <div id={panelId} aria-live="polite" className="mt-3">
        {state.status === "error" && (
          <p className="text-sm text-[var(--muted)]">Couldn&apos;t load the result. Try again.</p>
        )}
        {state.status === "shown" && (
          <div className="space-y-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
            <p className="break-words font-[family-name:var(--font-display)] text-xl font-bold">
              {state.view.headline}
            </p>
            <p className="break-words text-sm">{state.view.method}</p>
            <p className="text-sm text-[var(--muted)]">{state.view.when}</p>
            {state.view.scorecards.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-sm text-[var(--muted)]">
                {state.view.scorecards.map((card, index) => (
                  <li key={index}>{card}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
