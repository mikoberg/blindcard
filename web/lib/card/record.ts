import type { CardFight, FighterRecord } from "./types";

/** "23-3", "23-3-1" (draws), "23-3 (1 NC)". The record going INTO the bout. */
export function formatRecord(record: FighterRecord): string {
  const base = `${record.w}-${record.l}${record.d > 0 ? `-${record.d}` : ""}`;
  return record.nc > 0 ? `${base} (${record.nc} NC)` : base;
}

/** "Name 23-3" for each fighter whose record is known, in the order of the pairing. */
export function recordLabels(fight: CardFight): string[] {
  const records = fight.records;
  if (!records) return [];
  const labels: string[] = [];
  if (records.a) labels.push(`${fight.fighterA.name} ${formatRecord(records.a)}`);
  if (records.b) labels.push(`${fight.fighterB.name} ${formatRecord(records.b)}`);
  return labels;
}
