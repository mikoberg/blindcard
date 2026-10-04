import { describe, expect, it } from "vitest";
import { cardStatus } from "@/lib/card/state";
import { makeFight } from "./helpers";

describe("cardStatus", () => {
  it("is empty when the event has no fights", () => {
    expect(cardStatus([])).toBe("empty");
  });

  it("is pending when no fight has a score yet", () => {
    expect(cardStatus([makeFight(1, null), makeFight(2, null)])).toBe("pending");
  });

  it("is rated as soon as any fight has a score", () => {
    expect(cardStatus([makeFight(1, null), makeFight(2, 3)])).toBe("rated");
  });
});
