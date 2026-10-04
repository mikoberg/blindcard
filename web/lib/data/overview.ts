import type { EventSummary } from "@/lib/overview/types";
import { getSupabase } from "@/lib/supabase/server";
import { OVERVIEW_COLUMNS } from "./columns";
import { ensure } from "./ensure";
import { mapOverview, type OverviewRow } from "./map";

const PAGE = 500; // below the 1000 rows a single Supabase request may return

/** Every event with at least one fight, newest first, with its public star ratings. */
export async function listEventSummaries(): Promise<EventSummary[]> {
  const db = getSupabase();
  const rows: OverviewRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const page = ensure<OverviewRow[]>(
      await db
        .from("event_overview")
        .select(OVERVIEW_COLUMNS)
        .order("event_date", { ascending: false })
        .order("id")
        .range(from, from + PAGE - 1),
      "list event overview",
    );
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows.map(mapOverview);
}
