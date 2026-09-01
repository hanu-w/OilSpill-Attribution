/**
 * Deterministic seeded PRNG utilities.
 *
 * OceanWatch mock traffic must be reproducible: the same seed must produce
 * the same fleet, the same initial positions, and the same movement
 * trajectory on every application load. This module is the *only* source of
 * randomness the simulation is allowed to use — it is never `Math.random()`.
 *
 * `mulberry32` is a small, fast, well-understood PRNG (public domain).
 */

/** Seeded PRNG producing values in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic integer in [min, max] inclusive. */
export function randomInt(rng: () => number, min: number, max: number): number {
  const span = max - min + 1;
  return min + Math.min(span - 1, Math.floor(rng() * span));
}

/** Deterministic number in [min, max). */
export function randomRange(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

/** Deterministically pick one element. */
export function pick<T>(rng: () => number, items: readonly T[]): T {
  const index = Math.min(items.length - 1, Math.floor(rng() * items.length));
  return items[index];
}

/** Deterministic Fisher–Yates shuffle; returns a new array. */
export function shuffle<T>(rng: () => number, items: readonly T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** FNV-1a string hash → 32-bit unsigned int (deterministic, no Math.random). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
