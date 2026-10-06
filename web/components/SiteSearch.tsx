"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { cleanSearchTerm, SEARCH_MIN_LENGTH } from "@/lib/leaderboard/search";
import type { FighterSearchResult } from "@/lib/leaderboard/types";
import { formatEventDate } from "@/lib/format";
import { isEventSearchResult, type EventSearchResult } from "@/lib/search/events";

type Found = { fighters: FighterSearchResult[]; events: EventSearchResult[] };
type Outcome = { term: string; found: Found } | { term: string; failed: true };

const DEBOUNCE_MS = 250;

function isFighter(value: unknown): value is FighterSearchResult {
  const v = value as Record<string, unknown> | null;
  return (
    typeof v === "object" &&
    v !== null &&
    typeof v.slug === "string" &&
    typeof v.name === "string" &&
    typeof v.fights === "number" &&
    typeof v.average === "number"
  );
}

function parse(body: unknown): Found {
  const v = body as { fighters?: unknown; events?: unknown } | null;
  if (!v || !Array.isArray(v.fighters) || !Array.isArray(v.events)) throw new Error("search failed");
  return { fighters: v.fighters.filter(isFighter), events: v.events.filter(isEventSearchResult) };
}

function safeDate(iso: string): string {
  try {
    return formatEventDate(iso);
  } catch {
    return iso;
  }
}

/** One search box for fighters and events, with the answer listed under it. */
export function SiteSearch() {
  const inputId = useId();
  const [text, setText] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const term = cleanSearchTerm(text);

  useEffect(() => {
    if (term === null) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: controller.signal });
        const body: unknown = await response.json();
        if (!response.ok) throw new Error("search failed");
        setOutcome({ term, found: parse(body) });
      } catch (error) {
        if ((error as { name?: string }).name !== "AbortError") setOutcome({ term, failed: true });
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  const current = term !== null && outcome?.term === term ? outcome : null;
  const found = current && "found" in current ? current.found : null;
  const empty = found !== null && found.fighters.length === 0 && found.events.length === 0;

  return (
    <div className="max-w-xl">
      <div role="search">
        <label htmlFor={inputId} className="block text-sm font-bold">
          Find a fighter or an event
        </label>
        <input
          id={inputId}
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Try a name, or 331"
          autoComplete="off"
          spellCheck={false}
          maxLength={50}
          className="mt-1.5 min-h-12 w-full border-2 border-[var(--text)] bg-[var(--surface)] px-3 text-lg font-semibold text-[var(--text)] placeholder:font-normal placeholder:text-[var(--muted)]"
        />
      </div>

      <div aria-live="polite" className="mt-3 empty:mt-0">
        {term === null && text.trim().length > 0 && (
          <p className="text-sm text-[var(--muted)]">Type at least {SEARCH_MIN_LENGTH} letters.</p>
        )}
        {term !== null && current === null && <p className="text-sm text-[var(--muted)]">Searching…</p>}
        {current && "failed" in current && (
          <p className="text-sm text-[var(--muted)]">Search is not available right now. Try again in a moment.</p>
        )}
        {empty && <p className="text-sm text-[var(--muted)]">Nothing found for “{term}”.</p>}
        {found && !empty && (
          <div className="space-y-4 border-2 border-[var(--text)] bg-[var(--surface)] p-3">
            {found.fighters.length > 0 && (
              <section aria-label="Fighters">
                <h2 className="text-sm font-bold text-[var(--muted)]">Fighters</h2>
                <ul className="mt-1 divide-y divide-[var(--border)]">
                  {found.fighters.map((fighter) => (
                    <li key={fighter.slug}>
                      <Link
                        href={`/fighters/${fighter.slug}`}
                        className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 hover:text-[var(--accent)]"
                      >
                        <span className="font-bold">{fighter.name}</span>
                        <span className="text-sm text-[var(--muted)]">
                          {fighter.fights} {fighter.fights === 1 ? "fight" : "fights"}, average{" "}
                          {fighter.average.toFixed(1)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {found.events.length > 0 && (
              <section aria-label="Events">
                <h2 className="text-sm font-bold text-[var(--muted)]">Events</h2>
                <ul className="mt-1 divide-y divide-[var(--border)]">
                  {found.events.map((event) => (
                    <li key={event.href}>
                      <Link
                        href={event.href}
                        className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 hover:text-[var(--accent)]"
                      >
                        <span className="font-bold">{event.name}</span>
                        <span className="text-sm text-[var(--muted)]">{safeDate(event.date)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
