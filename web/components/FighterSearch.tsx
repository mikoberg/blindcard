"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { MIN_FIGHTS } from "@/lib/leaderboard/rank";
import { SEARCH_MIN_LENGTH, cleanSearchTerm } from "@/lib/leaderboard/search";
import type { FighterSearchResult } from "@/lib/leaderboard/types";
import { FighterRow } from "./FighterRow";

/** The answer for one search text: the matches, or that the search failed. */
type Outcome = { term: string; results: FighterSearchResult[] } | { term: string; failed: true };

const DEBOUNCE_MS = 250;

function isResult(value: unknown): value is FighterSearchResult {
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

/**
 * A search box above the leaderboard. Empty, it shows the leaderboard it wraps; with a name in
 * it, it shows every fighter that matches, ranked or not.
 */
export function FighterSearch({ children }: { children: ReactNode }) {
  const inputId = useId();
  const [text, setText] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const term = cleanSearchTerm(text);

  useEffect(() => {
    if (term === null) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/fighters?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });
        const body: unknown = await response.json();
        if (!response.ok || !Array.isArray(body)) throw new Error("search failed");
        setOutcome({ term, results: body.filter(isResult) });
      } catch (error) {
        if ((error as { name?: string }).name !== "AbortError") setOutcome({ term, failed: true });
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  // What is shown follows from the text and the last answer; nothing is set while typing.
  const current = term !== null && outcome?.term === term ? outcome : null;
  const results = current && "results" in current ? current.results : null;

  return (
    <div className="space-y-4">
      <div role="search">
        <label htmlFor={inputId} className="block text-sm font-semibold text-[var(--muted)]">
          Find a fighter
        </label>
        <input
          id={inputId}
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Type a name"
          autoComplete="off"
          spellCheck={false}
          maxLength={50}
          className="mt-1 min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-lg text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
        />
      </div>

      <div aria-live="polite">
        {term === null && text.trim().length > 0 && (
          <p className="text-sm text-[var(--muted)]">Type at least {SEARCH_MIN_LENGTH} letters.</p>
        )}
        {term !== null && current === null && (
          <p className="text-sm text-[var(--muted)]">Searching…</p>
        )}
        {current && "failed" in current && (
          <p className="text-sm text-[var(--muted)]">
            Search is not available right now. Try again in a moment.
          </p>
        )}
        {results !== null && results.length === 0 && (
          <p className="text-sm text-[var(--muted)]">No fighter found for “{term}”.</p>
        )}
      </div>

      {term === null ? (
        children
      ) : results !== null && results.length > 0 ? (
        <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--surface)]">
          {results.map((result) => (
            <li key={result.slug}>
              <FighterRow
                slug={result.slug}
                name={result.name}
                country={result.country}
                fights={result.fights}
                average={result.average}
                note={result.fights < MIN_FIGHTS ? `not ranked yet (needs ${MIN_FIGHTS})` : undefined}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
