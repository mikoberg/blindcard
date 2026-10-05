import "server-only"; // a client component that imports this fails the build
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export class MissingEnvError extends Error {
  constructor() {
    super("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set (see web/.env.example)");
    this.name = "MissingEnvError";
  }
}

export function readSupabaseEnv(
  env: Record<string, string | undefined> = process.env,
): { url: string; anonKey: string } {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) throw new MissingEnvError();
  return { url, anonKey };
}

let client: SupabaseClient | null = null;

/** The anon-key client. Only server code imports this (enforced by tests/columns.test.ts). */
export function getSupabase(): SupabaseClient {
  if (client) return client;
  const { url, anonKey } = readSupabaseEnv();
  client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
