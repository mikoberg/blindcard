import type { LeaderboardEntry } from "./types";

/** A fighter is active when they fought within this many days (two years, like the Elo page). */
export const ACTIVE_DAYS = 730;

const DAY_MS = 86_400_000;

/** Whether a latest fight (ISO date) lies within the active window before `today` (ISO date). */
export function isActive(lastFight: string | null | undefined, today: string): boolean {
  if (!lastFight || !/^\d{4}-\d{2}-\d{2}$/.test(lastFight) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return false;
  const days = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${lastFight}T00:00:00Z`)) / DAY_MS;
  return Number.isFinite(days) && days <= ACTIVE_DAYS;
}

/** Only the active fighters, numbered again from 1 (the rank is the place on THIS list). */
export function activeOnly(entries: readonly LeaderboardEntry[], today: string): LeaderboardEntry[] {
  return entries.filter((entry) => isActive(entry.lastFight, today)).map((entry, index) => ({ ...entry, rank: index + 1 }));
}
