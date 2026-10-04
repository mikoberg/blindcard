import type { RevealView } from "./format";

export type RevealState =
  | { status: "hidden" }
  | { status: "loading" }
  | { status: "shown"; view: RevealView }
  | { status: "error" };

export type RevealAction =
  | { type: "request" }
  | { type: "success"; view: RevealView }
  | { type: "failure" }
  | { type: "hide" };

/**
 * Every transition is guarded so a double click, a late response or a hide during loading
 * cannot corrupt the state or start a second request.
 */
export function revealReducer(state: RevealState, action: RevealAction): RevealState {
  switch (action.type) {
    case "request":
      return state.status === "hidden" || state.status === "error" ? { status: "loading" } : state;
    case "success":
      return state.status === "loading" ? { status: "shown", view: action.view } : state;
    case "failure":
      return state.status === "loading" ? { status: "error" } : state;
    case "hide":
      return state.status === "shown" ? { status: "hidden" } : state;
  }
}
