import { searchFighters } from "@/lib/data/leaderboard";
import { toSearchResults } from "@/lib/leaderboard/rank";

export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } as const;

/** GET /api/fighters?q=name: fighters (public ratings only) whose name contains the text. */
export async function GET(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  try {
    return Response.json(toSearchResults(await searchFighters(q)), { headers: HEADERS });
  } catch {
    // Nothing from the database or its errors reaches the client.
    return Response.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
