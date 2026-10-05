import type { FightRatingRow } from "@/lib/classics/types";
import { getSupabase } from "@/lib/supabase/server";
import { FIGHT_RATING_COLUMNS } from "./columns";
import { ensure } from "./ensure";

const PAGE = 500; // at most this many rows per request (the server may send fewer)

/** Every fight rated five stars by the active score version. */
export async function listClassicRows(): Promise<FightRatingRow[]> {
  const db = getSupabase();
  const rows: FightRatingRow[] = [];
  for (let from = 0; ; ) {
    const page = ensure<FightRatingRow[]>(
      await db
        .from("fight_ratings")
        .select(FIGHT_RATING_COLUMNS)
        .eq("stars", 5)
        .order("event_date", { ascending: false })
        .order("fight_id")
        .range(from, from + PAGE - 1),
      "list classics",
    );
    if (page.length === 0) break;
    rows.push(...page);
    from += page.length;
  }
  return rows;
}
