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
    <div className="border-t border-[var(--border)]">
      <button
        type="button"
        onClick={shown ? () => setState({ status: "idle" }) : load}
        disabled={state.status === "loading"}
        aria-expanded={shown}
        aria-controls={panelId}
        // Many identical buttons on a card: the name says which bout this one is for.
        aria-label={`${state.status === "loading" ? "Loading…" : shown ? "Hide the model lean" : state.status === "error" ? "Try again" : "Show the model lean"}: ${nameA} versus ${nameB}`}
        className={`flex h-9 w-full items-center justify-between gap-4 px-4 text-left text-[0.8rem] font-bold transition-colors focus-visible:-outline-offset-4 disabled:opacity-70 sm:px-5 ${
          shown
            ? "bg-[var(--surface-2)] hover:bg-[var(--border)]"
            : "hover:bg-[var(--text)] hover:text-[var(--surface)] focus-visible:bg-[var(--text)] focus-visible:text-[var(--surface)]"
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
          <span aria-hidden="true" className="flex items-center gap-1.5 font-semibold opacity-70">
            Spoiler
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="11" width="14" height="10" rx="1" />
              <path d="M8 11V8a4 4 0 018 0v3" />
            </svg>
          </span>
        )}
      </button>
      {!shown && state.status !== "error" && (
        <p className="px-4 py-2 text-xs text-[var(--muted)] sm:px-5">
          A statistical lean from the fighters&apos; past results, not betting advice. It can colour how you
          watch, so it stays closed until you open it.
        </p>
      )}
      <div id={panelId} aria-live="polite">
        {state.status === "error" && (
          <p className="px-4 py-2 text-sm text-[var(--muted)] sm:px-5">Couldn&apos;t load this. Try again.</p>
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
    <div className="space-y-1 bg-[var(--bg)] px-4 py-4 sm:px-5">
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
