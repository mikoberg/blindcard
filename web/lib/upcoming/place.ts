/**
 * Where an event is. Outside the Americas the place is marked: such a card starts at a very
 * different time from a US one (the real start times are shown next to it).
 */

export interface Place {
  /** "Abu Dhabi". */
  city: string;
  country: string;
  /** IANA zone, or null when the place is not one we can place with confidence. */
  zone: string | null;
}

export const HOME_ZONE = "Europe/Amsterdam";

/** Zone by state or province, for countries that span several. */
const REGION_ZONES: Record<string, string> = {
  Nevada: "America/Los_Angeles",
  California: "America/Los_Angeles",
  Washington: "America/Los_Angeles",
  Oregon: "America/Los_Angeles",
  Arizona: "America/Phoenix",
  Utah: "America/Denver",
  Colorado: "America/Denver",
  "New Mexico": "America/Denver",
  Texas: "America/Chicago",
  Illinois: "America/Chicago",
  Missouri: "America/Chicago",
  Minnesota: "America/Chicago",
  Louisiana: "America/Chicago",
  Tennessee: "America/Chicago",
  Oklahoma: "America/Chicago",
  Florida: "America/New_York",
  Georgia: "America/New_York",
  "New York": "America/New_York",
  "New Jersey": "America/New_York",
  Pennsylvania: "America/New_York",
  Massachusetts: "America/New_York",
  Ohio: "America/New_York",
  Michigan: "America/New_York",
  "North Carolina": "America/New_York",
  Alberta: "America/Edmonton",
  "British Columbia": "America/Vancouver",
  Ontario: "America/Toronto",
  Quebec: "America/Toronto",
};

/** Zone by city, for countries that span several and are named without a region. */
const CITY_ZONES: Record<string, string> = {
  Sydney: "Australia/Sydney",
  Melbourne: "Australia/Melbourne",
  Brisbane: "Australia/Brisbane",
  Perth: "Australia/Perth",
  Adelaide: "Australia/Adelaide",
  "Mexico City": "America/Mexico_City",
  "Rio de Janeiro": "America/Sao_Paulo",
  "São Paulo": "America/Sao_Paulo",
  Moscow: "Europe/Moscow",
};

/** Zone for a country that has one (or one that matters for an event). */
const COUNTRY_ZONES: Record<string, string> = {
  "United Arab Emirates": "Asia/Dubai",
  Qatar: "Asia/Qatar",
  "Saudi Arabia": "Asia/Riyadh",
  China: "Asia/Shanghai",
  Japan: "Asia/Tokyo",
  "South Korea": "Asia/Seoul",
  Singapore: "Asia/Singapore",
  Thailand: "Asia/Bangkok",
  "United Kingdom": "Europe/London",
  England: "Europe/London",
  Ireland: "Europe/Dublin",
  France: "Europe/Paris",
  Germany: "Europe/Berlin",
  Netherlands: "Europe/Amsterdam",
  Belgium: "Europe/Brussels",
  Spain: "Europe/Madrid",
  Italy: "Europe/Rome",
  Poland: "Europe/Warsaw",
  "Czech Republic": "Europe/Prague",
  Denmark: "Europe/Copenhagen",
  Sweden: "Europe/Stockholm",
  Brazil: "America/Sao_Paulo",
  Argentina: "America/Argentina/Buenos_Aires",
};

/**
 * Reads "Venue, City, Region, Country" (the region is left out outside the US and Canada).
 * Anything with fewer than two parts has no place to speak of.
 */
export function parsePlace(location: string | null): Place | null {
  if (!location) return null;
  const parts = location
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p !== "");
  if (parts.length < 2) return null;
  const country = parts[parts.length - 1] as string;
  const hasRegion = parts.length >= 4;
  const region = hasRegion ? (parts[parts.length - 2] as string) : null;
  const city = (hasRegion ? parts[parts.length - 3] : parts[parts.length - 2]) as string;
  const zone =
    (region !== null ? REGION_ZONES[region] : undefined) ??
    CITY_ZONES[city] ??
    COUNTRY_ZONES[country] ??
    null;
  return { city: region !== null ? cityOrRegion(city, region) : city, country, zone };
}

/** The Vegas venues sit in suburbs (Paradise, Enterprise): people call the place Las Vegas. */
function cityOrRegion(city: string, region: string): string {
  return region === "Nevada" ? "Las Vegas" : city;
}

/** Events outside the Americas: they start at a very different time from a US card. */
export function isAwayFromAmericas(zone: string | null): boolean {
  return zone !== null && !zone.startsWith("America/");
}

export interface PlaceInfo {
  city: string;
  country: string;
  /** Outside the Americas: worth pointing out. */
  away: boolean;
}

export function placeInfo(location: string | null): PlaceInfo | null {
  const place = parsePlace(location);
  if (!place) return null;
  return { city: place.city, country: place.country, away: isAwayFromAmericas(place.zone) };
}
