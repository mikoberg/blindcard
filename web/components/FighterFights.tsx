"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { recordParts } from "@/lib/card/record";
import { formatMonthYear } from "@/lib/format";
import { HISTORY_OPEN_EVENT } from "@/lib/fighters/open";
import { recordsAfter } from "@/lib/fighters/history";
import { fetchFighterResults, type FightOutcome, type FighterResult, type OtherBout } from "@/lib/fighters/results";
import { formatRating, isHighRating } from "@/lib/leaderboard/format";
import type { FighterFight } from "@/lib/leaderboard/types";
import type { FighterRecord } from "@/lib/card/types";

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

/** One line of the list: a rated UFC fight, or (after opening the history) a fight we only know of. */
interface Row {
  key: string;
  date: string;
  opponent: string;
  opponentSlug: string | null;
  eventName: string | null;
  eventHref: string | null;
  isTitleFight: boolean;
  weightClass: string | null;
  /** null: not rated (no fight statistics). */
  stars: number | null;
  result: Pick<FighterResult, "outcome" | "how"> | null;
}

function ufcRow(fight: FighterFight, result: FighterResult | undefined): Row {
  return {
    key: `ufc-${fight.eventSlug}-${fight.opponent}`,
    date: fight.eventDate,
    opponent: fight.opponent,
    opponentSlug: fight.opponentSlug ?? null,
    eventName: fight.eventName,
    eventHref: fight.fightId ? `/events/${fight.eventSlug}#fight-${fight.fightId}` : `/events/${fight.eventSlug}`,
    isTitleFight: fight.isTitleFight,
    weightClass: fight.weightClass ?? null,
    stars: fight.stars,
    result: result ? { outcome: result.outcome, how: result.how } : null,
  };
}

function otherRow(bout: OtherBout): Row {
  return {
    key: `other-${bout.date}-${bout.opponent}`,
    date: bout.date,
    opponent: bout.opponent,
    opponentSlug: null,
    eventName: bout.event,
    eventHref: null,
    isTitleFight: false,
    weightClass: null,
    stars: null,
    result: { outcome: bout.outcome, how: bout.how },
  };
}

/**
 * A fighter's fights. With the spoiler gate closed it is the plain list of rated UFC fights. After the
 * gate is opened (from the button here or from the record at the top of the page) it is the FULL
 * history in one list: every fight, how it ended, and the record the fighter had going into it.
 * The results are result data, so nothing is loaded until the gate is opened, and the warning stands
 * right next to both ways in.
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
  /** The record as of today: the other end of the history, and what the lists should add up to. */
  record: FighterRecord | null;
}) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [filter, setFilter] = useState<Filter>("all");
  const panelId = useId();

  async function load() {
    if (state.status === "loading" || state.status === "shown") return;
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

  // The record at the top of the page opens the history from there: one click, no second button.
  const latest = useRef(load);
  useEffect(() => {
    latest.current = load;
  });
  useEffect(() => {
    function open() {
      document.getElementById("fights")?.scrollIntoView({ behavior: "smooth", block: "start" });
      void latest.current();
    }
    window.addEventListener(HISTORY_OPEN_EVENT, open);
    return () => window.removeEventListener(HISTORY_OPEN_EVENT, open);
  }, []);

  const shown = state.status === "shown";
  const results = shown ? state.results : null;
  const rows: Row[] = fights.map((fight) => ufcRow(fight, results && fight.fightId ? results.get(fight.fightId) : undefined));
  if (shown) rows.push(...state.others.map(otherRow));
  rows.sort((a, b) => b.date.localeCompare(a.date)); // stable: rated fights stay ahead of others of one date
  const after = shown
    ? recordsAfter(
        record,
        rows.map((row) => ({ key: row.key, date: row.date, outcome: row.result ? row.result.outcome : null })),
      )
    : null;
  const visible = rows.filter((row) => filter === "all" || !shown || row.result?.outcome === filter);
  const known = rows.flatMap((row) => (row.result ? [row.result] : []));
  const total = record ? record.w + record.l + record.d + record.nc : null;

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
                Spoilers: shows every fight of the career, how it ended, win or loss, and the record after each fight. It
                stays closed until you open it.
              </p>
            )}
            {state.status === "error" && (
              <p className="px-4 py-2 text-sm text-[var(--muted)]">Could not load the history. Try again.</p>
            )}
            {shown && (
              <p className="px-4 py-2 text-sm">
                {summarise(known)}{" "}
                <span className="text-[var(--muted)]">
                  {total !== null && total === rows.length
                    ? `All ${total} fights of the record are listed.`
                    : total !== null
                      ? `${rows.length} of the ${total} fights in the record are listed; the rest are not in our sources.`
                      : `${rows.length} fights listed.`}
                </span>
              </p>
            )}
            {!shown && state.status !== "error" && (
              <p className="px-4 pb-2 text-xs text-[var(--muted)]">
                The list below holds the UFC fights we have rated. The full history adds the earlier fights and other
                promotions.
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
          {shown && <span className="hidden w-16 shrink-0 md:block">Record</span>}
          <span className="w-12 shrink-0 text-center">Rating</span>
        </div>
        {visible.length === 0 ? (
          <p className="px-4 py-4 text-sm text-[var(--muted)]">None of these fights match.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {visible.map((row) => {
              const then = after?.get(row.key) ?? null;
              const thenParts = then ? recordParts(then) : null;
              return (
                <li key={row.key} className="flex min-h-[3.25rem] items-center gap-3 px-3 py-2 sm:px-4">
                  <span className="w-16 shrink-0 text-sm tabular-nums text-[var(--muted)]">{formatMonthYear(row.date)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words font-extrabold leading-tight sm:text-lg">
                      <span className="mr-1 text-sm font-bold text-[var(--accent-text)]">vs</span>
                      {row.opponentSlug ? (
                        <Link
                          href={`/fighters/${row.opponentSlug}`}
                          className="underline decoration-[var(--border)] decoration-2 underline-offset-[5px] hover:text-[var(--accent)] hover:decoration-[var(--accent)]"
                        >
                          {row.opponent}
                        </Link>
                      ) : (
                        row.opponent
                      )}
                      {row.isTitleFight && (
                        <span className="ml-2 inline-block border-[1.5px] border-[var(--text)] bg-[var(--text)] px-1.5 py-px align-middle text-[0.7rem] font-bold leading-4 text-[var(--bg)]">
                          Title
                        </span>
                      )}
                    </span>
                    {row.eventName &&
                      (row.eventHref ? (
                        <Link href={row.eventHref} className="block truncate text-xs text-[var(--muted)] hover:text-[var(--accent)] md:hidden">
                          {row.eventName}
                        </Link>
                      ) : (
                        <span className="block truncate text-xs text-[var(--muted)] md:hidden">{row.eventName}</span>
                      ))}
                  </span>
                  <span className="hidden min-w-0 flex-1 md:block">
                    {row.eventName &&
                      (row.eventHref ? (
                        <Link
                          href={row.eventHref}
                          className="block truncate text-sm text-[var(--muted)] hover:text-[var(--accent)]"
                          title={row.eventName}
                        >
                          {row.eventName}
                        </Link>
                      ) : (
                        <span className="block truncate text-sm text-[var(--muted)]" title={row.eventName}>
                          {row.eventName}
                        </span>
                      ))}
                  </span>
                  {showClass && (
                    <span className="hidden w-36 shrink-0 truncate text-sm text-[var(--muted)] lg:block">
                      {row.weightClass ?? ""}
                    </span>
                  )}
                  {shown && (row.result ? <Outcome result={row.result} /> : <span className="w-[4.25rem] shrink-0 sm:w-[6.5rem]" />)}
                  {shown && (
                    <span
                      className="hidden w-16 shrink-0 text-sm tabular-nums text-[var(--muted)] md:block"
                      aria-label={thenParts ? `Record after the fight: ${thenParts.main}${thenParts.extra ? ` ${thenParts.extra}` : ""}` : undefined}
                    >
                      <span aria-hidden="true">{thenParts ? thenParts.main : ""}</span>
                    </span>
                  )}
                  {row.stars !== null ? (
                    <span
                      role="img"
                      aria-label={`Rated ${formatRating(row.stars)} out of 5`}
                      className={`scorebox h-8 w-12 shrink-0 text-base ${isHighRating(row.stars) ? "scorebox-hot" : ""}`}
                    >
                      <span aria-hidden="true">{formatRating(row.stars)}</span>
                    </span>
                  ) : (
                    <span className="w-12 shrink-0 text-center text-xs text-[var(--muted)]" title="Not rated: no fight statistics">
                      <span className="sr-only">Not rated</span>
                      <span aria-hidden="true">–</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
