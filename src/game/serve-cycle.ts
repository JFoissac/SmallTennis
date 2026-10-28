import * as THREE from 'three';
import { BALL_GROUND_Y } from './physics';
import type { BallKidAgent } from './agents';
import type { BallState } from './physics';
import type { PlayerProfile } from './players';
import type { PlayerRig, SwingVisual } from './rig';
import type { ServePlan } from './serve';

export type ServeStep = 'idle' | 'fetchWait' | 'fetching' | 'carrying' | 'passing' | 'preServe' | 'toss' | 'flight';

/** The slice of a player the serve choreography needs. */
export interface ServePlayer {
  slot: 0 | 1;
  sideSign: 1 | -1;
  rig: PlayerRig;
  profile: PlayerProfile;
  swing: SwingVisual | null;
  contactHit: boolean;
  moveTarget: THREE.Vector3;
}

export interface ServeHost {
  readonly simTime: number;
  readonly serveNumber: 1 | 2;
  readonly serverSlot: 0 | 1;
  readonly agents: [ServePlayer, ServePlayer];
  readonly ballKids: BallKidAgent[];
  readonly ball: BallState;
  readonly deadBallPos: THREE.Vector3 | null;
  isRainy(): boolean;
  /** Starts a rain delay that will restart the serve sequence when play resumes. */
  requestRainDelay(): void;
  servePosition(player: ServePlayer): THREE.Vector3;
  returnPosition(player: ServePlayer): THREE.Vector3;
  chooseServeTarget(player: ServePlayer): ServePlan;
  launchServe(player: ServePlayer): void;
  clearDeadBall(): void;
  /**: Shows the ball mesh at `pos`; `glow`/`shadow` control the extra sprites. */
  showBallAt(pos: THREE.Vector3, opts: { glow?: boolean; shadow?: boolean; track?: boolean }): void;
  hideBall(): void;
  setShadowOpacity(value: number): void;
  debug(text: string): void;
}

const GROUND = BALL_GROUND_Y;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const distance2 = (a: THREE.Vector3, b: THREE.Vector3): number => Math.hypot(a.x - b.x, a.z - b.z);

interface ServePassState {
  active: boolean;
  t: number;
  duration: number;
  start: THREE.Vector3;
  bounce: THREE.Vector3;
  catch: THREE.Vector3;
}

interface ServeTossState {
  active: boolean;
  start: THREE.Vector3;
  end: THREE.Vector3;
  startTime: number;
  duration: number;
  target: THREE.Vector3;
  kind: 'serve' | 'serve2';
  spin: number;
  power: number;
  boxSign: 1 | -1;
}

/**
 * The serve sequence: ball kid fetch, carry, pass, pre-serve, toss, launch.
 *
 * Owns its state and visuals calls through `ServeHost`; the match keeps only
 * the ball simulation and point rules. `launchServe` stays on the host because
 * it also resolves the shot and awards the serve speed.
 */
export class ServeCycle {
  step: ServeStep = 'idle';
  private timer = 0;
  private preServeTimer = 0;
  private fetchKid: BallKidAgent | null = null;
  private readonly fetchDelivery = new THREE.Vector3();
  private pass: ServePassState = {
    active: false,
    t: 0,
    duration: 1,
    start: new THREE.Vector3(),
    bounce: new THREE.Vector3(),
    catch: new THREE.Vector3(),
  };
  private toss: ServeTossState = {
    active: false,
    start: new THREE.Vector3(),
    end: new THREE.Vector3(),
    startTime: 0,
    duration: 0.9,
    target: new THREE.Vector3(),
    kind: 'serve',
    spin: 40,
    power: 1,
    boxSign: 1,
  };
  private contactTime = 0;

  get currentToss(): ServeTossState {
    return this.toss;
  }

  get carryingKid(): BallKidAgent | null {
    return this.fetchKid;
  }

  get passActive(): boolean {
    return this.pass.active;
  }

  begin(fullFetch: boolean): void {
    this.step = fullFetch ? 'fetchWait' : 'preServe';
    this.timer = 0;
    this.preServeTimer = 0;
    this.pass.active = false;
    this.toss.active = false;
    this.fetchKid = null;
  }

  /** Shared by faults and lets: the server walks back and serves again. */
  resetToPreServe(): void {
    this.step = 'preServe';
    this.preServeTimer = 0;
    this.timer = 0;
    this.pass.active = false;
    this.toss.active = false;
    this.fetchKid = null;
  }

  markFlight(): void {
    this.step = 'flight';
  }

  completeToss(): void {
    this.toss.active = false;
  }

  update(host: ServeHost, dt: number, time: number): void {
    if (host.isRainy() && this.step !== 'flight' && this.step !== 'toss') {
      host.requestRainDelay();
      return;
    }
    const server = host.agents[host.serverSlot];
    const receiver = host.agents[host.serverSlot === 0 ? 1 : 0];
    this.timer += dt;
    switch (this.step) {
      case 'fetchWait':
        if (this.timer > 0.45) this.beginFetch(host, server);
        break;
      case 'fetching':
        if (this.fetchKid && !this.fetchKid.busy) {
          this.fetchKid.busy = true;
          this.fetchKid.carrying = true;
          host.showBallAt(this.fetchKid.position, { shadow: false });
          this.buildCarryRoute(host, this.fetchKid, server);
          this.step = 'carrying';
          this.timer = 0;
        }
        break;
      case 'carrying':
        if (this.fetchKid && !this.fetchKid.busy) {
          this.startServePass(host, this.fetchKid, server);
          this.step = 'passing';
        }
        break;
      case 'passing':
        this.updateServePass(host, dt);
        if (!this.pass.active) {
          host.hideBall();
          this.step = 'preServe';
          this.preServeTimer = 0;
          this.fetchKid?.goHome();
          this.fetchKid = null;
        }
        break;
      case 'preServe':
        this.preServeTimer += dt;
        if (distance2(server.rig.position, server.moveTarget) < 1.2) {
          this.moveHeldBallPreServe(host, server);
          if (this.preServeTimer > 1.55) this.startServeToss(host, server);
        }
        break;
      case 'toss':
        this.updateServeToss(host, time, server);
        break;
      default:
        break;
    }
    // The receiver keeps tracking the server while the ball is being fetched.
    if (this.step === 'fetchWait' || this.step === 'fetching' || this.step === 'carrying' || this.step === 'passing') {
      receiver.moveTarget.copy(host.returnPosition(receiver));
    }
  }

  private beginFetch(host: ServeHost, server: ServePlayer): void {
    let source = host.deadBallPos ? host.deadBallPos.clone() : host.ball.pos.clone();
    const ballValid =
      (host.deadBallPos !== null || host.ball.active) &&
      Number.isFinite(source.x) &&
      Math.abs(source.x) < 10 &&
      Math.abs(source.z) < 17 &&
      source.y > -1;
    if (!ballValid) {
      const kid = host.ballKids[0];
      source = new THREE.Vector3(kid.home.x - 0.4, GROUND, kid.home.z + 0.5);
    }
    host.clearDeadBall();
    source.y = GROUND;
    source.x = clamp(source.x, -7.5, 7.5);
    source.z = clamp(source.z, -15.8, 15.8);
    host.ball.pos.copy(source);
    const sourceSide = Math.sign(source.z) || -server.sideSign;
    const candidates = host.ballKids.filter((kid) => Math.sign(kid.position.z) === sourceSide);
    const pool = candidates.length ? candidates : host.ballKids;
    let best = pool[0];
    let bestD = Infinity;
    for (const kid of pool) {
      const d = distance2(kid.position, source);
      if (d < bestD) {
        bestD = d;
        best = kid;
      }
    }
    this.fetchKid = best;
    const route: THREE.Vector3[] = [];
    if (Math.sign(best.position.z) !== Math.sign(source.z)) {
      route.push(new THREE.Vector3(best.position.x > 0 ? 7.15 : -7.15, GROUND, 0));
    }
    route.push(source);
    best.goPath(route, 6.2, false);
    this.step = 'fetching';
    this.timer = 0;
    host.showBallAt(source, { shadow: true });
  }

  private buildCarryRoute(host: ServeHost, kid: BallKidAgent, server: ServePlayer): void {
    const deliveryX = clamp(server.rig.position.x + 3.1, -7.2, 7.2);
    const deliveryZ = clamp(server.rig.position.z - server.sideSign * 1.3, -15.6, 15.6);
    this.fetchDelivery.set(deliveryX, GROUND, deliveryZ);
    const route: THREE.Vector3[] = [];
    if (Math.sign(kid.position.z) !== Math.sign(deliveryZ)) {
      route.push(new THREE.Vector3(kid.position.x > 0 ? 7.15 : -7.15, GROUND, 0));
    }
    route.push(this.fetchDelivery);
    kid.goPath(route, 5.8, true);
  }

  private startServePass(host: ServeHost, kid: BallKidAgent, server: ServePlayer): void {
    kid.release(kid.position);
    const start = new THREE.Vector3(kid.position.x, GROUND + 0.85, kid.position.z);
    const catchPos = new THREE.Vector3(server.rig.position.x, GROUND + 0.95, server.rig.position.z);
    const bounce = new THREE.Vector3(
      start.x + (catchPos.x - start.x) * 0.52,
      GROUND + 0.08,
      start.z + (catchPos.z - start.z) * 0.52,
    );
    this.pass = { active: true, t: 0, duration: 1, start, bounce, catch: catchPos };
    host.showBallAt(start, { shadow: true });
  }

  private updateServePass(host: ServeHost, dt: number): void {
    if (!this.pass.active) return;
    this.pass.t += dt;
    const u = clamp(this.pass.t / this.pass.duration, 0, 1);
    const ball = new THREE.Vector3();
    if (u < 0.53) {
      const t = u / 0.53;
      ball.lerpVectors(this.pass.start, this.pass.bounce, t);
      ball.y += Math.sin(t * Math.PI) * 0.24;
    } else {
      const t = (u - 0.53) / 0.47;
      ball.lerpVectors(this.pass.bounce, this.pass.catch, t);
      ball.y += Math.sin(t * Math.PI) * 0.34;
    }
    host.showBallAt(ball, { shadow: true });
    host.setShadowOpacity(0.28 * (1 - clamp(ball.y / 3, 0, 0.8)));
    if (u >= 1) {
      this.pass.active = false;
      host.hideBall();
    }
  }

  private moveHeldBallPreServe(host: ServeHost, server: ServePlayer): void {
    const t = this.preServeTimer;
    const bx = server.rig.position.x + 0.55 * -server.sideSign;
    const bz = server.rig.position.z + 0.25;
    const bounce = Math.abs(Math.sin(t * Math.PI * 2.1));
    host.showBallAt(new THREE.Vector3(bx, GROUND + 0.22 + bounce * 0.72, bz), { shadow: true });
  }

  private startServeToss(host: ServeHost, server: ServePlayer): void {
    this.fetchKid = null;
    this.preServeTimer = 0;
    this.step = 'toss';
    const targetInfo = host.chooseServeTarget(server);
    const contact = server.rig.getServeContactWorld();
    const start = server.rig.getLeftHandWorld().clone();
    start.y = Math.max(GROUND + 1.0, start.y);
    const swing: SwingVisual = {
      type: 'serve',
      start: host.simTime,
      contact: host.simTime + 0.92,
      end: host.simTime + 1.5,
      contactWorld: contact.clone(),
      outWorld: new THREE.Vector3(targetInfo.target.x - contact.x, 0, targetInfo.target.z - contact.z).normalize(),
    };
    server.swing = swing;
    server.contactHit = false;
    this.toss = {
      active: true,
      start,
      end: contact.clone(),
      startTime: host.simTime,
      duration: 0.92,
      target: targetInfo.target.clone(),
      kind: targetInfo.kind,
      spin: targetInfo.spin,
      power: targetInfo.power,
      boxSign: targetInfo.boxSign,
    };
    this.contactTime = swing.contact;
    host.showBallAt(start, { glow: true });
  }

  private updateServeToss(host: ServeHost, time: number, server: ServePlayer): void {
    if (this.toss.active) {
      const u = clamp((time - this.toss.startTime) / this.toss.duration, 0, 1);
      const p = new THREE.Vector3().lerpVectors(this.toss.start, this.toss.end, u);
      p.y += Math.sin(u * Math.PI) * 0.42;
      host.showBallAt(p, { glow: true, shadow: p.y < 3.5, track: true });
    }
    if (time >= this.contactTime) host.launchServe(server);
  }
}
