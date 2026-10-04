import { beforeEach, describe, expect, it, vi } from "vitest";
import { RevealUnavailableError } from "@/lib/reveal/errors";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getSupabase: () => ({ rpc }) }));

import { revealFight } from "@/lib/reveal/service";

const scoreRow = {
  fight_id: "f1",
  version: 2,
  composite: 1,
  config: { weights: { pace: 1 }, performance_weights: { ko_finish: 1 } },
  features: {
    raw: { pace: 9, ko_finish: 1 },
    normalised: { pace: 0.5, ko_finish: 1 },
    performance: { composite: 1, percentile: 90, stars: 4.5 },
  },
};

/** reveal_fight answers with `fight`, reveal_score with `score`. */
function answer(fight: unknown, score: unknown) {
  rpc.mockImplementation(async (name: string) => (name === "reveal_fight" ? fight : score));
}

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

  it("adds the score breakdown from reveal_score (one more call, same fight)", async () => {
    answer({ data: [row], error: null }, { data: [scoreRow], error: null });
    const result = await revealFight("f1");
    expect(rpc).toHaveBeenCalledWith("reveal_score", { p_fight_id: "f1" });
    expect(result?.score?.fight.factors).toEqual([{ feature: "pace", raw: 9, contribution: 0.5 }]);
    expect(result?.score?.performance?.stars).toBe(4.5);
  });

  it.each([
    ["an error", { data: null, error: { code: "42883" } }],
    ["no row", { data: [], error: null }],
    ["two rows", { data: [scoreRow, scoreRow], error: null }],
    ["a malformed row", { data: [{ ...scoreRow, features: "x" }], error: null }],
  ])("still reveals the result when reveal_score gives %s", async (_label, score) => {
    answer({ data: [row], error: null }, score);
    const result = await revealFight("f1");
    expect(result).toMatchObject({ outcome: "win", score: null });
  });

  it("does not ask for the breakdown of a fight without a result", async () => {
    answer({ data: [], error: null }, { data: [scoreRow], error: null });
    expect(await revealFight("f1")).toBeNull();
    expect(rpc).not.toHaveBeenCalledWith("reveal_score", expect.anything());
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
