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
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={share}
        aria-label={`Share ${fighterA} versus ${fighterB}`}
        className="inline-flex min-h-11 items-center px-1 text-sm font-semibold text-[var(--muted)] underline underline-offset-4 hover:text-[var(--accent)]"
      >
        Share
      </button>
      <span aria-live="polite" className="text-sm text-[var(--muted)]">
        {state === "copied" ? "Link copied" : state === "failed" ? "Could not copy the link" : ""}
      </span>
    </span>
  );
}
