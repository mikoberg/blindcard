import { isValidSlug } from "@/lib/slug";

/**
 * How one of a fighter's fights ended. This is result data: it is only loaded after an explicit
 * click on the fighter page, through the reveal path (`fighter_results`), never during a render.
 *
 * This file is shipped to the browser, so it holds no method strings: the server turns the source's
 * method into a few plain words (lib/fighters/map.ts) and the browser only checks and shows them.
 */
export type FightOutcome = "win" | "loss" | "draw" | "no_contest";

export interface FighterResult {
  fightId: string;
  outcome: FightOutcome;
  /** How it was decided, in a few words, as the server worded it. */
  how: string;
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

/** One result as the route sends it; anything unexpected is an error, never a guess. */
export function checkResult(item: unknown): FighterResult {
  const r = (item ?? {}) as Record<string, unknown>;
  if (typeof r.fightId !== "string" || !/^[0-9a-f-]{36}$/i.test(r.fightId)) throw new FighterResultsParseError("fightId");
  if (typeof r.outcome !== "string" || !(OUTCOMES as readonly string[]).includes(r.outcome)) {
    throw new FighterResultsParseError("outcome");
  }
  if (typeof r.how !== "string" || r.how.length === 0 || r.how.length > 24) throw new FighterResultsParseError("how");
  return { fightId: r.fightId, outcome: r.outcome as FightOutcome, how: r.how };
}

/** Validates what the browser received: the results the route sends. Error bodies are rejected. */
export function parseResults(json: unknown): FighterResult[] {
  if (typeof json !== "object" || json === null) throw new FighterResultsParseError("not an object");
  const results = (json as Record<string, unknown>).results;
  if (!Array.isArray(results)) throw new FighterResultsParseError("results");
  if (results.length > MAX_FIGHTER_RESULTS) throw new FighterResultsParseError("too many rows");
  return results.map(checkResult);
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
