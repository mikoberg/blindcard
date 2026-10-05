/** 0.0623 -> "6.2%". */
export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/** 2.0614 -> "2.06". */
export function formatPoints(value: number): string {
  return value.toFixed(2);
}
