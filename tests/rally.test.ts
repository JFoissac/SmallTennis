import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { judgeBallEvent, type RallyHost, type RallyView } from '../src/game/rally';
import type { BallEvent } from '../src/game/physics';

const COURT = { singlesHalf: 4.115, lengthHalf: 11.885, serviceLine: 6.4 };

function host(overrides: Partial<RallyHost> = {}): RallyHost & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    surface: 'clay',
    court: COURT,
    registerBounce: () => calls.push('bounce'),
    triggerNetRipple: () => calls.push('netRipple'),
    emitCall: (text) => calls.push(`call:${text}`),
    recordCloseCall: (_pos, line) => calls.push(`close:${line}`),
    serveFault: (reason) => calls.push(`fault:${reason}`),
    let: () => calls.push('let'),
    point: (winner, reason) => calls.push(`point:${winner}:${reason}`),
    debug: () => {},
    ...overrides,
  };
}

function rally(overrides: Partial<RallyView> = {}): RallyView {
  return {
    hitter: 0,
    bounces: 0,
    isServe: true,
    serveBoxSign: -1,
    receiverSide: -1,
    netTouched: false,
    serveIn: false,
    ...overrides,
  };
}

function bounce(x: number, z: number, speed = 18): BallEvent {
  return { kind: 'bounce', pos: new THREE.Vector3(x, 0, z), speed, spin: new THREE.Vector3(), surface: 'clay' };
}

const net = (over: boolean, x = 0): BallEvent => ({ kind: 'net', pos: new THREE.Vector3(x, 1, 0), cord: false, over, clearance: 0 });
const lost = (): BallEvent => ({ kind: 'lost', pos: new THREE.Vector3(0, 0, 30) });

describe('rally rules', () => {
  it('keeps the serve alive when the first bounce is in the box', () => {
    const h = host();
    const next = judgeBallEvent(rally(), bounce(-2, -5), h);
    expect(next.bounces).toBe(1);
    expect(next.serveIn).toBe(true);
    expect(h.calls).toContain('bounce');
    expect(h.calls.filter((c) => c.startsWith('point'))).toHaveLength(0);
  });

  it('faults a serve that lands outside the box', () => {
    const h = host();
    judgeBallEvent(rally(), bounce(-7, -5), h);
    expect(h.calls).toContain('fault:OUT');
  });

  it('faults a serve into the wrong box', () => {
    const h = host();
    judgeBallEvent(rally({ serveBoxSign: 1 }), bounce(-2, -5), h);
    expect(h.calls).toContain('fault:OUT');
  });

  it('replays a let when the net cord falls in', () => {
    const h = host();
    const next = judgeBallEvent(rally({ netTouched: true }), bounce(-2, -5), h);
    expect(next.serveIn).toBe(true);
    expect(h.calls).toContain('let');
  });

  it('awards an ace when the serve bounces twice untouched', () => {
    const h = host();
    judgeBallEvent(rally({ bounces: 1, serveIn: true }), bounce(-2, -8), h);
    expect(h.calls).toContain('point:0:ACE');
  });

  it('awards a winner when a rally ball bounces twice', () => {
    const h = host();
    judgeBallEvent(rally({ isServe: false, bounces: 1 }), bounce(2, -8), h);
    expect(h.calls).toContain('point:0:WINNER');
  });

  it('awards the point to the opponent when a rally ball lands out', () => {
    const h = host();
    judgeBallEvent(rally({ isServe: false }), bounce(6, -8), h);
    expect(h.calls).toContain('call:OUT!');
    expect(h.calls).toContain('point:1:OUT');
  });

  it('faults a serve that hits the net low', () => {
    const h = host();
    judgeBallEvent(rally(), net(false), h);
    expect(h.calls).toContain('fault:NET');
  });

  it('marks a net cord and keeps the rally alive', () => {
    const h = host();
    const next = judgeBallEvent(rally(), net(true), h);
    expect(next.netTouched).toBe(true);
    expect(h.calls).toContain('call:NET CORD');
  });

  it('awards the point to the opponent when a rally ball hits the net', () => {
    const h = host();
    judgeBallEvent(rally({ isServe: false }), net(false), h);
    expect(h.calls).toContain('point:1:NET');
  });

  it('awards the point to the opponent when the ball is lost', () => {
    const h = host();
    judgeBallEvent(rally({ isServe: false }), lost(), h);
    expect(h.calls).toContain('point:1:OUT');
  });

  it('records a close line call on clay', () => {
    const h = host();
    judgeBallEvent(rally({ isServe: false }), bounce(COURT.singlesHalf - 0.05, -8), h);
    expect(h.calls).toContain('close:IN');
  });

  it('does not record line calls on other surfaces', () => {
    const h = host({ surface: 'grass' });
    judgeBallEvent(rally({ isServe: false }), bounce(COURT.singlesHalf - 0.05, -8), h);
    expect(h.calls.some((c) => c.startsWith('close:'))).toBe(false);
  });
});
