import { describe, expect, it } from "vitest";
import { flagCode } from "@/lib/card/country";
import { formatRecord, recordParts } from "@/lib/card/record";

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

describe("recordParts", () => {
  it("splits the big part from a small no-contest note", () => {
    expect(recordParts({ w: 36, l: 17, d: 1, nc: 1 })).toEqual({ main: "36-17-1", extra: "(1 NC)" });
    expect(recordParts({ w: 10, l: 1, d: 0, nc: 0 })).toEqual({ main: "10-1", extra: null });
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
