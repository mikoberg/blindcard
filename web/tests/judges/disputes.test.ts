import { describe, expect, it, vi } from "vitest";
import {
  DisputeParseError,
  DisputeRequestError,
  MAX_DISPUTES,
  describeMethod,
  fetchDisputes,
  otherFighter,
  parseDisputes,
  rowsToCards,
  type DisputeRow,
} from "@/lib/judges/disputes";

const row = (patch: Partial<DisputeRow> = {}): DisputeRow => ({
  fight_id: "f1",
  event_name: "Test Event",
  event_slug: "test-event",
  event_date: "2024-05-04",
  fighter_a_name: "Alan A",
  fighter_a_slug: "alan-a",
  fighter_b_name: "Ben B",
  fighter_b_slug: "ben-b",
  winner_name: "Ben B",
  method: "Decision - Split",
  scorecards: ["Ann One 29 - 28", "Bea Two 28 - 29", "Cid Three 28 - 29"],
  judge_card: "Ann One 29 - 28",
  margin: -1,
  lone: true,
  ...patch,
});

describe("rowsToCards", () => {
  it("maps a database row to a card", () => {
    const [card] = rowsToCards([row()]);
    expect(card).toMatchObject({
      fightId: "f1",
      eventSlug: "test-event",
      winnerName: "Ben B",
      margin: -1,
      lone: true,
    });
    expect(card?.fighterA).toEqual({ name: "Alan A", slug: "alan-a" });
  });

  it("rejects a card that did not go against the result, a bad slug and too many rows", () => {
    expect(() => rowsToCards([row({ margin: 1 })])).toThrow(DisputeParseError);
    expect(() => rowsToCards([row({ event_slug: "../x" })])).toThrow(DisputeParseError);
    expect(() => rowsToCards([row({ winner_name: null })])).toThrow(DisputeParseError);
    expect(() =>
      rowsToCards(Array.from({ length: MAX_DISPUTES + 1 }, () => row())),
    ).toThrow(DisputeParseError);
  });
});

describe("parseDisputes", () => {
  const body = () => ({ cards: rowsToCards([row()]) });

  it("accepts what the route sends", () => {
    expect(parseDisputes(JSON.parse(JSON.stringify(body())))).toEqual(body().cards);
  });

  it("rejects error bodies and odd shapes", () => {
    expect(() => parseDisputes({ error: "unavailable" })).toThrow(DisputeParseError);
    expect(() => parseDisputes(null)).toThrow(DisputeParseError);
    expect(() => parseDisputes({ cards: [null] })).toThrow(DisputeParseError);
    expect(() =>
      parseDisputes({ cards: [{ ...body().cards[0], scorecards: [1] }] }),
    ).toThrow(DisputeParseError);
  });
});

describe("fetchDisputes", () => {
  it("POSTs without caching to the judge's route and validates the answer", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ cards: rowsToCards([row()]) }),
    );
    const cards = await fetchDisputes("ann-one", fetchImpl as unknown as typeof fetch);
    expect(cards).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledWith("/api/judges/ann-one/disputes", {
      method: "POST",
      cache: "no-store",
    });
  });

  it("fails with the status on a bad response", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ error: "unavailable" }, { status: 503 }));
    await expect(
      fetchDisputes("ann-one", fetchImpl as unknown as typeof fetch),
    ).rejects.toBeInstanceOf(DisputeRequestError);
  });
});

describe("wording", () => {
  it("turns the method into plain words and finds the fighter the judge had ahead", () => {
    expect(describeMethod("Decision - Split")).toBe("split decision");
    expect(describeMethod("Decision - Unanimous")).toBe("unanimous decision");
    expect(describeMethod("Overturned")).toBe("Overturned");
    const [card] = rowsToCards([row()]);
    expect(card && otherFighter(card)).toBe("Alan A");
  });
});
