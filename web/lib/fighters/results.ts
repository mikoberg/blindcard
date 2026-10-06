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

/**
 * A bout of the fighter's career that is not in our own data (earlier fights, other promotions),
 * from their Wikipedia table. Not rated: only who, where, when and how it ended.
 */
export interface OtherBout {
  /** ISO date. */
  date: string;
  opponent: string;
  event: string | null;
  outcome: FightOutcome;
  how: string;
}

/** What the route sends: how every fight in our data ended, and the rest of the career. */
export interface FighterCareer {
  results: FighterResult[];
  others: OtherBout[];
}

/** At most this many fights are ever served for one fighter (also enforced in the database). */
export const MAX_FIGHTER_RESULTS = 120;
export const MAX_OTHER_BOUTS = 150;

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

/** One other bout as the route sends it. */
export function checkOther(item: unknown): OtherBout {
  const r = (item ?? {}) as Record<string, unknown>;
  if (typeof r.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) throw new FighterResultsParseError("date");
  if (typeof r.opponent !== "string" || r.opponent.length === 0 || r.opponent.length > 120) {
    throw new FighterResultsParseError("opponent");
  }
  if (r.event !== null && (typeof r.event !== "string" || r.event.length > 100)) throw new FighterResultsParseError("event");
  const { outcome, how } = checkResult({ fightId: "00000000-0000-0000-0000-000000000000", outcome: r.outcome, how: r.how });
  return { date: r.date, opponent: r.opponent, event: r.event as string | null, outcome, how };
}

/** Validates what the browser received: what the route sends. Error bodies are rejected. */
export function parseCareer(json: unknown): FighterCareer {
  if (typeof json !== "object" || json === null) throw new FighterResultsParseError("not an object");
  const { results, others } = json as Record<string, unknown>;
  if (!Array.isArray(results)) throw new FighterResultsParseError("results");
  if (!Array.isArray(others)) throw new FighterResultsParseError("others");
  if (results.length > MAX_FIGHTER_RESULTS || others.length > MAX_OTHER_BOUTS) {
    throw new FighterResultsParseError("too many rows");
  }
  return { results: results.map(checkResult), others: others.map(checkOther) };
}

/** Browser side: ask for one fighter's results. Never cached. */
export async function fetchFighterResults(slug: string, fetchImpl: typeof fetch = fetch): Promise<FighterCareer> {
  if (!isValidSlug(slug)) throw new FighterResultsParseError("slug");
  const response = await fetchImpl(`/api/fighters/${encodeURIComponent(slug)}/results`, {
    method: "POST",
    cache: "no-store",
  });
  if (!response.ok) throw new FighterResultsRequestError(response.status);
  return parseCareer(await response.json());
}
