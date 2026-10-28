import * as THREE from 'three';
import { C, hexOf } from '../core/palette';
import type { DioramaCamera } from '../core/camera';
import { COURT, type SurfaceType } from '../world/court';
import type { ClubWorld } from '../world/world';
import type { TimeMode } from '../world/sky';
import { addMesh, circleTexture, GEO } from '../world/build';
import {
  BALL_GROUND_Y,
  BALL_RADIUS,
  type BallState,
  type BallEvent,
  createBall,
  predictTrajectory,
  solveShot,
  stepBall,
  SURFACE_PHYSICS,
} from './physics';
import { TennisMatch, type ScoreSnapshot } from './rules';
import { PLAYERS, playerById, fullName, initials, type PlayerProfile } from './players';
import { PlayerRig, type SwingVisual, type SwingType } from './rig';
import {
  BallKidAgent,
  DragMat,
  GroundsmanAgent,
  UmpireAgent,
} from './agents';
import { createRng, type Rng } from './rng';
import { judgeBallEvent, type RallyCourt, type RallyHost } from './rally';
import { Career, type CareerMatch, type LadderEntry, type PlayerCareer } from './career';
import { ServeCycle, type ServeHost } from './serve-cycle';import { chooseShot, type ForcedShot, type ShotDecision } from './shot-selection';
import {
  chooseServeTarget,
  returnPosition as serveReturnPosition,
  serveErrorSigma,
  serveFaultOutcome,
  servePosition as serveStance,
  type ServePlan,
} from './serve';import {
  conditionsFor,
  scorePressure,
  STAMINA_DRAIN_PER_POINT,
  STAMINA_RECOVERY_PER_BREAK,
  type ConditionModifiers,
} from './conditions';

export type { ForcedShot };

type Mode =
  | 'serveSetup'
  | 'inPlay'
  | 'pointOver'
  | 'markCheck'
  | 'setBreak'
  | 'rainDelay'
  | 'covered'
  | 'rainResume'
  | 'matchOver';

export interface LadderView {
  id: string;
  name: string;
  nickname: string;
  style: string;
  wins: number;
  losses: number;
  status: 'champion' | 'challenger' | 'waiting';
  active: boolean;
}

interface IncomingPlan {
  contactTime: number;
  contactWorld: THREE.Vector3;
  type: SwingType;
  target: THREE.Vector3;
  stretch: boolean;
  beforeBounce: boolean;
  contactHeight: number;
  windup: number;
}

interface ActiveAgent {
  slot: 0 | 1;
  profile: PlayerProfile;
  rig: PlayerRig;
  sideSign: 1 | -1;
  moveTarget: THREE.Vector3;
  velocity: THREE.Vector3;
  swing: SwingVisual | null;
  plan: IncomingPlan | null;
  contactHit: boolean;
  intent: 'rally' | 'net';
  sitting: boolean;
  wantSit: boolean;
  /** Remaining stamina, 1 = fresh, 0 = empty. */
  stamina: number;
}

interface RallyState {
  hitter: 0 | 1;
  shots: number;
  isServe: boolean;
  serveBoxSign: 1 | -1;
  receiverSide: 1 | -1;
  bounces: number;
  netTouched: boolean;
  serveIn: boolean;
  started: number;
  lastBounce: THREE.Vector3 | null;
}

interface IdealContact {
  sampleTime: number;
  contact: THREE.Vector3;
  target: THREE.Vector3;
  type: SwingType;
  side: 'forehand' | 'backhand';
  beforeBounce: boolean;
  height: number;
  windup: number;
  score: number;
}

interface Call {
  start: number;
  end: number;
  text: string;
}

interface ResultOverlay {
  winnerName: string;
  nextName: string;
  score: string;
}

const SINGLES_HALF = COURT.singlesWidth / 2;
const DOUBLES_HALF = COURT.doublesWidth / 2;
const LENGTH_HALF = COURT.length / 2;
const GROUND = BALL_GROUND_Y;
const PLAYER_MIN_Z = 0.65;
const RALLY_COURT: RallyCourt = { singlesHalf: SINGLES_HALF, lengthHalf: LENGTH_HALF, serviceLine: COURT.serviceLine };

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function rightFor(sideSign: 1 | -1): THREE.Vector3 {
  return new THREE.Vector3(-sideSign, 0, 0);
}

function forwardFor(sideSign: 1 | -1): THREE.Vector3 {
  return new THREE.Vector3(0, 0, -sideSign);
}

function sideName(slot: 0 | 1): 1 | -1 {
  return slot === 0 ? 1 : -1;
}

function sampleStr(c: IdealContact): string {
  return `${c.sampleTime.toFixed(2)}:${c.type}:${c.height.toFixed(2)}`;
}

function distance2(a: THREE.Vector3, b: THREE.Vector3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export class MatchGame {
  speed: 1 | 3 = 1;
  forcedShot: ForcedShot = null;
  readonly seed: number;
  readonly rng: Rng;
  readonly career = new Career();
  readonly ballPos = new THREE.Vector3();
  debugServe: Record<string, unknown> | null = null;
  debugLog: string[] = [];

  private world: ClubWorld;
  private camera: DioramaCamera;
  private mode: Mode = 'serveSetup';
  private simTime = 0;
  private matchIndex = 0;

  private get ladder(): LadderEntry[] {
    return this.career.ladder;
  }
  private match!: TennisMatch;
  private agents!: [ActiveAgent, ActiveAgent];
  private ball: BallState = createBall();
  private ballVisible = false;
  private rally: RallyState | null = null;
  private pointResolved = true;
  private lastServeSpeed = 0;
  private lastServeWasSecond = false;
  private calls: Call[] = [];
  private toastText = '';
  private toastUntil = 0;
  private aimPoint: THREE.Vector3 | null = null;
  private aimMarker: THREE.Group;
  private lastCloseCall: { pos: THREE.Vector3; lineCall: 'IN' | 'OUT'; isServe: boolean } | null = null;
  private pendingSetBreak = false;
  private pendingMatchOver = false;
  private pendingMark: THREE.Vector3 | null = null;
  private pendingMarkLine: 'IN' | 'OUT' = 'IN';
  private deadBallPos: THREE.Vector3 | null = null;
  private afterPointTimer = 0;
  private matchResult: ResultOverlay | null = null;
  private matchOverTimer = 0;
  private setBreakTimer = 0;
  private setBreakStage = 0;
  private rainCallback: (() => void) | null = null;
  private rainTimer = 0;
  private ballKids: BallKidAgent[] = [];
  private umpire: UmpireAgent;
  private groundsmen: GroundsmanAgent[] = [];
  private dragMat: DragMat;
  private serve!: ServeCycle;
  private ballMesh: THREE.Mesh;
  private ballGlow: THREE.Sprite;
  private ballShadow: THREE.Mesh;
  private ballTrail: THREE.Line;
  private trailPositions: THREE.Vector3[] = [];
  private lastTrailTime = 0;
  private hitFlash: THREE.Sprite;
  private hitFlashT = 1;
  private hitFlashPos = new THREE.Vector3();
  private surfaceBeforeCover: SurfaceType = 'clay';
  private sitQueued = false;
  private excitement = 0;

  constructor(scene: THREE.Scene, world: ClubWorld, camera: DioramaCamera, seed = Math.floor(Math.random() * 0xffffffff)) {
    this.world = world;
    this.camera = camera;
    this.seed = seed >>> 0;
    this.rng = createRng(this.seed);
    this.serve = new ServeCycle();

    this.ballMesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.28, 1),
      new THREE.MeshBasicMaterial({ color: hexOf(C.paleYellow), toneMapped: false }),
    );
    this.ballMesh.castShadow = true;
    this.ballMesh.visible = false;
    world.root.add(this.ballMesh);

    const glowTex = circleTexture(hexOf(C.paleYellow), 24);
    this.ballGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));
    this.ballGlow.scale.set(1.15, 1.15, 1);
    this.ballGlow.visible = false;
    world.root.add(this.ballGlow);

    const shadowMat = new THREE.MeshBasicMaterial({ color: hexOf(C.ink), transparent: true, opacity: 0.28, depthWrite: false });
    this.ballShadow = addMesh(
      world.root,
      new THREE.CircleGeometry(0.5, 12),
      shadowMat,
      0,
      GROUND + 0.012,
      0,
      false,
      false,
    );
    this.ballShadow.rotation.x = -Math.PI / 2;
    this.ballShadow.visible = false;
    this.ballShadow.renderOrder = 3;

    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
    this.ballTrail = new THREE.Line(
      trailGeo,
      new THREE.LineBasicMaterial({ color: hexOf(C.paleYellow), transparent: true, opacity: 0.5, depthWrite: false }),
    );
    this.ballTrail.visible = false;
    this.ballTrail.frustumCulled = false;
    world.root.add(this.ballTrail);

    this.aimMarker = new THREE.Group();
    const ring = addMesh(this.aimMarker, new THREE.RingGeometry(0.32, 0.46, 16), new THREE.MeshBasicMaterial({ color: hexOf(C.mustard), transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }), 0, 0, 0, false, false);
    ring.rotation.x = -Math.PI / 2;
    const dot = addMesh(this.aimMarker, new THREE.RingGeometry(0.06, 0.12, 10), new THREE.MeshBasicMaterial({ color: hexOf(C.cream), transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }), 0, 0, 0, false, false);
    dot.rotation.x = -Math.PI / 2;
    for (let i = 0; i < 4; i++) {
      const tick = addMesh(this.aimMarker, GEO.box, new THREE.MeshBasicMaterial({ color: hexOf(C.cream), transparent: true, opacity: 0.85 }), 0, 0, 0, false, false);
      const a = (i / 4) * Math.PI * 2;
      tick.position.set(Math.cos(a) * 0.55, 0.02, Math.sin(a) * 0.55);
      tick.scale.set(0.06, 0.03, 0.2);
      tick.rotation.y = -a;
    }
    this.aimMarker.position.y = GROUND + 0.015;
    this.aimMarker.visible = false;
    world.root.add(this.aimMarker);
    this.hitFlash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff6e0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.hitFlash.scale.set(0.8, 0.8, 1);
    this.hitFlash.visible = false;
    world.root.add(this.hitFlash);

    this.dragMat = new DragMat(world.root);

    this.ballKids = world.furniture.ballKidSpots.map((spot, i) => new BallKidAgent(world.root, spot, i));

    const chairWorld = new THREE.Vector3(world.furniture.umpire.root.position.x, 2.3, world.furniture.umpire.root.position.z);
    this.umpire = new UmpireAgent(world.root, chairWorld);

    this.groundsmen = [
      new GroundsmanAgent(world.root, new THREE.Vector3(7.0, GROUND, 12.4)),
      new GroundsmanAgent(world.root, new THREE.Vector3(7.4, GROUND, 13.6)),
    ];

    this.matchIndex = 0;
    this.startNewMatch();
  }

  get isRainy(): boolean {
    return this.world.weather.isRainy;
  }

  get coverAmount(): number {
    return this.world.weather.coverAmount;
  }

  setSpeed(speed: 1 | 3): void {
    this.speed = speed;
  }

  toggleSpeed(): void {
    this.speed = this.speed === 1 ? 3 : 1;
  }

  setRain(on: boolean): void {
    this.world.setRain(on);
  }

  setTime(mode: TimeMode): void {
    this.world.setTime(mode);
  }

  setSurface(surface: SurfaceType): void {
    this.world.setSurface(surface);
  }

  toggleForcedShot(kind: 'lob' | 'drop'): void {
    this.forcedShot = this.forcedShot === kind ? null : kind;
  }

  setAimFromNdc(ndcX: number, ndcY: number): void {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -GROUND);
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plane, hit)) return;
    if (Math.abs(hit.x) > 6.6 || Math.abs(hit.z) > 14.2) return;
    const isServe = !(this.mode === 'inPlay' && this.rally && !this.pointResolved);
    const next = this.likelyHitter();
    const normalized = this.normalizeTarget(hit, next, isServe);
    this.aimPoint = normalized;
    this.aimMarker.visible = true;
    this.aimMarker.position.set(normalized.x, GROUND + 0.016, normalized.z);
    this.toast(isServe ? 'SERVE AIM SET' : 'TARGET SET');
  }

  clearAim(): void {
    this.aimPoint = null;
    this.aimMarker.visible = false;
  }

  get umpireAnchor(): THREE.Vector3 {
    return this.umpire.callAnchor;
  }

  get serveSpeed(): number {
    return this.lastServeSpeed;
  }

  getView(): {
    score: ScoreSnapshot;
    ladder: LadderView[];
    players: Array<{ id: string; name: string; surname: string; nickname: string; style: string; initials: string; shirt: number; accent: number; stamina: number }>;
    status: string;
    phase: string;
    serveSpeed: number;
    serveNumber: 1 | 2;
    call: string | null;
    toast: string | null;
    aim: { x: number; z: number } | null;
    forced: ForcedShot;
    speed: 1 | 3;
    rain: boolean;
    covered: boolean;
    surface: SurfaceType;
    timeMode: TimeMode;
    result: ResultOverlay | null;
    setHistory: Array<{ a: number; b: number; kind: string }>;
    serverName: string;
    seed: number;
    career: {
      matches: number;
      lastMatch: CareerMatch | null;
      players: PlayerCareer[];
    };
  } {
    const now = this.simTime;
    const call = this.calls
      .filter((c) => c.start <= now && c.end > now)
      .sort((a, b) => b.start - a.start)[0]?.text ?? null;
    const activePlayers = this.agents ?? [];
    return {
      score: this.match.snapshot(),
      ladder: this.ladder.map((entry, i) => ({
        id: entry.profile.id,
        name: fullName(entry.profile),
        nickname: entry.profile.nickname,
        style: entry.profile.style,
        wins: entry.wins,
        losses: entry.losses,
        status: i === 0 ? 'champion' : i === 1 ? 'challenger' : 'waiting',
        active: activePlayers.some((a) => a.profile.id === entry.profile.id),
      })),
      players: activePlayers.map((a) => ({
        id: a.profile.id,
        name: a.profile.name,
        surname: a.profile.surname,
        nickname: a.profile.nickname,
        style: a.profile.style,
        initials: initials(a.profile),
        shirt: a.profile.look.shirt,
        accent: a.profile.look.accent,
        stamina: a.stamina,
      })),
      status: this.statusText(),
      phase: this.mode,
      serveSpeed: this.lastServeSpeed,
      serveNumber: this.match.serveNumber,
      call,
      toast: now < this.toastUntil ? this.toastText : null,
      aim: this.aimPoint ? { x: this.aimPoint.x, z: this.aimPoint.z } : null,
      forced: this.forcedShot,
      speed: this.speed,
      rain: this.world.weather.isRainy,
      covered: this.coverAmount > 0.92,
      surface: this.world.surface,
      timeMode: this.world.timeMode,
      result: this.mode === 'matchOver' ? this.matchResult : null,
      setHistory: this.match.setHistory,
      serverName: this.match.names[this.match.server],
      seed: this.seed,
      career: {
        matches: this.career.matches.length,
        lastMatch: this.career.lastMatch,
        players: this.career.playerList(),
      },
    };
  }

  update(dt: number, time: number): void {
    this.simTime = time;
    this.updateAim(dt);
    this.updateCalls(time);
    this.updateWeatherInterrupts();

    switch (this.mode) {
      case 'serveSetup':
        this.updateAgents(dt, time);
        this.serve.update(this.serveHost(), dt, time);
        break;
      case 'inPlay':
        this.updateAgents(dt, time);
        this.updateInPlay(dt, time);
        break;
      case 'pointOver':
        this.updateAgents(dt, time, false);
        this.afterPointTimer += dt;
        if (this.afterPointTimer > 1.35) this.runAfterPointStep();
        break;
      case 'markCheck':
        this.updateAgents(dt, time, false);
        break;
      case 'setBreak':
        this.updateAgents(dt, time, true);
        this.updateSetBreak(dt, time);
        break;
      case 'rainDelay':
        this.updateAgents(dt, time, true);
        this.updateRainDelay(dt, time);
        break;
      case 'covered':
        this.updateAgents(dt, time, true);
        this.updateCovered(dt, time);
        break;
      case 'rainResume':
        this.updateAgents(dt, time, true);
        this.updateRainResume(dt, time);
        break;
      case 'matchOver':
        this.updateAgents(dt, time, true);
        this.matchOverTimer += dt;
        if (this.matchOverTimer > 8.5) this.startNewMatch();
        break;
      default:
        break;
    }

    this.updateBallKids(dt, time);
    this.updateUmpire(dt, time);
    this.updateGroundsmen(dt, time);
    this.updateCrowd(dt);
    this.updateBallVisual(dt, time);
    this.aimMarker.rotation.y += dt * 0.8;
  }

  private updateCrowd(dt: number): void {
    this.excitement = Math.max(0, this.excitement - dt * 0.035);
    const rain = this.world.weather.rainLevel;
    const covered = this.coverAmount;
    const sets = this.match?.sets ?? [0, 0];
    const games = this.match?.games ?? [0, 0];
    const setGap = Math.abs(sets[0] - sets[1]);
    const gameGap = Math.abs(games[0] - games[1]);
    const closeness = Math.max(0, 1 - setGap * 0.45 - gameGap * 0.08);
    const target = clamp(
      0.42 + this.excitement * 0.42 + closeness * 0.16 + Math.sin(this.simTime * 0.045) * 0.05 - rain * 0.5 - (covered > 0.5 ? 0.2 : 0),
      0.06,
      0.97,
    );
    this.world.stand.setAttendance(target);
  }

  private startNewMatch(): void {
    if (this.agents) {
      for (const a of this.agents) {
        this.world.root.remove(a.rig.root);
      }
    }
    if (this.ladder.length < 2) {
      this.career.ladder = PLAYERS.map((profile) => ({ profile, wins: 0, losses: 0 }));
    }
    const champion = this.career.champion;
    const challenger = this.career.challenger;
    const firstServer = (this.matchIndex % 2) as 0 | 1;
    this.match = new TennisMatch([fullName(champion), fullName(challenger)], firstServer);
    this.career.beginMatch(this.matchIndex);
    this.agents = [
      this.createAgent(0, champion),
      this.createAgent(1, challenger),
    ];
    const p0 = this.agents[0];
    const p1 = this.agents[1];
    p0.rig.setPosition(2.0, 13.8);
    p1.rig.setPosition(-2.0, -13.8);
    p0.moveTarget.set(2.0, GROUND, 13.8);
    p1.moveTarget.set(-2.0, GROUND, -13.8);
    this.aimPoint = null;
    this.aimMarker.visible = false;
    this.forcedShot = null;
    this.rally = null;
    this.pointResolved = true;
    this.lastServeSpeed = 0;
    this.lastServeWasSecond = false;
    this.matchResult = null;
    this.pendingSetBreak = false;
    this.pendingMatchOver = false;
    this.pendingMark = null;
    this.lastCloseCall = null;
    this.ballVisible = false;
    this.ball.active = false;
    this.deadBallPos = null;
    this.calls = [];
    this.matchIndex++;
    this.excitement *= 0.25;
    this.beginServeCycle(true);
    this.toast(`${fullName(champion).toUpperCase()} v ${fullName(challenger).toUpperCase()}`, 3.5);
  }

  private createAgent(slot: 0 | 1, profile: PlayerProfile): ActiveAgent {
    const rig = new PlayerRig(profile);
    this.world.root.add(rig.root);
    const sideSign = sideName(slot);
    const agent: ActiveAgent = {
      slot,
      profile,
      rig,
      sideSign,
      moveTarget: new THREE.Vector3(0, GROUND, sideSign * 13.5),
      velocity: new THREE.Vector3(),
      swing: null,
      plan: null,
      contactHit: true,
      intent: 'rally',
      sitting: false,
      wantSit: false,
      stamina: 1,
    };
    return agent;
  }

  private beginServeCycle(fullFetch: boolean): void {
    if (!this.agents) return;
    this.mode = 'serveSetup';
    this.rally = null;
    this.pointResolved = true;
    this.lastCloseCall = null;
    this.pendingMark = null;
    this.pendingSetBreak = false;
    this.ball.active = false;
    this.ballVisible = false;
    this.dragMat.hide();
    this.serve.begin(fullFetch);
    for (const agent of this.agents) {
      agent.plan = null;
      agent.swing = null;
      agent.contactHit = true;
      agent.intent = 'rally';
      agent.wantSit = false;
      agent.sitting = false;
    }
    const server = this.agents[this.match.server];
    const receiver = this.agents[this.match.server === 0 ? 1 : 0];
    const servePos = this.servePosition(server);
    const returnPos = this.returnPosition(receiver);
    server.moveTarget.copy(servePos);
    receiver.moveTarget.copy(returnPos);
    this.toast(`${this.match.names[this.match.server].toUpperCase()} TO SERVE`, 2.4);
  }

  private chooseServeTarget(server: ActiveAgent): ServePlan {
    const plan = chooseServeTarget({
      rng: this.rng,
      serveNumber: this.match.serveNumber,
      serverSideSign: server.sideSign,
      serveX: this.servePosition(server).x,
      stats: server.profile.stats,
      aimTarget: this.aimPoint ? this.normalizeTarget(this.aimPoint, server, true) : null,
    });
    plan.power *= this.agentConditions(server).servePower;
    return plan;
  }

  private launchServe(server: ActiveAgent): void {
    this.serve.completeToss();
    const from = server.rig.racketHeadWorld.clone();
    if (!Number.isFinite(from.y)) return;
    const targetInfo = this.serve.currentToss;
    const solved = solveShot({
      from,
      target: targetInfo.target,
      kind: targetInfo.kind,
      surface: this.world.surface,
      spinRate: targetInfo.spin,
      power: targetInfo.power,
    });
    const velocity = solved.velocity.clone();
    const sigma = serveErrorSigma(targetInfo.kind, server.profile.stats.consistency) * this.agentConditions(server).serveAccuracy;
    const angle = this.rng.gaussian() * sigma;
    velocity.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
    velocity.multiplyScalar(1 + this.rng.gaussian() * (targetInfo.kind === 'serve' ? 0.018 : 0.012));
    this.lastServeSpeed = Math.round(velocity.length() * 3.6);
    this.lastServeWasSecond = targetInfo.kind === 'serve2';
    this.debugServe = {
      from: from.toArray(), target: targetInfo.target.toArray(), kind: targetInfo.kind,
      boxSign: targetInfo.boxSign, speed: this.lastServeSpeed, launch: velocity.toArray(),
    };
    this.debugLog.push(`serve ${this.lastServeSpeed}km/h target ${targetInfo.target.x.toFixed(2)},${targetInfo.target.z.toFixed(2)}`);
    if (this.debugLog.length > 120) this.debugLog.shift();
    server.swing && (server.swing.outWorld = new THREE.Vector3(velocity.x, 0, velocity.z).normalize());
    this.launchBall(from, velocity, solved.spin, server.slot, true, targetInfo.boxSign);
    this.toast(targetInfo.kind === 'serve2' ? 'SECOND SERVE' : 'SERVE', 1.4);
  }

  private launchBall(from: THREE.Vector3, velocity: THREE.Vector3, spin: THREE.Vector3, hitter: 0 | 1, isServe: boolean, serveBoxSign: 1 | -1, receiverSide?: 1 | -1): void {
    const receiver = this.agents[hitter === 0 ? 1 : 0];
    this.ball.pos.copy(from);
    this.ball.vel.copy(velocity);
    this.ball.spin.copy(spin);
    this.ball.bounces = 0;
    this.ball.grounded = false;
    this.ball.active = true;
    this.ballVisible = true;
    this.ballMesh.visible = true;
    this.ballGlow.visible = true;
    this.ballTrail.visible = true;
    this.trailPositions = [];
    this.ball.pos.copy(from);
    this.ballPos.copy(from);
    const recSide = (receiverSide ?? (-this.agents[hitter].sideSign)) as 1 | -1;
    this.rally = {
      hitter,
      shots: 1,
      isServe,
      serveBoxSign,
      receiverSide: recSide,
      bounces: 0,
      netTouched: false,
      serveIn: false,
      started: this.simTime,
      lastBounce: null,
    };
    this.pointResolved = false;
    this.mode = 'inPlay';
    this.serve.markFlight();
    this.agents[hitter].contactHit = true;
    this.agents[hitter].plan = null;
    this.agents[hitter].intent = 'rally';
    const hitterAgent = this.agents[hitter];
    if (isServe && hitterAgent.profile.stats.net > 0.85 && this.rng.next() < 0.58) {
      hitterAgent.intent = 'net';
      hitterAgent.moveTarget.set(clamp(from.x * 0.3, -2.4, 2.4), GROUND, hitterAgent.sideSign * 3.2);
    } else if (isServe) {
      hitterAgent.moveTarget.set(0.5 * hitterAgent.sideSign, GROUND, hitterAgent.sideSign * 12.4);
    }
    this.planIncoming(receiver);
    this.clearAim();
    this.serve.completeToss();
    this.ballMesh.position.copy(from);
    this.ballShadow.visible = true;
    this.hitFlashT = 0;
    this.hitFlashPos.copy(from);
    this.hitFlash.position.copy(from);
    this.hitFlash.visible = true;
  }

  private updateInPlay(dt: number, time: number): void {
    if (!this.rally || this.pointResolved) return;
    // contacts are evaluated after the rigs have been posed for this frame
    this.checkContacts(time);
    if (this.pointResolved) return;
    const step = 1 / 120;
    let remaining = Math.min(dt, 0.3);
    while (remaining > 1e-6 && !this.pointResolved) {
      const sub = Math.min(step, remaining);
      const events = stepBall(this.ball, sub, this.world.surface);
      for (const e of events) {
        this.processBallEvent(e);
        if (this.pointResolved) break;
      }
      remaining -= sub;
      if (!this.ball.active && !this.pointResolved) {
        this.resolvePoint((this.rally ? 1 - this.rally.hitter : 0) as 0 | 1, 'OUT');
        break;
      }
    }
  }

  private checkContacts(time: number): void {
    if (!this.agents || !this.rally || this.pointResolved) return;
    for (const agent of this.agents) {
      if (!agent.swing || agent.contactHit) continue;
      if (time < agent.swing.contact) continue;
      agent.contactHit = true;
      if (this.rally.hitter === agent.slot) continue;
      const racket = agent.rig.racketHeadWorld;
      const dx = this.ball.pos.x - racket.x;
      const dz = this.ball.pos.z - racket.z;
      const dy = this.ball.pos.y - racket.y;
      const horiz = Math.hypot(dx, dz);
      if (horiz > 1.6 || Math.abs(dy) > 1.6) {
        this.toast('JUST OUT OF REACH', 1.2);
        this.debugLog.push(`miss t=${time.toFixed(2)} h=${horiz.toFixed(2)} ball=${this.ball.pos.toArray().map(v=>v.toFixed(2))} racket=${racket.toArray().map(v=>v.toFixed(2))} plan=${agent.plan ? agent.plan.contactWorld.toArray().map(v=>v.toFixed(2)) : 'none'} target=${agent.plan ? agent.plan.target.toArray().map(v=>v.toFixed(2)) : 'none'} sampleT=${agent.plan ? agent.plan.contactTime.toFixed(2) : 'none'} swingT=${agent.swing ? agent.swing.contact.toFixed(2) : 'none'} bounces=${this.rally?.bounces}`);
        continue;
      }
      this.executeHit(agent, time);
      return;
    }
  }

  private executeHit(agent: ActiveAgent, time: number): void {
    if (!this.rally) return;
    const wasServe = this.rally.isServe;
    const contactHeight = this.ball.pos.y - GROUND;
    const beforeBounce = this.rally.bounces === 0;
    const from = agent.rig.racketHeadWorld.clone();
    const decision = this.decideShot(agent, from, contactHeight, beforeBounce);
    const solved = solveShot({
      from,
      target: decision.target,
      kind: decision.kind,
      surface: this.world.surface,
      spinRate: decision.spin,
      power: decision.power,
    });
    const velocity = solved.velocity.clone();
    const consistency = agent.profile.stats.consistency;
    const shots = this.rally?.shots ?? 1;
    const errorScale = decision.aggressive ? 1.3 : 1;
    const stretchedErr = agent.plan?.stretch || contactHeight < 0.5 || contactHeight > 1.5 ? 1.35 : 1;
    const pressure = 1 + Math.max(0, shots - 7) * 0.055;
    const sigma = ((1 - consistency) * 0.044 + 0.021) * errorScale * stretchedErr * pressure * this.agentConditions(agent).accuracy;
    const angle = this.rng.gaussian() * sigma;
    velocity.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
    velocity.multiplyScalar(1 + this.rng.gaussian() * 0.022);
    velocity.y *= 1 + this.rng.gaussian() * 0.026;
    const out = new THREE.Vector3(velocity.x, 0, velocity.z).normalize();
    if (agent.swing) {
      agent.swing.outWorld.copy(out);
      agent.rig.update(0, {
        time,
        speed: 0,
        facing: agent.sideSign === 1 ? Math.PI : 0,
        swing: agent.swing,
        ballWorld: this.ball.pos,
        sitting: false,
      });
    }
    const hitter = agent.slot;
    const opponent = this.agents[hitter === 0 ? 1 : 0];
    this.ball.pos.copy(from);
    this.ball.vel.copy(velocity);
    this.ball.spin.copy(solved.spin);
    this.ball.bounces = 0;
    this.ball.grounded = false;
    this.ball.active = true;
    this.ballVisible = true;
    this.ballMesh.visible = true;
    this.ballGlow.visible = true;
    this.ballTrail.visible = true;
    this.trailPositions = [];
    const nextShots = shots + 1;
    if (nextShots >= 6) this.excitement = Math.min(1, this.excitement + 0.02);
    this.rally = {
      hitter,
      shots: nextShots,
      isServe: false,
      serveBoxSign: 1,
      receiverSide: (-agent.sideSign) as 1 | -1,
      bounces: 0,
      netTouched: false,
      serveIn: false,
      started: time,
      lastBounce: null,
    };
    agent.plan = null;
    agent.intent = decision.approach || agent.intent === 'net' ? 'net' : 'rally';
    if (agent.intent === 'net') {
      agent.moveTarget.set(clamp(from.x * 0.35, -2.6, 2.6), GROUND, agent.sideSign * 3.1);
    } else {
      agent.moveTarget.set(0.4 * agent.sideSign, GROUND, agent.sideSign * 12.3);
    }
    opponent.contactHit = true;
    opponent.plan = null;
    opponent.swing = null;
    this.planIncoming(opponent);
    if (this.forcedShot) this.forcedShot = null;
    this.clearAim();
    if (decision.label) this.toast(decision.label, 1.7);
    if (wasServe) this.toast(this.lastServeWasSecond ? 'RETURN' : 'RETURN OF SERVE', 1.0);
    this.ballMesh.position.copy(from);
    this.ballShadow.visible = true;
    this.hitFlashT = 0;
    this.hitFlashPos.copy(from);
    this.hitFlash.position.copy(from);
    this.hitFlash.visible = true;
  }

  private decideShot(agent: ActiveAgent, contact: THREE.Vector3, height: number, beforeBounce: boolean): ShotDecision {
    const opp = this.agents[agent.slot === 0 ? 1 : 0];
    const aimTarget = this.aimPoint ? this.normalizeTarget(this.aimPoint, agent, false) : null;
    return chooseShot({
      stats: agent.profile.stats,
      contact,
      contactHeight: height,
      beforeBounce,
      oppPosition: opp.rig.position,
      stretch: agent.plan?.stretch ?? false,
      rallyShots: this.rally?.shots ?? 1,
      forcedShot: this.forcedShot,
      aimTarget,
      receiverSide: (-agent.sideSign) as 1 | -1,
      rng: this.rng,
    });
  }

  private processBallEvent(event: BallEvent): void {
    if (this.pointResolved || !this.rally) return;
    const updated = judgeBallEvent(this.rally, event, this.rallyHost);
    if (!this.pointResolved && this.rally) this.rally = { ...this.rally, ...updated };
  }

  private get rallyHost(): RallyHost {
    return {
      surface: this.world.surface,
      court: RALLY_COURT,
      registerBounce: (x, z, power) => this.world.court.registerBounce(x, z, power, true),
      triggerNetRipple: (x, over) => this.world.court.triggerNetRipple(x, over ? 0.45 : 1.1),
      emitCall: (text, delay, duration) => this.emitCall(text, delay, duration),
      recordCloseCall: (pos, lineCall, isServe) => {
        this.lastCloseCall = { pos: new THREE.Vector3(pos.x, pos.y, pos.z), lineCall, isServe };
      },
      serveFault: (reason) => this.handleServeFault(reason),
      let: () => this.handleLet(),
      point: (winner, reason) => this.resolvePoint(winner, reason),
      debug: (text) => this.pushDebug(text),
    };
  }

  private handleServeFault(reason: string): void {
    if (!this.rally) return;
    const rally = this.rally;
    this.emitCall(reason === 'NET' ? 'NET' : 'FAULT', 0, 1.2);
    this.agents[rally.hitter].swing = null;
    this.agents[1 - rally.hitter].swing = null;
    this.agents[1 - rally.hitter].plan = null;
    this.deadBallPos = this.ball.pos.clone();
    this.ball.active = false;
    this.ballVisible = false;
    this.ballMesh.visible = false;
    this.ballGlow.visible = false;
    this.ballShadow.visible = false;
    if (serveFaultOutcome(this.match.serveNumber) === 'doubleFault') {
      this.emitCall('DOUBLE FAULT', 0.1, 1.5);
      this.pointResolved = false;
      this.resolvePoint((1 - rally.hitter) as 0 | 1, 'DOUBLE FAULT');
      return;
    }
    this.lastCloseCall = null;
    this.match.serveNumber = 2;
    this.toast('SECOND SERVE', 2.0);
    this.mode = 'serveSetup';
    this.serve.resetToPreServe();
    this.rally = null;
    this.pointResolved = true;
    for (const agent of this.agents) {
      agent.plan = null;
      agent.contactHit = true;
    }
    const server = this.agents[this.match.server];
    server.moveTarget.copy(this.servePosition(server));
    this.agents[this.match.server === 0 ? 1 : 0].moveTarget.copy(this.returnPosition(this.agents[this.match.server === 0 ? 1 : 0]));
  }

  private handleLet(): void {
    if (!this.rally) return;
    this.emitCall('LET', 0.05, 1.4);
    this.deadBallPos = this.ball.pos.clone();
    this.ball.active = false;
    this.ballVisible = false;
    this.ballMesh.visible = false;
    this.ballGlow.visible = false;
    this.ballShadow.visible = false;
    this.mode = 'serveSetup';
    this.serve.resetToPreServe();
    this.lastCloseCall = null;
    this.ball.active = false;
    this.pointResolved = true;
    for (const agent of this.agents) {
      agent.plan = null;
      agent.contactHit = true;
    }
    this.rally = null;
    const server = this.agents[this.match.server];
    server.moveTarget.copy(this.servePosition(server));
  }

  private resolvePoint(winner: 0 | 1, reason: string): void {
    if (this.pointResolved) return;
    const shots = this.rally?.shots ?? 1;
    this.pointResolved = true;
    this.rally = null;
    this.mode = 'pointOver';
    this.deadBallPos = this.ball.pos.clone();
    this.ball.active = false;
    this.ballVisible = false;
    this.ballMesh.visible = false;
    this.ballGlow.visible = false;
    this.ballShadow.visible = false;
    this.ballTrail.visible = false;
    for (const agent of this.agents) {
      agent.plan = null;
      agent.contactHit = true;
    }
    const result = this.match.awardPoint(winner);
    this.career.recordPoint(winner, reason, shots);
    for (const agent of this.agents) {
      agent.stamina = Math.max(0, agent.stamina - STAMINA_DRAIN_PER_POINT / Math.max(0.5, agent.profile.stats.stamina));
    }
    this.debugLog.push(`POINT ${reason} winner=${winner} sets=${result.snapshot.sets} games=${result.snapshot.games} points=${result.snapshot.points} serve=${result.snapshot.serveNumber}`);
    this.emitCall(result.call, 0.15, 3.0);
    if (reason === 'OUT' || reason === 'DOUBLE FAULT') {
      this.toast(reason === 'OUT' ? 'OUT' : 'DOUBLE FAULT', 1.8);
    } else if (reason === 'WINNER' || reason === 'ACE') {
      this.toast(reason === 'ACE' ? 'ACE' : 'WINNER', 1.8);
    } else if (reason === 'NET') {
      this.toast('NET', 1.4);
    }
    this.world.stand.cheer(reason === 'WINNER' || reason === 'ACE' ? 1.1 : 0.8);
    if (reason === 'WINNER' || reason === 'ACE') this.excitement = Math.min(1, this.excitement + 0.12);
    else if (reason === 'DOUBLE FAULT' || reason === 'OUT') this.excitement = Math.max(0, this.excitement - 0.02);
    this.pendingSetBreak = result.setWon && !result.matchWon;
    this.pendingMatchOver = result.matchWon;
    this.pendingMark = this.lastCloseCall && this.world.surface === 'clay' ? this.lastCloseCall.pos.clone() : null;
    this.pendingMarkLine = this.lastCloseCall?.lineCall ?? 'IN';
    this.afterPointTimer = 0;
    for (const agent of this.agents) {
      agent.intent = 'rally';
      agent.moveTarget.copy(agent.rig.position);
      agent.velocity.set(0, 0, 0);
    }
    if (this.pendingMatchOver) {
      // award handled; the after-point flow triggers the result overlay after the mark check
    }
    if (this.lastCloseCall && this.world.surface === 'clay') {
      this.emitCall(this.lastCloseCall.lineCall === 'IN' ? 'IN' : 'OUT', 1.2, 1.2);
    }
    this.lastCloseCall = null;
  }

  private runAfterPointStep(): void {
    if (this.pendingMatchOver) {
      this.startMatchOver();
      return;
    }
    if (this.pendingMark) {
      const mark = this.pendingMark;
      this.pendingMark = null;
      this.startMarkCheck(mark);
      return;
    }
    if (this.world.weather.isRainy) {
      this.startRainDelay(() => {
        if (this.pendingSetBreak) {
          this.runAfterPointStep();
        } else {
          this.beginServeCycle(true);
        }
      });
      return;
    }
    if (this.pendingSetBreak) {
      this.pendingSetBreak = false;
      this.startSetBreak();
      return;
    }
    this.beginServeCycle(true);
  }

  private startMatchOver(): void {
    this.mode = 'matchOver';
    this.matchOverTimer = 0;
    this.ball.active = false;
    this.ballVisible = false;
    this.ballMesh.visible = false;
    this.ballGlow.visible = false;
    this.ballShadow.visible = false;
    this.ballTrail.visible = false;
    const winnerSlot = this.match.winner ?? 0;
    const winner = this.agents[winnerSlot].profile;
    const sets = this.match.snapshot().sets;
    const summary = this.career.finishMatch({
      score: `${sets[0]} – ${sets[1]}`,
      sets: this.match.setHistory,
      winnerSlot,
      profiles: [this.agents[0].profile, this.agents[1].profile],
    });
    const next = this.career.ladder[1]?.profile;
    this.matchResult = {
      winnerName: summary?.winnerName ?? fullName(winner),
      nextName: next ? fullName(next) : '',
      score: summary?.score ?? `${sets[0]} – ${sets[1]}`,
    };
    this.world.stand.cheer(1.4);
    this.emitCall(`GAME, SET AND MATCH, ${fullName(winner).toUpperCase()}`, 0.2, 4.0);
    const p0 = this.agents[0];
    const p1 = this.agents[1];
    p0.moveTarget.set(0.35, GROUND, 0.95);
    p1.moveTarget.set(-0.35, GROUND, -0.95);
    p0.wantSit = false;
    p1.wantSit = false;
    p0.sitting = false;
    p1.sitting = false;
    p0.intent = 'rally';
    p1.intent = 'rally';
  }

  private startMarkCheck(mark: THREE.Vector3): void {
    this.mode = 'markCheck';
    this.ball.active = false;
    this.ballVisible = false;
    this.ballMesh.visible = false;
    this.ballGlow.visible = false;
    this.ballShadow.visible = false;
    this.emitCall('LET ME SEE THAT MARK', 0.1, 2.0);
    this.toast('MARK CHECK', 2.2);
    this.umpire.checkMark(mark, () => {
      const line = this.pendingMarkLine;
      this.emitCall(line, 0.0, 1.4);
      this.toast(line === 'IN' ? 'THE MARK IS GOOD' : 'CALL STANDS', 2.0);
      this.mode = 'pointOver';
      this.afterPointTimer = 0;
    });
    for (const agent of this.agents) {
      agent.plan = null;
      agent.swing = null;
      agent.contactHit = true;
      agent.wantSit = false;
      agent.velocity.set(0, 0, 0);
      agent.moveTarget.copy(agent.rig.position);
    }
  }

  private startSetBreak(): void {
    this.mode = 'setBreak';
    this.setBreakTimer = 0;
    this.setBreakStage = 0;
    this.ball.active = false;
    this.ballVisible = false;
    this.ballMesh.visible = false;
    this.ballGlow.visible = false;
    this.ballShadow.visible = false;
    this.dragMat.hide();
    this.emitCall('SET BREAK', 0.1, 2.0);
    this.toast(this.world.surface === 'clay' ? 'GROUNDSMEN DRAGGING THE CLAY' : 'SET BREAK', 2.2);
    for (const agent of this.agents) {
      agent.plan = null;
      agent.swing = null;
      agent.contactHit = true;
      agent.velocity.set(0, 0, 0);
      agent.intent = 'rally';
      agent.wantSit = true;
    }
    const chairs = this.world.furniture.playerChairs;
    this.agents[0].moveTarget.set(chairs[0].root.position.x, GROUND, chairs[0].root.position.z);
    this.agents[1].moveTarget.set(chairs[1].root.position.x, GROUND, chairs[1].root.position.z);
    const clay = this.world.surface === 'clay';
    if (clay) {
      this.groundsmen[0].setTarget(new THREE.Vector3(6.9, GROUND, -12.4), 3.2);
      this.groundsmen[1].setTarget(new THREE.Vector3(7.2, GROUND, -11.6), 3.2);
    } else {
      this.groundsmen[0].goHome();
      this.groundsmen[1].goHome();
    }
    this.world.stand.cheer(0.9);
    for (const agent of this.agents) {
      agent.stamina = Math.min(1, agent.stamina + STAMINA_RECOVERY_PER_BREAK * agent.profile.stats.stamina);
    }
  }

  private updateSetBreak(dt: number, time: number): void {
    this.setBreakTimer += dt;
    const clay = this.world.surface === 'clay';
    if (clay) {
      if (this.setBreakTimer > 1.8 && this.setBreakTimer < 6.8) {
        const p = clamp((this.setBreakTimer - 1.8) / 5.0, 0, 1);
        const z = -13.0 + p * 26.0;
        this.dragMat.setProgress(z);
        const ballPos = this.ballMesh.position;
        this.groundsmen[0].person.setPosition(6.85, GROUND, z + 0.9);
        this.groundsmen[1].person.setPosition(7.25, GROUND, z + 0.9);
        this.groundsmen[0].person.update(dt, 1.2, 'drag', ballPos);
        this.groundsmen[1].person.update(dt, 1.2, 'drag', ballPos);
      } else if (this.setBreakTimer >= 6.8) {
        this.dragMat.hide();
        this.world.court.clearClayMarks();
        this.groundsmen[0].goHome();
        this.groundsmen[1].goHome();
      }
    }
    if (this.setBreakTimer > 9.2) {
      this.dragMat.hide();
      for (const agent of this.agents) {
        agent.wantSit = false;
        agent.sitting = false;
      }
      this.runAfterPointStep();
    }
  }

  private startRainDelay(callback: () => void): void {
    if (this.mode === 'rainDelay' || this.mode === 'covered' || this.mode === 'rainResume') return;
    this.rainCallback = callback;
    this.mode = 'rainDelay';
    this.rainTimer = 0;
    this.ball.active = false;
    this.ballVisible = false;
    this.ballMesh.visible = false;
    this.ballGlow.visible = false;
    this.ballShadow.visible = false;
    this.ballTrail.visible = false;
    this.clearAim();
    this.forcedShot = null;
    this.world.weather.setCoverTarget(1);
    for (const agent of this.agents) {
      agent.plan = null;
      agent.swing = null;
      agent.contactHit = true;
      agent.velocity.set(0, 0, 0);
      agent.wantSit = true;
      agent.intent = 'rally';
    }
    const chairs = this.world.furniture.playerChairs;
    this.agents[0].moveTarget.set(chairs[0].root.position.x, GROUND, chairs[0].root.position.z);
    this.agents[1].moveTarget.set(chairs[1].root.position.x, GROUND, chairs[1].root.position.z);
    for (const kid of this.ballKids) kid.goHome();
    this.emitCall('RAIN DELAY', 0.1, 2.6);
    this.toast('GROUNDSMEN PULLING THE COVER', 3.0);
    this.sitQueued = true;
  }

  private updateRainDelay(dt: number, time: number): void {
    this.rainTimer += dt;
    this.updateCoverCrew(dt);
    if (this.world.weather.coverAmount > 0.94 && this.rainTimer > 1.2) {
      this.mode = 'covered';
      this.toast('PLAY SUSPENDED · COVER ON', 2.6);
    }
    if (!this.world.weather.isRainy && this.rainTimer > 3.0) {
      this.beginRainResume();
    }
  }

  private updateCovered(dt: number, time: number): void {
    this.rainTimer += dt;
    this.updateCoverCrew(dt);
    if (!this.world.weather.isRainy) {
      this.beginRainResume();
    }
  }

  private beginRainResume(): void {
    this.mode = 'rainResume';
    this.rainTimer = 0;
    this.world.weather.setCoverTarget(0);
    this.toast('COVER COMING OFF', 2.0);
    for (const agent of this.agents) {
      agent.wantSit = true;
    }
  }

  private updateRainResume(dt: number, time: number): void {
    this.rainTimer += dt;
    this.updateCoverCrew(dt);
    if (this.world.weather.coverAmount < 0.03 && this.rainTimer > 1.0) {
      for (const agent of this.agents) {
        agent.wantSit = false;
        agent.sitting = false;
      }
      const callback = this.rainCallback;
      this.rainCallback = null;
      this.world.weather.setCoverTarget(0);
      if (callback) callback();
      else this.beginServeCycle(true);
    }
  }

  private updateCoverCrew(dt: number): void {
    const lead = this.world.weather.coverLeadingEdge;
    const cover = this.world.weather.coverAmount;
    if (cover > 0.02) {
      const z = lead.z;
      this.groundsmen[0].person.setPosition(6.85, GROUND, z + 0.4);
      this.groundsmen[1].person.setPosition(-6.85, GROUND, z + 0.4);
      this.groundsmen[0].person.update(dt, 1.2, 'drag', this.ballMesh.position);
      this.groundsmen[1].person.update(dt, 1.2, 'drag', this.ballMesh.position);
    } else if (this.mode === 'rainResume') {
      this.groundsmen[0].goHome();
      this.groundsmen[1].goHome();
    }
  }

  private updateWeatherInterrupts(): void {
    if (this.world.weather.isRainy) {
      if (this.mode === 'serveSetup' && this.serve.step !== 'toss' && this.serve.step !== 'passing') {
        this.startRainDelay(() => this.beginServeCycle(true));
      }
      return;
    }
    if (this.mode === 'rainDelay' || this.mode === 'covered') {
      if (!this.world.weather.isRainy) {
        this.beginRainResume();
      }
    }
  }

  private startRainDelayFromServe(): void {
    this.startRainDelay(() => this.beginServeCycle(true));
  }

  private beginAfterPoint(): void {
    this.afterPointTimer = 0;
    this.mode = 'pointOver';
  }

  // ---------------------------------- ball kids / umpire / staff ----------------------------------

  private updateBallKids(dt: number, time: number): void {
    for (const kid of this.ballKids) {
      const arrived = kid.update(dt, this.ballVisible ? this.ball.pos : new THREE.Vector3(0, 1, 0));
      void arrived;
      if (kid.carrying && this.serve.step === 'carrying' && this.serve.carryingKid === kid) {
        this.ballMesh.position.set(kid.position.x, kid.position.y + 0.6, kid.position.z);
      }
    }
  }

  private updateUmpire(dt: number, time: number): void {
    this.umpire.update(dt, this.ballVisible ? this.ball.pos : new THREE.Vector3(0, 1, 4), time);
  }

  private updateGroundsmen(dt: number, time: number): void {
    if (this.mode === 'setBreak' || this.mode === 'rainDelay' || this.mode === 'covered' || this.mode === 'rainResume') return;
    this.groundsmen[0].update(dt, this.ballVisible ? this.ball.pos : undefined);
    this.groundsmen[1].update(dt, this.ballVisible ? this.ball.pos : undefined);
  }

  // ---------------------------------- agent motion / posing ----------------------------------

  private agentConditions(agent: ActiveAgent): ConditionModifiers {
    return conditionsFor({
      surface: this.world.surface,
      rain: this.world.weather.rainLevel,
      wetness: this.world.weather.wetnessLevel,
      night: this.world.sky.nightFactor,
      stamina: agent.stamina,
      pressure: this.match ? scorePressure(this.match) : 0.18,
    });
  }

  private updateAgents(dt: number, time: number, allowMovement = true): void {
    for (const agent of this.agents) {
      const p = agent.rig.position;
      const mods = this.agentConditions(agent);
      let desiredX = 0;
      let desiredZ = 0;
      if (agent.sitting) {
        desiredX = 0;
        desiredZ = 0;
      } else if (allowMovement) {
        const tx = agent.moveTarget.x - p.x;
        const tz = agent.moveTarget.z - p.z;
        const dist = Math.hypot(tx, tz);
        if (dist > 0.08) {
          const speed = agent.profile.stats.speed * 1.04 * mods.speed;
          const inSwing = agent.swing && time >= agent.swing.start;
          const slowing = inSwing ? (time > agent.swing!.contact - 0.12 ? 0.2 : 0.92) : 1;
          desiredX = (tx / dist) * speed * slowing;
          desiredZ = (tz / dist) * speed * slowing;
        }
      }
      const accel = 26;
      agent.velocity.x += clamp(desiredX - agent.velocity.x, -accel * dt, accel * dt);
      agent.velocity.z += clamp(desiredZ - agent.velocity.z, -accel * dt, accel * dt);
      if (Math.abs(agent.velocity.x) < 0.01) agent.velocity.x = 0;
      if (Math.abs(agent.velocity.z) < 0.01) agent.velocity.z = 0;
      const nx = p.x + agent.velocity.x * dt;
      const nz = p.z + agent.velocity.z * dt;
      const cx = clamp(nx, -COURT.fenceX + 0.55, COURT.fenceX - 0.55);
      const czSide = clamp(nz * agent.sideSign, PLAYER_MIN_Z, COURT.fenceZ - 0.55);
      const cz = czSide * agent.sideSign;
      agent.rig.setPosition(cx, cz);
      if (!agent.wantSit) agent.sitting = false;
      if (agent.wantSit && !agent.sitting && distance2(agent.rig.position, agent.moveTarget) < 0.32) {
        agent.sitting = true;
        agent.velocity.set(0, 0, 0);
      }
      const facing = agent.sitting ? Math.PI / 2 : agent.sideSign === 1 ? Math.PI : 0;
      const speedNow = Math.hypot(agent.velocity.x, agent.velocity.z);
      agent.rig.update(dt, {
        time,
        speed: speedNow,
        facing,
        swing: agent.swing,
        ballWorld: this.ballVisible ? this.ball.pos : null,
        sitting: agent.sitting,
      });
      if (agent.swing && time > agent.swing.end + 0.25) {
        agent.swing = null;
      }
    }
  }

  private planIncoming(agent: ActiveAgent): void {
    if (!this.rally || this.pointResolved || !this.ball.active || agent.sitting) return;
    const pred = predictTrajectory(this.ball, this.world.surface, 5, 120);
    const first = pred.bounces[0];
    const second = pred.bounces[1];
    if (!first) return;
    const firstIn = this.isReceiverCourt(first.pos.x, first.pos.z, agent.sideSign);
    if (!firstIn) return;
    if (this.rally.isServe) {
      const boxIn =
        Math.abs(first.pos.x) <= SINGLES_HALF + 0.08 &&
        first.pos.z * this.rally.receiverSide > 0 &&
        Math.abs(first.pos.z) <= COURT.serviceLine + 0.08 &&
        Math.sign(first.pos.x) === this.rally.serveBoxSign;
      if (!boxIn) return;
    }
    const cands: IdealContact[] = [];
    const maxBefore = pred.samples;
    const firstT = first.t;
    const secondT = second?.t ?? Infinity;
    const oppSide = agent.sideSign;
    const nearNet = Math.abs(agent.rig.position.z) < 5.5;
    const shortLanding = Math.abs(first.pos.z) < 6.6;
    for (const sample of maxBefore) {
      if (sample.t < 0.16) continue;
      const height = sample.pos.y - GROUND;
      if (height < 0.18 || height > 2.65) continue;
      const beforeBounce = sample.t < firstT - 0.01;
      if (beforeBounce) {
        if (!nearNet && !shortLanding) continue;
        if (sample.pos.z * oppSide < 0.6) continue;
        if (height > 2.5) continue;
        const windup = height > 1.8 ? 0.3 : 0.25;
        const evaluated = this.evaluateContact(agent, sample, height, true, windup, firstT, secondT);
        if (evaluated) cands.push(evaluated);
      } else {
        if (sample.t < firstT + 0.02 || sample.t > secondT - 0.005) continue;
        if (sample.pos.z * oppSide <= 0.6) continue;
        if (height > 1.95) continue;
        const windup = 0.4;
        const evaluated = this.evaluateContact(agent, sample, height, false, windup, firstT, secondT);
        if (evaluated) cands.push(evaluated);
      }
    }
    if (!cands.length) {
      // still move toward the incoming ball even if the contact is unrealistic
      agent.moveTarget.set(
        clamp(first.pos.x, -7.8, 7.8),
        GROUND,
        clamp(first.pos.z * agent.sideSign, PLAYER_MIN_Z, COURT.fenceZ - 0.7) * agent.sideSign,
      );
      return;
    }
    cands.sort((a, b) => a.score - b.score);
    let chosen = cands[0];
    // Prefer a comfortable post-bounce ball over a low-percentage reflex volley if both exist.
    const post = cands.find((c) => !c.beforeBounce && c.score < 6);
    if (post) chosen = post;
    const contactTime = this.simTime + chosen.sampleTime;
    const windup = Math.min(chosen.windup, Math.max(0.18, contactTime - this.simTime - 0.04));
    const start = Math.max(this.simTime + 0.01, contactTime - windup);
    const swing: SwingVisual = {
      type: chosen.type,
      start,
      contact: contactTime,
      end: contactTime + 0.5,
      contactWorld: chosen.contact.clone(),
      outWorld: new THREE.Vector3(0, 0, -agent.sideSign).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.18),
    };
    agent.swing = swing;
    agent.contactHit = false;
    this.debugLog.push(`plan t=${this.simTime.toFixed(2)} chosen=${chosen.type} sample=${sampleStr(chosen)} contactT=${contactTime.toFixed(2)} contact=${chosen.contact.toArray().map(v=>v.toFixed(2))} target=${chosen.target.toArray().map(v=>v.toFixed(2))} ball=${this.ball.pos.toArray().map(v=>v.toFixed(2))} v=${this.ball.vel.toArray().map(v=>v.toFixed(2))} bounces=${this.rally?.bounces} first=${pred.bounces[0]?.t.toFixed(2)}@${pred.bounces[0]?.pos.toArray().map(v=>v.toFixed(2))} second=${pred.bounces[1]?.t.toFixed(2)}@${pred.bounces[1]?.pos.toArray().map(v=>v.toFixed(2))}`);
    agent.plan = {
      contactTime,
      contactWorld: chosen.contact.clone(),
      type: chosen.type,
      target: chosen.target.clone(),
      stretch: this.timeToTravel(agent, chosen.target, chosen.sampleTime) < 0.15 || distance2(agent.rig.position, chosen.target) > 3.3,
      beforeBounce: chosen.beforeBounce,
      contactHeight: chosen.height,
      windup,
    };
    agent.moveTarget.copy(chosen.target);
  }

  private evaluateContact(
    agent: ActiveAgent,
    sample: { t: number; pos: THREE.Vector3 },
    height: number,
    beforeBounce: boolean,
    windup: number,
    firstT: number,
    secondT: number,
  ): IdealContact | null {
    if (sample.t < windup + 0.05) return null;
    const fwd = forwardFor(agent.sideSign);
    const right = rightFor(agent.sideSign);
    const fore = sample.pos.clone().sub(fwd.clone().multiplyScalar(0.36)).sub(right.clone().multiplyScalar(0.55));
    const back = sample.pos.clone().sub(fwd.clone().multiplyScalar(0.36)).add(right.clone().multiplyScalar(0.55));
    const clampTarget = (v: THREE.Vector3) => {
      v.x = clamp(v.x, -COURT.fenceX + 0.6, COURT.fenceX - 0.6);
      const zSide = clamp(v.z * agent.sideSign, PLAYER_MIN_Z, COURT.fenceZ - 0.6);
      v.z = zSide * agent.sideSign;
      v.y = GROUND;
      return v;
    };
    clampTarget(fore);
    clampTarget(back);
    const dFore = distance2(agent.rig.position, fore);
    const dBack = distance2(agent.rig.position, back);
    let target = dFore <= dBack ? fore : back;
    const side: 'forehand' | 'backhand' = dFore <= dBack ? 'forehand' : 'backhand';
    const type: SwingType = beforeBounce ? (height > 1.8 ? 'smash' : 'volley') : side;
    const travel = distance2(agent.rig.position, target);
    const speed = agent.profile.stats.speed;
    const reachable = travel <= speed * sample.t * 0.92 + 0.55;
    const comfort = Math.abs(height - (beforeBounce ? 1.05 : 0.85));
    let score = comfort * 2.1 + sample.t * 0.12;
    if (!reachable) score += 10 + (travel - speed * sample.t) * 2.2;
    if (side === 'backhand') score += 0.08;
    if (beforeBounce) score += 0.18;
    if (height < 0.4) score += 2.5;
    if (type === 'smash') score -= 0.5;
    if (beforeBounce && sample.pos.z * agent.sideSign < 1.2) score += 1.5;
    if (!Number.isFinite(firstT) || !Number.isFinite(secondT)) score += 1;
    return { sampleTime: sample.t, contact: sample.pos.clone(), target, type, side, beforeBounce, height, windup, score };
  }

  private timeToTravel(agent: ActiveAgent, target: THREE.Vector3, time: number): number {
    const dist = distance2(agent.rig.position, target);
    return Math.max(0, time - dist / agent.profile.stats.speed);
  }

  // ---------------------------------- serve positions / aiming ----------------------------------

  private servePosition(server: ActiveAgent): THREE.Vector3 {
    return serveStance(this.match.serveSide, server.sideSign, LENGTH_HALF);
  }

  private returnPosition(receiver: ActiveAgent): THREE.Vector3 {
    const server = this.agents[this.match.server];
    const sx = this.servePosition(server).x;
    return serveReturnPosition(sx >= 0 ? -1 : 1, receiver.sideSign, LENGTH_HALF);
  }

  private likelyHitter(): ActiveAgent {
    if (this.mode === 'inPlay' && this.rally && !this.pointResolved) {
      return this.agents[this.rally.hitter === 0 ? 1 : 0];
    }
    return this.agents[this.match.server];
  }

  private normalizeTarget(point: THREE.Vector3, hitter: ActiveAgent, isServe: boolean): THREE.Vector3 {
    let x = point.x;
    let z = point.z;
    if (isServe) {
      const recSide = (-hitter.sideSign) as 1 | -1;
      if (z * recSide < 0) z = -z;
      z = recSide * clamp(Math.abs(z || 4.8), 1.0, 6.1);
      const sx = this.servePosition(hitter).x;
      const boxSign = sx >= 0 ? -1 : 1;
      if (x * boxSign < 0) x = -x;
      x = boxSign * clamp(Math.abs(x), 0.25, 3.8);
    } else {
      const oppSide = (-hitter.sideSign) as 1 | -1;
      if (z * oppSide < 0) z = -z;
      z = oppSide * clamp(Math.abs(z || 8.5), 1.2, 11.9);
      x = clamp(x, -4.4, 4.4);
    }
    return new THREE.Vector3(x, GROUND, z);
  }

  private isReceiverCourt(x: number, z: number, sideSign: 1 | -1): boolean {
    return Math.abs(x) <= SINGLES_HALF + 0.25 && z * sideSign > 0 && Math.abs(z) <= LENGTH_HALF + 0.2;
  }

  // ---------------------------------- serve host / ball visuals ----------------------------------

  private serveHost(): ServeHost {
    return {
      simTime: this.simTime,
      serveNumber: this.match.serveNumber,
      serverSlot: this.match.server,
      agents: this.agents,
      ballKids: this.ballKids,
      ball: this.ball,
      deadBallPos: this.deadBallPos,
      isRainy: () => this.world.weather.isRainy,
      requestRainDelay: () => this.startRainDelay(() => this.beginServeCycle(true)),
      servePosition: (player) => this.servePosition(player as ActiveAgent),
      returnPosition: (player) => this.returnPosition(player as ActiveAgent),
      chooseServeTarget: (player) => this.chooseServeTarget(player as ActiveAgent),
      launchServe: (player) => this.launchServe(player as ActiveAgent),
      clearDeadBall: () => {
        this.deadBallPos = null;
      },
      showBallAt: (pos, opts) => this.showBallAt(pos, opts),
      hideBall: () => this.hideBallMesh(),
      setShadowOpacity: (value) => {
        (this.ballShadow.material as THREE.MeshBasicMaterial).opacity = value;
      },
      debug: (text) => this.pushDebug(text),
    };
  }

  private showBallAt(pos: THREE.Vector3, opts: { glow?: boolean; shadow?: boolean; track?: boolean } = {}): void {
    this.ballVisible = true;
    this.ballMesh.visible = true;
    this.ballMesh.position.copy(pos);
    this.ballGlow.visible = Boolean(opts.glow);
    if (opts.glow) this.ballGlow.position.copy(pos);
    this.ballShadow.visible = Boolean(opts.shadow);
    if (opts.shadow) this.ballShadow.position.set(pos.x, GROUND + 0.012, pos.z);
    if (opts.track) this.ballPos.copy(pos);
  }

  private hideBallMesh(): void {
    this.ballVisible = false;
    this.ballMesh.visible = false;
    this.ballGlow.visible = false;
    this.ballShadow.visible = false;
  }

  // ---------------------------------- visual ball / aim / calls ----------------------------------

  private updateBallVisual(dt: number, time: number): void {
    this.hitFlashT += dt;
    if (this.hitFlashT < 0.2) {
      const u = this.hitFlashT / 0.2;
      this.hitFlash.visible = true;
      this.hitFlash.position.copy(this.hitFlashPos);
      this.hitFlash.scale.setScalar(0.55 + u * 1.1);
      (this.hitFlash.material as THREE.SpriteMaterial).opacity = (1 - u) * 0.7;
    } else if (this.hitFlash.visible) {
      this.hitFlash.visible = false;
    }
    this.ballPos.copy(this.ballMesh.visible ? this.ballMesh.position : this.ball.pos);
    if (!this.ballVisible) {
      this.ballMesh.visible = false;
      this.ballGlow.visible = false;
      this.ballShadow.visible = false;
      this.ballTrail.visible = false;
      return;
    }
    if (this.mode === 'inPlay' && this.ball.active) {
      this.ballMesh.position.copy(this.ball.pos);
      this.ballPos.copy(this.ball.pos);
      this.ballMesh.visible = true;
      this.ballGlow.visible = true;
      this.ballGlow.position.copy(this.ball.pos);
      const h = this.ball.pos.y - GROUND;
      this.ballShadow.visible = true;
      this.ballShadow.position.set(this.ball.pos.x, GROUND + 0.012, this.ball.pos.z);
      const sc = clamp(1.15 + h * 0.3, 1.15, 3.0);
      this.ballShadow.scale.set(sc, sc, sc);
      (this.ballShadow.material as THREE.MeshBasicMaterial).opacity = clamp(0.3 - h * 0.035, 0.08, 0.3);
      if (time - this.lastTrailTime > 0.045) {
        this.lastTrailTime = time;
        this.trailPositions.unshift(this.ball.pos.clone());
        if (this.trailPositions.length > 8) this.trailPositions.pop();
        const pos = this.ballTrail.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < 8; i++) {
          const p = this.trailPositions[Math.min(i, this.trailPositions.length - 1)] ?? this.ball.pos;
          pos.setXYZ(i, p.x, p.y, p.z);
        }
        pos.needsUpdate = true;
        this.ballTrail.visible = true;
      }
    } else {
      // The mesh is being driven by toss / pass / held-ball choreography.
      this.ballGlow.position.copy(this.ballMesh.position);
    }
  }

  private updateAim(dt: number): void {
    if (this.aimPoint) {
      this.aimMarker.visible = true;
      this.aimMarker.position.y = GROUND + 0.018 + Math.sin(this.simTime * 4) * 0.006;
      const s = 1 + Math.sin(this.simTime * 5) * 0.06;
      this.aimMarker.scale.setScalar(s);
    } else {
      this.aimMarker.visible = false;
    }
  }

  private updateCalls(time: number): void {
    if (this.calls.length > 20) this.calls = this.calls.slice(-20);
    const active = this.calls.filter((c) => c.end > time);
    if (active.length !== this.calls.length) this.calls = active;
  }

  private emitCall(text: string, delay = 0, duration = 2.8): void {
    const start = this.simTime + delay;
    this.calls.push({ start, end: start + duration, text });
  }

  private toast(text: string, duration = 2.2): void {
    this.toastText = text;
    this.toastUntil = this.simTime + duration;
  }

  private pushDebug(text: string): void {
    this.debugLog.push(text);
    if (this.debugLog.length > 120) this.debugLog.shift();
  }

  private statusText(): string {
    switch (this.mode) {
      case 'serveSetup':
        return this.match.serveNumber === 2 ? 'SECOND SERVE' : 'SERVE';
      case 'inPlay':
        return 'RALLY';
      case 'pointOver':
        return 'POINT';
      case 'markCheck':
        return 'MARK CHECK';
      case 'setBreak':
        return 'SET BREAK · GROUND CREW';
      case 'rainDelay':
        return 'RAIN DELAY · PULLING THE COVER';
      case 'covered':
        return 'RAIN DELAY · COVER ON';
      case 'rainResume':
        return 'COVER COMING OFF';
      case 'matchOver':
        return 'MATCH · WINNER STAYS ON';
      default:
        return '';
    }
  }
}
