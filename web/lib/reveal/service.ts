import "server-only"; // a client component that imports this fails the build
import { getSupabase } from "@/lib/supabase/server";
import { rowsToCards, type DisputedCard, type DisputeRow, MAX_DISPUTES } from "@/lib/judges/disputes";
import { ELO_ROWS_SHOWN, rowsToEntries, type EloEntry, type EloRow } from "@/lib/elo/board";
import { rowsToSteps, type EloStepRow, type EloStepView } from "@/lib/elo/history";
import { rowsToResults, type FighterResult, type FighterResultRow } from "@/lib/fighters/results";
import { rowToPick, type PickRow, type UpcomingPick } from "@/lib/upcoming/pick";
import { RevealUnavailableError } from "./errors";
import { buildScoreBreakdown } from "./breakdown";
import { rowToResponse } from "./response";
import type { RevealResponse, RevealRow, RevealScore, ScoreRow } from "./types";

/**
 * The single place that asks the database for a result. `reveal_fight` returns at most one
 * row for one fight; anything else is treated as a failure. The score breakdown comes from
 * `reveal_score` (same rule: one fight, active version) and is an extra: if it is missing or
 * cannot be read, the result is still revealed, just without "why this rating".
 */
export async function revealFight(fightId: string): Promise<RevealResponse | null> {
  const { data, error } = await getSupabase().rpc("reveal_fight", { p_fight_id: fightId });
  if (error) throw new RevealUnavailableError(error.code ?? "unknown");
  if (!Array.isArray(data)) throw new RevealUnavailableError("bad_shape");
  if (data.length === 0) return null;
  if (data.length > 1) throw new RevealUnavailableError("multiple_rows");
  return rowToResponse(data[0] as RevealRow, await revealScore(fightId));
}

async function revealScore(fightId: string): Promise<RevealScore | null> {
  const { data, error } = await getSupabase().rpc("reveal_score", { p_fight_id: fightId });
  if (error || !Array.isArray(data) || data.length !== 1) return null;
  return buildScoreBreakdown(data[0] as ScoreRow);
}

/**
 * The scorecards one judge scored against the official result, most disputed first, at most
 * MAX_DISPUTES. Same rule as `reveal_fight`: it names fights, so it is only called from a POST
 * route after an explicit click, and the database function (not this code) enforces the limit.
 */
export async function revealJudgeDisputes(judgeSlug: string): Promise<DisputedCard[]> {
  const { data, error } = await getSupabase().rpc("judge_disputed_cards", {
    p_slug: judgeSlug,
    p_limit: MAX_DISPUTES,
  });
  if (error) throw new RevealUnavailableError(error.code ?? "unknown");
  if (!Array.isArray(data)) throw new RevealUnavailableError("bad_shape");
  return rowsToCards(data as DisputeRow[]);
}

/**
 * Who is favoured in one upcoming bout, learned from past results. Same rule as `reveal_fight`:
 * one bout per call, from a POST route, after an explicit click. null when the bout has no pick.
 */
export async function revealUpcomingPick(boutId: string): Promise<UpcomingPick | null> {
  const { data, error } = await getSupabase().rpc("upcoming_pick", { p_bout_id: boutId });
  if (error) throw new RevealUnavailableError(error.code ?? "unknown");
  if (!Array.isArray(data)) throw new RevealUnavailableError("bad_shape");
  if (data.length === 0) return null;
  if (data.length > 1) throw new RevealUnavailableError("multiple_rows");
  return rowToPick(data[0] as PickRow);
}

/**
 * The Elo leaderboard: who is strongest now, built from who beat whom. That is result data, so like
 * `reveal_fight` it is only called from a POST route after an explicit click on the spoiler page,
 * and the database function (not this code) enforces the row limit and the active-fighter rule.
 */
export async function revealEloBoard(): Promise<EloEntry[]> {
  const { data, error } = await getSupabase().rpc("elo_leaderboard", { p_limit: ELO_ROWS_SHOWN });
  if (error) throw new RevealUnavailableError(error.code ?? "unknown");
  if (!Array.isArray(data)) throw new RevealUnavailableError("bad_shape");
  return rowsToEntries(data as EloRow[]);
}

/**
 * The calculation behind one fighter's Elo rating, newest fight first. Like the board it names
 * fights and how they were decided, so it is only called from a POST route after a click on that
 * fighter; the database function enforces the row limit and answers for fighters on the board only.
 */
export async function revealEloHistory(slug: string): Promise<EloStepView[]> {
  const { data, error } = await getSupabase().rpc("elo_fighter_history", { p_slug: slug });
  if (error) throw new RevealUnavailableError(error.code ?? "unknown");
  if (!Array.isArray(data)) throw new RevealUnavailableError("bad_shape");
  return rowsToSteps(data as EloStepRow[]);
}

/**
 * How every fight of one fighter ended, newest first. Result data like `reveal_fight`: only called
 * from a POST route after a click on the fighter page, one fighter per call, and the database
 * function (not this code) enforces the row limit.
 */
export async function revealFighterResults(slug: string): Promise<FighterResult[]> {
  const { data, error } = await getSupabase().rpc("fighter_results", { p_slug: slug });
  if (error) throw new RevealUnavailableError(error.code ?? "unknown");
  if (!Array.isArray(data)) throw new RevealUnavailableError("bad_shape");
  return rowsToResults(data as FighterResultRow[]);
}
