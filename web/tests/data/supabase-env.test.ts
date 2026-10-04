import { describe, expect, it } from "vitest";
import { MissingEnvError, readSupabaseEnv } from "@/lib/supabase/server";

describe("readSupabaseEnv", () => {
  it("returns the trimmed values", () => {
    expect(readSupabaseEnv({ NEXT_PUBLIC_SUPABASE_URL: " https://x.supabase.co ", NEXT_PUBLIC_SUPABASE_ANON_KEY: " k " })).toEqual({
      url: "https://x.supabase.co",
      anonKey: "k",
    });
  });

  it("fails clearly when a value is missing or blank, naming the variables but no values", () => {
    for (const env of [{}, { NEXT_PUBLIC_SUPABASE_URL: "u" }, { NEXT_PUBLIC_SUPABASE_URL: "u", NEXT_PUBLIC_SUPABASE_ANON_KEY: "  " }]) {
      expect(() => readSupabaseEnv(env)).toThrow(MissingEnvError);
      expect(() => readSupabaseEnv(env)).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    }
  });
});
