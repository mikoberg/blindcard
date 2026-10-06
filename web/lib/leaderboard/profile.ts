import type { FighterFight, ProfileStats } from "./types";

/** What a fighter's rated fights add up to. Null when there are none. */
export function profileStats(fights: readonly FighterFight[]): ProfileStats | null {
  if (fights.length === 0) return null;
  const years = fights.map((fight) => fight.eventDate.slice(0, 4)).sort();
  const perClass = new Map<string, number>();
  for (const fight of fights) {
    if (fight.weightClass) perClass.set(fight.weightClass, (perClass.get(fight.weightClass) ?? 0) + 1);
  }
  return {
    rated: fights.length,
    best: Math.max(...fights.map((fight) => fight.stars)),
    fourPlus: fights.filter((fight) => fight.stars >= 4).length,
    firstYear: years[0] as string,
    lastYear: years[years.length - 1] as string,
    weightClasses: [...perClass.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name),
    titleFights: fights.filter((fight) => fight.isTitleFight).length,
  };
}

/** "2020 to 2026", or just the year when it is the same one. */
export function activeYears(stats: Pick<ProfileStats, "firstYear" | "lastYear">): string {
  return stats.firstYear === stats.lastYear ? stats.firstYear : `${stats.firstYear} to ${stats.lastYear}`;
}
