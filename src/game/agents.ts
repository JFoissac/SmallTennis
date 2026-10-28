import * as THREE from 'three';
import { C } from '../core/palette';
import { COURT } from '../world/court';
import { StandingPerson, type PersonLook } from '../world/models';
import { addBox, addCylinder, GEO, lambert } from '../world/build';

export const BALL_KID_LOOKS: PersonLook[] = [
  { shirt: C.mustard, shorts: C.paper, skin: C.skinMid, hair: C.darkBrown, cap: C.forestDeep, accent: C.forest },
  { shirt: C.mustard, shorts: C.paper, skin: C.skinLight, hair: C.brown, cap: C.clay, accent: C.forest },
  { shirt: C.mustard, shorts: C.paper, skin: C.skinDark, hair: C.ink, cap: C.forestDeep, accent: C.forest },
  { shirt: C.mustard, shorts: C.paper, skin: C.skinMid, hair: C.umber, cap: C.clay, accent: C.forest },
];

export const GROUNDSMAN_LOOK: PersonLook = {
  shirt: C.forest,
  shorts: C.umber,
  skin: C.skinMid,
  hair: C.darkBrown,
  cap: C.mustard,
  accent: C.mustard,
};

export class BallKidAgent {
  readonly person: StandingPerson;
  readonly home: THREE.Vector3;
  private target: THREE.Vector3;
  private queue: THREE.Vector3[] = [];
  private speed = 0;
  private mode: 'idle' | 'run' | 'kneel' = 'kneel';
  carrying = false;
  busy = false;

  constructor(parent: THREE.Object3D, home: THREE.Vector3, index: number) {
    this.home = home.clone();
    this.target = home.clone();
    this.person = new StandingPerson(BALL_KID_LOOKS[index % BALL_KID_LOOKS.length], 0.8);
    this.person.setPosition(home.x, home.y, home.z);
    this.person.root.rotation.y = index % 2 === 0 ? Math.PI : 0;
    parent.add(this.person.root);
    this.mode = 'kneel';
  }

  get position(): THREE.Vector3 {
    return this.person.root.position;
  }

  goTo(target: THREE.Vector3, speed = 5.8): void {
    this.goPath([target], speed, false);
  }

  goPath(points: THREE.Vector3[], speed = 5.2, carrying = false): void {
    this.queue = points.map((p) => p.clone());
    this.target.copy(this.queue.shift() ?? this.home);
    this.speed = speed;
    this.busy = true;
    this.carrying = carrying;
    this.mode = 'run';
  }

  carryTo(target: THREE.Vector3, speed = 5.0): void {
    this.goPath([target], speed, true);
  }

  release(pos: THREE.Vector3): void {
    this.person.setPosition(pos.x, pos.y, pos.z);
    this.speed = 0;
    this.busy = false;
    this.carrying = false;
    this.mode = 'kneel';
  }

  goHome(): void {
    this.goPath([this.home], 4.8, false);
  }

  update(dt: number, ballPos: THREE.Vector3): boolean {
    const p = this.person.root.position;
    let arrived = false;
    if (this.mode === 'run') {
      const dx = this.target.x - p.x;
      const dz = this.target.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.08) {
        arrived = true;
        this.person.setPosition(this.target.x, this.target.y, this.target.z);
        if (this.queue.length > 0) {
          this.target.copy(this.queue.shift()!);
        } else {
          this.speed = 0;
          this.mode = 'kneel';
          this.busy = false;
        }
      } else {
        const step = Math.min(dist, this.speed * dt);
        const nx = p.x + (dx / dist) * step;
        const nz = p.z + (dz / dist) * step;
        this.person.setPosition(nx, this.target.y, nz);
        this.person.faceTo(new THREE.Vector3(nx + dx, this.target.y, nz + dz), 0.3);
      }
    }
    if (this.mode === 'run') {
      this.person.update(dt, this.speed, this.carrying ? 'idle' : 'walk', ballPos);
    } else if (this.mode === 'kneel') {
      this.person.update(dt, 0, 'kneel', ballPos);
    } else {
      this.person.update(dt, 0, 'idle', ballPos);
    }
    return arrived;
  }
}

export class GroundsmanAgent {
  readonly person: StandingPerson;
  readonly home: THREE.Vector3;
  target: THREE.Vector3;
  speed = 0;
  mode: 'idle' | 'walk' | 'drag' = 'idle';
  moving = false;

  constructor(parent: THREE.Object3D, home: THREE.Vector3, look = GROUNDSMAN_LOOK) {
    this.home = home.clone();
    this.target = home.clone();
    this.person = new StandingPerson(look, 0.98);
    this.person.setPosition(home.x, home.y, home.z);
    parent.add(this.person.root);
  }

  setTarget(target: THREE.Vector3, speed = 2.8): void {
    this.target.copy(target);
    this.speed = speed;
    this.moving = true;
    this.mode = 'walk';
  }

  update(dt: number, lookTarget?: THREE.Vector3): void {
    const p = this.person.root.position;
    let moving = false;
    if (this.moving) {
      const dx = this.target.x - p.x;
      const dz = this.target.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.12) {
        const step = Math.min(dist, this.speed * dt);
        const nx = p.x + (dx / dist) * step;
        const nz = p.z + (dz / dist) * step;
        this.person.setPosition(nx, this.target.y, nz);
        this.person.faceTo(new THREE.Vector3(nx + dx, this.target.y, nz + dz), 0.18);
        moving = true;
      } else {
        this.person.setPosition(this.target.x, this.target.y, this.target.z);
        this.moving = false;
      }
    }
    this.person.update(dt, moving ? this.speed : 0, this.mode === 'drag' ? 'drag' : moving ? 'walk' : 'idle', lookTarget);
  }

  goHome(): void {
    this.mode = 'walk';
    this.setTarget(this.home, 2.5);
  }
}

export class UmpireAgent {
  readonly person: StandingPerson;
  readonly chair: THREE.Vector3;
  readonly headWorld = new THREE.Vector3();
  readonly markTarget = new THREE.Vector3();
  private base = new THREE.Vector3();
  private state: 'chair' | 'down' | 'toMark' | 'read' | 'back' | 'up' = 'chair';
  private t = 0;
  private mark = new THREE.Vector3();
  private onComplete: (() => void) | null = null;
  private look = new THREE.Vector3();

  constructor(parent: THREE.Object3D, chairRoot: THREE.Vector3) {
    this.chair = chairRoot.clone();
    this.base.set(chairRoot.x, 2.3, chairRoot.z + 0.18);
    this.person = new StandingPerson(
      { shirt: C.cream, shorts: C.slate, skin: C.skinMid, hair: C.ink, cap: C.paper, accent: C.mustard },
      1.0,
    );
    this.person.setPosition(this.base.x, this.base.y, this.base.z);
    this.person.root.rotation.y = Math.PI / 2;
    parent.add(this.person.root);
  }

  get worldHead(): THREE.Vector3 {
    return this.headWorld;
  }

  isBusy(): boolean {
    return this.state !== 'chair';
  }

  checkMark(mark: THREE.Vector3, onComplete: () => void): void {
    this.mark.copy(mark);
    this.markTarget.set(mark.x, COURT.groundY, mark.z);
    this.onComplete = onComplete;
    this.state = 'down';
    this.t = 0;
  }

  update(dt: number, ballPos: THREE.Vector3, elapsed: number): void {
    this.t += dt;
    const p = this.person.root.position;
    if (this.state === 'chair') {
      this.person.setPosition(this.base.x, this.base.y, this.base.z);
      this.person.faceTo(new THREE.Vector3(0, 1.2, 0), 0.1);
      this.person.update(dt, 0, 'idle', ballPos);
    } else if (this.state === 'down') {
      const u = Math.min(1, this.t / 1.15);
      this.person.setPosition(this.base.x + u * 0.2, this.base.y * (1 - u) + COURT.groundY * u, this.base.z + u * 0.7);
      this.person.update(dt, 0.4, 'walk', this.markTarget);
      if (u >= 1) {
        this.state = 'toMark';
        this.t = 0;
      }
    } else if (this.state === 'toMark') {
      const dx = this.markTarget.x - p.x;
      const dz = this.markTarget.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.3) {
        const speed = 2.3;
        const step = Math.min(dist, speed * dt);
        this.person.setPosition(p.x + (dx / dist) * step, COURT.groundY, p.z + (dz / dist) * step);
        this.person.update(dt, speed, 'walk', this.markTarget);
      } else {
        this.state = 'read';
        this.t = 0;
        this.person.update(dt, 0, 'kneel', this.markTarget);
      }
    } else if (this.state === 'read') {
      this.person.update(dt, 0, 'kneel', this.markTarget);
      if (this.t > 1.3) {
        this.state = 'back';
        this.t = 0;
        this.onComplete?.();
        this.onComplete = null;
      }
    } else if (this.state === 'back') {
      const dx = this.base.x - p.x;
      const dz = this.base.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.3) {
        const speed = 2.5;
        const step = Math.min(dist, speed * dt);
        this.person.setPosition(p.x + (dx / dist) * step, COURT.groundY, p.z + (dz / dist) * step);
        this.person.update(dt, speed, 'walk', this.base);
      } else {
        this.state = 'up';
        this.t = 0;
      }
    } else if (this.state === 'up') {
      const u = Math.min(1, this.t / 1.2);
      this.person.setPosition(this.base.x, COURT.groundY * (1 - u) + this.base.y * u, this.base.z);
      this.person.update(dt, 0.3, 'idle', ballPos);
      if (u >= 1) {
        this.state = 'chair';
        this.t = 0;
      }
    }

    this.headWorld.copy(this.person.root.position).add(new THREE.Vector3(0, 1.5, 0));
    this.look.copy(ballPos);
  }

  getHeadWorld(): THREE.Vector3 {
    return this.headWorld;
  }

  get callAnchor(): THREE.Vector3 {
    return this.headWorld.clone().add(new THREE.Vector3(0, 0.6, 0));
  }
}

export class DragMat {
  readonly root = new THREE.Group();
  private mat: THREE.Mesh;
  private poles: THREE.Group;

  constructor(parent: THREE.Object3D) {
    parent.add(this.root);
    const geo = new THREE.BoxGeometry(ADRAG_WIDTH, 0.055, 1.25);
    const mat = new THREE.Mesh(geo, lambert(C.leather));
    mat.position.y = COURT.groundY + 0.035;
    mat.receiveShadow = true;
    mat.castShadow = true;
    this.mat = mat;
    this.poles = new THREE.Group();
    this.root.add(mat);
    addBox(this.poles, ADRAG_WIDTH + 0.2, 0.06, 0.06, C.tan, 0, COURT.groundY + 0.1, 0.6, 0, false, false);
    addBox(this.poles, ADRAG_WIDTH + 0.2, 0.06, 0.06, C.tan, 0, COURT.groundY + 0.1, -0.6, 0, false, false);
    for (let i = 0; i < 8; i++) {
      addBox(this.poles, 0.06, 0.05, 0.2, C.clay, -ADRAG_WIDTH / 2 + 0.6 + i * 1.2, COURT.groundY + 0.07, 0, 0, false, false);
    }
    this.root.add(this.poles);
    this.root.visible = false;
  }

  setProgress(z: number): void {
    this.root.position.z = z;
    this.root.visible = true;
  }

  hide(): void {
    this.root.visible = false;
  }
}

const ADRAG_WIDTH = 10.2;

export function addBenchAndTowel(parent: THREE.Object3D): void {
  addCylinder(parent, 0.12, 0.6, C.paper, 0, 0.3, 0, 6);
}
