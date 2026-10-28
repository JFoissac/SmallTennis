import * as THREE from 'three';
import { BALL_GROUND_Y } from './physics';
import type { PlayerStats } from './players';
import type { Rng } from './rng';

export type ServeKind = 'serve' | 'serve2';

export interface ServePlan {
  target: THREE.Vector3;
  kind: ServeKind;
  spin: number;
  power: number;
  boxSign: 1 | -1;
  receiverSide: 1 | -1;
}

export interface ServeContext {
  rng: Rng;
  serveNumber: 1 | 2;
  /** +1 when the server stands on the positive z half. */
  serverSideSign: 1 | -1;
  /** x of the server's stance, which decides the deuce/ad box. */
  serveX: number;
  stats: PlayerStats;
  /** Already normalized aim point, or null. */
  aimTarget: THREE.Vector3 | null;
}

const GROUND = BALL_GROUND_Y;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function boxSignFor(serveX: number): 1 | -1 {
  return (serveX >= 0 ? -1 : 1) as 1 | -1;
}

/** Service target for the current point, including the second-serve kick. */
export function chooseServeTarget(ctx: ServeContext): ServePlan {
  const { rng, stats } = ctx;
  const receiverSide = (-ctx.serverSideSign) as 1 | -1;
  const boxSign = boxSignFor(ctx.serveX);
  const second = ctx.serveNumber === 2;
  let x = boxSign * (1.6 + rng.next() * 1.3);
  let z = receiverSide * (4.6 + rng.next() * 1.1);

  if (ctx.aimTarget) {
    x = ctx.aimTarget.x;
    z = ctx.aimTarget.z;
  } else if (!second) {
    const pick = rng.next();
    if (pick < 0.48) x = boxSign * (2.5 + rng.next() * 0.9);
    else if (pick < 0.82) x = boxSign * (0.65 + rng.next() * 0.7);
    else x = boxSign * (1.6 + rng.next() * 0.4);
    z = receiverSide * (4.2 + rng.next() * 1.5);
  } else {
    x = boxSign * (1.1 + rng.next() * 1.5);
    z = receiverSide * (4.8 + rng.next() * 1.15);
  }

  x = boxSign * clamp(Math.abs(x), 0.25, 3.8);
  z = receiverSide * clamp(Math.abs(z), 1.0, 6.15);
  const spin = second ? 245 + rng.next() * 75 : 28 + rng.next() * 45;
  const power = (second ? 0.9 : 1.02) + stats.serve * (second ? 0.2 : 0.32);
  return { target: new THREE.Vector3(x, GROUND, z), kind: second ? 'serve2' : 'serve', spin, power, boxSign, receiverSide };
}

/** Angular launch error (radians) for a serve. */
export function serveErrorSigma(kind: ServeKind, consistency: number): number {
  return kind === 'serve'
    ? 0.012 + (1 - consistency) * 0.022
    : 0.006 + (1 - consistency) * 0.01;
}

export type ServeFaultOutcome = 'secondServe' | 'doubleFault';

export function serveFaultOutcome(serveNumber: 1 | 2): ServeFaultOutcome {
  return serveNumber === 2 ? 'doubleFault' : 'secondServe';
}

/** Where the server stands for the current side. */
export function servePosition(side: 'deuce' | 'ad', dir: 1 | -1, lengthHalf: number): THREE.Vector3 {
  const x = (side === 'deuce' ? 2.25 : -2.25) * dir;
  return new THREE.Vector3(x, GROUND, dir * (lengthHalf + 0.45));
}

/** Where the receiver waits, opposite the service box. */
export function returnPosition(boxSign: 1 | -1, receiverSide: 1 | -1, lengthHalf: number): THREE.Vector3 {
  return new THREE.Vector3(boxSign * 2.35, GROUND, receiverSide * (lengthHalf + 0.7));
}
