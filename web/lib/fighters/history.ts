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
 * The record the fighter had AFTER each fight of the history (what a record column in a fight table
 * shows: a win in the first fight reads 1-0), found by starting from the record as it stands today and
 * walking back: today's record is the record after the newest fight; take that fight off and you have
 * the record after the one before it, and so on. This stays right for every listed fight as long as no
 * LATER fight is missing from the list (the fights we miss are the early ones, so it nearly always is).
 *
 * A fight gets null when it cannot be known: a later result is unknown, or the numbers would go below
 * zero (the lists then do not match the record). Once that happens every older fight is null too.
 * Never a guess.
 */
export function recordsAfter(
  today: FighterRecord | null,
  bouts: readonly HistoryBout[],
): Map<string, FighterRecord | null> {
  const after = new Map<string, FighterRecord | null>();
  // Newest first; the sort is stable, so fights of one date keep the order they were given in.
  const ordered = [...bouts].sort((a, b) => b.date.localeCompare(a.date));
  let running: FighterRecord | null = today;
  for (const bout of ordered) {
    // The record after a fight includes its own result: a win cannot leave nought wins.
    if (running !== null && bout.outcome !== null && running[KEY[bout.outcome]] < 1) running = null;
    after.set(bout.key, running);
    if (running === null || bout.outcome === null) {
      running = null;
      continue;
    }
    const next: FighterRecord = { ...running };
    next[KEY[bout.outcome]] -= 1;
    running = next.w < 0 || next.l < 0 || next.d < 0 || next.nc < 0 ? null : next;
  }
  return after;
}
