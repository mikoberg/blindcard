"use client";

import { useState } from "react";

type State = "idle" | "copied" | "failed";

/**
 * Shares the link to one fight on its card (the card page, scrolled to the fight). The link and the
 * text hold only the two names: no rating and nothing that depends on the result. Uses the phone's
 * share sheet when there is one, and copies the link otherwise.
 */
export function ShareFightButton({
  fightId,
  fighterA,
  fighterB,
}: {
  fightId: string;
  fighterA: string;
  fighterB: string;
}) {
  const [state, setState] = useState<State>("idle");

  async function share() {
    const url = `${window.location.origin}${window.location.pathname}#fight-${fightId}`;
    const title = `${fighterA} vs ${fighterB}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, text: `${title}: worth watching? No spoilers.`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch (error) {
      if ((error as { name?: string }).name === "AbortError") return; // closed the share sheet
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2500);
  }

  return (
    <span className="inline-flex shrink-0 items-center gap-2">
      <span aria-live="polite" className="text-xs font-semibold text-[var(--muted)]">
        {state === "copied" ? "Link copied" : state === "failed" ? "Could not copy" : ""}
      </span>
      <button
        type="button"
        onClick={share}
        aria-label={`Share ${fighterA} versus ${fighterB}`}
        title="Share this fight"
        className="inline-flex h-8 w-8 items-center justify-center text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[1.15rem] w-[1.15rem]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 15V3" />
          <path d="M7.5 7.5L12 3l4.5 4.5" />
          <path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
        </svg>
      </button>
    </span>
  );
}
