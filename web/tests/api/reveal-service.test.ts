import { beforeEach, describe, expect, it, vi } from "vitest";
import { RevealUnavailableError } from "@/lib/reveal/errors";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getSupabase: () => ({ rpc }) }));

import { revealFight } from "@/lib/reveal/service";

const row = {
  fight_id: "f1",
  outcome: "win",
  winner_fighter_id: "w1",
  method: "KO/TKO",
  method_detail: null,
  end_round: 1,
  end_time_seconds: 30,
  scorecards: [],
  bonuses: [],
};

describe("revealFight", () => {
  beforeEach(() => rpc.mockReset());

  it("calls reveal_fight with the id and maps the single row", async () => {
    rpc.mockResolvedValue({ data: [row], error: null });
    const result = await revealFight("f1");
    expect(rpc).toHaveBeenCalledWith("reveal_fight", { p_fight_id: "f1" });
    expect(result).toMatchObject({ outcome: "win", winnerFighterId: "w1", endRound: 1 });
  });

  it("returns null when the fight has no result row", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await revealFight("f1")).toBeNull();
  });

  it("fails on a database error with a code only", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "row (secret) failed" } });
    const error = await revealFight("f1").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RevealUnavailableError);
    expect((error as Error).message).not.toContain("secret");
  });

  it("refuses more than one row (the reveal path serves one fight at a time)", async () => {
    rpc.mockResolvedValue({ data: [row, row], error: null });
    await expect(revealFight("f1")).rejects.toBeInstanceOf(RevealUnavailableError);
  });

  it("refuses a non-array answer", async () => {
    rpc.mockResolvedValue({ data: { weird: true }, error: null });
    await expect(revealFight("f1")).rejects.toBeInstanceOf(RevealUnavailableError);
  });
});
