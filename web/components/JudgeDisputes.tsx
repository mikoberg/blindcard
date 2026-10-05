"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { formatEventDate } from "@/lib/format";
import {
  describeMethod,
  fetchDisputes,
  otherFighter,
  type DisputedCard,
} from "@/lib/judges/disputes";
import { splitScorecard } from "@/lib/judges/parse";
import { ScorecardLine } from "./ScorecardLine";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "shown"; cards: DisputedCard[] };

/**
 * The scorecards this judge scored against the official result, so you can see where the pattern
 * comes from. It names fights and who they went to, so nothing is loaded until the button is
 * clicked, and the warning stands next to the button.
 */
export function JudgeDisputes({
  slug,
  name,
  slugs,
}: {
  slug: string;
  name: string;
  slugs: readonly string[];
}) {
  const [state, setState] = useState<State>({ status: "idle" });
  const panelId = useId();

  async function load() {
    if (state.status === "loading") return;
    setState({ status: "loading" });
    try {
      setState({ status: "shown", cards: await fetchDisputes(slug) });
    } catch {
      setState({ status: "error" });
    }
  }

  const shown = state.status === "shown";
  return (
    <div className="mt-4">
      {!shown && (
        <p className="max-w-xl text-sm text-[var(--muted)]">
          This lists real fights with their official results and all three
          scorecards. Open it only if you have seen these fights or don&apos;t
          mind knowing how they went.
        </p>
      )}
      <button
        type="button"
        onClick={shown ? () => setState({ status: "idle" }) : load}
        disabled={state.status === "loading"}
        aria-expanded={shown}
        aria-controls={panelId}
        className={`mt-3 flex min-h-12 w-full max-w-md items-center rounded-lg justify-between gap-4 px-4 text-left text-sm font-bold transition-colors disabled:opacity-70 ${shown ? "border border-[var(--border)] hover:bg-[var(--surface-2)]" : "redact hover:bg-[var(--accent)] hover:text-[var(--accent-ink)]"}`}
      >
        {state.status === "loading"
          ? "Loading…"
          : shown
            ? "Hide scorecards"
            : state.status === "error"
              ? "Try again"
              : "Show their most disputed scorecards"}
      </button>
      <div id={panelId} aria-live="polite" className="mt-4">
        {state.status === "error" && (
          <p className="text-sm text-[var(--muted)]">
            Couldn&apos;t load the scorecards. Try again.
          </p>
        )}
        {state.status === "shown" && state.cards.length === 0 && (
          <p className="text-sm text-[var(--muted)]">
            No scorecards to show for {name}.
          </p>
        )}
        {state.status === "shown" && state.cards.length > 0 && (
          <>
            <p className="mb-3 max-w-xl text-sm text-[var(--muted)]">
              Scorecards where {name} had the other fighter ahead, the ones
              furthest from the other two judges first. The first score on a
              card is for the fighter who lost the official result.
            </p>
            <ol className="space-y-4">
              {state.cards.map((c) => (
                <DisputeItem key={c.fightId} card={c} name={name} slugs={slugs} />
              ))}
            </ol>
          </>
        )}
      </div>
    </div>
  );
}

export function DisputeItem({
  card,
  name,
  slugs,
}: {
  card: DisputedCard;
  name: string;
  slugs: readonly string[];
}) {
  return (
    <li className="space-y-1 rounded-lg bg-[var(--surface)] p-4">
      <p className="break-words display text-xl font-bold">
        <Link
          href={`/fighters/${card.fighterA.slug}`}
          className="hover:text-[var(--accent)]"
        >
          {card.fighterA.name}
        </Link>{" "}
        vs{" "}
        <Link
          href={`/fighters/${card.fighterB.slug}`}
          className="hover:text-[var(--accent)]"
        >
          {card.fighterB.name}
        </Link>
      </p>
      <p className="text-sm text-[var(--muted)]">
        <Link
          href={`/events/${card.eventSlug}`}
          className="underline decoration-[var(--accent)]/60 underline-offset-4 hover:decoration-[var(--accent)]"
        >
          {card.eventName}
        </Link>
        , {formatEventDate(card.eventDate)}
      </p>
      <p className="break-words text-sm">
        Official result: {card.winnerName}, {describeMethod(card.method)}
      </p>
      <p className="text-sm font-semibold text-[var(--accent)]">
        {name} had {otherFighter(card)} ahead
        {card.lone ? ", against both other judges." : "."}
      </p>
      <ul className="mt-2 space-y-0.5 text-sm text-[var(--muted)]">
        {card.scorecards.map((text, index) => {
          const own = splitScorecard(text);
          const mine = own !== null && own.slug !== null && slugs.includes(own.slug);
          return (
            <li
              key={index}
              className={mine ? "font-semibold text-[var(--text)]" : undefined}
            >
              {mine ? (
                <>
                  {own.judge} {own.scores}{" "}
                  <span className="font-normal text-[var(--muted)]">
                    (this judge)
                  </span>
                </>
              ) : (
                <ScorecardLine text={text} />
              )}
            </li>
          );
        })}
      </ul>
    </li>
  );
}
