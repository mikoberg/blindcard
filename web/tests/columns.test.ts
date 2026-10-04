import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as columns from "@/lib/data/columns";

const root = fileURLToPath(new URL("..", import.meta.url));
const FORBIDDEN_COLUMN_TOKENS = [
  "*", "source", "source_id", "winner", "method", "end_round", "end_time", "scorecards",
  "bonuses", "fight_results", "fight_rounds", "excitement_features",
];
const FORBIDDEN_TABLES = ["fight_results", "fight_rounds", "excitement_features"];

function files(dir: string, ext: RegExp): string[] {
  // A directory that does not exist yet (e.g. components/ before it is created) has no files to scan.
  if (!existsSync(join(root, dir))) return [];
  return (readdirSync(join(root, dir), { recursive: true }) as string[])
    .filter((name) => ext.test(name))
    .map((name) => join(root, dir, name));
}
const read = (path: string) => readFileSync(path, "utf8");
const rel = (path: string) => relative(root, path).replaceAll("\\", "/");

describe("column allowlist", () => {
  it("no exported column list names a forbidden column", () => {
    for (const [name, value] of Object.entries(columns)) {
      const parts = String(value).split(",").map((part) => part.trim());
      for (const token of FORBIDDEN_COLUMN_TOKENS) {
        expect(parts, `${name} must not contain ${token}`).not.toContain(token);
      }
    }
  });
});

describe("data access guards", () => {
  const dataFiles = files("lib/data", /\.ts$/);

  it("every .select() uses a constant from columns.ts", () => {
    for (const path of dataFiles) {
      for (const match of read(path).matchAll(/\.select\(([^)]*)\)/g)) {
        const firstArg = (match[1] ?? "").split(",")[0]?.trim() ?? "";
        expect(firstArg, `${rel(path)}: ${match[0]}`).toMatch(/^[A-Z_]+_COLUMNS?$/);
      }
    }
  });

  it("no code in lib/ or app/ reads the result tables", () => {
    const all = [...files("lib", /\.ts$/), ...files("app", /\.tsx?$/), ...files("components", /\.tsx$/)];
    for (const path of all) {
      for (const table of FORBIDDEN_TABLES) {
        expect(read(path), `${rel(path)} mentions ${table}`).not.toMatch(new RegExp(`from\\(\\s*["'\`]${table}`));
      }
    }
  });

  // Skipped until Task 6: lib/reveal/service.ts does not exist yet.
  // Re-enabled in Task 6 once lib/reveal/service.ts exists (change it.skip back to it).
  it.skip("the reveal_fight RPC is called from exactly one file", () => {
    const all = [...files("lib", /\.ts$/), ...files("app", /\.tsx?$/), ...files("components", /\.tsx$/)];
    const callers = all.filter((path) => /\.rpc\(/.test(read(path))).map(rel);
    expect(callers).toEqual(["lib/reveal/service.ts"]);
  });

  it("client components never import the data layer or the Supabase client", () => {
    const all = [...files("app", /\.tsx?$/), ...files("components", /\.tsx$/)];
    for (const path of all) {
      const source = read(path);
      if (!/^\s*["']use client["']/.test(source)) continue;
      expect(source, rel(path)).not.toMatch(/@\/lib\/(data|supabase)/);
    }
  });
});
