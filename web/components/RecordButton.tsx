"use client";

import { HISTORY_OPEN_EVENT } from "@/lib/fighters/open";
import { recordParts } from "@/lib/card/record";
import type { FighterRecord } from "@/lib/card/types";

/**
 * The record at the top of a fighter page. Clicking it opens the full fight history below (every
 * fight, how it ended, the record at the time). That is result data, so the words next to the record
 * are the spoiler warning, and nothing is loaded before the click.
 */
export function RecordButton({ record }: { record: FighterRecord }) {
  const parts = recordParts(record);
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(HISTORY_OPEN_EVENT))}
      aria-label={`Record: ${parts.main}${parts.extra ? ` ${parts.extra}` : ""}. Show the full fight history (spoilers)`}
      className="group block w-fit text-left"
    >
      <span aria-hidden="true" className="underline decoration-2 underline-offset-4 group-hover:text-[var(--accent)]">
        {parts.main}
      </span>
      {parts.extra && (
        <span aria-hidden="true" className="ml-1 text-xs font-normal text-[var(--muted)]">
          {parts.extra}
        </span>
      )}
      <span aria-hidden="true" className="mt-0.5 block text-xs font-normal text-[var(--muted)] group-hover:text-[var(--accent)]">
        Full history (spoilers) ↓
      </span>
    </button>
  );
}
