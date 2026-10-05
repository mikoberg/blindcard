import type { BaselineRow, JudgeRow } from "@/lib/judges/types";
import { MIN_CARDS } from "@/lib/judges/stats";
import { isValidSlug } from "@/lib/slug";
import { getSupabase } from "@/lib/supabase/server";
import { JUDGE_BASELINE_COLUMNS, JUDGE_COLUMNS } from "./columns";
import { ensure, ensureOptional } from "./ensure";

/** A judge by any spelling of their name (reversed order and the like). */
export async function getJudge(slug: string): Promise<JudgeRow | null> {
  if (!isValidSlug(slug)) return null;
  const rows = ensure<JudgeRow[]>(
    await getSupabase()
      .from("judge_stats")
      .select(JUDGE_COLUMNS)
      .contains("slugs", [slug])
      .limit(1),
    "load judge",
  );
  return rows[0] ?? null;
}

/** The totals of all judges, or null before the first `ingest-judges` run. */
export async function getBaseline(): Promise<BaselineRow | null> {
  return ensureOptional<BaselineRow>(
    await getSupabase()
      .from("judge_baseline")
      .select(JUDGE_BASELINE_COLUMNS)
      .eq("id", 1)
      .maybeSingle(),
    "load judge baseline",
  );
}

/** Every judge with enough scorecards to be compared (a few dozen). */
export async function listComparableJudges(): Promise<JudgeRow[]> {
  return ensure<JudgeRow[]>(
    await getSupabase()
      .from("judge_stats")
      .select(JUDGE_COLUMNS)
      .gte("cards", MIN_CARDS)
      .order("cards", { ascending: false }),
    "list judges",
  );
}
