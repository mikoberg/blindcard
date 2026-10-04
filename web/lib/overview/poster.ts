/**
 * Deterministic poster art for an event: the same name always gives the same colours and cut.
 * Generated from the name alone (no images, no logos), so it can never carry a result.
 */
export interface PosterArt {
  ground: string;
  slab: string;
  /** clip-path polygon of the angled slab. */
  cut: string;
}

const PALETTE: readonly { ground: string; slab: string }[] = [
  { ground: "#4a1620", slab: "#7a2433" }, // oxblood
  { ground: "#14284f", slab: "#234289" }, // cobalt
  { ground: "#123326", slab: "#1f5a41" }, // forest
  { ground: "#2f1743", slab: "#4c2a6b" }, // plum
  { ground: "#4d2310", slab: "#8a4118" }, // rust
  { ground: "#0f3a3f", slab: "#17676f" }, // teal
  { ground: "#3a3216", slab: "#6b5a1f" }, // olive
  { ground: "#1b2230", slab: "#33415a" }, // graphite
];

export const POSTER_PALETTE_SIZE = PALETTE.length;

/** FNV-1a, 32 bit: tiny, stable across runtimes. */
export function hashName(name: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** murmur3 finalizer: spreads the bits so every part of the hash is well mixed. */
function mix(value: number): number {
  let h = value >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

export function posterArt(name: string): PosterArt {
  const hash = mix(hashName(name));
  const colours = PALETTE[hash % PALETTE.length] as { ground: string; slab: string };
  const top = 38 + ((hash >>> 3) % 25);
  const bottom = 12 + ((hash >>> 8) % 30);
  const mirrored = ((hash >>> 13) & 1) === 1;
  const cut = mirrored
    ? `polygon(0 0, ${100 - top}% 0, ${100 - bottom}% 100%, 0 100%)`
    : `polygon(${top}% 0, 100% 0, 100% 100%, ${bottom}% 100%)`;
  return { ...colours, cut };
}

/** Bar height in percent: 1 star is a stub, 5 stars fills the strip. */
export function barHeight(stars: number): number {
  const clamped = Math.min(5, Math.max(1, stars));
  return Math.round(14 + ((clamped - 1) / 4) * 86);
}
