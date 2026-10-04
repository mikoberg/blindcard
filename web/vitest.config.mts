import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("./", import.meta.url)).replace(/[\\/]$/, "");

export default defineConfig({
  resolve: { alias: { "@": root } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    // Only the public NEXT_PUBLIC_* values from .env / .env.local, for the gated integration tests.
    env: loadEnv("development", root, "NEXT_PUBLIC_"),
  },
});
