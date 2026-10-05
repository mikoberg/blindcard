import { revealEloHistory } from "@/lib/reveal/service";
import { isValidSlug } from "@/lib/slug";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function respond(status: number, body: unknown): Response {
  // Logs hold the route and the status only. Never a name, a rating or an error message.
  console.info(JSON.stringify({ route: "elo-history", status }));
  return Response.json(body, { status, headers: NO_STORE });
}

/**
 * POST only: no GET, so it is never prefetched or cached. One fighter per call. The history names
 * fights and how they were decided, so it is only served here, after a click on that fighter.
 */
export async function POST(_request: Request, context: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await context.params;
  if (!isValidSlug(slug)) return respond(400, { error: "invalid_slug" });
  try {
    const steps = await revealEloHistory(slug);
    if (steps.length === 0) return respond(404, { error: "not_found" });
    return respond(200, { steps });
  } catch {
    return respond(503, { error: "unavailable" });
  }
}
