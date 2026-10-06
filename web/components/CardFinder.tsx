"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchExploreEvents } from "@/lib/explore/client";
import { metricById } from "@/lib/explore/metrics";
import { DEFAULT_STATE, freshState, parseState, runFinder, stateToSearch, type FinderState } from "@/lib/explore/query";
import type { ExploreEvent } from "@/lib/explore/types";
import { EventCard } from "./EventCard";
import { FinderControls } from "./FinderControls";

const PAGE_SIZE = 12;

type Data = { status: "loading" } | { status: "error" } | { status: "ready"; events: ExploreEvent[] };

/**
 * The card finder of the home page: order and filter every card on what is known about it before the
 * fights (ratings, Elo and UFC ranks going in, title fights, places, dates). Nothing in it is built
 * from a result, so there is nothing to lock.
 */
export function CardFinder() {
  const [data, setData] = useState<Data>({ status: "loading" });
  const [state, setState] = useState<FinderState>(DEFAULT_STATE);
  const [shown, setShown] = useState(PAGE_SIZE);
  const [ready, setReady] = useState(false);

  // The address bar is read once the cards have arrived and written on every change, so a search can
  // be shared as a link.
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
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
    );
  }

  const events = data.status === "ready" ? data.events : null;
  const outcome = useMemo(() => (events ? runFinder(events, state) : null), [events, state]);
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

  const metric = outcome?.shown ? metricById(outcome.shown) : null;
  return (
    <div className="space-y-5">
      <FinderControls
        state={state}
        onChange={update}
        years={years}
        countries={countries}
        total={outcome ? outcome.matches.length : null}
      />

      <div aria-live="polite" className="space-y-4">
        {data.status === "loading" && <p className="text-[var(--muted)]">Loading the cards…</p>}
        {data.status === "error" && (
          <p role="alert" className="font-semibold">
            The cards could not be loaded. Refresh the page to try again.
          </p>
        )}
        {outcome &&
          (outcome.matches.length === 0 ? (
            <div className="border-2 border-dashed border-[var(--text)] p-6">
              <p className="font-bold">No card matches all of that.</p>
              <p className="mt-1 text-[var(--muted)]">Loosen a filter, or start again.</p>
              <button
                type="button"
                onClick={() => update(freshState())}
                className="mt-3 min-h-10 border-2 border-[var(--text)] px-4 text-sm font-bold hover:bg-[var(--surface-2)]"
              >
                Reset everything
              </button>
            </div>
          ) : (
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {outcome.matches.slice(0, shown).map((event) => {
                const value = metric ? metric.value(event) : null;
                return (
                  <li key={event.id} className="flex h-full flex-col gap-2">
                    <div className="grid flex-1">
                      <EventCard event={event} />
                    </div>
                    {metric && metric.id !== "cardRating" && (
                      <p className="text-sm tabular-nums">
                        <span className="text-[var(--muted)]">{metric.label}: </span>
                        <span className="font-bold">{value === null ? "not known" : metric.format(value)}</span>
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          ))}
        {outcome && outcome.matches.length > shown && (
          <button
            type="button"
            onClick={() => setShown((n) => n + PAGE_SIZE)}
            className="min-h-11 border-2 border-[var(--text)] px-5 text-sm font-bold hover:bg-[var(--surface-2)]"
          >
            Show more ({outcome.matches.length - shown} left)
          </button>
        )}
      </div>
    </div>
  );
}
