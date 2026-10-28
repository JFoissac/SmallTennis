import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { C, hexOf, hexToRgb } from '../core/palette';
import {
  addBox,
  addCylinder,
  addMesh,
  addSphere,
  GEO,
  lambert,
  segment,
  simpleRng,
} from './build';

export interface PersonLook {
  shirt: number;
  shorts: number;
  skin: number;
  hair: number;
  shoe?: number;
  cap?: number | null;
  headband?: number | null;
  accent?: number;
}

export const DEFAULT_LOOK: PersonLook = {
  shirt: C.cream,
  shorts: C.slate,
  skin: C.skinMid,
  hair: C.darkBrown,
  shoe: C.paper,
  cap: null,
  headband: null,
  accent: C.clay,
};

const headMaterial = new THREE.MeshLambertMaterial({
  vertexColors: true,
  flatShading: true,
});

function paintGeometry(geometry: THREE.BufferGeometry, colorIndex: number): void {
  const color = hexToRgb(hexOf(colorIndex));
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function headBox(
  w: number,
  h: number,
  d: number,
  colorIndex: number,
  x: number,
  y: number,
  z: number,
): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(w, h, d);
  geometry.translate(x, y, z);
  paintGeometry(geometry, colorIndex);
  return geometry;
}

function createHeadMesh(look: PersonLook): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [
    headBox(0.24, 0.24, 0.22, look.skin, 0, 0.1, 0),
    headBox(0.26, 0.08, 0.24, look.hair, 0, 0.23, 0),
    headBox(0.26, 0.04, 0.02, look.hair, 0, 0.14, 0.12),
  ];
  if (look.headband !== null && look.headband !== undefined) {
    parts.push(headBox(0.26, 0.035, 0.24, look.headband, 0, 0.17, 0));
  }
  if (look.cap !== null && look.cap !== undefined) {
    parts.push(headBox(0.28, 0.08, 0.26, look.cap, 0, 0.25, 0));
    parts.push(headBox(0.24, 0.025, 0.16, look.cap, 0, 0.225, 0.16));
  }
  parts.push(headBox(0.03, 0.03, 0.03, C.ink, -0.055, 0.12, 0.115));
  parts.push(headBox(0.03, 0.03, 0.03, C.ink, 0.055, 0.12, 0.115));
  const geometry = mergeGeometries(parts, false)!;
  parts.forEach((part) => part.dispose());
  const mesh = new THREE.Mesh(geometry, headMaterial);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

export class StandingPerson {
  readonly root = new THREE.Group();
  readonly head = new THREE.Group();
  private legL: THREE.Group;
  private legR: THREE.Group;
  private armL: THREE.Group;
  private armR: THREE.Group;
  private body = new THREE.Group();
  private phase = 0;
  private baseY = 0;

  constructor(look: PersonLook, height = 1) {
    this.root.scale.setScalar(height);

    this.legL = this.makeLeg(look, -0.1);
    this.legR = this.makeLeg(look, 0.1);
    this.root.add(this.legL, this.legR);

    this.body.position.y = 0.78;
    this.root.add(this.body);
    const bodyParts = [
      headBox(0.34, 0.5, 0.22, look.shirt, 0, 0.28, 0),
      headBox(0.36, 0.1, 0.24, look.accent ?? C.clay, 0, 0.06, 0),
      headBox(0.12, 0.2, 0.02, look.skin, 0, 0.48, 0.12),
    ];
    const bodyGeometry = mergeGeometries(bodyParts, false)!;
    bodyParts.forEach((part) => part.dispose());
    const bodyMesh = new THREE.Mesh(bodyGeometry, headMaterial);
    bodyMesh.castShadow = false;
    bodyMesh.receiveShadow = true;
    this.body.add(bodyMesh);

    this.armL = this.makeArm(look, -1);
    this.armR = this.makeArm(look, 1);
    this.body.add(this.armL, this.armR);

    this.head.position.set(0, 0.68, 0);
    this.body.add(this.head);
    this.head.add(createHeadMesh(look));

    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = false;
        o.receiveShadow = true;
      }
    });
  }

  private makeLeg(look: PersonLook, x: number): THREE.Group {
    const group = new THREE.Group();
    group.position.set(x, 0.78, 0);
    const parts = [
      headBox(0.13, 0.42, 0.15, look.shorts, 0, -0.18, 0),
      headBox(0.11, 0.33, 0.12, look.skin, 0, -0.53, 0),
      headBox(0.13, 0.08, 0.22, look.shoe ?? C.paper, 0, -0.72, 0.04),
    ];
    const geometry = mergeGeometries(parts, false)!;
    parts.forEach((part) => part.dispose());
    const mesh = new THREE.Mesh(geometry, headMaterial);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    group.add(mesh);
    return group;
  }

  private makeArm(look: PersonLook, side: number): THREE.Group {
    const group = new THREE.Group();
    group.position.set(side * 0.22, 0.47, 0);
    const parts = [
      headBox(0.1, 0.29, 0.11, look.skin, 0, -0.14, 0),
      headBox(0.08, 0.22, 0.09, look.skin, 0, -0.39, 0),
    ];
    const geometry = mergeGeometries(parts, false)!;
    parts.forEach((part) => part.dispose());
    const mesh = new THREE.Mesh(geometry, headMaterial);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    group.add(mesh);
    return group;
  }

  setPosition(x: number, y: number, z: number): void {
    this.root.position.set(x, y, z);
    this.baseY = y;
  }

  faceTo(target: THREE.Vector3, amount = 1): void {
    const dx = target.x - this.root.position.x;
    const dz = target.z - this.root.position.z;
    if (Math.abs(dx) + Math.abs(dz) < 0.0001) return;
    const targetAngle = Math.atan2(dx, dz);
    const current = this.root.rotation.y;
    let diff = targetAngle - current;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.root.rotation.y = current + diff * Math.min(1, amount);
  }

  update(dt: number, speed: number, mode: 'idle' | 'walk' | 'kneel' | 'clap' | 'drag' = 'idle', lookTarget?: THREE.Vector3): void {
    this.phase += dt * (2.4 + speed * 1.2);
    const moving = speed > 0.1;
    const swing = moving ? Math.sin(this.phase * 3.3) * Math.min(0.65, speed * 0.1) : 0;
    this.legL.rotation.x = mode === 'kneel' ? -1.1 : swing;
    this.legR.rotation.x = mode === 'kneel' ? 0.2 : -swing;
    this.legL.rotation.z = mode === 'kneel' ? -0.3 : 0;
    this.legR.rotation.z = mode === 'kneel' ? 0.1 : 0;
    this.root.position.y = this.baseY + (moving ? Math.abs(Math.sin(this.phase * 3.3)) * 0.025 : 0);

    if (mode === 'clap') {
      this.armL.rotation.x = -1.0 + Math.sin(this.phase * 8) * 0.35;
      this.armR.rotation.x = -1.0 - Math.sin(this.phase * 8) * 0.35;
      this.armL.rotation.z = 0.35;
      this.armR.rotation.z = -0.35;
    } else if (mode === 'drag') {
      this.armL.rotation.x = -1.35;
      this.armR.rotation.x = -1.35;
      this.armL.rotation.z = 0.12;
      this.armR.rotation.z = -0.12;
    } else if (mode === 'kneel') {
      this.armL.rotation.x = -0.25;
      this.armR.rotation.x = -0.25;
    } else {
      this.armL.rotation.x = -swing * 0.85;
      this.armR.rotation.x = swing * 0.85;
      this.armL.rotation.z = 0.08;
      this.armR.rotation.z = -0.08;
    }

    if (lookTarget) {
      const local = this.head.parent!.worldToLocal(lookTarget.clone());
      const targetPitch = THREE.MathUtils.clamp(
        -Math.atan2(local.y - this.head.position.y, Math.hypot(local.x, local.z)),
        -0.5,
        0.45,
      );
      const targetYaw = THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -0.8, 0.8);
      this.head.rotation.x += (targetPitch - this.head.rotation.x) * Math.min(1, dt * 8);
      this.head.rotation.y += (targetYaw - this.head.rotation.y) * Math.min(1, dt * 8);
    } else {
      this.head.rotation.x *= 1 - Math.min(1, dt * 5);
      this.head.rotation.y *= 1 - Math.min(1, dt * 5);
    }
  }

  setCarryPose(): void {
    this.armL.rotation.x = -1.1;
    this.armR.rotation.x = -1.1;
    this.armL.rotation.z = 0.3;
    this.armR.rotation.z = -0.3;
  }
}

export class SeatedPerson {
  readonly root = new THREE.Group();
  readonly head = new THREE.Group();
  readonly armL = new THREE.Group();
  readonly armR = new THREE.Group();
  readonly skinColor: number;
  private phase = 0;

  constructor(look: PersonLook, scale = 1) {
    this.skinColor = look.skin;
    this.root.scale.setScalar(scale);
    addBox(this.root, 0.34, 0.2, 0.26, look.shorts, 0, 0.5, 0);
    addBox(this.root, 0.34, 0.42, 0.22, look.shirt, 0, 0.78, 0);
    addBox(this.root, 0.36, 0.08, 0.24, look.accent ?? C.clay, 0, 0.58, 0);
    addBox(this.root, 0.13, 0.12, 0.4, look.shorts, -0.09, 0.48, 0.17);
    addBox(this.root, 0.13, 0.12, 0.4, look.shorts, 0.09, 0.48, 0.17);
    addBox(this.root, 0.12, 0.3, 0.12, look.skin, -0.09, 0.28, 0.36);
    addBox(this.root, 0.12, 0.3, 0.12, look.skin, 0.09, 0.28, 0.36);
    addBox(this.root, 0.14, 0.07, 0.2, look.shoe ?? C.paper, -0.09, 0.1, 0.4);
    addBox(this.root, 0.14, 0.07, 0.2, look.shoe ?? C.paper, 0.09, 0.1, 0.4);
    this.head.position.set(0, 1.04, 0);
    this.head.userData.noBatch = true;
    this.root.add(this.head);
    this.head.add(createHeadMesh(look));

    this.armL.position.set(-0.22, 0.94, 0);
    this.armR.position.set(0.22, 0.94, 0);
    this.root.add(this.armL, this.armR);

    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = false;
        o.receiveShadow = true;
      }
    });
  }

  update(dt: number, clap: number, lookTarget?: THREE.Vector3): void {
    this.phase += dt * 7;
    const c = Math.max(0, Math.min(1, clap));
    this.armL.rotation.x = -0.2 - c * (1.0 + Math.sin(this.phase) * 0.2);
    this.armR.rotation.x = -0.2 - c * (1.0 - Math.sin(this.phase) * 0.2);
    this.armL.rotation.z = 0.1 + c * 0.2;
    this.armR.rotation.z = -0.1 - c * 0.2;
    if (lookTarget) {
      const local = this.head.parent!.worldToLocal(lookTarget.clone());
      const yaw = THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -0.75, 0.75);
      const pitch = THREE.MathUtils.clamp(
        -Math.atan2(local.y - this.head.position.y, Math.hypot(local.x, local.z)),
        -0.3,
        0.5,
      );
      this.head.rotation.y += (yaw - this.head.rotation.y) * Math.min(1, dt * 6);
      this.head.rotation.x += (pitch - this.head.rotation.x) * Math.min(1, dt * 6);
    } else {
      this.head.rotation.y *= 1 - Math.min(1, dt * 3);
      this.head.rotation.x *= 1 - Math.min(1, dt * 3);
    }
  }
}

export function addPoplar(parent: THREE.Object3D, x: number, z: number, scale = 1, seed = 1): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.scale.setScalar(scale);
  const rand = simpleRng(seed * 79 + 3);
  addCylinder(group, 0.22, 4.4, C.brown, 0, 2.2, 0, 6);
  const heights = [3.3, 4.4, 5.5, 6.6, 7.6, 8.4];
  const radii = [1.05, 1.18, 1.06, 0.88, 0.65, 0.38];
  for (let i = 0; i < heights.length; i++) {
    const blob = addSphere(
      group,
      radii[i],
      i % 3 === 0 ? C.forest : i % 2 === 0 ? C.green : C.moss,
      (rand() - 0.5) * 0.35,
      heights[i],
      (rand() - 0.5) * 0.35,
      'ico',
      1.22,
    );
    blob.rotation.set(rand() * 0.4, rand() * Math.PI, rand() * 0.3);
    blob.castShadow = true;
  }
  addSphere(group, 0.42, C.grass, 0, 2.2, 0, 'ico', 1.4);
  parent.add(group);
  return group;
}

export function addRoundTree(parent: THREE.Object3D, x: number, z: number, scale = 1, seed = 2): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.scale.setScalar(scale);
  const rand = simpleRng(seed * 41 + 9);
  addCylinder(group, 0.34, 2.6, C.brown, 0, 1.3, 0, 6);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    addSphere(
      group,
      1.2 + rand() * 0.35,
      i % 2 === 0 ? C.green : C.moss,
      Math.cos(a) * 0.6,
      3.1 + rand() * 1.2,
      Math.sin(a) * 0.6,
      'ico',
      1.05,
    );
  }
  parent.add(group);
  return group;
}

export function addBush(parent: THREE.Object3D, x: number, z: number, scale = 1, color: number = C.moss): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.scale.setScalar(scale);
  addSphere(group, 0.65, color, 0, 0.45, 0, 'ico', 0.7);
  addSphere(group, 0.45, C.green, 0.45, 0.3, 0.1, 'ico', 0.7);
  addSphere(group, 0.4, C.forest, -0.4, 0.28, -0.1, 'ico', 0.7);
  parent.add(group);
  return group;
}

export function addRock(parent: THREE.Object3D, x: number, y: number, z: number, size: number, color: number = C.stone, seed = 3): THREE.Mesh {
  const rand = simpleRng(seed * 13 + 1);
  const rock = addMesh(parent, GEO.dodeca, lambert(color), x, y, z, true, true);
  rock.scale.set(size * (1 + rand() * 0.4), size * (0.6 + rand() * 0.3), size * (1 + rand() * 0.3));
  rock.rotation.set(rand() * 0.6, rand() * Math.PI, rand() * 0.6);
  return rock;
}

export interface CloudPuff {
  group: THREE.Group;
  base: THREE.Vector3;
  speed: number;
  phase: number;
}

export function addCloud(parent: THREE.Object3D, x: number, y: number, z: number, scale = 1, seed = 5): CloudPuff {
  const group = new THREE.Group();
  const rand = simpleRng(seed * 31 + 7);
  group.position.set(x, y, z);
  const colors = [C.bone, C.cream, C.paper, C.lightGrey];
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const r = (0.7 + rand() * 0.8) * scale;
    const geometry = new THREE.IcosahedronGeometry(1, 1);
    geometry.scale(r, r * 0.6, r);
    geometry.translate(
      (rand() - 0.5) * 3.2 * scale,
      (rand() - 0.5) * 0.8 * scale,
      (rand() - 0.5) * 1.6 * scale,
    );
    paintGeometry(geometry, colors[Math.floor(rand() * colors.length)]);
    parts.push(geometry);
  }
  const merged = mergeGeometries(parts, false)!;
  parts.forEach((part) => part.dispose());
  const cloud = new THREE.Mesh(merged, headMaterial);
  cloud.castShadow = false;
  cloud.receiveShadow = false;
  group.add(cloud);
  parent.add(group);
  return { group, base: new THREE.Vector3(x, y, z), speed: 0.1 + rand() * 0.2, phase: rand() * 6 };
}

export class CloudField {
  readonly clouds: CloudPuff[] = [];
  private readonly root: THREE.Group;

  constructor(parent: THREE.Object3D) {
    this.root = new THREE.Group();
    parent.add(this.root);
    const spots: Array<[number, number, number, number]> = [
      [-27, -8, 7, 1.25],
      [25, -9, 19, 1.45],
      [22, -10, -20, 1.05],
      [-20, 14, -27, 0.95],
      [-32, 19, 18, 1.15],
    ];
    for (let i = 0; i < spots.length; i++) {
      const [x, y, z, s] = spots[i];
      this.clouds.push(addCloud(this.root, x, y, z, s, i + 3));
    }
  }

  update(dt: number, elapsed: number): void {
    for (const cloud of this.clouds) {
      cloud.group.position.x = cloud.base.x + Math.sin(elapsed * cloud.speed + cloud.phase) * 1.2;
      cloud.group.position.y = cloud.base.y + Math.sin(elapsed * 0.23 + cloud.phase) * 0.35;
    }
  }
}

export function addStringLight(parent: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, count = 9): THREE.Mesh[] {
  const bulbs: THREE.Mesh[] = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const p = new THREE.Vector3().lerpVectors(from, to, t);
    p.y -= Math.sin(t * Math.PI) * 0.45;
    const bulb = addMesh(parent, GEO.ico, new THREE.MeshBasicMaterial({ color: 0xf0d77c }), p.x, p.y, p.z, false, false);
    bulb.scale.setScalar(0.07);
    bulb.visible = false;
    bulbs.push(bulb);
  }
  segment(parent, from, new THREE.Vector3().lerpVectors(from, to, 0.5).add(new THREE.Vector3(0, -0.45, 0)), 0.012, C.ink, 6);
  segment(parent, to, new THREE.Vector3().lerpVectors(from, to, 0.5).add(new THREE.Vector3(0, -0.45, 0)), 0.012, C.ink, 6);
  return bulbs;
}



