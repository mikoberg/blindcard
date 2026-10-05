import { revealEloBoard } from "@/lib/reveal/service";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function respond(status: number, body: unknown): Response {
  // Logs hold the route and the status only. Never a name, a rating or an error message.
  console.info(JSON.stringify({ route: "elo-board", status }));
  return Response.json(body, { status, headers: NO_STORE });
}

/**
 * POST only: no GET, so it is never prefetched or cached. The board is result-derived (an Elo
 * rating is built from who beat whom), so it is only served here, after a click on the spoiler page.
 */
export async function POST(): Promise<Response> {
  try {
    return respond(200, { board: await revealEloBoard() });
  } catch {
    return respond(503, { error: "unavailable" });
  }
}
