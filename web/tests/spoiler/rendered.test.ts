import { describe, expect, it } from "vitest";
import { CHUNK_LEAK_PATTERNS, HTML_LEAK_PATTERNS, findLeaks } from "./leaks";

// The live suite is SKIPPED unless SPOILER_TEST_BASE_URL is set. To run it:
//   npm run build
//   npm run start -- -p 3100          (in a second terminal)
//   $env:SPOILER_TEST_BASE_URL = "http://localhost:3100"
//   npx vitest run tests/spoiler
const BASE =process.env.SPOILER_TEST_BASE_URL?.replace(/\/$/, "");
const live = describe.skipIf(!BASE);

async function get(path: string, headers: Record<string, string> = {}) {
  const response = await fetch(`${BASE}${path}`, { headers });
  return { status: response.status, text: await response.text(), headers: response.headers };
}

live("the running app serves no result data", () => {
  it("home, events list and card pages: HTML, Next data payload and client bundles", async () => {
    const sitemap = await get("/sitemap.xml");
    const eventPaths = [...sitemap.text.matchAll(/<loc>[^<]*?(\/events\/[a-z0-9-]+)<\/loc>/g)]
      .map((match) => match[1] as string)
      .slice(0, 6);
    expect(eventPaths.length).toBeGreaterThan(0);

    const chunkUrls = new Set<string>();
    for (const path of ["/", "/events", ...eventPaths]) {
      const html = await get(path);
      expect(html.status, path).toBe(200);
      expect(findLeaks(html.text, HTML_LEAK_PATTERNS), `HTML ${path}`).toEqual([]);

      const payload = await get(path, { RSC: "1" });
      // Prove a real Flight payload was scanned (not an error page or an ignored header).
      expect(payload.status, `payload status ${path}`).toBe(200);
      expect(payload.headers.get("content-type"), `payload content-type ${path}`).toContain("text/x-component");
      expect(findLeaks(payload.text, HTML_LEAK_PATTERNS), `payload ${path}`).toEqual([]);

      for (const match of html.text.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g)) {
        chunkUrls.add(match[1] as string);
      }
    }
    expect(chunkUrls.size).toBeGreaterThan(0);
    for (const url of chunkUrls) {
      const chunk = await get(url);
      expect(findLeaks(chunk.text, CHUNK_LEAK_PATTERNS), `bundle ${url}`).toEqual([]);
    }
  }, 180_000);

  it("the home page carries no result in its metadata", async () => {
    const html = (await get("/")).text;
    const head = html.slice(0, html.indexOf("</head>"));
    expect(findLeaks(head, HTML_LEAK_PATTERNS)).toEqual([]);
    expect(head).toMatch(/<title>[^<]+<\/title>/);
  });

  it("the reveal route: POST only, no-store, one fight, strict about ids", async () => {
    const home = await get("/");
    const id = /data-fight-id="([0-9a-f-]{36})"/.exec(home.text)?.[1];
    expect(id, "the home page should list at least one fight").toBeTruthy();

    const post = await fetch(`${BASE}/api/reveal/${id}`, { method: "POST" });
    expect(post.status).toBe(200);
    expect(post.headers.get("cache-control")).toContain("no-store");
    const body = (await post.json()) as Record<string, unknown>;
    expect(body).toHaveProperty("method");
    expect(Array.isArray(body)).toBe(false);

    expect((await fetch(`${BASE}/api/reveal/${id}`)).status).toBe(405);
    expect((await fetch(`${BASE}/api/reveal/not-a-uuid`, { method: "POST" })).status).toBe(400);
    expect(
      (await fetch(`${BASE}/api/reveal/00000000-0000-0000-0000-000000000000`, { method: "POST" })).status,
    ).toBe(404);
    expect((await fetch(`${BASE}/api/reveal`, { method: "POST" })).status).toBe(404);
  });
});
