import type { ResultFacets, ResultsByEvent } from "./types";

/**
 * What every completed event's fights turned out to be, added up. RESULT DATA: it is only loaded
 * after an explicit click on a spoiler warning, through the reveal path (`event_result_stats`),
 * never during a page render. This module is shipped to the browser, so it holds no method strings.
 */

/** At most this many events are ever served (also enforced in the database). */
export const MAX_EVENT_ROWS = 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ExploreParseError extends Error {
  constructor(reason: string) {
    super(`invalid event results: ${reason}`);
    this.name = "ExploreParseError";
  }
}

export class ExploreRequestError extends Error {
  constructor(readonly status: number) {
    super(`event results request failed with status ${status}`);
    this.name = "ExploreRequestError";
  }
}

/** A row of `event_result_stats`. */
export interface EventResultRow {
  event_id: unknown;
  fights: unknown;
  knockouts: unknown;
  submissions: unknown;
  decisions: unknown;
  split_decisions: unknown;
  round_one_finishes: unknown;
  total_seconds: unknown;
  longest_seconds: unknown;
  fastest_finish_seconds: unknown;
  bonuses: unknown;
  upsets: unknown;
  knockdowns: unknown;
  strikes: unknown;
  takedowns: unknown;
  sub_attempts: unknown;
  control_seconds: unknown;
}

function whole(value: unknown, label: string): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0) throw new ExploreParseError(label);
  return n;
}

/** Maps one database row; anything unexpected is an error, never a guess. */
export function rowToResults(row: EventResultRow): { id: string; results: ResultFacets } {
  if (typeof row.event_id !== "string" || !UUID.test(row.event_id)) throw new ExploreParseError("event_id");
  const fights = whole(row.fights, "fights");
  if (fights < 1) throw new ExploreParseError("fights");
  const knockouts = whole(row.knockouts, "knockouts");
  const submissions = whole(row.submissions, "submissions");
  const decisions = whole(row.decisions, "decisions");
  const splitDecisions = whole(row.split_decisions, "split_decisions");
  if (splitDecisions > decisions || knockouts + submissions + decisions > fights) {
    throw new ExploreParseError("counts");
  }
  return {
    id: row.event_id,
    results: {
      fights,
      knockouts,
      submissions,
      decisions,
      splitDecisions,
      roundOneFinishes: whole(row.round_one_finishes, "round_one_finishes"),
      totalSeconds: whole(row.total_seconds, "total_seconds"),
      longestSeconds: whole(row.longest_seconds, "longest_seconds"),
      fastestFinishSeconds:
        row.fastest_finish_seconds === null || row.fastest_finish_seconds === undefined
          ? null
          : whole(row.fastest_finish_seconds, "fastest_finish_seconds"),
      bonuses: whole(row.bonuses, "bonuses"),
      upsets: whole(row.upsets, "upsets"),
      knockdowns: whole(row.knockdowns, "knockdowns"),
      strikes: whole(row.strikes, "strikes"),
      takedowns: whole(row.takedowns, "takedowns"),
      subAttempts: whole(row.sub_attempts, "sub_attempts"),
      controlSeconds: whole(row.control_seconds, "control_seconds"),
    },
  };
}

export function rowsToResults(rows: readonly EventResultRow[]): ResultsByEvent {
  if (rows.length > MAX_EVENT_ROWS) throw new ExploreParseError("too many rows");
  const byEvent: Record<string, ResultFacets> = {};
  for (const row of rows) {
    const { id, results } = rowToResults(row);
    byEvent[id] = results;
  }
  return byEvent;
}

/** What the browser received: the route sends `{ results: { [eventId]: ResultFacets } }`. */
export function parseResults(json: unknown): ResultsByEvent {
  if (typeof json !== "object" || json === null) throw new ExploreParseError("not an object");
  const results = (json as Record<string, unknown>).results;
  if (typeof results !== "object" || results === null || Array.isArray(results)) {
    throw new ExploreParseError("results");
  }
  const entries = Object.entries(results as Record<string, unknown>);
  if (entries.length > MAX_EVENT_ROWS) throw new ExploreParseError("too many rows");
  const byEvent: Record<string, ResultFacets> = {};
  for (const [id, value] of entries) {
    const o = (value ?? {}) as Record<string, unknown>;
    // The same checks as for a database row, so what the browser accepts is what the server could send.
    const { results: parsed } = rowToResults({
      event_id: id,
      fights: o.fights,
      knockouts: o.knockouts,
      submissions: o.submissions,
      decisions: o.decisions,
      split_decisions: o.splitDecisions,
      round_one_finishes: o.roundOneFinishes,
      total_seconds: o.totalSeconds,
      longest_seconds: o.longestSeconds,
      fastest_finish_seconds: o.fastestFinishSeconds ?? null,
      bonuses: o.bonuses,
      upsets: o.upsets,
      knockdowns: o.knockdowns,
      strikes: o.strikes,
      takedowns: o.takedowns,
      sub_attempts: o.subAttempts,
      control_seconds: o.controlSeconds,
    });
    byEvent[id] = parsed;
  }
  return byEvent;
}

/** Browser side: ask for the result facets. Never cached. */
export async function fetchEventResults(fetchImpl: typeof fetch = fetch): Promise<ResultsByEvent> {
  const response = await fetchImpl("/api/explore/results", { method: "POST", cache: "no-store" });
  if (!response.ok) throw new ExploreRequestError(response.status);
  return parseResults(await response.json());
}
