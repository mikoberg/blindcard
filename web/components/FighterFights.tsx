"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { formatMonthYear } from "@/lib/format";
import { fetchFighterResults, type FightOutcome, type FighterResult, type OtherBout } from "@/lib/fighters/results";
import { formatRating, isHighRating } from "@/lib/leaderboard/format";
import type { FighterFight } from "@/lib/leaderboard/types";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "shown"; results: ReadonlyMap<string, FighterResult>; others: readonly OtherBout[] };

type Filter = "all" | "win" | "loss";

const OUTCOME_LABEL: Record<FightOutcome, string> = { win: "Won", loss: "Lost", draw: "Draw", no_contest: "No contest" };
const OUTCOME_SHORT: Record<FightOutcome, string> = { win: "W", loss: "L", draw: "D", no_contest: "NC" };

/** W in ink, L as an outline, the rest quiet: readable at a glance and never colour alone. */
function Outcome({ result }: { result: Pick<FighterResult, "outcome" | "how"> }) {
  const style =
    result.outcome === "win"
      ? "border-[var(--text)] bg-[var(--text)] text-[var(--bg)]"
      : result.outcome === "loss"
        ? "border-[var(--text)] text-[var(--text)]"
        : "border-[var(--border)] text-[var(--muted)]";
  return (
    <span
      className="flex shrink-0 items-center gap-2"
      aria-label={`${OUTCOME_LABEL[result.outcome]}${result.outcome === "win" || result.outcome === "loss" ? ` by ${result.how}` : ""}`}
    >
      <span
        aria-hidden="true"
        className={`inline-flex h-7 w-8 items-center justify-center border-2 text-xs font-extrabold ${style}`}
      >
        {OUTCOME_SHORT[result.outcome]}
      </span>
      <span aria-hidden="true" className="hidden w-[4.5rem] text-xs text-[var(--muted)] sm:block">
        {result.outcome === "draw" || result.outcome === "no_contest" ? "" : result.how}
      </span>
    </span>
  );
}

/** How many of each, as one sentence: "Won 6, lost 3." */
export function summarise(results: Iterable<Pick<FighterResult, "outcome">>): string {
  const count: Record<FightOutcome, number> = { win: 0, loss: 0, draw: 0, no_contest: 0 };
  for (const result of results) count[result.outcome] += 1;
  const parts = [`Won ${count.win}`, `lost ${count.loss}`];
  if (count.draw > 0) parts.push(`${count.draw} ${count.draw === 1 ? "draw" : "draws"}`);
  if (count.no_contest > 0) parts.push(`${count.no_contest} no contest`);
  return `${parts.join(", ")}.`;
}

/**
 * The rated fights of a fighter. With the spoiler gate closed it is the plain list; after a click on
 * the gate every fight also says how it ended (and the list can be cut down to wins or losses). The
 * results are result data, so nothing is loaded until the gate is opened and the warning stands
 * right above it.
 */
export function FighterFights({
  slug,
  name,
  fights,
  showClass,
  record,
}: {
  slug: string;
  name: string;
  fights: readonly FighterFight[];
  showClass: boolean;
  /** The record as of today, to say how much of the career the lists cover. */
  record: { w: number; l: number; d: number; nc: number } | null;
}) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [filter, setFilter] = useState<Filter>("all");
  const panelId = useId();

  async function load() {
    if (state.status === "loading") return;
    setState({ status: "loading" });
    try {
      const career = await fetchFighterResults(slug);
      setState({
        status: "shown",
        results: new Map(career.results.map((result) => [result.fightId, result])),
        others: career.others,
      });
    } catch {
      setState({ status: "error" });
    }
  }

  const shown = state.status === "shown";
  const results = shown ? state.results : null;
  const listed = results
    ? fights.flatMap((fight) => (fight.fightId && results.has(fight.fightId) ? [results.get(fight.fightId) as FighterResult] : []))
    : [];
  const others = shown ? state.others : [];
  const visibleOthers = others.filter((bout) => filter === "all" || bout.outcome === filter);
  const total = record ? record.w + record.l + record.d + record.nc : null;
  const listedAll = listed.length + others.length;
  const visible = fights.filter((fight) => {
    if (!results || filter === "all") return true;
    return fight.fightId ? results.get(fight.fightId)?.outcome === filter : false;
  });

  return (
    <section aria-labelledby="fights">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <h2 id="fights" className="display scroll-mt-20 text-xl sm:text-2xl">
          Fight history
        </h2>
        {shown && (
          <div role="group" aria-label="Which fights" className="inline-flex border-2 border-[var(--text)]">
            {(
              [
                ["all", "All"],
                ["win", "Wins"],
                ["loss", "Losses"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
                className={`inline-flex min-h-9 items-center px-3 text-sm font-bold ${
                  filter === key ? "bg-[var(--text)] text-[var(--bg)]" : "hover:bg-[var(--surface-2)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 border-2 border-[var(--text)] bg-[var(--surface)]">
        <div className="border-b-2 border-[var(--text)]">
          <button
            type="button"
            onClick={shown ? () => setState({ status: "idle" }) : load}
            disabled={state.status === "loading"}
            aria-expanded={shown}
            aria-controls={panelId}
            aria-label={`${shown ? "Hide the full fight history" : state.status === "error" ? "Try again" : "Show the full fight history"} of ${name}`}
            className={`flex min-h-11 w-full items-center justify-between gap-4 px-4 text-left text-sm font-bold transition-colors focus-visible:outline-offset-[-5px] disabled:opacity-70 ${
              shown
                ? "bg-[var(--surface-2)] hover:bg-[var(--border)]"
                : "redact hover:bg-[var(--accent)] hover:text-[var(--accent-ink)] focus-visible:outline-[var(--accent-ink)]"
            }`}
          >
            <span>
              {state.status === "loading"
                ? "Loading…"
                : shown
                  ? "Hide the fight history"
                  : state.status === "error"
                    ? "Try again"
                    : "Show the full fight history (spoilers)"}
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
          <div id={panelId} aria-live="polite">
            {!shown && state.status !== "error" && (
              <p className="px-4 py-2 text-xs text-[var(--muted)]">
                Spoilers: shows how every fight ended, win or loss, and how. It stays closed until you open it.
              </p>
            )}
            {state.status === "error" && (
              <p className="px-4 py-2 text-sm text-[var(--muted)]">Could not load the results. Try again.</p>
            )}
            {shown && (
              <p className="px-4 py-2 text-sm">
                {summarise([...listed, ...others])}{" "}
                <span className="text-[var(--muted)]">
                  {total !== null && total === listedAll
                    ? `All ${total} fights of the record are listed.`
                    : total !== null
                      ? `${listedAll} of the ${total} fights in the record are listed; the rest are not in our sources.`
                      : `${listedAll} fights listed.`}
                </span>
              </p>
            )}
            {!shown && state.status !== "error" && (
              <p className="px-4 pb-2 text-xs text-[var(--muted)]">
                The list holds the UFC fights we have rated. Opening the history adds who they beat and lost to, and
                the rest of the career: earlier fights and other promotions.
              </p>
            )}
          </div>
        </div>

        <div
          aria-hidden="true"
          className="hidden items-center gap-3 border-b border-[var(--border)] px-4 py-2 text-xs font-semibold text-[var(--muted)] sm:flex"
        >
          <span className="w-16 shrink-0">Date</span>
          <span className="min-w-0 flex-1">Opponent</span>
          <span className="hidden min-w-0 flex-1 md:block">Event</span>
          {showClass && <span className="hidden w-36 shrink-0 lg:block">Weight class</span>}
          {shown && <span className="w-[6.5rem] shrink-0">Result</span>}
          <span className="w-12 shrink-0 text-center">Rating</span>
        </div>
        {visible.length === 0 ? (
          <p className="px-4 py-4 text-sm text-[var(--muted)]">None of these fights match.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {visible.map((fight) => {
              const eventHref = fight.fightId
                ? `/events/${fight.eventSlug}#fight-${fight.fightId}`
                : `/events/${fight.eventSlug}`;
              const result = results && fight.fightId ? results.get(fight.fightId) : undefined;
              return (
                <li key={`${fight.eventSlug}-${fight.opponent}`} className="flex min-h-[3.25rem] items-center gap-3 px-3 py-2 sm:px-4">
                  <span className="w-16 shrink-0 text-sm tabular-nums text-[var(--muted)]">{formatMonthYear(fight.eventDate)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words font-extrabold leading-tight sm:text-lg">
                      <span className="mr-1 text-sm font-bold text-[var(--accent-text)]">vs</span>
                      {fight.opponentSlug ? (
                        <Link
                          href={`/fighters/${fight.opponentSlug}`}
                          className="underline decoration-[var(--border)] decoration-2 underline-offset-[5px] hover:text-[var(--accent)] hover:decoration-[var(--accent)]"
                        >
                          {fight.opponent}
                        </Link>
                      ) : (
                        fight.opponent
                      )}
                      {fight.isTitleFight && (
                        <span className="ml-2 inline-block border-[1.5px] border-[var(--text)] bg-[var(--text)] px-1.5 py-px align-middle text-[0.7rem] font-bold leading-4 text-[var(--bg)]">
                          Title
                        </span>
                      )}
                    </span>
                    <Link href={eventHref} className="block text-xs text-[var(--muted)] hover:text-[var(--accent)] md:hidden">
                      {fight.eventName}
                    </Link>
                  </span>
                  <Link
                    href={eventHref}
                    className="hidden min-w-0 flex-1 truncate text-sm text-[var(--muted)] hover:text-[var(--accent)] md:block"
                    title={fight.eventName}
                  >
                    {fight.eventName}
                  </Link>
                  {showClass && (
                    <span className="hidden w-36 shrink-0 truncate text-sm text-[var(--muted)] lg:block">
                      {fight.weightClass ?? ""}
                    </span>
                  )}
                  {shown && (result ? <Outcome result={result} /> : <span className="w-[4.25rem] shrink-0 sm:w-[6.5rem]" />)}
                  <span
                    role="img"
                    aria-label={`Rated ${formatRating(fight.stars)} out of 5`}
                    className={`scorebox h-8 w-12 shrink-0 text-base ${isHighRating(fight.stars) ? "scorebox-hot" : ""}`}
                  >
                    <span aria-hidden="true">{formatRating(fight.stars)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {shown && visibleOthers.length > 0 && (
        <div className="mt-6">
          <h3 className="display text-lg sm:text-xl">Earlier fights and other promotions</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">Not rated: we have no fight statistics for these.</p>
          <ul className="mt-3 divide-y divide-[var(--border)] border-2 border-[var(--text)] bg-[var(--surface)]">
            {visibleOthers.map((bout) => (
              <li
                key={`${bout.date}-${bout.opponent}`}
                className="flex min-h-[3.25rem] items-center gap-3 px-3 py-2 sm:px-4"
              >
                <span className="w-16 shrink-0 text-sm tabular-nums text-[var(--muted)]">{formatMonthYear(bout.date)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words font-extrabold leading-tight sm:text-lg">
                    <span className="mr-1 text-sm font-bold text-[var(--accent-text)]">vs</span>
                    {bout.opponent}
                  </span>
                  {bout.event && <span className="block truncate text-xs text-[var(--muted)]">{bout.event}</span>}
                </span>
                <Outcome result={bout} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
