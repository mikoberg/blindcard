import {
  FighterResultsParseError,
  MAX_FIGHTER_RESULTS,
  type FightOutcome,
  type FighterResult,
} from "./results";

/** A row of `fighter_results`. */
export interface FighterResultRow {
  fight_id: unknown;
  result: unknown;
  method: unknown;
}

const OUTCOMES: readonly FightOutcome[] = ["win", "loss", "draw", "no_contest"];

/**
 * The source's method string in a few plain words. Anything unseen is "Other", never guessed.
 * Server side only: these strings must not reach the browser bundle (the spoiler suite checks).
 */
export function howDecided(method: unknown): string {
  const text = typeof method === "string" ? method.trim().toUpperCase() : "";
  if (text.startsWith("DECISION") || text.includes("DEC")) return "Decision";
  if (text.startsWith("KO") || text.includes("TKO") || text.includes("STOPPAGE")) return "KO/TKO";
  if (text.startsWith("SUB")) return "Submission";
  if (text === "DQ" || text.startsWith("DISQ")) return "DQ";
  return "Other";
}

/** Maps one database row; anything unexpected is an error, never a guess. */
export function rowToResult(row: FighterResultRow): FighterResult {
  if (typeof row.fight_id !== "string" || !/^[0-9a-f-]{36}$/i.test(row.fight_id)) {
    throw new FighterResultsParseError("fight_id");
  }
  if (typeof row.result !== "string" || !(OUTCOMES as readonly string[]).includes(row.result)) {
    throw new FighterResultsParseError("result");
  }
  return { fightId: row.fight_id, outcome: row.result as FightOutcome, how: howDecided(row.method) };
}

export function rowsToResults(rows: readonly FighterResultRow[]): FighterResult[] {
  if (rows.length > MAX_FIGHTER_RESULTS) throw new FighterResultsParseError("too many rows");
  return rows.map(rowToResult);
}
