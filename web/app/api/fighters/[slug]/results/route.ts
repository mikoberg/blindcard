import { revealFighterResults } from "@/lib/reveal/service";
import { isValidSlug } from "@/lib/slug";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function respond(status: number, body: unknown): Response {
  // Logs hold the route and the status only. Never a name, a fight or an error message.
  console.info(JSON.stringify({ route: "fighter-results", status }));
  return Response.json(body, { status, headers: NO_STORE });
}

/**
 * POST only: no GET, so it is never prefetched or cached. One fighter per call. The results say how
 * every fight of the fighter ended, so they are only served here, after a click on that fighter's page.
 */
export async function POST(_request: Request, context: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await context.params;
  if (!isValidSlug(slug)) return respond(400, { error: "invalid_slug" });
  try {
    const career = await revealFighterResults(slug);
    if (career.results.length === 0 && career.others.length === 0) return respond(404, { error: "not_found" });
    return respond(200, career);
  } catch {
    return respond(503, { error: "unavailable" });
  }
}
