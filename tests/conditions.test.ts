import { describe, expect, it } from 'vitest';
import type { SurfaceType } from '../src/world/court';
import { conditionsFor, scorePressure } from '../src/game/conditions';

const dry = {
  surface: 'clay' as SurfaceType,
  rain: 0,
  wetness: 0,
  night: 0,
  stamina: 1,
  pressure: 0,
};

describe('conditions', () => {
  it('leaves a fresh, dry player at the reference level', () => {
    const mods = conditionsFor(dry);
    expect(mods.speed).toBeCloseTo(1, 5);
    expect(mods.accuracy).toBeCloseTo(1, 5);
    expect(mods.servePower).toBeCloseTo(1, 5);
    expect(mods.serveAccuracy).toBeCloseTo(1, 5);
    expect(mods.strain).toBeCloseTo(0, 5);
  });

  it('slows players and increases errors on a wet court', () => {
    const mods = conditionsFor({ ...dry, wetness: 1 });
    expect(mods.speed).toBeLessThan(0.95);
    expect(mods.accuracy).toBeGreaterThan(1.2);
    expect(mods.serveAccuracy).toBeGreaterThan(1.2);
    expect(mods.servePower).toBeLessThan(1);
  });

  it('punishes grass more than clay on a wet court', () => {
    const clay = conditionsFor({ ...dry, surface: 'clay', wetness: 1 });
    const grass = conditionsFor({ ...dry, surface: 'grass', wetness: 1 });
    expect(grass.speed).toBeLessThan(clay.speed);
    expect(grass.servePower).toBeLessThan(clay.servePower);
  });

  it('makes a tired player slower and less accurate', () => {
    const fresh = conditionsFor(dry);
    const tired = conditionsFor({ ...dry, stamina: 0 });
    expect(tired.speed).toBeLessThan(fresh.speed);
    expect(tired.accuracy).toBeGreaterThan(fresh.accuracy);
    expect(tired.servePower).toBeLessThan(fresh.servePower);
    expect(tired.strain).toBeGreaterThan(0.5);
  });

  it('adds pressure on top of fatigue and weather', () => {
    const calm = conditionsFor(dry);
    const tense = conditionsFor({ ...dry, pressure: 1 });
    expect(tense.accuracy).toBeGreaterThan(calm.accuracy);
  });

  it('derives pressure from the score situation', () => {
    const neutral = scorePressure({
      inTiebreak: false,
      inMatchTiebreak: false,
      decidingPoint: false,
      games: [0, 0],
      points: [0, 0],
    });
    const deuce = scorePressure({
      inTiebreak: false,
      inMatchTiebreak: false,
      decidingPoint: true,
      games: [2, 2],
      points: [3, 3],
    });
    const matchTiebreak = scorePressure({
      inTiebreak: false,
      inMatchTiebreak: true,
      decidingPoint: false,
      games: [0, 0],
      points: [0, 0],
    });
    expect(deuce).toBeGreaterThan(neutral);
    expect(matchTiebreak).toBeGreaterThan(deuce);
  });
});
