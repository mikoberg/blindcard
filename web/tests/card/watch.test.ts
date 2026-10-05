import { describe, expect, it } from "vitest";
import { watchUrl } from "@/lib/card/watch";

describe("watchUrl", () => {
  it("is a YouTube search of the fighters and the year, nothing else", () => {
    expect(watchUrl("Max Holloway", "Dustin Poirier", 2025)).toBe(
      "https://www.youtube.com/results?search_query=Max%20Holloway%20vs%20Dustin%20Poirier%20full%20fight%202025",
    );
  });

  it("escapes what was typed and drops control characters", () => {
    const url = watchUrl("A&B=C", "D\u0000\nE", "2020")!;
    expect(url).toContain("A%26B%3DC");
    expect(url).not.toContain("%00");
    expect(url.startsWith("https://www.youtube.com/results?search_query=")).toBe(true);
  });

  it("refuses an empty name or a year that is not four digits", () => {
    expect(watchUrl("", "B", 2020)).toBeNull();
    expect(watchUrl("A", "   ", 2020)).toBeNull();
    expect(watchUrl("A", "B", "20x0")).toBeNull();
  });
});
