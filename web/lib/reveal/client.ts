import { RevealRequestError } from "./errors";
import { parseRevealResponse } from "./response";
import type { RevealResponse } from "./types";

/** Browser side: ask the reveal route for one fight's result. Never cached. */
export async function fetchReveal(
  fightId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RevealResponse> {
  const response = await fetchImpl(`/api/reveal/${encodeURIComponent(fightId)}`, {
    method: "POST",
    cache: "no-store",
  });
  if (!response.ok) throw new RevealRequestError(response.status);
  return parseRevealResponse(await response.json());
}
