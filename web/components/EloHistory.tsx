"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchEloHistory, type EloStepView } from "@/lib/elo/history";
import { formatEventDate } from "@/lib/format";

type State = { status: "loading" } | { status: "error" } | { status: "shown"; steps: EloStepView[] };

function day(iso: string): string {
  try {
    return formatEventDate(iso);
  } catch {
    return iso;
  }
}

const signed = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(1)}`;

function Figure({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-[0.7rem] text-[var(--muted)]">{label}</dt>
      <dd className={`tabular-nums ${strong ? "display-tight text-base" : "text-sm font-semibold"}`}>{value}</dd>
    </div>
  );
}

/**
 * The calculation behind one rating, fight by fight, newest first: the rating before, the
 * opponent's, the expected score, K, what the fight counted as, the change and the rating after.
 * It names fights and how they were decided, so it loads only when its fighter is opened.
 */
export function EloHistory({
  slug,
  name,
  rating,
  peak,
  peakDate,
}: {
  slug: string;
  name: string;
  rating: number;
  peak: number;
  peakDate: string;
}) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetchEloHistory(slug)
      .then((steps) => !cancelled && setState({ status: "shown", steps }))
      .catch(() => !cancelled && setState({ status: "error" }));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (state.status === "loading") return <p className="px-4 py-4 text-sm text-[var(--muted)]">Loading…</p>;
  if (state.status === "error") {
    return <p className="px-4 py-4 text-sm text-[var(--muted)]">Could not load the calculation. Close this row and try again.</p>;
  }

  return (
    <div className="border-t border-[var(--border)] bg-[var(--bg)] px-3 py-4 sm:px-4">
      <p className="mb-3 text-sm">
        <span className="font-bold">Now {Math.round(rating)}.</span>{" "}
        {Math.round(peak) > Math.round(rating) ? (
          <>
            Highest ever <span className="font-bold">{Math.round(peak)}</span>, reached {day(peakDate)} (
            {Math.round(peak - rating)} points above now).
          </>
        ) : (
          <>At the highest rating {name} has reached.</>
        )}
      </p>
      <p className="max-w-2xl text-sm text-[var(--muted)]">
        Every fight moves the rating by <strong className="text-[var(--text)]">K × (score − expected)</strong>. Expected
        is the chance the rating predicts, 1 / (1 + 10^((opponent − own) / 400)). Score is 1 for a win and 0 for a loss;
        a split decision counts 0.667 and a majority decision 0.833 for the winner, a draw 0.5 for both. Everyone
        starts at 1500.
      </p>
      <ol className="mt-4 space-y-3">
        {state.steps.map((step) => (
          <li key={step.seq} className="border-l-4 border-[var(--text)] bg-[var(--surface)] px-3 py-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
              <p className="min-w-0 font-bold">
                {step.opponentSlug ? (
                  <Link href={`/fighters/${step.opponentSlug}`} className="underline underline-offset-4 hover:text-[var(--accent)]">
                    {step.opponent}
                  </Link>
                ) : (
                  step.opponent
                )}
                <span className="ml-2 text-sm font-normal text-[var(--muted)]">{step.how}</span>
              </p>
              <p className="text-xs text-[var(--muted)]">
                #{step.seq} · {day(step.date)} · {step.eventName}
              </p>
            </div>
            <dl className="mt-2 grid grid-cols-4 gap-x-3 gap-y-2 sm:grid-cols-7">
              <Figure label="Before" value={step.ratingBefore.toFixed(1)} />
              <Figure label="Opponent" value={step.opponentRating.toFixed(1)} />
              <Figure label="Expected" value={`${(step.expected * 100).toFixed(1)}%`} />
              <Figure label="K" value={step.k.toFixed(1)} />
              <Figure label="Score" value={step.score.toFixed(3).replace(/\.?0+$/, "") || "0"} />
              <Figure label="Change" value={signed(step.change)} strong />
              <Figure label="After" value={step.ratingAfter.toFixed(1)} strong />
            </dl>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-sm">
        <Link href={`/fighters/${slug}`} className="font-semibold underline underline-offset-4 hover:text-[var(--accent)]">
          {name} and how well their fights were rated
        </Link>
      </p>
    </div>
  );
}
