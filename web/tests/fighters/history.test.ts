import { describe, expect, it } from "vitest";
import { recordsAfter, type HistoryBout } from "@/lib/fighters/history";

const bout = (key: string, date: string, outcome: HistoryBout["outcome"]): HistoryBout => ({ key, date, outcome });

describe("recordsAfter", () => {
  it("starts from today's record at the newest fight and walks back", () => {
    const out = recordsAfter({ w: 3, l: 1, d: 0, nc: 0 }, [
      bout("a", "2020-01-01", "win"), // debut
      bout("c", "2022-01-01", "loss"),
      bout("b", "2021-01-01", "win"),
      bout("d", "2023-01-01", "win"),
    ]);
    expect(out.get("d")).toEqual({ w: 3, l: 1, d: 0, nc: 0 }); // after the newest fight = today
    expect(out.get("c")).toEqual({ w: 2, l: 1, d: 0, nc: 0 });
    expect(out.get("b")).toEqual({ w: 2, l: 0, d: 0, nc: 0 });
    expect(out.get("a")).toEqual({ w: 1, l: 0, d: 0, nc: 0 }); // a win in the debut reads 1-0, never 0-0
  });

  it("counts draws and no contests", () => {
    const out = recordsAfter({ w: 1, l: 0, d: 1, nc: 1 }, [
      bout("a", "2020-01-01", "win"),
      bout("b", "2021-01-01", "draw"),
      bout("c", "2022-01-01", "no_contest"),
    ]);
    expect(out.get("c")).toEqual({ w: 1, l: 0, d: 1, nc: 1 });
    expect(out.get("b")).toEqual({ w: 1, l: 0, d: 1, nc: 0 });
    expect(out.get("a")).toEqual({ w: 1, l: 0, d: 0, nc: 0 });
  });

  it("stays right for the listed fights when only early ones are missing", () => {
    // the record says 5 wins, but we only know the last two
    const out = recordsAfter({ w: 5, l: 0, d: 0, nc: 0 }, [bout("x", "2024-01-01", "win"), bout("y", "2025-01-01", "win")]);
    expect(out.get("y")).toEqual({ w: 5, l: 0, d: 0, nc: 0 });
    expect(out.get("x")).toEqual({ w: 4, l: 0, d: 0, nc: 0 });
  });

  it("gives null after a fight whose result is unknown, and for every older one", () => {
    const out = recordsAfter({ w: 3, l: 0, d: 0, nc: 0 }, [
      bout("a", "2020-01-01", "win"),
      bout("b", "2021-01-01", null),
      bout("c", "2022-01-01", "win"),
    ]);
    expect(out.get("c")).toEqual({ w: 3, l: 0, d: 0, nc: 0 });
    expect(out.get("b")).toEqual({ w: 2, l: 0, d: 0, nc: 0 }); // known: only the NEWER results are needed
    expect(out.get("a")).toBeNull();
  });

  it("gives null when the lists do not match the record, instead of a negative number", () => {
    const out = recordsAfter({ w: 1, l: 0, d: 0, nc: 0 }, [bout("a", "2020-01-01", "win"), bout("b", "2021-01-01", "win")]);
    expect(out.get("b")).toEqual({ w: 1, l: 0, d: 0, nc: 0 });
    expect(out.get("a")).toBeNull(); // two wins listed, one in the record: the oldest cannot be known
  });

  it("knows nothing without a record", () => {
    expect(recordsAfter(null, [bout("a", "2020-01-01", "win")]).get("a")).toBeNull();
  });

  it("keeps the given order for fights on one date", () => {
    const out = recordsAfter({ w: 2, l: 0, d: 0, nc: 0 }, [bout("first", "2020-01-01", "win"), bout("second", "2020-01-01", "win")]);
    expect(out.get("first")).toEqual({ w: 2, l: 0, d: 0, nc: 0 });
    expect(out.get("second")).toEqual({ w: 1, l: 0, d: 0, nc: 0 });
  });
});
