import { listExploreEvents } from "@/lib/data/explore";

export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } as const;

/** GET /api/explore: every event with its star ratings and its public, pre-fight facts. */
export async function GET(): Promise<Response> {
  try {
    return Response.json({ events: await listExploreEvents() }, { headers: HEADERS });
  } catch {
    // Nothing from the database or its errors reaches the client.
    return Response.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
