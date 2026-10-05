import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlaceChip } from "@/components/PlaceChip";
import { parsePlace, placeInfo } from "@/lib/upcoming/place";

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

describe("placeInfo and PlaceChip", () => {
  it("marks events outside the Americas and leaves the others plain", () => {
    expect(placeInfo("Etihad Arena, Abu Dhabi, United Arab Emirates")).toMatchObject({ city: "Abu Dhabi", away: true });
    expect(placeInfo("Meta Apex, Enterprise, Nevada, United States")).toMatchObject({ city: "Las Vegas", away: false });
    expect(placeInfo("Some Hall, Smalltown, Narnia")).toMatchObject({ away: false });
  });

  it("renders the city only, accented only away from the Americas, and no time difference", () => {
    const away = renderToStaticMarkup(<PlaceChip location="Etihad Arena, Abu Dhabi, United Arab Emirates" />);
    expect(away).toContain("Abu Dhabi");
    expect(away).toContain("border-[var(--accent)]");
    expect(away).not.toMatch(/Amsterdam|ahead|behind/);
    const home = renderToStaticMarkup(<PlaceChip location="Meta Apex, Enterprise, Nevada, United States" />);
    expect(home).toContain("Las Vegas");
    expect(home).not.toContain("border-[var(--accent)]");
    expect(renderToStaticMarkup(<PlaceChip location={null} />)).toBe("");
  });
});
