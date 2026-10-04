import { describe, expect, it } from "vitest";
import { DataError, ensure, ensureOptional } from "@/lib/data/ensure";

describe("ensure", () => {
  it("returns data when there is no error", () => {
    expect(ensure<number[]>({ data: [1], error: null }, "load")).toEqual([1]);
  });

  it("throws a DataError that carries the code but never the database message", () => {
    const error = { code: "42501", message: 'permission denied for table fight_results, row (secret)' };
    try {
      ensure({ data: null, error }, "load fights");
      expect.unreachable();
    } catch (caught) {
      expect(caught).toBeInstanceOf(DataError);
      expect((caught as Error).message).toBe("load fights failed (42501)");
      expect((caught as Error).message).not.toContain("secret");
    }
  });

  it("treats missing data as an error", () => {
    expect(() => ensure({ data: null, error: null }, "load")).toThrow(DataError);
  });
});

describe("ensureOptional", () => {
  it("allows null data", () => {
    expect(ensureOptional({ data: null, error: null }, "load")).toBeNull();
  });
  it("still throws on an error", () => {
    expect(() => ensureOptional({ data: null, error: { code: "x" } }, "load")).toThrow(DataError);
  });
});
