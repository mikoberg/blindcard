/**
 * Where an event is and how far its clock is from ours. The site shows times in Europe/Amsterdam
 * by default, so the offset is given against Amsterdam on the day of the event (daylight saving
 * included): an event in Abu Dhabi starts in the European afternoon, one in Las Vegas at night.
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

/** Minutes the zone's clock is ahead of UTC at noon UTC on `isoDate`. */
function offsetMinutes(zone: string, isoDate: string): number {
  const at = new Date(`${isoDate}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const local = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((local - at.getTime()) / 60000);
}

/** Hours the place's clock is ahead of Amsterdam on that day (negative: behind). */
export function hoursFromHome(isoDate: string, zone: string): number {
  return (offsetMinutes(zone, isoDate) - offsetMinutes(HOME_ZONE, isoDate)) / 60;
}

/** "2 h ahead of Amsterdam", "9 h behind Amsterdam", "same time as Amsterdam". */
export function offsetLabel(hours: number): string {
  if (hours === 0) return "same time as Amsterdam";
  const amount = Number.isInteger(hours) ? `${Math.abs(hours)}` : `${Math.abs(hours).toFixed(1)}`;
  return `${amount} h ${hours > 0 ? "ahead of" : "behind"} Amsterdam`;
}

/** Events outside the Americas: they start at a very different time from a US card. */
export function isAwayFromAmericas(zone: string | null): boolean {
  return zone !== null && !zone.startsWith("America/");
}

export interface PlaceInfo {
  city: string;
  country: string;
  /** null when the zone is unknown. */
  offset: string | null;
  hours: number | null;
  /** Outside the Americas: worth pointing out. */
  away: boolean;
}

export function placeInfo(location: string | null, isoDate: string): PlaceInfo | null {
  const place = parsePlace(location);
  if (!place) return null;
  const hours = place.zone ? hoursFromHome(isoDate, place.zone) : null;
  return {
    city: place.city,
    country: place.country,
    offset: hours === null ? null : offsetLabel(hours),
    hours,
    away: isAwayFromAmericas(place.zone),
  };
}
