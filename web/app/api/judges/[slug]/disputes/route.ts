import { isValidSlug } from "@/lib/slug";
import { revealJudgeDisputes } from "@/lib/reveal/service";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function respond(status: number, body: unknown, slug?: string): Response {
  // Logs hold the route, status and judge slug only. Never a fight, never an error message.
  console.info(JSON.stringify({ route: "judge-disputes", status, slug: slug ?? null }));
  return Response.json(body, { status, headers: NO_STORE });
}

/** POST only: no GET, so it is never prefetched or cached. One judge per call, at most 10 cards. */
export async function POST(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await context.params;
  if (!isValidSlug(slug)) return respond(400, { error: "invalid_slug" });

  try {
    return respond(200, { cards: await revealJudgeDisputes(slug) }, slug);
  } catch {
    return respond(503, { error: "unavailable" }, slug);
  }
}
