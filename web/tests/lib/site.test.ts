import { describe, expect, it } from "vitest";
import { getSiteUrl } from "@/lib/site";

type Env = Record<string, string | undefined>;
const env = (values: Env): NodeJS.ProcessEnv => values as NodeJS.ProcessEnv;

describe("getSiteUrl", () => {
  it("falls back to localhost in development and test", () => {
    expect(getSiteUrl(env({ NODE_ENV: "development" }))).toBe("http://localhost:3000");
    expect(getSiteUrl(env({ NODE_ENV: "test" }))).toBe("http://localhost:3000");
    expect(getSiteUrl(env({}))).toBe("http://localhost:3000");
  });

  it("lets an explicit value win and strips trailing slashes", () => {
    expect(getSiteUrl(env({ NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://blindcard.app" }))).toBe(
      "https://blindcard.app",
    );
    expect(getSiteUrl(env({ NEXT_PUBLIC_SITE_URL: "https://blindcard.app/" }))).toBe("https://blindcard.app");
    expect(getSiteUrl(env({ NEXT_PUBLIC_SITE_URL: "https://blindcard.app///" }))).toBe("https://blindcard.app");
    expect(getSiteUrl(env({ NEXT_PUBLIC_SITE_URL: "  http://localhost:3100/  " }))).toBe("http://localhost:3100");
  });

  it("prefers the explicit value over the Vercel variable", () => {
    expect(
      getSiteUrl(
        env({
          NODE_ENV: "production",
          NEXT_PUBLIC_SITE_URL: "https://blindcard.app",
          VERCEL_PROJECT_PRODUCTION_URL: "other.vercel.app",
        }),
      ),
    ).toBe("https://blindcard.app");
  });

  it("throws on a value without a scheme", () => {
    expect(() => getSiteUrl(env({ NEXT_PUBLIC_SITE_URL: "blindcard.app" }))).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });

  it("throws on a scheme that is not http or https", () => {
    for (const bad of ["ftp://x", "javascript:alert(1)"]) {
      expect(() => getSiteUrl(env({ NEXT_PUBLIC_SITE_URL: bad })), bad).toThrow(/NEXT_PUBLIC_SITE_URL/);
    }
  });

  it("throws an actionable error in production when nothing is configured", () => {
    const call = () => getSiteUrl(env({ NODE_ENV: "production" }));
    expect(call).toThrow(/NEXT_PUBLIC_SITE_URL must be set for production builds/);
    expect(call).toThrow(/web\/README\.md/);
  });

  it("uses VERCEL_PROJECT_PRODUCTION_URL in production, with or without a scheme", () => {
    expect(getSiteUrl(env({ NODE_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "blindcard.vercel.app" }))).toBe(
      "https://blindcard.vercel.app",
    );
    expect(
      getSiteUrl(env({ NODE_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "https://blindcard.vercel.app/" })),
    ).toBe("https://blindcard.vercel.app");
  });

  it("does not use the Vercel variable outside production", () => {
    expect(getSiteUrl(env({ NODE_ENV: "development", VERCEL_PROJECT_PRODUCTION_URL: "blindcard.vercel.app" }))).toBe(
      "http://localhost:3000",
    );
  });

  it("treats a blank or whitespace value as unset", () => {
    expect(getSiteUrl(env({ NODE_ENV: "development", NEXT_PUBLIC_SITE_URL: "" }))).toBe("http://localhost:3000");
    expect(getSiteUrl(env({ NODE_ENV: "development", NEXT_PUBLIC_SITE_URL: "   " }))).toBe("http://localhost:3000");
    expect(() => getSiteUrl(env({ NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "  " }))).toThrow(
      /must be set for production builds/,
    );
    expect(
      getSiteUrl(
        env({ NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "", VERCEL_PROJECT_PRODUCTION_URL: "blindcard.vercel.app" }),
      ),
    ).toBe("https://blindcard.vercel.app");
  });
});
