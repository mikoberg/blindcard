import { isValidSlug } from "@/lib/slug";

/**
 * How one of a fighter's fights ended. This is result data: it is only loaded after an explicit
 * click on the fighter page, through the reveal path (`fighter_results`), never during a render.
 */
export type FightOutcome = "win" | "loss" | "draw" | "no_contest";

export interface FighterResult {
  fightId: string;
  outcome: FightOutcome;
  /** How it was decided, in a few words: "Decision", "KO/TKO", "Submission", "DQ" or "Other". */
  how: string;
}

/** A row of `fighter_results`. */
export interface FighterResultRow {
  fight_id: unknown;
  result: unknown;
  method: unknown;
}

/** At most this many fights are ever served for one fighter (also enforced in the database). */
export const MAX_FIGHTER_RESULTS = 120;

const OUTCOMES: readonly FightOutcome[] = ["win", "loss", "draw", "no_contest"];

export class FighterResultsParseError extends Error {
  constructor(reason: string) {
    super(`invalid fighter results: ${reason}`);
    this.name = "FighterResultsParseError";
  }
}

export class FighterResultsRequestError extends Error {
  constructor(readonly status: number) {
    super(`fighter results request failed with status ${status}`);
    this.name = "FighterResultsRequestError";
  }
}

/** The source's method string in a few plain words. Anything unseen is "Other", never guessed. */
export function howDecided(method: unknown): string {
  const text = typeof method === "string" ? method.trim().toUpperCase() : "";
  if (text.startsWith("DECISION") || text.endsWith("-DEC") || text.includes("DEC")) return "Decision";
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

/** Validates what the browser received: the results the route sends. Error bodies are rejected. */
export function parseResults(json: unknown): FighterResult[] {
  if (typeof json !== "object" || json === null) throw new FighterResultsParseError("not an object");
  const results = (json as Record<string, unknown>).results;
  if (!Array.isArray(results)) throw new FighterResultsParseError("results");
  return rowsToResults(
    results.map((item) => {
      const r = (item ?? {}) as Record<string, unknown>;
      // The route sends the mapped shape; the same checks as for a database row apply.
      return { fight_id: r.fightId, result: r.outcome, method: r.how } as FighterResultRow;
    }),
  );
}

/** Browser side: ask for one fighter's results. Never cached. */
export async function fetchFighterResults(slug: string, fetchImpl: typeof fetch = fetch): Promise<FighterResult[]> {
  if (!isValidSlug(slug)) throw new FighterResultsParseError("slug");
  const response = await fetchImpl(`/api/fighters/${encodeURIComponent(slug)}/results`, {
    method: "POST",
    cache: "no-store",
  });
  if (!response.ok) throw new FighterResultsRequestError(response.status);
  return parseResults(await response.json());
}
