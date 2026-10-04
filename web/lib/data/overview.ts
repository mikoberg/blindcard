import type { EventSummary } from "@/lib/overview/types";
import { getSupabase } from "@/lib/supabase/server";
import { OVERVIEW_COLUMNS } from "./columns";
import { ensure } from "./ensure";
import { mapOverview, type OverviewRow } from "./map";

const PAGE = 500; // at most this many rows per request (the server may send fewer)

/** Every event with at least one fight, newest first, with its public star ratings. */
export async function listEventSummaries(): Promise<EventSummary[]> {
  const db = getSupabase();
  const rows: OverviewRow[] = [];
  // Advance by what actually came back: a lower server-side row limit must not end the loop
  // early. Only an empty page means everything has been read.
  for (let from = 0; ; ) {
    const page = ensure<OverviewRow[]>(
      await db
        .from("event_overview")
        .select(OVERVIEW_COLUMNS)
        .order("event_date", { ascending: false })
        .order("id")
        .range(from, from + PAGE - 1),
      "list event overview",
    );
    if (page.length === 0) break;
    rows.push(...page);
    from += page.length;
  }
  return rows.flatMap((row) => mapOverview(row) ?? []);
}
