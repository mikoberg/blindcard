export type StarFill = "full" | "half" | "empty";

/** A valid rating is 1.0 to 5.0 in half-star steps. */
export function isValidStars(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 1 &&
    value <= 5 &&
    Number.isInteger(value * 2)
  );
}

function assertValid(stars: number): void {
  if (!isValidStars(stars)) {
    throw new RangeError(`invalid star rating: ${String(stars)}`);
  }
}

export function starFills(stars: number): StarFill[] {
  assertValid(stars);
  return Array.from({ length: 5 }, (_, index): StarFill => {
    if (stars >= index + 1) return "full";
    if (stars >= index + 0.5) return "half";
    return "empty";
  });
}

export function formatStars(stars: number): string {
  assertValid(stars);
  return stars.toFixed(1);
}

export function starsLabel(stars: number | null): string {
  return stars === null ? "Not rated yet" : `Rated ${formatStars(stars)} out of 5`;
}
