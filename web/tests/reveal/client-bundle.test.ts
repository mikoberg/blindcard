import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf-8");

/** Everything the browser loads for the reveal panel. */
const CLIENT_SIDE = [
  "components/RevealButton.tsx",
  "components/ScoreBreakdown.tsx",
  "components/FightCard.tsx",
  "lib/reveal/client.ts",
  "lib/reveal/format.ts",
  "lib/reveal/response.ts",
  "lib/reveal/state.ts",
  "lib/reveal/types.ts",
];

describe("the reveal vocabulary stays on the server", () => {
  it.each(CLIENT_SIDE)("%s does not import the label or breakdown modules", (path) => {
    expect(read(path)).not.toMatch(/from\s+["'](?:@\/lib\/reveal\/|\.\/)(?:featureLabels|breakdown|service)["']/);
  });

  it("only the server-side breakdown names result-like features", () => {
    for (const path of CLIENT_SIDE) {
      expect(read(path), path).not.toMatch(/KO\/TKO|ko_finish|early_finish|finish_lateness/);
    }
  });
});
