import { buildProfile } from "@/lib/leaderboard/rank";
import type { FighterFightRow, FighterProfile, FighterRatingRow } from "@/lib/leaderboard/types";
import { getSupabase } from "@/lib/supabase/server";
import { FIGHTER_FIGHT_COLUMNS, FIGHTER_RATING_COLUMNS } from "./columns";
import { ensure, ensureOptional } from "./ensure";
import { isValidSlug } from "./events";

const PAGE = 500; // at most this many rows per request (the server may send fewer)

/** Every fighter with at least one rated fight (active score version). */
export async function listFighterRatings(): Promise<FighterRatingRow[]> {
  const db = getSupabase();
  const rows: FighterRatingRow[] = [];
  // Advance by what actually came back; only an empty page means everything has been read.
  for (let from = 0; ; ) {
    const page = ensure<FighterRatingRow[]>(
      await db
        .from("fighter_ratings")
        .select(FIGHTER_RATING_COLUMNS)
        .order("id")
        .range(from, from + PAGE - 1),
      "list fighter ratings",
    );
    if (page.length === 0) break;
    rows.push(...page);
    from += page.length;
  }
  return rows;
}

/** A fighter's page data: who they are and the rated fights behind their average. */
export async function getFighterProfile(slug: string): Promise<FighterProfile | null> {
  if (!isValidSlug(slug)) return null;
  const db = getSupabase();
  const fighter = ensureOptional<FighterRatingRow>(
    await db.from("fighter_ratings").select(FIGHTER_RATING_COLUMNS).eq("slug", slug).maybeSingle(),
    "load fighter",
  );
  if (!fighter) return null;
  const fights = ensure<FighterFightRow[]>(
    await db.from("fighter_fights").select(FIGHTER_FIGHT_COLUMNS).eq("fighter_slug", slug),
    "load fighter fights",
  );
  return buildProfile(fighter, fights);
}
