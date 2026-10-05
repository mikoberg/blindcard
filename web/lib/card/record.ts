import type { FighterRecord } from "./types";

/** "23-3", "23-3-1" (draws), "23-3 (1 NC)". The record going INTO the bout. */
export function formatRecord(record: FighterRecord): string {
  const { main, extra } = recordParts(record);
  return extra ? `${main} ${extra}` : main;
}

/** The record split for display: the big part and a small "(1 NC)" when there is one. */
export function recordParts(record: FighterRecord): { main: string; extra: string | null } {
  const main = `${record.w}-${record.l}${record.d > 0 ? `-${record.d}` : ""}`;
  return { main, extra: record.nc > 0 ? `(${record.nc} NC)` : null };
}
