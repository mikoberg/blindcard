import { getSupabase } from "@/lib/supabase/server";
import { RevealUnavailableError } from "./errors";
import { rowToResponse } from "./response";
import type { RevealResponse, RevealRow } from "./types";

/**
 * The single place that asks the database for a result. `reveal_fight` returns at most one
 * row for one fight; anything else is treated as a failure.
 */
export async function revealFight(fightId: string): Promise<RevealResponse | null> {
  const { data, error } = await getSupabase().rpc("reveal_fight", { p_fight_id: fightId });
  if (error) throw new RevealUnavailableError(error.code ?? "unknown");
  if (!Array.isArray(data)) throw new RevealUnavailableError("bad_shape");
  if (data.length === 0) return null;
  if (data.length > 1) throw new RevealUnavailableError("multiple_rows");
  return rowToResponse(data[0] as RevealRow);
}
