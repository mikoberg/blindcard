import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("./", import.meta.url)).replace(/[\\/]$/, "");

export default defineConfig({
  resolve: { alias: { "@": root, "server-only": `${root}/tests/stubs/server-only.ts` } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    // Only the public NEXT_PUBLIC_* values from .env / .env.local, for the gated integration tests.
    env: loadEnv("development", root, "NEXT_PUBLIC_"),
  },
});
