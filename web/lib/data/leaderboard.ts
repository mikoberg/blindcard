import type { FighterRatingRow } from "@/lib/leaderboard/types";
import { getSupabase } from "@/lib/supabase/server";
import { FIGHTER_RATING_COLUMNS } from "./columns";
import { ensure } from "./ensure";

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
