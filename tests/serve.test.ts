import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  chooseServeTarget,
  returnPosition,
  serveErrorSigma,
  serveFaultOutcome,
  servePosition,
  type ServeContext,
} from '../src/game/serve';
import { createRng } from '../src/game/rng';
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

function ctx(overrides: Partial<ServeContext> = {}): ServeContext {
  return {
    rng: createRng(5),
    serveNumber: 1,
    serverSideSign: 1,
    serveX: 2.25,
    stats: STATS,
    aimTarget: null,
    ...overrides,
  };
}

describe('serve planning', () => {
  it('targets the opposite service box for both sides', () => {
    const deuce = chooseServeTarget(ctx());
    expect(deuce.boxSign).toBe(-1);
    expect(Math.sign(deuce.target.x)).toBe(-1);
    expect(Math.sign(deuce.target.z)).toBe(-1);

    const ad = chooseServeTarget(ctx({ serverSideSign: -1, serveX: -2.25 }));
    expect(ad.boxSign).toBe(1);
    expect(Math.sign(ad.target.x)).toBe(1);
    expect(Math.sign(ad.target.z)).toBe(1);
  });

  it('keeps targets inside the service box for many seeds', () => {
    for (let seed = 0; seed < 50; seed++) {
      for (const serveNumber of [1, 2] as const) {
        const plan = chooseServeTarget(ctx({ rng: createRng(seed), serveNumber }));
        expect(Math.abs(plan.target.x)).toBeGreaterThanOrEqual(0.25 - 1e-9);
        expect(Math.abs(plan.target.x)).toBeLessThanOrEqual(3.8 + 1e-9);
        expect(Math.abs(plan.target.z)).toBeGreaterThanOrEqual(1 - 1e-9);
        expect(Math.abs(plan.target.z)).toBeLessThanOrEqual(6.15 + 1e-9);
        expect(Math.sign(plan.target.z)).toBe(-1);
      }
    }
  });

  it('kicks the second serve with more spin and less power', () => {
    const first = chooseServeTarget(ctx({ serveNumber: 1 }));
    const second = chooseServeTarget(ctx({ serveNumber: 2 }));
    expect(second.kind).toBe('serve2');
    expect(second.spin).toBeGreaterThan(first.spin);
    expect(second.power).toBeLessThan(first.power);
  });

  it('uses an aimed target verbatim', () => {
    const aim = new THREE.Vector3(-1.4, 0, -5.2);
    const plan = chooseServeTarget(ctx({ aimTarget: aim }));
    expect(plan.target.x).toBeCloseTo(aim.x, 5);
    expect(plan.target.z).toBeCloseTo(aim.z, 5);
  });

  it('narrows the serve error as consistency improves', () => {
    expect(serveErrorSigma('serve', 0.95)).toBeLessThan(serveErrorSigma('serve', 0.7));
    expect(serveErrorSigma('serve2', 0.7)).toBeLessThan(serveErrorSigma('serve', 0.7));
  });

  it('turns the second fault into a double fault', () => {
    expect(serveFaultOutcome(1)).toBe('secondServe');
    expect(serveFaultOutcome(2)).toBe('doubleFault');
  });

  it('mirrors the stance and the return spot', () => {
    const up = servePosition('deuce', 1, 11.885);
    const down = servePosition('deuce', -1, 11.885);
    expect(up.x).toBeCloseTo(-down.x, 5);
    expect(Math.sign(up.z)).toBe(1);
    expect(Math.sign(down.z)).toBe(-1);

    const ret = returnPosition(-1, -1, 11.885);
    expect(ret.x).toBeCloseTo(-2.35, 5);
    expect(Math.sign(ret.z)).toBe(-1);
  });
});
