import type { CardEvent } from "@/lib/card/types";
import { isValidSlug } from "@/lib/slug";
import { getSupabase } from "@/lib/supabase/server";
import { eventSearchWords, type EventSearchResult } from "@/lib/search/events";
import { EVENT_COLUMNS, ID_COLUMN, UPCOMING_EVENT_COLUMNS } from "./columns";
import { DataError, ensure, ensureOptional } from "./ensure";
import { mapEvent, type EventRow } from "./map";

export { isValidSlug };

const PAGE = 500; // at most this many rows per request (the server may send fewer)

/** Every event, newest first. Read in pages: the server caps the rows of one request. */
export async function listEvents(): Promise<CardEvent[]> {
  const db = getSupabase();
  const rows: EventRow[] = [];
  // Advance by what actually came back: only an empty page means everything has been read.
  for (let from = 0; ; ) {
    const page = ensure<EventRow[]>(
      await db
        .from("events")
        .select(EVENT_COLUMNS)
        .order("event_date", { ascending: false })
        .order("id")
        .range(from, from + PAGE - 1),
      "list events",
    );
    if (page.length === 0) break;
    rows.push(...page);
    from += page.length;
  }
  return rows.map(mapEvent);
}

export async function getEventBySlug(slug: string): Promise<CardEvent | null> {
  if (!isValidSlug(slug)) return null;
  const result = await getSupabase().from("events").select(EVENT_COLUMNS).eq("slug", slug).maybeSingle();
  const row = ensureOptional<EventRow>(result, "load event");
  return row ? mapEvent(row) : null;
}

/** The newest event that has at least one fight (an event stored without fights is skipped). */
export async function getLatestEventWithFights(): Promise<CardEvent | null> {
  const db = getSupabase();
  const latest = await db
    .from("events")
    .select(EVENT_COLUMNS)
    .order("event_date", { ascending: false })
    .order("id")
    .limit(10);
  for (const row of ensure<EventRow[]>(latest, "latest events")) {
    const { count, error } = await db
      .from("fights")
      .select(ID_COLUMN, { count: "exact", head: true })
      .eq("event_id", row.id);
    if (error) throw new DataError("count fights", error.code ?? null);
    if ((count ?? 0) > 0) return mapEvent(row);
  }
  return null;
}

const EVENT_SEARCH_LIMIT = 8;

/**
 * Events (completed and announced) whose name contains every word of `raw`, newest first. Announced
 * events only show while they are still ahead, like the pages do.
 */
export async function searchEvents(raw: string, today: string): Promise<EventSearchResult[]> {
  const words = eventSearchWords(raw);
  if (words.length === 0) return [];
  const db = getSupabase();
  let done = db.from("events").select(EVENT_COLUMNS);
  let ahead = db.from("upcoming_events").select(UPCOMING_EVENT_COLUMNS).gte("event_date", today);
  for (const word of words) {
    done = done.ilike("search_name", `%${word}%`);
    ahead = ahead.ilike("search_name", `%${word}%`);
  }
  const [completed, announced] = await Promise.all([
    done.order("event_date", { ascending: false }).limit(EVENT_SEARCH_LIMIT),
    ahead.order("event_date", { ascending: true }).limit(EVENT_SEARCH_LIMIT),
  ]);
  const doneRows = ensure<EventRow[]>(completed, "search events");
  const aheadRows = ensure<EventRow[]>(announced, "search upcoming events");
  return [
    ...aheadRows.map((row) => ({ name: row.name, date: row.event_date, href: `/upcoming/${row.slug}` })),
    ...doneRows.map((row) => ({ name: row.name, date: row.event_date, href: `/events/${row.slug}` })),
  ].slice(0, EVENT_SEARCH_LIMIT);
}
