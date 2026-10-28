import { describe, expect, it } from 'vitest';
import { createRng, seedFrom } from '../src/game/rng';

describe('seeded rng', () => {
  it('replays the same sequence for the same seed', () => {
    const a = createRng(1234);
    const b = createRng(1234);
    for (let i = 0; i < 50; i++) expect(a.next()).toBe(b.next());
  });

  it('diverges for different seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('stays inside [0, 1) and produces finite gaussians', () => {
    const rng = createRng(99);
    for (let i = 0; i < 500; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      expect(Number.isFinite(rng.gaussian())).toBe(true);
    }
  });

  it('has a roughly standard-normal spread', () => {
    const rng = createRng(7);
    let sum = 0;
    let sumSq = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const value = rng.gaussian();
      sum += value;
      sumSq += value * value;
    }
    const mean = sum / n;
    const variance = sumSq / n - mean * mean;
    expect(Math.abs(mean)).toBeLessThan(0.08);
    expect(variance).toBeGreaterThan(0.85);
    expect(variance).toBeLessThan(1.15);
  });

  it('parses numeric and textual seeds deterministically', () => {
    expect(seedFrom('42', 0)).toBe(42);
    expect(seedFrom('love-all', 0)).toBe(seedFrom('love-all', 999));
    expect(seedFrom(undefined, 5)).toBe(5);
  });
});
