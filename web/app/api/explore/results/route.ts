import { revealEventResults } from "@/lib/reveal/service";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function respond(status: number, body: unknown): Response {
  // Logs hold the route and the status only. Never an event, a count or an error message.
  console.info(JSON.stringify({ route: "explore-results", status }));
  return Response.json(body, { status, headers: NO_STORE });
}

/**
 * POST only: no GET, so it is never prefetched or cached. What the fights of every event turned out
 * to be (knockouts, how long the card ran, and so on) is result data, so it is only served here,
 * after a click on the spoiler warning of the card finder.
 */
export async function POST(): Promise<Response> {
  try {
    return respond(200, { results: await revealEventResults() });
  } catch {
    return respond(503, { error: "unavailable" });
  }
}
