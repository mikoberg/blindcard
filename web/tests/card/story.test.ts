import { describe, expect, it } from "vitest";
import { fighterNote, pairingLabel } from "@/lib/card/story";
import { makeFight } from "./helpers";

const career = (meetings: number, a: [number, boolean], b: [number, boolean]) => ({
  meetings,
  a: { streak: a[0], unbeaten: a[1] },
  b: { streak: b[0], unbeaten: b[1] },
});

describe("pairingLabel", () => {
  it("has nothing to say for a first meeting or without context", () => {
    expect(pairingLabel(makeFight(1, 4))).toBeNull();
    expect(pairingLabel(makeFight(1, 4, { career: career(0, [0, false], [0, false]) }))).toBeNull();
  });

  it("names a rematch, and later meetings by number", () => {
    expect(pairingLabel(makeFight(1, 4, { career: career(1, [0, false], [0, false]) }))).toBe("Rematch");
    expect(pairingLabel(makeFight(1, 4, { career: career(2, [0, false], [0, false]) }))).toBe("Meeting number 3");
  });
});

describe("fighterNote", () => {
  it("says unbeaten, or a win streak of three or more", () => {
    expect(fighterNote({ streak: 7, unbeaten: true })).toBe("Unbeaten in the promotion");
    expect(fighterNote({ streak: 4, unbeaten: false })).toBe("Won 4 in a row");
  });

  it("says nothing about a short streak or without context", () => {
    expect(fighterNote({ streak: 2, unbeaten: false })).toBeNull();
    expect(fighterNote(null)).toBeNull();
    expect(fighterNote(undefined)).toBeNull();
  });
});


describe("fighterNote: a debut", () => {
  it("says promotion debut when the whole career is known and empty", () => {
    expect(fighterNote({ streak: 0, unbeaten: false, record: { w: 0, l: 0, d: 0, nc: 0 } })).toBe("Promotion debut");
  });

  it("does not claim a debut when the record is not known", () => {
    expect(fighterNote({ streak: 0, unbeaten: false, record: null })).toBeNull();
    expect(fighterNote({ streak: 0, unbeaten: false })).toBeNull();
  });
});
