import { describe, expect, it } from "vitest";
import { isVideoId, videoUrl } from "@/lib/card/watch";

describe("video ids and links", () => {
  it("accepts exactly an 11-character YouTube id", () => {
    expect(isVideoId("dQw4w9WgXcQ")).toBe(true);
    expect(isVideoId("short")).toBe(false);
    expect(isVideoId("dQw4w9WgXcQ!")).toBe(false);
    expect(isVideoId("dQw4w9WgX/Q")).toBe(false);
    expect(isVideoId(null)).toBe(false);
  });

  it("links to the watch page of that video, and to nothing else", () => {
    expect(videoUrl("dQw4w9WgXcQ")).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(videoUrl("javascript:alert(1)")).toBeNull();
    expect(videoUrl(null)).toBeNull();
    expect(videoUrl(undefined)).toBeNull();
  });
});
