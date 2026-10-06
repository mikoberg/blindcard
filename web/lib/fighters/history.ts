import type { FighterRecord } from "@/lib/card/types";
import type { FightOutcome } from "./results";

/** One fight of the full history, as far as the record is concerned. */
export interface HistoryBout {
  key: string;
  /** ISO date. */
  date: string;
  /** null when we do not know how it ended. */
  outcome: FightOutcome | null;
}

const KEY: Record<FightOutcome, keyof FighterRecord> = { win: "w", loss: "l", draw: "d", no_contest: "nc" };

/**
 * The record the fighter had going INTO each fight of the history, found by taking the record as it
 * stands today and walking back: take off the newest fight, that is the record before it, take off
 * the next, and so on. This stays right for every listed fight as long as no LATER fight is missing
 * from the list (the fights we miss are the early ones, so it nearly always does).
 *
 * A fight gets null when it cannot be known: its result or a later one is unknown, or the numbers
 * would go below zero (the lists then do not match the record). Once that happens every older fight
 * is null too. Never a guess.
 */
export function recordsBefore(
  today: FighterRecord | null,
  bouts: readonly HistoryBout[],
): Map<string, FighterRecord | null> {
  const before = new Map<string, FighterRecord | null>();
  // Newest first; the sort is stable, so fights of one date keep the order they were given in.
  const ordered = [...bouts].sort((a, b) => b.date.localeCompare(a.date));
  let running: FighterRecord | null = today;
  for (const bout of ordered) {
    if (running === null || bout.outcome === null) {
      running = null;
      before.set(bout.key, null);
      continue;
    }
    const next: FighterRecord = { ...running };
    next[KEY[bout.outcome]] -= 1;
    if (next.w < 0 || next.l < 0 || next.d < 0 || next.nc < 0) {
      running = null;
      before.set(bout.key, null);
      continue;
    }
    running = next;
    before.set(bout.key, next);
  }
  return before;
}
