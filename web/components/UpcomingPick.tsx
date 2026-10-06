"use client";

import { useId, useState } from "react";
import { fetchPick, isTossUp, percent, type UpcomingPick as Pick } from "@/lib/upcoming/pick";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "shown"; pick: Pick };

/**
 * The model lean for this bout. It is learned from past results, so nothing is loaded until the
 * button is clicked, and only for this bout. It is a lean, not a certainty, and says so.
 */
export function UpcomingPick({ boutId, nameA, nameB }: { boutId: string; nameA: string; nameB: string }) {
  const [state, setState] = useState<State>({ status: "idle" });
  const panelId = useId();

  async function load() {
    if (state.status === "loading") return;
    setState({ status: "loading" });
    try {
      setState({ status: "shown", pick: await fetchPick(boutId) });
    } catch {
      setState({ status: "error" });
    }
  }

  const shown = state.status === "shown";
  return (
    <div className="mt-1 border-t border-[var(--border)] pt-2">
      <button
        type="button"
        onClick={shown ? () => setState({ status: "idle" }) : load}
        disabled={state.status === "loading"}
        aria-expanded={shown}
        aria-controls={panelId}
        // Many identical buttons on a card: the name says which bout this one is for.
        aria-label={`${state.status === "loading" ? "Loading…" : shown ? "Hide the model lean" : state.status === "error" ? "Try again" : "Show the model lean"}: ${nameA} versus ${nameB}`}
        className={`flex min-h-11 w-full items-center justify-between gap-4 px-4 text-left text-sm font-bold transition-colors focus-visible:outline-offset-[-5px] disabled:opacity-70 ${
          shown
            ? "border-2 border-[var(--text)] hover:bg-[var(--surface-2)]"
            : "redact hover:bg-[var(--accent)] hover:text-[var(--accent-ink)] focus-visible:outline-[var(--accent-ink)]"
        }`}
      >
        <span>
          {state.status === "loading"
            ? "Loading…"
            : shown
              ? "Hide the model lean"
              : state.status === "error"
                ? "Try again"
                : "Show the model lean"}
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
      {!shown && state.status !== "error" && (
        <p className="mt-2 text-xs text-[var(--muted)]">
          A statistical lean from the fighters&apos; past results, not betting advice. It can colour how you
          watch, so it stays closed until you open it.
        </p>
      )}
      <div id={panelId} aria-live="polite" className="mt-3">
        {state.status === "error" && (
          <p className="text-sm text-[var(--muted)]">Couldn&apos;t load this. Try again.</p>
        )}
        {state.status === "shown" && <Panel pick={state.pick} nameA={nameA} nameB={nameB} />}
      </div>
    </div>
  );
}

function Panel({ pick, nameA, nameB }: { pick: Pick; nameA: string; nameB: string }) {
  const name = pick.favoured === "a" ? nameA : nameB;
  const toss = isTossUp(pick);
  return (
    <div className="space-y-1 bg-[var(--bg)] p-4">
      <p className="display break-words text-xl">
        {toss ? `Too close to call, slight lean to ${name}` : `Model lean: ${name}`}{" "}
        <span className="text-[var(--accent)]">{percent(pick.probability)}</span>
      </p>
      <p className="text-sm text-[var(--muted)]">
        {pick.basis === "both"
          ? "Based on the earlier results of both fighters, including how any earlier meeting between them went."
          : "Only one of the two fighters has earlier results here, so this leans on that fighter."}
      </p>
      <p className="text-xs text-[var(--muted)]">
        Leans like this were right about {percent(pick.accuracy)} of the time on past fights (a coin flip is
        50%). A small lean, never a certainty, and not betting advice.
      </p>
    </div>
  );
}
