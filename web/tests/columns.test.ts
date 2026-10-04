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
const COLUMN_CONSTANTS = Object.keys(columns);

// ---------------------------------------------------------------------------
// Detection helpers. Each takes a root-relative path and the source and returns
// a list of violations. They are unit-tested below with in-memory strings, so the
// guards are proven able to fail, then run over the real tree.
// ---------------------------------------------------------------------------

/** Replace comments with spaces, keeping string literals intact (so URLs in strings survive). */
function stripComments(source: string): string {
  return source.replace(
    /("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
    (match, str: string | undefined) => (str !== undefined ? match : " "),
  );
}

const inDataLayer = (path: string) => path.startsWith("lib/data/");

/** `.from(` as a database call; `Array.from(` and friends are not queries. */
const FROM_CALL = /(?<!\b(?:Array|Buffer|Int8Array|Uint8Array|Uint16Array|Int32Array|Float32Array|Float64Array)\s*)\.from\(/;
const SELECT_CALL = /\.select\(/;

/** Queries (.from / .select) may only be written inside lib/data/. */
function findQueriesOutsideDataLayer(path: string, source: string): string[] {
  if (inDataLayer(path)) return [];
  const code = stripComments(source);
  const found: string[] = [];
  if (FROM_CALL.test(code)) found.push(`${path}: .from( outside lib/data/`);
  if (SELECT_CALL.test(code)) found.push(`${path}: .select( outside lib/data/`);
  return found;
}

/** Every .select() first argument must be a constant exported from columns.ts. */
function findBadSelects(path: string, source: string, allowed: readonly string[]): string[] {
  const found: string[] = [];
  for (const match of stripComments(source).matchAll(/\.select\(([^)]*)\)/g)) {
    const firstArg = (match[1] ?? "").split(",")[0]?.trim() ?? "";
    if (!allowed.includes(firstArg)) found.push(`${path}: ${match[0].replace(/\s+/g, " ")}`);
  }
  return found;
}

/** A *_COLUMNS name defined next to the query would shadow the vetted constant. */
function findLocalColumnConstants(path: string, source: string): string[] {
  if (!inDataLayer(path) || path === "lib/data/columns.ts") return [];
  const found: string[] = [];
  for (const match of stripComments(source).matchAll(/\b(?:const|let|var)\s+([A-Z_]+_COLUMNS?)\b/g)) {
    found.push(`${path}: local constant ${match[1]} shadows columns.ts`);
  }
  return found;
}

const SUPABASE_ALLOWED = (path: string) =>
  inDataLayer(path) || path === "lib/reveal/service.ts" || path === "lib/supabase/server.ts";

/** The Supabase client may only be reached from the data layer, the reveal service and its own module. */
function findSupabaseAccessOutsideAllowed(path: string, source: string): string[] {
  if (SUPABASE_ALLOWED(path)) return [];
  return /supabase\/server|getSupabase\s*\(/.test(stripComments(source))
    ? [`${path}: uses the Supabase client`]
    : [];
}

/** A result table name as a quoted string, anywhere (closes the variable-indirection bypass). */
function findResultTableStrings(path: string, source: string): string[] {
  const names = FORBIDDEN_TABLES.join("|");
  const pattern = new RegExp(`["'\`]\\s*(?:${names})\\b|\\b(?:${names})\\s*["'\`]`);
  return pattern.test(stripComments(source)) ? [`${path}: names a result table in a string`] : [];
}

// ---------------------------------------------------------------------------
// File scanning
// ---------------------------------------------------------------------------

function files(dir: string, ext: RegExp): string[] {
  return (readdirSync(join(root, dir), { recursive: true }) as string[])
    .filter((name) => ext.test(name))
    .map((name) => join(root, dir, name));
}
const read = (path: string) => readFileSync(path, "utf8");
const rel = (path: string) => relative(root, path).replaceAll("\\", "/");

/** lib/, lib/data and app/ must exist and hold files; only components/ may be missing (Task 7 creates it). */
function scanTree(): string[] {
  for (const required of ["lib", "lib/data", "app"]) {
    expect(existsSync(join(root, required)), `${required}/ must exist (wrong root?)`).toBe(true);
  }
  const lib = files("lib", /\.tsx?$/);
  const data = files("lib/data", /\.tsx?$/);
  const app = files("app", /\.tsx?$/);
  expect(lib.length, "no files found under lib/").toBeGreaterThan(0);
  expect(data.length, "no files found under lib/data/").toBeGreaterThan(0);
  expect(app.length, "no files found under app/").toBeGreaterThan(0);
  const components = existsSync(join(root, "components")) ? files("components", /\.tsx?$/) : [];
  return [...lib, ...app, ...components];
}

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
  const tree = scanTree();
  const violations = (check: (path: string, source: string) => string[]) =>
    tree.flatMap((path) => check(rel(path), read(path)));

  it("every .select() in lib/data uses a constant exported from columns.ts", () => {
    const dataFiles = tree.filter((path) => inDataLayer(rel(path)));
    expect(dataFiles.length).toBeGreaterThan(0);
    const bad = dataFiles.flatMap((path) => findBadSelects(rel(path), read(path), COLUMN_CONSTANTS));
    expect(bad).toEqual([]);
  });

  it("no .select() anywhere in lib/, app/ or components/ uses a constant that is not exported from columns.ts", () => {
    expect(violations((path, source) => findBadSelects(path, source, COLUMN_CONSTANTS))).toEqual([]);
  });

  it("lib/data files do not define their own *_COLUMNS constants", () => {
    expect(violations(findLocalColumnConstants)).toEqual([]);
  });

  it(".from() and .select() queries exist only under lib/data/", () => {
    expect(violations(findQueriesOutsideDataLayer)).toEqual([]);
  });

  it("the Supabase client is only used by lib/data, lib/reveal/service.ts and its own module", () => {
    expect(violations(findSupabaseAccessOutsideAllowed)).toEqual([]);
  });

  it("no code in lib/, app/ or components/ names a result table in a string", () => {
    expect(violations(findResultTableStrings)).toEqual([]);
  });

  it("the reveal_fight RPC is called from exactly one file", () => {
    const callers = tree.filter((path) => /\.rpc\(/.test(read(path))).map(rel);
    expect(callers).toEqual(["lib/reveal/service.ts"]);
  });

  it("client components never import the data layer or the Supabase client", () => {
    for (const path of tree.filter((p) => /[\\/](app|components)[\\/]/.test(p))) {
      const source = read(path);
      if (!/^\s*["']use client["']/.test(source)) continue;
      expect(source, rel(path)).not.toMatch(/@\/lib\/(data|supabase)/);
    }
  });
});

describe("the guards can fail (negative controls)", () => {
  const DATA = "lib/data/probe.ts";
  const APP = "app/events/[slug]/page.tsx";

  it.each([
    ["select star", '.select("*")'],
    ["empty select", ".select()"],
    ["multi-line select with source_id", '.select("id,\n source_id")'],
    ["template literal select", ".select(`id, name`)"],
    ["constant concatenated with an extra column", '.select(EVENT_COLUMNS + ", source")'],
    ["constant that is not exported", ".select(NOT_EXPORTED_COLUMNS)"],
  ])("flags a bad select: %s", (_label, code) => {
    expect(findBadSelects(DATA, `db.from("x")${code}`, COLUMN_CONSTANTS)).toHaveLength(1);
  });

  it("does not flag selects that use exported constants", () => {
    const source = `
      db.from("events").select(EVENT_COLUMNS).eq("a", 1);
      db.from("fights").select(ID_COLUMN, { count: "exact", head: true }).eq("event_id", id);
      db.from("fights")
        .select(
          FIGHT_COLUMNS,
        );
    `;
    expect(findBadSelects(DATA, source, COLUMN_CONSTANTS)).toEqual([]);
  });

  it("ignores a select that only appears in a comment", () => {
    expect(findBadSelects(DATA, '// .select("*")\n/* .select() */', COLUMN_CONSTANTS)).toEqual([]);
  });

  it("flags a shadowing local *_COLUMNS constant in lib/data", () => {
    expect(findLocalColumnConstants(DATA, 'const EVENT_COLUMNS = "*";')).toHaveLength(1);
    expect(findLocalColumnConstants("lib/data/columns.ts", 'export const EVENT_COLUMNS = "id";')).toEqual([]);
  });

  it("flags .from() and .select() outside lib/data, but not inside it or for Array.from", () => {
    expect(findQueriesOutsideDataLayer(APP, 'getX().from("fights")')).toHaveLength(1);
    expect(findQueriesOutsideDataLayer("lib/reveal/x.ts", "db\n  .from(table)")).toHaveLength(1);
    expect(findQueriesOutsideDataLayer(APP, "q.select(EVENT_COLUMNS)")).toHaveLength(1);
    expect(findQueriesOutsideDataLayer(DATA, 'db.from("fights").select(ID_COLUMN)')).toEqual([]);
    expect(findQueriesOutsideDataLayer("lib/card/stars.ts", "Array.from({ length: 5 })")).toEqual([]);
    expect(findQueriesOutsideDataLayer(APP, '// db.from("fights")')).toEqual([]);
  });

  it("flags Supabase client use outside the allowed files", () => {
    expect(findSupabaseAccessOutsideAllowed(APP, 'import { getSupabase } from "@/lib/supabase/server";')).toHaveLength(1);
    expect(findSupabaseAccessOutsideAllowed("lib/card/x.ts", "const db = getSupabase();")).toHaveLength(1);
    expect(findSupabaseAccessOutsideAllowed("lib/data/card.ts", "getSupabase()")).toEqual([]);
    expect(findSupabaseAccessOutsideAllowed("lib/reveal/service.ts", "getSupabase()")).toEqual([]);
    expect(findSupabaseAccessOutsideAllowed("lib/supabase/server.ts", "getSupabase()")).toEqual([]);
  });

  it("flags a quoted result table name anywhere, but not one in a comment", () => {
    for (const quote of ['"', "'", "`"]) {
      expect(findResultTableStrings(APP, `const t = ${quote}fight_results${quote};`)).toHaveLength(1);
    }
    expect(findResultTableStrings(APP, 'const t = "excitement_features";')).toHaveLength(1);
    expect(findResultTableStrings(APP, "// fight_results are separated by RLS\n/* fight_rounds */")).toEqual([]);
  });
});
