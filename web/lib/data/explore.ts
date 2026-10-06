import { toFacets, type FacetRow } from "@/lib/explore/facets";
import type { ExploreEvent } from "@/lib/explore/types";
import { getSupabase } from "@/lib/supabase/server";
import { EVENT_FACET_COLUMNS } from "./columns";
import { ensure } from "./ensure";
import { listEventSummaries } from "./overview";

const PAGE = 500;

async function listFacetRows(): Promise<FacetRow[]> {
  const db = getSupabase();
  const rows: FacetRow[] = [];
  for (let from = 0; ; ) {
    const page = ensure<FacetRow[]>(
      await db
        .from("event_facets")
        .select(EVENT_FACET_COLUMNS)
        .order("event_id")
        .range(from, from + PAGE - 1),
      "list event facets",
    );
    if (page.length === 0) break;
    rows.push(...page);
    from += page.length;
  }
  return rows;
}

/** Every event of the overview with its public facets (the card finder's data). */
export async function listExploreEvents(): Promise<ExploreEvent[]> {
  const [events, facetRows] = await Promise.all([listEventSummaries(), listFacetRows()]);
  const facets = new Map(facetRows.map((row) => [row.event_id, toFacets(row)]));
  return events.map((event) => ({ ...event, facets: facets.get(event.id) ?? null }));
}
