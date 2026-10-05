import { isUuid } from "@/lib/reveal/uuid";
import { revealUpcomingPick } from "@/lib/reveal/service";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function respond(status: number, body: unknown, boutId?: string): Response {
  // Logs hold the route, status and bout id only. Never a pick, never an error message.
  console.info(JSON.stringify({ route: "upcoming-pick", status, boutId: boutId ?? null }));
  return Response.json(body, { status, headers: NO_STORE });
}

/** POST only: no GET, no list, no bulk. One bout per call. */
export async function POST(
  _request: Request,
  context: { params: Promise<{ bout: string }> },
): Promise<Response> {
  const { bout } = await context.params;
  if (!isUuid(bout)) return respond(400, { error: "invalid_id" });

  try {
    const pick = await revealUpcomingPick(bout);
    if (pick === null) return respond(404, { error: "not_found" }, bout);
    return respond(200, { pick }, bout);
  } catch {
    return respond(503, { error: "unavailable" }, bout);
  }
}
