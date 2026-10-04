import type { CardEvent } from "@/lib/card/types";
import { getSupabase } from "@/lib/supabase/server";
import { EVENT_COLUMNS, ID_COLUMN } from "./columns";
import { DataError, ensure, ensureOptional } from "./ensure";
import { mapEvent, type EventRow } from "./map";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Slugs are lowercase words joined by single hyphens. Anything else never reaches the database. */
export function isValidSlug(slug: string): boolean {
  return slug.length >= 1 && slug.length <= 200 && SLUG_PATTERN.test(slug);
}

export async function listEvents(): Promise<CardEvent[]> {
  const result = await getSupabase()
    .from("events")
    .select(EVENT_COLUMNS)
    .order("event_date", { ascending: false })
    .order("id");
  return ensure<EventRow[]>(result, "list events").map(mapEvent);
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
