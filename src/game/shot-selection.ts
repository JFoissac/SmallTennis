import * as THREE from 'three';
import { BALL_GROUND_Y } from './physics';
import type { PlayerStats } from './players';
import type { Rng } from './rng';

export type ForcedShot = 'lob' | 'drop' | null;
export type ShotKind = 'flat' | 'topspin' | 'slice' | 'lob' | 'drop' | 'smash' | 'volley';

export interface ShotDecision {
  kind: ShotKind;
  spin: number;
  power: number;
  target: THREE.Vector3;
  approach: boolean;
  aggressive: boolean;
  label: string;
}

export interface ShotContext {
  stats: PlayerStats;
  /** Where the ball is met, in world space. */
  contact: THREE.Vector3;
  /** Contact height above the ground. */
  contactHeight: number;
  /** True when the ball is met before its first bounce. */
  beforeBounce: boolean;
  /** Opponent's world position on the court. */
  oppPosition: THREE.Vector3;
  /** True when the player is stretched or arriving late. */
  stretch: boolean;
  /** Rally length before this shot. */
  rallyShots: number;
  forcedShot: ForcedShot;
  /** Already normalized aim point, or null. */
  aimTarget: THREE.Vector3 | null;
  /** Side of the opponent relative to the world origin. */
  receiverSide: 1 | -1;
  rng: Rng;
}

const GROUND = BALL_GROUND_Y;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Decides the next shot from the situation alone.
 *
 * Pure on purpose: no scene access, no match state mutation, every roll comes
 * from the injected `Rng`. That makes the decision table testable in isolation.
 */
export function chooseShot(ctx: ShotContext): ShotDecision {
  const { stats, rng } = ctx;
  const oppAtNet = Math.abs(ctx.oppPosition.z) < 3.8;
  const shortBall = Math.abs(ctx.contact.z) < 6.1;
  const openSign = ctx.oppPosition.x === 0 ? (rng.next() > 0.5 ? 1 : -1) : -Math.sign(ctx.oppPosition.x);
  const receiverSide = ctx.receiverSide;
  const deepZ = receiverSide * (9.2 + rng.next() * 2.1);
  const crossX = openSign * (2.2 + rng.next() * 1.7);
  const lineX = -openSign * (2.2 + rng.next() * 1.7);
  const angleX = openSign * (3.2 + rng.next() * 0.7);
  const approachZ = receiverSide * (4.6 + rng.next() * 1.7);
  const dropZ = receiverSide * (1.4 + rng.next() * 1.6);
  const lobZ = receiverSide * (10.1 + rng.next() * 1.0);
  const r = rng.next();
  const pressure = ctx.rallyShots >= 8;
  let target = new THREE.Vector3();
  let kind: ShotKind = 'topspin';
  let spin = 150 + stats.topspin * 210;
  let power = 0.9 + stats.power * 0.3;
  let approach = false;
  let aggressive = false;
  let label = '';

  if (ctx.contactHeight > 1.85 && ctx.beforeBounce) {
    kind = 'smash';
    spin = 25;
    power = 1.1 + stats.power * 0.22;
    target.set(clamp(openSign * (2.1 + rng.next() * 1.2), -3.9, 3.9), GROUND, deepZ);
    label = 'SMASH';
    aggressive = true;
  } else if (ctx.beforeBounce) {
    kind = 'volley';
    spin = 55 + stats.slice * 60;
    power = 0.95 + stats.power * 0.2;
    target.set(clamp(openSign * (2.2 + rng.next() * 1.5), -3.9, 3.9), GROUND, deepZ);
    label = 'VOLLEY';
  } else if (ctx.forcedShot === 'lob') {
    kind = 'lob';
    spin = 120 + stats.slice * 140;
    power = 0.85;
    target.set(clamp(openSign * (1.3 + rng.next() * 1.4), -3.4, 3.4), GROUND, lobZ);
    label = 'LOB';
  } else if (ctx.forcedShot === 'drop') {
    kind = 'drop';
    spin = 160 + stats.slice * 130;
    power = 0.62;
    target.set(clamp(openSign * (1.0 + rng.next() * 1.4), -2.8, 2.8), GROUND, dropZ);
    label = 'DROP SHOT';
  } else if (ctx.aimTarget) {
    target.copy(ctx.aimTarget);
    if (ctx.stretch) {
      kind = 'slice';
      spin = 150 + stats.slice * 170;
      power = 0.82;
    } else {
      kind = 'topspin';
      spin = 170 + stats.topspin * 210;
      power = 0.94 + stats.power * 0.28;
    }
    label = 'PLACED';
  } else if (ctx.stretch) {
    if (oppAtNet) {
      kind = 'lob';
      spin = 120 + stats.slice * 150;
      power = 0.82;
      target.set(clamp(openSign * (1.0 + rng.next() * 1.4), -3.4, 3.4), GROUND, lobZ);
      label = 'DEFENSIVE LOB';
    } else {
      kind = 'slice';
      spin = 150 + stats.slice * 170;
      power = 0.82;
      target.set(clamp(openSign * (1.8 + rng.next() * 1.4), -3.8, 3.8), GROUND, deepZ);
      label = 'SLICE';
    }
  } else if (oppAtNet) {
    if (r < 0.2 + stats.variety * 0.18) {
      kind = 'lob';
      spin = 120 + stats.slice * 150;
      power = 0.86;
      target.set(clamp(openSign * (1.4 + rng.next() * 1.4), -3.5, 3.5), GROUND, lobZ);
      label = 'LOB OVER THE RUSH';
    } else {
      kind = 'flat';
      spin = 40;
      power = 1.0 + stats.power * 0.25;
      target.set(clamp(openSign * (2.8 + rng.next() * 0.8), -3.8, 3.8), GROUND, deepZ);
      label = 'PASSING SHOT';
      aggressive = true;
    }
  } else if (shortBall) {
    if (r < 0.25 + stats.net * 0.55) {
      kind = 'flat';
      spin = 60;
      power = 1.02 + stats.power * 0.25;
      target.set(clamp(openSign * (1.6 + rng.next() * 1.3), -3.6, 3.6), GROUND, approachZ);
      approach = true;
      label = 'APPROACH';
      aggressive = true;
    } else if (r < 0.5 + stats.variety * 0.3) {
      kind = 'drop';
      spin = 160 + stats.slice * 130;
      power = 0.62;
      target.set(clamp(openSign * (1.0 + rng.next() * 1.4), -2.8, 2.8), GROUND, dropZ);
      label = 'DROP SHOT';
    } else {
      kind = 'topspin';
      spin = 175 + stats.topspin * 210;
      power = 0.98 + stats.power * 0.2;
      target.set(clamp(angleX, -3.9, 3.9), GROUND, receiverSide * (5.2 + rng.next() * 2.2));
      label = 'SHORT ANGLE';
      aggressive = true;
    }
  } else {
    const oppOutOfPosition = Math.abs(ctx.oppPosition.x) > 2.4 || Math.abs(ctx.oppPosition.z) > 10.2;
    if ((oppOutOfPosition && r < 0.22 + stats.power * 0.2) || (pressure && r < 0.34)) {
      kind = 'flat';
      spin = 50;
      power = 1.04 + stats.power * 0.3;
      target.set(clamp(openSign * (3.2 + rng.next() * 0.7), -3.9, 3.9), GROUND, receiverSide * (5.4 + rng.next() * 2.2));
      label = 'WINNER';
      aggressive = true;
    } else if (r < stats.variety * 0.08) {
      kind = 'drop';
      spin = 160 + stats.slice * 130;
      power = 0.6;
      target.set(clamp(openSign * (1.1 + rng.next() * 1.3), -2.8, 2.8), GROUND, dropZ);
      label = 'SURPRISE DROP';
    } else if (r < stats.variety * 0.12 + 0.03) {
      kind = 'lob';
      spin = 120 + stats.slice * 150;
      power = 0.86;
      target.set(clamp(openSign * (1.3 + rng.next() * 1.4), -3.5, 3.5), GROUND, lobZ);
      label = 'LOB';
    } else if (r < 0.3 + stats.power * 0.22) {
      kind = rng.next() < 0.55 ? 'flat' : 'topspin';
      spin = kind === 'flat' ? 45 : 180 + stats.topspin * 210;
      power = 0.98 + stats.power * 0.32;
      target.set(clamp(lineX, -3.8, 3.8), GROUND, deepZ);
      label = 'DOWN THE LINE';
      aggressive = true;
    } else if (r < 0.52 + stats.variety * 0.18) {
      kind = 'topspin';
      spin = 175 + stats.topspin * 210;
      power = 0.92 + stats.power * 0.2;
      target.set(clamp(angleX, -3.9, 3.9), GROUND, receiverSide * (5.6 + rng.next() * 2.4));
      label = 'SHARP ANGLE';
    } else {
      kind = 'topspin';
      spin = 165 + stats.topspin * 230;
      power = 0.9 + stats.power * 0.25;
      target.set(clamp(crossX, -3.8, 3.8), GROUND, deepZ);
      label = 'CROSS COURT';
    }
  }

  target.x = clamp(target.x, -4.4, 4.4);
  target.z = receiverSide * clamp(Math.abs(target.z), 1.1, 12.1);
  if (ctx.aimTarget && ctx.forcedShot) {
    target.copy(ctx.aimTarget);
  }
  return { kind, spin, power, target, approach, aggressive, label };
}
