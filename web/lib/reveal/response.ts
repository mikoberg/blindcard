import { RevealParseError } from "./errors";
import type { RevealResponse, RevealRow } from "./types";

const OUTCOMES = ["win", "draw", "no_contest"] as const;

function isOutcome(value: unknown): value is RevealResponse["outcome"] {
  return typeof value === "string" && (OUTCOMES as readonly string[]).includes(value);
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/** Maps the database row to the JSON the route returns. */
export function rowToResponse(row: RevealRow): RevealResponse {
  if (!isOutcome(row.outcome)) throw new RevealParseError("unknown outcome");
  return {
    outcome: row.outcome,
    winnerFighterId: row.winner_fighter_id,
    method: row.method,
    methodDetail: row.method_detail,
    endRound: row.end_round,
    endTimeSeconds: row.end_time_seconds,
    scorecards: strings(row.scorecards),
    bonuses: strings(row.bonuses),
  };
}

/** Validates what the browser received. Error bodies and odd shapes are rejected. */
export function parseRevealResponse(json: unknown): RevealResponse {
  if (typeof json !== "object" || json === null) throw new RevealParseError("not an object");
  const o = json as Record<string, unknown>;

  if (!isOutcome(o.outcome)) throw new RevealParseError("unknown outcome");
  if (!(o.winnerFighterId === null || typeof o.winnerFighterId === "string")) {
    throw new RevealParseError("winner id");
  }
  if ((o.outcome === "win") !== (typeof o.winnerFighterId === "string")) {
    throw new RevealParseError("winner does not match outcome");
  }
  if (typeof o.method !== "string" || o.method === "") throw new RevealParseError("method");
  if (!(o.methodDetail === null || typeof o.methodDetail === "string")) {
    throw new RevealParseError("method detail");
  }
  if (typeof o.endRound !== "number" || !Number.isInteger(o.endRound) || o.endRound < 1) {
    throw new RevealParseError("end round");
  }
  if (
    typeof o.endTimeSeconds !== "number" ||
    !Number.isInteger(o.endTimeSeconds) ||
    o.endTimeSeconds < 0
  ) {
    throw new RevealParseError("end time");
  }
  for (const key of ["scorecards", "bonuses"] as const) {
    const list = o[key];
    if (!Array.isArray(list) || !list.every((item) => typeof item === "string")) {
      throw new RevealParseError(key);
    }
  }

  return {
    outcome: o.outcome,
    winnerFighterId: o.winnerFighterId as string | null,
    method: o.method,
    methodDetail: o.methodDetail as string | null,
    endRound: o.endRound,
    endTimeSeconds: o.endTimeSeconds,
    scorecards: o.scorecards as string[],
    bonuses: o.bonuses as string[],
  };
}
