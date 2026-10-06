import { buildProfile } from "@/lib/leaderboard/rank";
import { cleanSearchTerm, containsPattern } from "@/lib/leaderboard/search";
import type { FighterFightRow, FighterProfile, FighterRatingRow } from "@/lib/leaderboard/types";
import { getSupabase } from "@/lib/supabase/server";
import { FIGHTER_FIGHT_COLUMNS, FIGHTER_PAGE_COLUMNS, FIGHTER_RATING_COLUMNS } from "./columns";
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

const PAGE_LOOKUP_CHUNK = 100; // slugs per request, so the address stays short

/**
 * Of these fighter slugs, the ones that have a profile page. A fighter's page needs a rated fight,
 * so a debutant or a fighter whose fights are not rated yet has none, and a name must not link
 * to a page that is not there. Public data only: a slug and nothing else.
 */
export async function fighterPageSlugs(slugs: Iterable<string>): Promise<Set<string>> {
  const wanted = [...new Set(slugs)].filter(isValidSlug);
  const found = new Set<string>();
  for (let i = 0; i < wanted.length; i += PAGE_LOOKUP_CHUNK) {
    const rows = ensure<{ slug: string }[]>(
      await getSupabase()
        .from("fighter_ratings")
        .select(FIGHTER_PAGE_COLUMNS)
        .in("slug", wanted.slice(i, i + PAGE_LOOKUP_CHUNK)),
      "look up fighter pages",
    );
    for (const row of rows) found.add(row.slug);
  }
  return found;
}

const SEARCH_LIMIT = 20;

/** Fighters whose name contains `raw` (ignoring case, accents and apostrophes), most rated fights first. */
export async function searchFighters(raw: string): Promise<FighterRatingRow[]> {
  const term = cleanSearchTerm(raw);
  if (term === null) return [];
  const pattern = containsPattern(term);
  if (pattern === null) return [];
  return ensure<FighterRatingRow[]>(
    await getSupabase()
      .from("fighter_ratings")
      .select(FIGHTER_RATING_COLUMNS)
      .ilike("search_name", pattern) // the folded name (migration 0020): case, accents, apostrophes
      .order("rated_fights", { ascending: false })
      .order("name")
      .limit(SEARCH_LIMIT),
    "search fighters",
  );
}
