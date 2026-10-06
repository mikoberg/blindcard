import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { featureLabel } from "@/lib/reveal/featureLabels";

const CONFIG_DIR = join(__dirname, "..", "..", "..", "ingest", "config");

/** The weighted features of a score config: the keys of its [weights] table. */
function weightedFeatures(file: string): string[] {
  const text = readFileSync(join(CONFIG_DIR, file), "utf-8");
  const table = /\[weights\]([\s\S]*?)(?:\n\[|$)/.exec(text)?.[1] ?? "";
  return [...table.matchAll(/^\s*([a-z0-9_]+)\s*=/gm)].map((m) => m[1] as string);
}

describe("the score breakdown names every feature of the newest score versions", () => {
  const newest = readdirSync(CONFIG_DIR)
    .filter((f) => /^scoring_v\d+\.toml$/.test(f))
    .sort((a, b) => Number(/\d+/.exec(b)?.[0]) - Number(/\d+/.exec(a)?.[0]))
    .slice(0, 3);

  it.each(newest)("%s: no feature falls back to its key", (file) => {
    const features = weightedFeatures(file);
    expect(features.length).toBeGreaterThan(5);
    for (const feature of features) {
      // a feature without a name would be shown as "min pace nofinish": the key with spaces
      expect(featureLabel(feature, 1).label, `${file}: ${feature}`).not.toBe(feature.replaceAll("_", " "));
    }
  });
});
