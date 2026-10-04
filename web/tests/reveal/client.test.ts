import { describe, expect, it, vi } from "vitest";
import { RevealParseError, RevealRequestError } from "@/lib/reveal/errors";
import { fetchReveal } from "@/lib/reveal/client";

const body = {
  outcome: "win",
  winnerFighterId: "w1",
  method: "KO/TKO",
  methodDetail: null,
  endRound: 1,
  endTimeSeconds: 30,
  scorecards: [],
  bonuses: [],
};

const respond = (status: number, payload: unknown) =>
  vi.fn(async () => new Response(typeof payload === "string" ? payload : JSON.stringify(payload), { status }));

describe("fetchReveal", () => {
  it("POSTs to the reveal route without caching and parses the answer", async () => {
    const fetchMock = respond(200, body);
    const result = await fetchReveal("fight-1", fetchMock as unknown as typeof fetch);
    expect(result.method).toBe("KO/TKO");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/reveal/fight-1");
    expect(init.method).toBe("POST");
    expect(init.cache).toBe("no-store");
  });

  it("encodes the id in the path", async () => {
    const fetchMock = respond(200, body);
    await fetchReveal("a/b?c", fetchMock as unknown as typeof fetch);
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("/api/reveal/a%2Fb%3Fc");
  });

  it.each([404, 400, 503])("throws RevealRequestError on status %s", async (status) => {
    await expect(fetchReveal("x", respond(status, { error: "nope" }) as unknown as typeof fetch)).rejects.toBeInstanceOf(RevealRequestError);
  });

  it("throws on malformed JSON and on a body of the wrong shape", async () => {
    await expect(fetchReveal("x", respond(200, "not json") as unknown as typeof fetch)).rejects.toThrow();
    await expect(fetchReveal("x", respond(200, { hello: 1 }) as unknown as typeof fetch)).rejects.toBeInstanceOf(RevealParseError);
  });

  it("propagates a network failure", async () => {
    const failing = vi.fn(async () => {
      throw new TypeError("network down");
    });
    await expect(fetchReveal("x", failing as unknown as typeof fetch)).rejects.toThrow("network down");
  });
});
