import "server-only"; // a client component that imports this fails the build
import { getSupabase } from "@/lib/supabase/server";
import { rowsToCards, type DisputedCard, type DisputeRow, MAX_DISPUTES } from "@/lib/judges/disputes";
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
