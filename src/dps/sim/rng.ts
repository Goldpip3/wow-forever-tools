/**
 * The simulator's only source of randomness.
 *
 * Every run is seeded, so the same configuration gives the same answer twice.
 * That matters more than it sounds: stat weights come from running the fight
 * again with one stat nudged up, and if the two runs used different random
 * numbers the difference between them would be mostly noise. Sharing a seed
 * means the same misses land in the same places and what is left is the effect
 * of the stat.
 */

export interface Rng {
  /** A number in [0, 1). */
  next(): number;
  /** True with probability p, where p is a fraction rather than a percentage. */
  chance(p: number): boolean;
  /** A number in [min, max]. */
  between(min: number, max: number): number;
}

/** Mulberry32: small, fast and good enough for damage rolls. */
export function mulberry32(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    chance: (p) => (p <= 0 ? false : p >= 1 ? true : next() < p),
    between: (min, max) => (max <= min ? min : min + next() * (max - min)),
  };
}

/**
 * A seed for one iteration of a run. Mixed rather than just added, so iteration
 * 1 and iteration 2 are not neighbouring streams that move together.
 */
export function splitSeed(base: number, index: number): number {
  let h = ((base >>> 0) ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
