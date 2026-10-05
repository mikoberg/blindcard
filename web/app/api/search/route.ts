import { searchEvents } from "@/lib/data/events";
import { searchFighters } from "@/lib/data/leaderboard";
import { toSearchResults } from "@/lib/leaderboard/rank";

export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } as const;

/**
 * GET /api/search?q=text: fighters (public ratings only) and events (name and date only) that match.
 * Nothing here comes from the result tables.
 */
export async function GET(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  try {
    const [fighters, events] = await Promise.all([
      searchFighters(q),
      searchEvents(q, new Date().toISOString().slice(0, 10)),
    ]);
    return Response.json({ fighters: toSearchResults(fighters).slice(0, 8), events }, { headers: HEADERS });
  } catch {
    // Nothing from the database or its errors reaches the client.
    return Response.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
