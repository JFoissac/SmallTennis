import * as THREE from 'three';
import { COURT, netHeightAt, type SurfaceType } from '../world/court';

export const BALL_RADIUS = 0.0335;
const BALL_MASS = 0.057;
const BALL_AREA = Math.PI * BALL_RADIUS * BALL_RADIUS;
const AIR_RHO = 1.225;
const DRAG_CD = 0.52;
const MAGNUS_TUNE = 0.9;
const GRAVITY = 9.81;
const SPIN_DECAY = 0.22;

export const BALL_GROUND_Y = COURT.groundY;

export interface BallState {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  bounces: number;
  grounded: boolean;
  active: boolean;
}

export interface SurfacePhysics {
  restitution: number;
  friction: number;
  retention: number;
  kick: number;
  label: string;
}

export const SURFACE_PHYSICS: Record<SurfaceType, SurfacePhysics> = {
  clay: { restitution: 0.73, friction: 0.64, retention: 0.92, kick: 0.5, label: 'Clay' },
  grass: { restitution: 0.53, friction: 0.3, retention: 0.98, kick: 0.22, label: 'Grass' },
  hard: { restitution: 0.82, friction: 0.49, retention: 0.95, kick: 0.38, label: 'Hard' },
};

export type BallEvent =
  | {
      kind: 'bounce';
      pos: THREE.Vector3;
      speed: number;
      spin: THREE.Vector3;
      surface: SurfaceType;
    }
  | {
      kind: 'net';
      pos: THREE.Vector3;
      cord: boolean;
      over: boolean;
      clearance: number;
    }
  | {
      kind: 'netCross';
      x: number;
      y: number;
      clearance: number;
      speed: number;
    }
  | { kind: 'lost'; pos: THREE.Vector3 };

export function createBall(pos = new THREE.Vector3(0, 1, 0)): BallState {
  return {
    pos: pos.clone(),
    vel: new THREE.Vector3(),
    spin: new THREE.Vector3(),
    bounces: 0,
    grounded: false,
    active: true,
  };
}

export function cloneBall(ball: BallState): BallState {
  return {
    pos: ball.pos.clone(),
    vel: ball.vel.clone(),
    spin: ball.spin.clone(),
    bounces: ball.bounces,
    grounded: ball.grounded,
    active: ball.active,
  };
}

export function ballAcceleration(vel: THREE.Vector3, spin: THREE.Vector3): THREE.Vector3 {
  const speed = vel.length();
  const accel = new THREE.Vector3(0, -GRAVITY, 0);
  if (speed < 1e-4) return accel;

  const drag = (-0.5 * AIR_RHO * DRAG_CD * BALL_AREA * speed) / BALL_MASS;
  accel.addScaledVector(vel, drag);

  const spinCrossVel = new THREE.Vector3().crossVectors(spin, vel);
  const crossMag = spinCrossVel.length();
  if (crossMag > 1e-5) {
    const spinRatio = (spin.length() * BALL_RADIUS) / Math.max(1, speed);
    const lift = Math.min(0.62, 0.55 * spinRatio) * MAGNUS_TUNE;
    accel.addScaledVector(spinCrossVel.normalize(), 0.5 * AIR_RHO * BALL_AREA * lift * speed * speed / BALL_MASS);
  }
  return accel;
}

export function stepBall(ball: BallState, dt: number, surface: SurfaceType): BallEvent[] {
  if (!ball.active) return [];
  const events: BallEvent[] = [];
  const prev = ball.pos.clone();
  const accel = ballAcceleration(ball.vel, ball.spin);
  ball.vel.addScaledVector(accel, dt);
  if (ball.grounded) {
    const damp = Math.exp(-dt * 1.5);
    ball.vel.x *= damp;
    ball.vel.z *= damp;
    ball.vel.y = 0;
    ball.spin.multiplyScalar(Math.exp(-dt * 2.4));
  } else {
    ball.spin.multiplyScalar(Math.exp(-SPIN_DECAY * dt));
  }
  ball.pos.addScaledVector(ball.vel, dt);

  const dir = Math.sign(ball.pos.z - prev.z);
  if (prev.z * ball.pos.z <= 0 && dir !== 0 && Math.abs(prev.z - ball.pos.z) > 1e-8) {
    const t = Math.abs(prev.z) / Math.max(1e-9, Math.abs(prev.z) + Math.abs(ball.pos.z));
    const cx = prev.x + (ball.pos.x - prev.x) * t;
    const cy = prev.y + (ball.pos.y - prev.y) * t;
    const netTop = COURT.groundY + netHeightAt(cx);
    const clearance = cy - netTop;
    events.push({ kind: 'netCross', x: cx, y: cy, clearance, speed: ball.vel.length() });
    if (Math.abs(cx) <= COURT.netPostX && cy - BALL_RADIUS < netTop && cy > COURT.groundY - 0.1) {
      const horizontalSpeed = Math.abs(ball.vel.z);
      const nearCord = cy + BALL_RADIUS >= netTop - 0.045;
      if (nearCord) {
        const trickleOver = horizontalSpeed > 6.2 && ball.vel.y < 4.5;
        ball.pos.set(cx, Math.min(cy, netTop + 0.02), dir * 0.1);
        if (trickleOver) {
          ball.vel.set(ball.vel.x * 0.42, -0.55, dir * Math.max(0.55, horizontalSpeed * 0.055));
          ball.spin.multiplyScalar(0.28);
        } else {
          ball.vel.set(ball.vel.x * 0.28, 0.15, -dir * 0.55);
          ball.spin.multiplyScalar(0.35);
        }
        events.push({ kind: 'net', pos: ball.pos.clone(), cord: true, over: trickleOver, clearance });
      } else {
        ball.pos.set(cx, cy, -dir * 0.05);
        ball.vel.set(ball.vel.x * 0.45, ball.vel.y * 0.25, -ball.vel.z * 0.18);
        ball.spin.multiplyScalar(0.4);
        events.push({ kind: 'net', pos: ball.pos.clone(), cord: false, over: false, clearance });
      }
      return events;
    }
  }

  const groundPlane = BALL_GROUND_Y + BALL_RADIUS;
  if (ball.pos.y <= groundPlane) {
    ball.pos.y = groundPlane;
    if (ball.vel.y < -0.35) {
      const surf = SURFACE_PHYSICS[surface];
      const incomingSpeed = ball.vel.length();
      const normalSpeed = -ball.vel.y;
      ball.vel.y = normalSpeed * surf.restitution;
      ball.vel.x *= surf.retention;
      ball.vel.z *= surf.retention;

      const contactOffset = new THREE.Vector3(0, -BALL_RADIUS, 0);
      const surfaceVel = new THREE.Vector3().crossVectors(ball.spin, contactOffset);
      const slip = new THREE.Vector3(ball.vel.x + surfaceVel.x, 0, ball.vel.z + surfaceVel.z);
      const slipMag = slip.length();
      if (slipMag > 1e-4) {
        const jn = BALL_MASS * (1 + surf.restitution) * normalSpeed;
        const maxJt = surf.friction * jn;
        const stopJ = slip.multiplyScalar(-BALL_MASS / 3.5);
        if (stopJ.length() > maxJt) stopJ.setLength(maxJt);
        ball.vel.x += stopJ.x / BALL_MASS;
        ball.vel.z += stopJ.z / BALL_MASS;
        const deltaSpin = new THREE.Vector3(contactOffset.z * stopJ.z, 0, -contactOffset.z * stopJ.x);
        const invI = 2.5 / (BALL_MASS * BALL_RADIUS * BALL_RADIUS);
        ball.spin.addScaledVector(deltaSpin, invI);
      }

      const spinUp = new THREE.Vector3().crossVectors(ball.spin, new THREE.Vector3(0, 1, 0));
      if (spinUp.lengthSq() > 1e-4) {
        ball.vel.addScaledVector(spinUp.normalize(), surf.kick * Math.abs(ball.spin.length()) * BALL_RADIUS * 0.18);
      }

      if (ball.vel.y < 0.38) {
        ball.vel.y = 0;
        ball.grounded = true;
      }
      ball.bounces++;
      events.push({
        kind: 'bounce',
        pos: ball.pos.clone(),
        speed: incomingSpeed,
        spin: ball.spin.clone(),
        surface,
      });
    } else {
      ball.vel.y = 0;
      ball.grounded = true;
      const damp = Math.exp(-dt * 2.2);
      ball.vel.x *= damp;
      ball.vel.z *= damp;
      if (ball.vel.lengthSq() < 0.0016) {
        ball.vel.set(0, 0, 0);
      }
    }
  }

  if (
    !Number.isFinite(ball.pos.x) ||
    Math.abs(ball.pos.x) > 33 ||
    Math.abs(ball.pos.z) > 42 ||
    ball.pos.y < -14
  ) {
    ball.active = false;
    events.push({ kind: 'lost', pos: ball.pos.clone() });
  }
  return events;
}

export function stepBallFixed(ball: BallState, dt: number, surface: SurfaceType): BallEvent[] {
  const step = 1 / 120;
  let remaining = Math.min(0.25, dt);
  const all: BallEvent[] = [];
  while (remaining > 1e-6) {
    const sub = Math.min(step, remaining);
    all.push(...stepBall(ball, sub, surface));
    remaining -= sub;
    if (!ball.active) break;
  }
  return all;
}

export interface FlatPrediction {
  samples: Array<{ t: number; pos: THREE.Vector3 }>;
  bounces: Array<{ t: number; pos: THREE.Vector3; speed: number }>;
  net?: { t: number; x: number; y: number; clearance: number };
  lost: boolean;
  duration: number;
}

export function predictTrajectory(
  ball: BallState,
  surface: SurfaceType,
  maxTime = 5.5,
  sampleRate = 60,
): FlatPrediction {
  const sim = cloneBall(ball);
  const samples: Array<{ t: number; pos: THREE.Vector3 }> = [];
  const bounces: Array<{ t: number; pos: THREE.Vector3; speed: number }> = [];
  let net: FlatPrediction['net'];
  let lost = false;
  const step = 1 / sampleRate;
  let t = 0;
  samples.push({ t: 0, pos: sim.pos.clone() });
  while (t < maxTime && sim.active) {
    const events = stepBall(sim, step, surface);
    t += step;
    for (const e of events) {
      if (e.kind === 'bounce') {
        bounces.push({ t, pos: e.pos.clone(), speed: e.speed });
      } else if (e.kind === 'netCross' && !net) {
        net = { t, x: e.x, y: e.y, clearance: e.clearance };
      } else if (e.kind === 'lost') {
        lost = true;
      }
    }
    samples.push({ t, pos: sim.pos.clone() });
    if (bounces.length >= 2) break;
  }
  return { samples, bounces, net, lost, duration: t };
}

export interface SolveInput {
  from: THREE.Vector3;
  target: THREE.Vector3;
  kind: 'flat' | 'topspin' | 'slice' | 'lob' | 'drop' | 'serve' | 'serve2' | 'smash' | 'volley';
  surface: SurfaceType;
  spinRate?: number;
  power?: number;
}

export interface SolvedShot {
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  landing: THREE.Vector3;
  netClearance: number;
  flightTime: number;
  launchSpeed: number;
  crossedNet: boolean;
}

function chooseFlightTime(input: SolveInput, horizontalDistance: number): number {
  const power = input.power ?? 1;
  switch (input.kind) {
    case 'lob':
      return THREE.MathUtils.clamp(horizontalDistance / 8.5, 2.1, 3.2);
    case 'drop':
      return THREE.MathUtils.clamp(horizontalDistance / 7.5, 1.4, 2.3);
    case 'serve':
      return THREE.MathUtils.clamp(0.26 + horizontalDistance / 52, 0.4, 0.78) / power;
    case 'serve2':
      return THREE.MathUtils.clamp(0.34 + horizontalDistance / 48, 0.48, 0.95) / power;
    case 'smash':
      return THREE.MathUtils.clamp(0.36 + horizontalDistance / 45, 0.4, 0.75);
    case 'volley':
      return THREE.MathUtils.clamp(0.44 + horizontalDistance / 38, 0.5, 0.95) / power;
    case 'slice':
      return THREE.MathUtils.clamp(0.68 + horizontalDistance / 30, 0.78, 1.6) / power;
    case 'topspin':
      return THREE.MathUtils.clamp(0.62 + horizontalDistance / 31, 0.7, 1.55) / power;
    default:
      return THREE.MathUtils.clamp(0.52 + horizontalDistance / 35, 0.58, 1.3) / power;
  }
}

function spinFor(input: SolveInput, direction: THREE.Vector3): THREE.Vector3 {
  const up = new THREE.Vector3(0, 1, 0);
  const topspinAxis = new THREE.Vector3().crossVectors(up, direction).normalize();
  const sliceAxis = topspinAxis.clone().negate();
  let rate = input.spinRate ?? 0;
  switch (input.kind) {
    case 'topspin':
      rate = input.spinRate ?? 285;
      break;
    case 'flat':
      rate = input.spinRate ?? 35;
      break;
    case 'slice':
      rate = input.spinRate ?? 210;
      return sliceAxis.multiplyScalar(rate);
    case 'lob':
      rate = input.spinRate ?? 160;
      return sliceAxis.multiplyScalar(rate);
    case 'drop':
      rate = input.spinRate ?? 185;
      return sliceAxis.multiplyScalar(rate);
    case 'serve':
      rate = input.spinRate ?? 45;
      break;
    case 'serve2':
      rate = input.spinRate ?? 265;
      break;
    case 'smash':
      rate = input.spinRate ?? 25;
      break;
    case 'volley':
      rate = input.spinRate ?? 55;
      break;
  }
  return topspinAxis.multiplyScalar(rate);
}

interface SimLanding {
  landing: THREE.Vector3;
  netClearance: number;
  crossedNet: boolean;
  flightTime: number;
  netHit: boolean;
}

function simulateLanding(from: THREE.Vector3, velocity: THREE.Vector3, spin: THREE.Vector3, surface: SurfaceType): SimLanding {
  const sim = createBall(from);
  sim.vel.copy(velocity);
  sim.spin.copy(spin);
  const step = 1 / 120;
  let netClearance = -99;
  let crossedNet = false;
  let netHit = false;
  let landing = sim.pos.clone();
  let flightTime = 0;
  for (let i = 0; i < 120 * 7; i++) {
    const events = stepBall(sim, step, surface);
    flightTime += step;
    for (const e of events) {
      if (e.kind === 'netCross') {
        netClearance = e.clearance;
        crossedNet = true;
      }
      if (e.kind === 'net') netHit = true;
      if (e.kind === 'bounce') {
        landing = e.pos.clone();
        return { landing, netClearance, crossedNet, flightTime, netHit };
      }
    }
    if (!sim.active) break;
  }
  return { landing: sim.pos.clone(), netClearance, crossedNet, flightTime, netHit };
}

export function solveShot(input: SolveInput): SolvedShot {
  const target = input.target.clone();
  target.y = BALL_GROUND_Y;
  const dx = target.x - input.from.x;
  const dz = target.z - input.from.z;
  const horizontalDistance = Math.max(0.2, Math.hypot(dx, dz));
  const direction = new THREE.Vector3(dx / horizontalDistance, 0, dz / horizontalDistance);
  const flightTime = chooseFlightTime(input, horizontalDistance);
  const spin = spinFor(input, direction);
  const g = GRAVITY;

  let vh = horizontalDistance / flightTime;
  let vy = (BALL_GROUND_Y - input.from.y + 0.5 * g * flightTime * flightTime) / flightTime;
  let best: SolvedShot | null = null;
  let bestCost = Infinity;

  const requiredClearance =
    input.kind === 'lob'
      ? 1.6
      : input.kind === 'drop'
        ? 0.42
        : input.kind === 'serve' || input.kind === 'serve2'
          ? 0.26
          : input.kind === 'smash'
            ? 0.18
            : 0.3;

  for (let iter = 0; iter < 10; iter++) {
    const velocity = new THREE.Vector3(direction.x * vh, vy, direction.z * vh);
    const result = simulateLanding(input.from, velocity, spin, input.surface);
    const range = Math.hypot(result.landing.x - input.from.x, result.landing.z - input.from.z);
    const rangeErr = horizontalDistance - range;
    const clearance = result.netClearance;
    const clearanceErr = requiredClearance - clearance;

    const launchSpeed = velocity.length();
    const trackCost = rangeErr * rangeErr + clearanceErr * clearanceErr * 2.4;
    if (trackCost < bestCost) {
      bestCost = trackCost;
      best = {
        velocity,
        spin: spin.clone(),
        landing: result.landing.clone(),
        netClearance: clearance,
        flightTime: result.flightTime,
        launchSpeed,
        crossedNet: result.crossedNet,
      };
    }

    const hErr = rangeErr;
    if (Math.abs(hErr) < 0.18 && clearanceErr < 0.18) break;

    vh += (hErr / Math.max(0.5, flightTime)) * 0.8;
    if (clearance < requiredClearance) {
      vy += Math.min(4.0, (requiredClearance - clearance) * 0.75 + 0.08);
    } else if (clearance > requiredClearance + 1.1) {
      vy -= Math.min(3.0, (clearance - requiredClearance) * 0.18);
    }
    vh = Math.max(3, Math.min(55, vh));
    vy = Math.max(-8, Math.min(22, vy));
  }

  return best!;
}
