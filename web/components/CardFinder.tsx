"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { fetchExploreEvents } from "@/lib/explore/client";
import { metricById } from "@/lib/explore/metrics";
import {
  PRESETS,
  applyPreset,
  isFiltered,
  parseState,
  runFinder,
  stateToSearch,
  withoutSpoilers,
  DEFAULT_STATE,
  type FinderState,
} from "@/lib/explore/query";
import { fetchEventResults } from "@/lib/explore/stats";
import type { ExploreEvent, ResultsByEvent } from "@/lib/explore/types";
import { EventCard } from "./EventCard";
import { FinderControls } from "./FinderControls";

const PAGE_SIZE = 12;

type Data = { status: "loading" } | { status: "error" } | { status: "ready"; events: ExploreEvent[] };
type Gate = "locked" | "loading" | "error" | "unlocked";

/**
 * The card finder of the home page: order and filter every card on anything we know about it.
 * What is known BEFORE the fights (ratings, Elo, UFC ranks, title fights, places) works straight
 * away. What is built from the results (knockouts, submissions, how long the card ran, upsets) stays
 * locked behind a warning and is only loaded after a click, like the Elo leaderboard.
 */
export function CardFinder() {
  const [data, setData] = useState<Data>({ status: "loading" });
  const [state, setState] = useState<FinderState>(DEFAULT_STATE);
  const [results, setResults] = useState<ResultsByEvent | null>(null);
  const [gate, setGate] = useState<Gate>("locked");
  const [shown, setShown] = useState(PAGE_SIZE);
  const [ready, setReady] = useState(false);
  const panelId = useId();

  // The address bar is read once the cards have arrived and written on every change. A link only
  // ever carries what is not a spoiler.
  useEffect(() => {
    let live = true;
    fetchExploreEvents()
      .then((events) => {
        if (!live) return;
        setState(parseState(window.location.search));
        setData({ status: "ready", events });
        setReady(true);
      })
      .catch(() => live && setData({ status: "error" }));
    return () => {
      live = false;
    };
  }, []);

  function update(next: FinderState) {
    setState(next);
    setShown(PAGE_SIZE);
    if (!ready) return;
    const query = stateToSearch(next);
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  }

  const events = data.status === "ready" ? data.events : null;
  const outcome = useMemo(() => (events ? runFinder(events, results, state) : null), [events, results, state]);
  const years = useMemo(() => {
    if (!events || events.length === 0) return [];
    const all = events.map((e) => Number(e.eventDate.slice(0, 4)));
    const low = Math.min(...all);
    const high = Math.max(...all);
    return Array.from({ length: high - low + 1 }, (_, i) => high - i);
  }, [events]);
  const countries = useMemo(
    () => (events ? [...new Set(events.flatMap((e) => e.facets?.countries ?? []))] : []),
    [events],
  );

  async function unlock() {
    if (gate === "loading") return;
    setGate("loading");
    try {
      setResults(await fetchEventResults());
      setGate("unlocked");
    } catch {
      setGate("error");
    }
  }

  function lock() {
    setResults(null);
    setGate("locked");
    update(withoutSpoilers(state));
  }

  const unlocked = gate === "unlocked";
  const metric = outcome?.shown ? metricById(outcome.shown) : null;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Quick starts">
        {PRESETS.map((preset) => {
          const locked = preset.spoiler && !unlocked;
          return (
            <button
              key={preset.id}
              type="button"
              disabled={locked}
              title={locked ? "Unlock the spoiler filters first" : undefined}
              onClick={() => update(applyPreset(preset))}
              className={`min-h-10 border-2 px-3 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${
                preset.spoiler
                  ? "border-[var(--accent)] text-[var(--accent-text)] hover:bg-[var(--surface-2)]"
                  : "border-[var(--text)] bg-[var(--surface)] hover:bg-[var(--surface-2)]"
              }`}
            >
              {preset.label}
              {preset.spoiler && <span className="sr-only"> (spoiler)</span>}
            </button>
          );
        })}
      </div>

      <FinderControls state={state} onChange={update} unlocked={unlocked} years={years} countries={countries} />

      <div className="border-2 border-[var(--accent)] bg-[var(--surface)] p-4">
        {unlocked ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-semibold">
              The spoiler filters are unlocked. Orders and conditions on how the fights ended now work, and the numbers
              show under the cards.
            </p>
            <button
              type="button"
              onClick={lock}
              className="min-h-10 border-2 border-[var(--text)] px-4 text-sm font-bold hover:bg-[var(--surface-2)]"
            >
              Lock them again
            </button>
          </div>
        ) : (
          <>
            <p className="max-w-2xl font-semibold">
              Spoilers ahead. Knockouts, submissions, how long a card ran, upsets and the like are built from the
              results, so ordering by them tells you how those events went. They stay locked until you open them
              yourself.
            </p>
            <button
              type="button"
              onClick={unlock}
              disabled={gate === "loading"}
              aria-controls={panelId}
              className="mt-3 min-h-11 bg-[var(--text)] px-5 text-sm font-bold text-[var(--bg)] disabled:opacity-70"
            >
              {gate === "loading" ? "Unlocking…" : gate === "error" ? "Try again" : "Unlock the spoiler filters"}
            </button>
            {gate === "error" && (
              <p role="alert" className="mt-2 text-sm font-semibold text-[var(--accent-text)]">
                Could not load them. Try again in a moment.
              </p>
            )}
          </>
        )}
      </div>

      <div id={panelId} aria-live="polite" className="space-y-4">
        {data.status === "loading" && <p className="text-[var(--muted)]">Loading the cards…</p>}
        {data.status === "error" && (
          <p role="alert" className="font-semibold">
            The cards could not be loaded. Refresh the page to try again.
          </p>
        )}
        {outcome && (
          <>
            <p className="text-sm font-bold">
              {outcome.matches.length} {outcome.matches.length === 1 ? "card" : "cards"}
              {isFiltered(state) ? " match" : ""}
            </p>
            {outcome.matches.length === 0 ? (
              <div className="border-2 border-dashed border-[var(--text)] p-6">
                <p className="font-bold">No card matches all of that.</p>
                <p className="mt-1 text-[var(--muted)]">Loosen a condition, or start again.</p>
                <button
                  type="button"
                  onClick={() => update({ ...DEFAULT_STATE, weightClasses: [], flags: [], rules: [] })}
                  className="mt-3 min-h-10 border-2 border-[var(--text)] px-4 text-sm font-bold hover:bg-[var(--surface-2)]"
                >
                  Reset everything
                </button>
              </div>
            ) : (
              <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {outcome.matches.slice(0, shown).map((event) => {
                  const own = results?.[event.id];
                  const value = metric ? metric.value(event, own) : null;
                  return (
                    <li key={event.id} className="flex h-full flex-col gap-2">
                      <div className="grid flex-1">
                        <EventCard event={event} />
                      </div>
                      {metric && (
                        <p className="text-sm tabular-nums">
                          <span className="text-[var(--muted)]">{metric.label}: </span>
                          <span className="font-bold">{value === null ? "not known" : metric.format(value)}</span>
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {outcome.matches.length > shown && (
              <button
                type="button"
                onClick={() => setShown((n) => n + PAGE_SIZE)}
                className="min-h-11 border-2 border-[var(--text)] px-5 text-sm font-bold hover:bg-[var(--surface-2)]"
              >
                Show more ({outcome.matches.length - shown} left)
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
