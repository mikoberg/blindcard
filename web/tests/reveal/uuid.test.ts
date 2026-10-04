import { describe, expect, it } from "vitest";
import { isUuid } from "@/lib/reveal/uuid";

describe("isUuid", () => {
  it("accepts UUIDs in any case", () => {
    expect(isUuid("0e55d8a3-d7a7-4391-8c3b-6a6e6d1d0b11")).toBe(true);
    expect(isUuid("0E55D8A3-D7A7-4391-8C3B-6A6E6D1D0B11")).toBe(true);
    expect(isUuid("00000000-0000-0000-0000-000000000000")).toBe(true);
  });

  it("rejects everything else", () => {
    for (const bad of ["", "not-a-uuid", "0e55d8a3d7a743918c3b6a6e6d1d0b11", "../etc/passwd", "0e55d8a3-d7a7-4391-8c3b-6a6e6d1d0b1", "0e55d8a3-d7a7-4391-8c3b-6a6e6d1d0b11 "]) {
      expect(isUuid(bad)).toBe(false);
    }
  });
});
