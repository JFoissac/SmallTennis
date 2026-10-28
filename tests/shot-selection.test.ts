import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { chooseShot, type ShotContext } from '../src/game/shot-selection';
import { createRng, type Rng } from '../src/game/rng';
import type { PlayerStats } from '../src/game/players';

const STATS: PlayerStats = {
  speed: 7.4,
  consistency: 0.85,
  power: 0.8,
  topspin: 0.8,
  slice: 0.5,
  net: 0.5,
  variety: 0.5,
  serve: 0.7,
  stamina: 0.9,
};

function constant(value: number): Rng {
  return {
    next: () => value,
    range: (min, max) => min + value * (max - min),
    gaussian: () => 0,
  };
}

function ctx(overrides: Partial<ShotContext> = {}): ShotContext {
  return {
    stats: STATS,
    contact: new THREE.Vector3(0, 1, 6),
    contactHeight: 1,
    beforeBounce: false,
    oppPosition: new THREE.Vector3(1, 0, -9),
    stretch: false,
    rallyShots: 3,
    forcedShot: null,
    aimTarget: null,
    receiverSide: -1,
    rng: constant(0.5),
    ...overrides,
  };
}

describe('shot selection', () => {
  it('smashes a high ball before the bounce', () => {
    const shot = chooseShot(ctx({ beforeBounce: true, contactHeight: 2.1 }));
    expect(shot.kind).toBe('smash');
    expect(shot.label).toBe('SMASH');
    expect(shot.aggressive).toBe(true);
  });

  it('volleys a low ball before the bounce', () => {
    const shot = chooseShot(ctx({ beforeBounce: true, contactHeight: 1 }));
    expect(shot.kind).toBe('volley');
    expect(shot.label).toBe('VOLLEY');
  });

  it('honours a forced lob and a forced drop', () => {
    expect(chooseShot(ctx({ forcedShot: 'lob' })).kind).toBe('lob');
    expect(chooseShot(ctx({ forcedShot: 'drop' })).kind).toBe('drop');
  });

  it('uses the aim target when one is set', () => {
    const aim = new THREE.Vector3(-3, 0, -9);
    const shot = chooseShot(ctx({ aimTarget: aim }));
    expect(shot.label).toBe('PLACED');
    expect(shot.target.x).toBeCloseTo(aim.x, 5);
    expect(shot.target.z).toBeCloseTo(aim.z, 5);
  });

  it('keeps the forced kind but the aimed target when both are set', () => {
    const aim = new THREE.Vector3(2, 0, -7);
    const shot = chooseShot(ctx({ forcedShot: 'lob', aimTarget: aim }));
    expect(shot.kind).toBe('lob');
    expect(shot.target.x).toBeCloseTo(aim.x, 5);
  });

  it('defends with a lob when stretched and the opponent is at the net', () => {
    const shot = chooseShot(ctx({ stretch: true, oppPosition: new THREE.Vector3(0, 0, 2) }));
    expect(shot.kind).toBe('lob');
    expect(shot.label).toBe('DEFENSIVE LOB');
  });

  it('attacks the net when a short ball is met', () => {
    const shot = chooseShot(ctx({ contact: new THREE.Vector3(0, 1, 3) }));
    expect(shot.kind).toBe('flat');
    expect(shot.approach).toBe(true);
    expect(shot.label).toBe('APPROACH');
  });

  it('lobs over a net rusher', () => {
    const shot = chooseShot(ctx({ contact: new THREE.Vector3(0, 1, 7.5), oppPosition: new THREE.Vector3(0, 0, 2), rng: constant(0.1) }));
    expect(shot.kind).toBe('lob');
    expect(shot.label).toBe('LOB OVER THE RUSH');
  });

  it('goes for a winner when the opponent is out of position', () => {
    const shot = chooseShot(ctx({ contact: new THREE.Vector3(0, 1, 7.5), oppPosition: new THREE.Vector3(4, 0, -9), rng: constant(0.1) }));
    expect(shot.label).toBe('WINNER');
    expect(shot.aggressive).toBe(true);
  });

  it('keeps targets inside the singles court', () => {
    for (let seed = 0; seed < 40; seed++) {
      const shot = chooseShot(ctx({ rng: createRng(seed) }));
      expect(Math.abs(shot.target.x)).toBeLessThanOrEqual(4.4 + 1e-9);
      expect(Math.abs(shot.target.z)).toBeGreaterThanOrEqual(1.1 - 1e-9);
      expect(Math.abs(shot.target.z)).toBeLessThanOrEqual(12.1 + 1e-9);
      expect(Math.sign(shot.target.z)).toBe(-1);
    }
  });

  it('is deterministic for a given seed', () => {
    const a = chooseShot(ctx({ rng: createRng(42) }));
    const b = chooseShot(ctx({ rng: createRng(42) }));
    expect(a).toEqual(b);
  });
});
