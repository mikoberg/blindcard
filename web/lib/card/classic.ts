import { CONFIG } from "@/lib/config";

/** A five-star fight. Derived only from the public rating, so it reveals nothing extra. */
export function isClassic(stars: number | null | undefined, minStars: number = CONFIG.classic.minStars): boolean {
  return typeof stars === "number" && stars >= minStars;
}
