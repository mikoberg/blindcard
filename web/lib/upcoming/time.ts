import { HOME_ZONE } from "./place";

export interface StartTime {
  label: "Main card" | "Prelims" | "Early prelims";
  /** ISO timestamp (UTC). */
  iso: string;
}

/** The start times that are known, main card first. */
export function startTimes(event: {
  mainCardAt: string | null;
  prelimsAt: string | null;
  earlyPrelimsAt: string | null;
}): StartTime[] {
  const all: [StartTime["label"], string | null][] = [
    ["Main card", event.mainCardAt],
    ["Prelims", event.prelimsAt],
    ["Early prelims", event.earlyPrelimsAt],
  ];
  return all.flatMap(([label, iso]) => (iso ? [{ label, iso }] : []));
}

export interface Shown {
  /** "Sat" */
  weekday: string;
  /** "20:00" */
  time: string;
  /** "CEST", or "GMT-7" where the zone has no short name in English. */
  zone: string;
}

/** A moment as people read it in a zone: weekday, 24-hour time and the zone's short name. */
export function formatStart(iso: string, zone: string = HOME_ZONE): Shown {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { weekday: get("weekday"), time: `${get("hour")}:${get("minute")}`, zone: get("timeZoneName") };
}

/** True when `zone` is a zone this runtime knows (a browser can report an odd one). */
export function isKnownZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
