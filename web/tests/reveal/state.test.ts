import { describe, expect, it } from "vitest";
import { revealReducer, type RevealState } from "@/lib/reveal/state";

const view = { headline: "X wins", method: "KO/TKO", when: "Round 1, 0:30", scorecards: [], score: null };
const hidden: RevealState = { status: "hidden" };
const loading: RevealState = { status: "loading" };
const shown: RevealState = { status: "shown", view };
const error: RevealState = { status: "error" };

describe("revealReducer", () => {
  it("goes hidden -> loading -> shown -> hidden", () => {
    let state = revealReducer(hidden, { type: "request" });
    expect(state).toEqual(loading);
    state = revealReducer(state, { type: "success", view });
    expect(state).toEqual(shown);
    state = revealReducer(state, { type: "hide" });
    expect(state).toEqual(hidden);
  });

  it("recovers from an error by allowing a new request", () => {
    expect(revealReducer(loading, { type: "failure" })).toEqual(error);
    expect(revealReducer(error, { type: "request" })).toEqual(loading);
  });

  it("ignores a second request while loading or already shown (no double fetch)", () => {
    expect(revealReducer(loading, { type: "request" })).toBe(loading);
    expect(revealReducer(shown, { type: "request" })).toBe(shown);
  });

  it("ignores hide while loading", () => {
    expect(revealReducer(loading, { type: "hide" })).toBe(loading);
  });

  it("ignores a late success or failure that no longer matches a pending request", () => {
    expect(revealReducer(hidden, { type: "success", view })).toBe(hidden);
    expect(revealReducer(shown, { type: "failure" })).toBe(shown);
    expect(revealReducer(hidden, { type: "failure" })).toBe(hidden);
  });
});
