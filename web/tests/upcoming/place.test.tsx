import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlaceChip } from "@/components/PlaceChip";
import { hoursFromHome, offsetLabel, parsePlace, placeInfo } from "@/lib/upcoming/place";

describe("parsePlace", () => {
  it("reads venue, city, region and country and names the Vegas venues Las Vegas", () => {
    expect(parsePlace("Meta Apex, Enterprise, Nevada, United States")).toEqual({
      city: "Las Vegas",
      country: "United States",
      zone: "America/Los_Angeles",
    });
    expect(parsePlace("T-Mobile Arena, Paradise, Nevada, United States")?.city).toBe("Las Vegas");
    expect(parsePlace("Rogers Place, Edmonton, Alberta, Canada")).toMatchObject({ city: "Edmonton", zone: "America/Edmonton" });
    expect(parsePlace("Madison Square Garden, New York City, New York, United States")).toMatchObject({
      city: "New York City",
      zone: "America/New_York",
    });
  });

  it("handles places without a region, and places it cannot place", () => {
    expect(parsePlace("Etihad Arena, Abu Dhabi, United Arab Emirates")).toEqual({
      city: "Abu Dhabi",
      country: "United Arab Emirates",
      zone: "Asia/Dubai",
    });
    expect(parsePlace("Afterpay Arena, Sydney, Australia")).toMatchObject({ city: "Sydney", zone: "Australia/Sydney" });
    expect(parsePlace("Some Hall, Smalltown, Narnia")).toEqual({ city: "Smalltown", country: "Narnia", zone: null });
    expect(parsePlace("Just a name")).toBeNull();
    expect(parsePlace(null)).toBeNull();
  });
});

describe("time difference against Amsterdam, daylight saving included", () => {
  it("gets the offsets right on the days of the cards", () => {
    expect(hoursFromHome("2026-10-24", "Asia/Dubai")).toBe(2); // Amsterdam is still on summer time
    expect(hoursFromHome("2026-11-21", "Asia/Qatar")).toBe(2); // and on winter time it is two hours too
    expect(hoursFromHome("2026-10-10", "America/Los_Angeles")).toBe(-9);
    expect(hoursFromHome("2026-11-07", "America/Los_Angeles")).toBe(-9);
    expect(hoursFromHome("2026-10-17", "America/Edmonton")).toBe(-8);
    expect(hoursFromHome("2026-11-14", "America/New_York")).toBe(-6);
    expect(hoursFromHome("2026-10-24", "Europe/Amsterdam")).toBe(0);
  });

  it("says it in words", () => {
    expect(offsetLabel(2)).toBe("2 h ahead of Amsterdam");
    expect(offsetLabel(-9)).toBe("9 h behind Amsterdam");
    expect(offsetLabel(0)).toBe("same time as Amsterdam");
    expect(offsetLabel(-9.5)).toBe("9.5 h behind Amsterdam");
  });
});

describe("placeInfo and PlaceChip", () => {
  it("marks events outside the Americas and leaves US events plain", () => {
    const away = placeInfo("Etihad Arena, Abu Dhabi, United Arab Emirates", "2026-10-24");
    expect(away).toMatchObject({ city: "Abu Dhabi", offset: "2 h ahead of Amsterdam", away: true });
    const home = placeInfo("Meta Apex, Enterprise, Nevada, United States", "2026-10-10");
    expect(home).toMatchObject({ city: "Las Vegas", offset: "9 h behind Amsterdam", away: false });
  });

  it("renders the city and the offset, accented only away from the Americas", () => {
    const away = renderToStaticMarkup(
      <PlaceChip location="Etihad Arena, Abu Dhabi, United Arab Emirates" isoDate="2026-10-24" />,
    );
    expect(away).toContain("Abu Dhabi");
    expect(away).toContain("2 h ahead of Amsterdam");
    expect(away).toContain("border-[var(--accent)]");
    const home = renderToStaticMarkup(
      <PlaceChip location="Meta Apex, Enterprise, Nevada, United States" isoDate="2026-10-10" />,
    );
    expect(home).toContain("Las Vegas");
    expect(home).not.toContain("border-[var(--accent)]");
  });

  it("shows only the city when the zone is unknown, and nothing without a place", () => {
    const unknown = renderToStaticMarkup(<PlaceChip location="Some Hall, Smalltown, Narnia" isoDate="2026-10-24" />);
    expect(unknown).toContain("Smalltown");
    expect(unknown).not.toContain("Amsterdam");
    expect(renderToStaticMarkup(<PlaceChip location={null} isoDate="2026-10-24" />)).toBe("");
  });
});
