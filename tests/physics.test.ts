import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ballAcceleration, createBall, predictTrajectory, solveShot, stepBall } from '../src/game/physics';

describe('ball physics', () => {
  it('solves a serve that clears the net and lands in the service box', () => {
    const from = new THREE.Vector3(-2.2, 3.1, 12.2);
    const target = new THREE.Vector3(1.5, 0.16, -5.0);
    const shot = solveShot({ from, target, kind: 'serve', surface: 'clay', spinRate: 40, power: 1.2 });
    const ball = createBall(from);
    ball.vel.copy(shot.velocity);
    ball.spin.copy(shot.spin);
    const pred = predictTrajectory(ball, 'clay', 4, 120);
    const bounce = pred.bounces[0];
    expect(bounce).toBeDefined();
    expect(Math.abs(bounce.pos.x - target.x)).toBeLessThan(0.5);
    expect(Math.abs(bounce.pos.z - target.z)).toBeLessThan(0.7);
    expect(pred.net?.clearance ?? -1).toBeGreaterThan(0);
    expect(shot.launchSpeed * 3.6).toBeGreaterThan(95);
  });

  it('solves a groundstroke that clears the net', () => {
    const from = new THREE.Vector3(2, 1.0, 8);
    const target = new THREE.Vector3(-3, 0.16, -9);
    const shot = solveShot({ from, target, kind: 'topspin', surface: 'clay', spinRate: 300, power: 1.05 });
    const ball = createBall(from);
    ball.vel.copy(shot.velocity);
    ball.spin.copy(shot.spin);
    const pred = predictTrajectory(ball, 'clay', 4, 120);
    const bounce = pred.bounces[0];
    expect(bounce).toBeDefined();
    expect(Math.abs(bounce.pos.x - target.x)).toBeLessThan(0.6);
    expect(Math.abs(bounce.pos.z - target.z)).toBeLessThan(0.8);
    expect(pred.net?.clearance ?? -1).toBeGreaterThan(0);
  });

  it('bounces higher on hard than grass and drives the ball differently by surface', () => {
    const results: Record<string, { vy: number; speed: number }> = {};
    for (const surface of ['clay', 'grass', 'hard'] as const) {
      const ball = createBall(new THREE.Vector3(0, 1.1, 0));
      ball.vel.set(0, -5, 8);
      let bounces = 0;
      for (let i = 0; i < 240; i++) {
        const events = stepBall(ball, 1 / 120, surface);
        if (events.some((e) => e.kind === 'bounce')) {
          bounces++;
          break;
        }
      }
      expect(bounces).toBe(1);
      results[surface] = { vy: ball.vel.y, speed: ball.vel.length() };
    }
    expect(results.hard.vy).toBeGreaterThan(results.grass.vy);
    expect(results.hard.vy).toBeGreaterThan(results.clay.vy);
    expect(results.hard.speed).toBeGreaterThan(results.grass.speed);
  });

  it('makes topspin curve down and slice float compared to a flat ball', () => {
    const vel = new THREE.Vector3(0, 0, 22);
    const topspin = ballAcceleration(vel, new THREE.Vector3(300, 0, 0));
    const flat = ballAcceleration(vel, new THREE.Vector3(0, 0, 0));
    const slice = ballAcceleration(vel, new THREE.Vector3(-300, 0, 0));
    expect(topspin.y).toBeLessThan(flat.y);
    expect(slice.y).toBeGreaterThan(flat.y);
  });
});

describe('net and court geometry', () => {
  it('uses the correct net heights at the posts and strap', async () => {
    const { netHeightAt, COURT } = await import('../src/world/court');
    expect(netHeightAt(0)).toBeCloseTo(COURT.netCenterHeight, 5);
    expect(netHeightAt(COURT.netPostX)).toBeCloseTo(COURT.netPostHeight, 5);
  });

  it('reports a net event when a ball hits the tape', () => {
    const ball = createBall(new THREE.Vector3(0, 1.03, 3));
    ball.vel.set(0, -0.2, -12);
    let hit: string | null = null;
    for (let i = 0; i < 120; i++) {
      const events = stepBall(ball, 1 / 120, 'clay');
      const net = events.find((e) => e.kind === 'net');
      if (net) {
        hit = net.kind;
        break;
      }
    }
    expect(hit).toBe('net');
  });
});
