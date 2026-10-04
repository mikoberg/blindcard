import { describe, expect, it } from "vitest";
import { flagCode } from "@/lib/card/country";
import { formatRecord, recordLabels } from "@/lib/card/record";
import { makeFight } from "./helpers";

describe("formatRecord", () => {
  it.each([
    [{ w: 23, l: 3, d: 0, nc: 0 }, "23-3"],
    [{ w: 17, l: 4, d: 1, nc: 0 }, "17-4-1"],
    [{ w: 16, l: 4, d: 0, nc: 1 }, "16-4 (1 NC)"],
    [{ w: 3, l: 1, d: 1, nc: 2 }, "3-1-1 (2 NC)"],
    [{ w: 0, l: 0, d: 0, nc: 0 }, "0-0"],
  ])("%j -> %s", (record, text) => {
    expect(formatRecord(record)).toBe(text);
  });
});

describe("recordLabels", () => {
  it("names each fighter with the record going into the bout, in the order of the pairing", () => {
    const fight = makeFight(1, 4, {
      fighterA: { id: "a", name: "Ann One" },
      fighterB: { id: "b", name: "Bea Two" },
      records: { a: { w: 23, l: 3, d: 0, nc: 0 }, b: { w: 14, l: 2, d: 0, nc: 0 } },
    });
    expect(recordLabels(fight)).toEqual(["Ann One 23-3", "Bea Two 14-2"]);
  });

  it("leaves out a side it does not know, and everything without records", () => {
    const one = makeFight(1, 4, {
      fighterA: { id: "a", name: "Ann One" },
      records: { a: null, b: { w: 1, l: 0, d: 0, nc: 0 } },
    });
    expect(recordLabels(one)).toEqual([`${one.fighterB.name} 1-0`]);
    expect(recordLabels(makeFight(1, 4))).toEqual([]);
  });
});

describe("flagCode", () => {
  it.each(["br", "us", "gb-sct", "gb-eng"])("accepts %s", (code) => {
    expect(flagCode(code)).toBe(code);
  });

  it.each(["", "BR", "Brazil", "../x", "br.svg", "a-b", "gb-scot", null, undefined])("rejects %s", (code) => {
    expect(flagCode(code as string | null | undefined)).toBeNull();
  });
});
