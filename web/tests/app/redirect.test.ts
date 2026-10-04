import { describe, expect, it } from "vitest";
import nextConfig from "@/next.config";

describe("next.config redirects", () => {
  it("sends the old events list to the homepage permanently, and nothing under /events/", async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    expect(redirects).toEqual([{ source: "/events", destination: "/", permanent: true }]);
  });
});
