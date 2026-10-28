/** Deterministic random source for the match simulation.
 *
 *  Every gameplay roll goes through an `Rng` so a match can be replayed from a
 *  seed. Visual-only randomness (crowd placement, texture noise) keeps using
 *  the existing `simpleRng` helpers in the world layer.
 */
export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform in [min, max). */
  range(min: number, max: number): number;
  /** Standard normal. */
  gaussian(): number;
}

/** Mulberry32: tiny, fast and stable across engines. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let spare: number | null = null;
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    gaussian() {
      if (spare !== null) {
        const value = spare;
        spare = null;
        return value;
      }
      let u = 0;
      let v = 0;
      while (u === 0) u = next();
      while (v === 0) v = next();
      const magnitude = Math.sqrt(-2 * Math.log(u));
      spare = magnitude * Math.sin(2 * Math.PI * v);
      return magnitude * Math.cos(2 * Math.PI * v);
    },
  };
}

/** Turns a URL-provided seed into a stable 32-bit integer. */
export function seedFrom(input: string | null | undefined, fallback: number): number {
  if (input === null || input === undefined || input.trim() === '') return fallback >>> 0;
  const trimmed = input.trim();
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed) >>> 0;
  let hash = 2166136261;
  for (let i = 0; i < trimmed.length; i++) {
    hash ^= trimmed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
