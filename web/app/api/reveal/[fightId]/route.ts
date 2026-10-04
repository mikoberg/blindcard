import { isUuid } from "@/lib/reveal/uuid";
import { revealFight } from "@/lib/reveal/service";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function respond(status: number, body: unknown, fightId?: string): Response {
  // Logs hold the route, status and fight id only. Never a result, never an error message.
  console.info(JSON.stringify({ route: "reveal", status, fightId: fightId ?? null }));
  return Response.json(body, { status, headers: NO_STORE });
}

/** POST only: no GET, no list, no bulk. One fight per call. */
export async function POST(
  _request: Request,
  context: { params: Promise<{ fightId: string }> },
): Promise<Response> {
  const { fightId } = await context.params;
  if (!isUuid(fightId)) return respond(400, { error: "invalid_id" });

  try {
    const result = await revealFight(fightId);
    if (result === null) return respond(404, { error: "not_found" }, fightId);
    return respond(200, result, fightId);
  } catch {
    return respond(503, { error: "unavailable" }, fightId);
  }
}
