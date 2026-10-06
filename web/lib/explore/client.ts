import type { EventFacets, ExploreEvent } from "./types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class ExploreLoadError extends Error {
  constructor(reason: string) {
    super(`could not load the cards: ${reason}`);
    this.name = "ExploreLoadError";
  }
}

function isFacets(value: unknown): value is EventFacets {
  if (typeof value !== "object" || value === null) return false;
  const o = value as Record<string, unknown>;
  return (
    ["titleFights", "fiveRoundFights", "womensFights", "rematches", "longestStreak", "evenFights", "rankedFighters", "champions", "top5Fighters", "rankedBouts"].every(
      (key) => typeof o[key] === "number",
    ) &&
    Array.isArray(o.weightClasses) &&
    Array.isArray(o.countries)
  );
}

/** What the browser received from /api/explore: public data, checked before it is trusted. */
export function parseExploreEvents(json: unknown): ExploreEvent[] {
  if (typeof json !== "object" || json === null) throw new ExploreLoadError("not an object");
  const events = (json as Record<string, unknown>).events;
  if (!Array.isArray(events)) throw new ExploreLoadError("events");
  return events.map((item): ExploreEvent => {
    const e = (item ?? {}) as Record<string, unknown>;
    if (
      typeof e.id !== "string" ||
      typeof e.slug !== "string" ||
      typeof e.name !== "string" ||
      typeof e.eventDate !== "string" ||
      !ISO_DATE.test(e.eventDate) ||
      !Array.isArray(e.ratings)
    ) {
      throw new ExploreLoadError("event");
    }
    return {
      id: e.id,
      slug: e.slug,
      name: e.name,
      eventDate: e.eventDate,
      location: typeof e.location === "string" ? e.location : null,
      mainEvent: (e.mainEvent ?? null) as ExploreEvent["mainEvent"],
      ratings: e.ratings as ExploreEvent["ratings"],
      facets: isFacets(e.facets) ? e.facets : null,
    };
  });
}

/** Browser side: the public data of the card finder. */
export async function fetchExploreEvents(fetchImpl: typeof fetch = fetch): Promise<ExploreEvent[]> {
  const response = await fetchImpl("/api/explore");
  if (!response.ok) throw new ExploreLoadError(`status ${response.status}`);
  return parseExploreEvents(await response.json());
}
