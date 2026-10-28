import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ServeCycle, type ServeHost, type ServePlayer } from '../src/game/serve-cycle';
import { createBall } from '../src/game/physics';
import { PLAYERS } from '../src/game/players';

function kid(x: number, z: number) {
  return {
    home: new THREE.Vector3(x, 0, z),
    position: new THREE.Vector3(x, 0, z),
    busy: false,
    carrying: false,
    goPath: vi.fn(),
    goHome: vi.fn(),
    release: vi.fn(),
  };
}

function player(slot: 0 | 1): ServePlayer {
  const rig = {
    position: new THREE.Vector3(slot === 0 ? 2 : -2, 0, slot === 0 ? 13 : -13),
    racketHeadWorld: new THREE.Vector3(0, 2, 0),
    getServeContactWorld: () => new THREE.Vector3(0, 3, 0),
    getLeftHandWorld: () => new THREE.Vector3(0.5, 2, 0),
  };
  return {
    slot,
    sideSign: slot === 0 ? 1 : -1,
    rig: rig as unknown as ServePlayer['rig'],
    profile: PLAYERS[slot],
    swing: null,
    contactHit: true,
    moveTarget: new THREE.Vector3(0, 0, 0),
  };
}

function host(overrides: Partial<ServeHost> = {}): ServeHost {
  const agents: [ServePlayer, ServePlayer] = [player(0), player(1)];
  return {
    simTime: 0,
    serveNumber: 1,
    serverSlot: 0,
    agents,
    ballKids: [kid(-6, 6), kid(6, -6)] as unknown as ServeHost['ballKids'],
    ball: createBall(),
    deadBallPos: null,
    isRainy: () => false,
    requestRainDelay: vi.fn(),
    servePosition: () => new THREE.Vector3(2, 0, 13),
    returnPosition: () => new THREE.Vector3(-2, 0, -13),
    chooseServeTarget: () => ({
      target: new THREE.Vector3(-2, 0, -5),
      kind: 'serve',
      spin: 40,
      power: 1,
      boxSign: -1,
      receiverSide: -1,
    }),
    launchServe: vi.fn(),
    clearDeadBall: vi.fn(),
    showBallAt: vi.fn(),
    hideBall: vi.fn(),
    setShadowOpacity: vi.fn(),
    debug: vi.fn(),
    ...overrides,
  };
}

describe('serve cycle', () => {
  it('waits, then sends a ball kid to fetch', () => {
    const cycle = new ServeCycle();
    const h = host();
    cycle.begin(true);
    expect(cycle.step).toBe('fetchWait');
    cycle.update(h, 0.2, 0);
    expect(cycle.step).toBe('fetchWait');
    cycle.update(h, 0.3, 0);
    expect(cycle.step).toBe('fetching');
    expect((h.ballKids[1].goPath as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
    expect(h.clearDeadBall).toHaveBeenCalled();
  });

  it('starts directly at pre-serve when the ball is already there', () => {
    const cycle = new ServeCycle();
    cycle.begin(false);
    expect(cycle.step).toBe('preServe');
  });

  it('resets to pre-serve on a fault or a let', () => {
    const cycle = new ServeCycle();
    const h = host();
    cycle.begin(true);
    cycle.update(h, 0.5, 0);
    expect(cycle.step).toBe('fetching');
    cycle.resetToPreServe();
    expect(cycle.step).toBe('preServe');
    expect(cycle.carryingKid).toBeNull();
  });

  it('goes to flight and clears the toss at contact', () => {
    const cycle = new ServeCycle();
    cycle.begin(true);
    cycle.markFlight();
    expect(cycle.step).toBe('flight');
    cycle.completeToss();
    expect(cycle.currentToss.active).toBe(false);
  });

  it('asks for a rain delay instead of serving in the rain', () => {
    const cycle = new ServeCycle();
    const h = host({ isRainy: () => true });
    cycle.begin(false);
    cycle.update(h, 0.1, 0);
    expect(h.requestRainDelay).toHaveBeenCalledOnce();
    expect(cycle.step).toBe('preServe');
  });
});
