"use client";

import { useSyncExternalStore } from "react";
import { HOME_ZONE } from "@/lib/upcoming/place";
import { formatStart, isKnownZone, type StartTime } from "@/lib/upcoming/time";

const subscribe = () => () => {};
const browserZone = () => {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return zone && isKnownZone(zone) ? zone : HOME_ZONE;
};

/**
 * When the event starts, in the visitor's own time zone. The server (and the first paint) uses
 * Amsterdam, the site's default; the browser then swaps in its own zone without a flash of
 * mismatch. The weekday is shown so a card that falls on another day for you is easy to spot.
 */
export function StartTimes({ times, variant }: { times: readonly StartTime[]; variant: "tile" | "page" }) {
  const zone = useSyncExternalStore(subscribe, browserZone, () => HOME_ZONE);
  if (times.length === 0) {
    return variant === "page" ? (
      <p className="text-sm text-[var(--muted)]">Start times are not announced yet.</p>
    ) : null;
  }
  const shown = times.map((t) => ({ ...t, at: formatStart(t.iso, zone) }));
  const main = shown[0];
  if (!main) return null;
  if (variant === "tile") {
    const rest = shown.slice(1);
    return (
      <p className="mt-1.5 text-sm">
        <span className="text-[var(--muted)]">{main.label} </span>
        <span className="font-bold">
          {main.at.weekday} {main.at.time}
        </span>{" "}
        <span className="text-[var(--muted)]">{main.at.zone}</span>
        {rest.length > 0 && (
          <span className="text-[var(--muted)]">
            {" · "}
            {rest.map((t, i) => (
              <span key={t.label}>
                {i > 0 ? ", " : ""}
                {t.label} {t.at.time}
              </span>
            ))}
          </span>
        )}
      </p>
    );
  }
  return (
    <ul className="space-y-1">
      {shown.map((t) => (
        <li key={t.label} className="flex items-baseline justify-between gap-4">
          <span className="text-[var(--muted)]">{t.label}</span>
          <span className="display-tight text-lg tabular-nums">
            {t.at.weekday} {t.at.time} <span className="text-sm font-semibold text-[var(--muted)]">{t.at.zone}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
