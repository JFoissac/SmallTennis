import * as THREE from 'three';
import { C, hexOf } from '../core/palette';
import {
  addBox,
  addBoxMat,
  addCone,
  addCylinder,
  addMesh,
  addSphere,
  GEO,
  lambert,
  makeCanvasTexture,
  simpleRng,
} from './build';
import { addBush, addPoplar, addRock, addRoundTree } from './models';
import { bannerTexture, gravelTexture, grassTexture } from './textures';

export const ISLAND = {
  x: 18.6,
  z: 24.6,
} as const;

function islandShape(scale = 1, wobble = 0.7, seed = 1): THREE.Shape {
  const rand = simpleRng(seed);
  const points = 28;
  const shape = new THREE.Shape();
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const jitter = 1 + (rand() - 0.5) * 0.06 * wobble;
    const x = Math.cos(a) * ISLAND.x * scale * jitter;
    const z = Math.sin(a) * ISLAND.z * scale * jitter;
    if (i === 0) shape.moveTo(x, -z);
    else shape.lineTo(x, -z);
  }
  shape.closePath();
  return shape;
}

function ribbon(parent: THREE.Object3D, points: Array<[number, number]>, width: number, y: number): THREE.Mesh {
  const verts: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let run = 0;
  const rand = simpleRng(42);
  for (let i = 0; i < points.length; i++) {
    const [x, z] = points[i];
    const [nx, nz] = points[Math.min(points.length - 1, i + 1)];
    const [px, pz] = points[Math.max(0, i - 1)];
    const dx = nx - px;
    const dz = nz - pz;
    const len = Math.max(0.0001, Math.hypot(dx, dz));
    const ox = (-dz / len) * width * 0.5;
    const oz = (dx / len) * width * 0.5;
    if (i > 0) run += Math.hypot(x - px, z - pz);
    verts.push(x + ox, y + (rand() - 0.5) * 0.006, z + oz, x - ox, y, z - oz);
    uvs.push(0, run / 1.4, 1, run / 1.4);
    if (i < points.length - 1) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const tex = gravelTexture();
  tex.repeat.set(1.3, 1.3);
  const mat = new THREE.MeshLambertMaterial({ map: tex, color: 0xffffff, flatShading: true, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export class Island {
  readonly root = new THREE.Group();
  readonly trees: THREE.Group[] = [];
  private rand = simpleRng(2026);

  constructor(parent: THREE.Object3D) {
    parent.add(this.root);
    this.buildTop();
    this.buildUnderside();
    this.buildPath();
    this.buildPlanting();
    this.buildDetails();
  }

  private buildTop(): void {
    const topShape = islandShape(1, 1.2, 5);
    const topGeo = new THREE.ShapeGeometry(topShape, 8);
    topGeo.rotateX(-Math.PI / 2);
    const grassMap = grassTexture();
    grassMap.repeat.set(0.32, 0.32);
    const grassMat = new THREE.MeshLambertMaterial({ map: grassMap, color: 0xffffff, flatShading: true });
    const top = new THREE.Mesh(topGeo, grassMat);
    top.position.y = 0;
    top.receiveShadow = true;
    this.root.add(top);

    const rimShape = islandShape(0.987, 1.2, 5);
    const rimGeo = new THREE.ExtrudeGeometry(rimShape, { depth: 0.55, bevelEnabled: false, steps: 1 });
    rimGeo.rotateX(-Math.PI / 2);
    rimGeo.translate(0, -0.55, 0);
    const rim = new THREE.Mesh(rimGeo, lambert(C.grass));
    rim.receiveShadow = true;
    rim.castShadow = true;
    this.root.add(rim);

    const soilShape = islandShape(0.973, 1.1, 5);
    const soilGeo = new THREE.ExtrudeGeometry(soilShape, { depth: 1.3, bevelEnabled: false, steps: 1 });
    soilGeo.rotateX(-Math.PI / 2);
    soilGeo.translate(0, -1.85, 0);
    const soil = new THREE.Mesh(soilGeo, lambert(C.umber));
    soil.receiveShadow = true;
    soil.castShadow = true;
    this.root.add(soil);
  }

  private buildUnderside(): void {
    const layers = [
      { y: -0.75, h: 1.5, sx: 19.1, sz: 25.1, color: C.darkBrown, rot: 0.1, segments: 12 },
      { y: -2.2, h: 1.9, sx: 18.4, sz: 24.2, color: C.brown, rot: 0.28, segments: 11 },
      { y: -3.95, h: 2.1, sx: 16.9, sz: 22.4, color: C.umber, rot: -0.16, segments: 10 },
      { y: -5.8, h: 2.2, sx: 14.2, sz: 18.9, color: C.leather, rot: 0.5, segments: 9 },
      { y: -7.6, h: 2.3, sx: 10.7, sz: 14.3, color: C.brown, rot: 0.12, segments: 8 },
      { y: -9.4, h: 2.7, sx: 6.7, sz: 9.3, color: C.umber, rot: -0.45, segments: 8 },
      { y: -11.4, h: 2.6, sx: 3.4, sz: 4.9, color: C.darkBrown, rot: 0.2, segments: 7 },
      { y: -13.4, h: 2.4, sx: 1.2, sz: 2.1, color: C.stone, rot: 0.6, segments: 6 },
    ];
    for (let i = 0; i < layers.length; i++) {
      const l = layers[i];
      const geo = new THREE.CylinderGeometry(0.5, 0.43, 1, l.segments, 1);
      const mesh = addMesh(this.root, geo, lambert(l.color), 0, l.y - l.h / 2, 0, true, true);
      mesh.scale.set(l.sx * 2, l.h, l.sz * 2);
      mesh.rotation.y = l.rot;
    }

    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + 0.13;
      const x = Math.cos(a) * (16.8 + this.rand() * 2.4);
      const z = Math.sin(a) * (21.5 + this.rand() * 3.2);
      const rock = addRock(this.root, x, -1.4 - this.rand() * 4.6, z, 1.1 + this.rand() * 2.2, i % 4 === 0 ? C.stone : i % 3 === 0 ? C.brown : C.leather, i + 200);
      rock.scale.y *= 1.2;
    }

    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.5;
      addCone(this.root, 0.75 + this.rand() * 0.8, 2.6 + this.rand() * 3.8, C.darkBrown, Math.cos(a) * (2.8 + this.rand() * 2.2), -12.2 - this.rand() * 2.4, Math.sin(a) * (3.8 + this.rand() * 2.2), 6);
    }

    for (let i = 0; i < 20; i++) {
      const a = this.rand() * Math.PI * 2;
      const x = Math.cos(a) * (17.5 + this.rand() * 1.2);
      const z = Math.sin(a) * (23.2 + this.rand() * 1.2);
      addSphere(this.root, 0.5 + this.rand() * 0.7, i % 3 === 0 ? C.moss : C.pine, x, -1.2 - this.rand() * 1.4, z, 'ico', 0.5);
    }

    const vineMat = lambert(C.pine);
    for (let i = 0; i < 18; i++) {
      const a = this.rand() * Math.PI * 2;
      const r = 0.86 + this.rand() * 0.12;
      const x = Math.cos(a) * ISLAND.x * r;
      const z = Math.sin(a) * ISLAND.z * r;
      const len = 1.2 + this.rand() * 4.8;
      const vine = addBox(this.root, 0.08, len, 0.08, C.pine, x, -0.3 - len / 2, z);
      vine.rotation.z = (this.rand() - 0.5) * 0.25;
      vine.rotation.x = (this.rand() - 0.5) * 0.25;
    }

    for (let i = 0; i < 12; i++) {
      const a = this.rand() * Math.PI * 2;
      const x = Math.cos(a) * (13 + this.rand() * 5);
      const z = Math.sin(a) * (17 + this.rand() * 6);
      addRock(this.root, x, -1 - this.rand() * 7, z, 0.4 + this.rand() * 1.2, i % 3 === 0 ? C.stone : C.brown, i + 2);
    }

    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2 + 0.5;
      addRock(this.root, Math.cos(a) * (4 + this.rand() * 3), -13.5 - this.rand() * 4, Math.sin(a) * (5 + this.rand() * 3), 0.28 + this.rand() * 0.5, C.stone, i + 30);
    }

    const tuftMat = lambert(C.grass);
    for (let i = 0; i < 30; i++) {
      const a = this.rand() * Math.PI * 2;
      const x = Math.cos(a) * ISLAND.x * (0.92 + this.rand() * 0.06);
      const z = Math.sin(a) * ISLAND.z * (0.92 + this.rand() * 0.06);
      const tuft = addBox(this.root, 0.15, 0.2 + this.rand() * 0.25, 0.12, i % 4 === 0 ? C.grassLight : C.grass, x, 0.08, z);
      tuft.rotation.y = this.rand() * 2;
      tuft.castShadow = false;
    }
  }

  private buildPath(): void {
    const points: Array<[number, number]> = [
      [-9.55, -2.4],
      [-9.35, 1.0],
      [-9.15, 4.5],
      [-8.98, 7.4],
      [-8.86, 9.55],
    ];
    ribbon(this.root, points, 1.3, 0.045);
    const branch: Array<[number, number]> = [
      [-9.5, 0.2],
      [-10.7, 5.2],
      [-11.7, 10.4],
      [-10.8, 16.2],
      [-7.4, 20.8],
      [-2.2, 23.2],
    ];
    ribbon(this.root, branch, 1.05, 0.041);

    for (let i = 0; i < points.length - 1; i++) {
      const [x1, z1] = points[i];
      const [x2, z2] = points[i + 1];
      const steps = Math.ceil(Math.hypot(x2 - x1, z2 - z1) / 0.8);
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const x = x1 + (x2 - x1) * t;
        const z = z1 + (z2 - z1) * t;
        addRock(this.root, x - 0.9, 0.08, z, 0.1 + this.rand() * 0.06, C.stone, i * 20 + s);
        addRock(this.root, x + 0.9, 0.08, z, 0.1 + this.rand() * 0.06, C.stone, i * 20 + s + 1);
      }
    }

    const sign = new THREE.Group();
    sign.position.set(-9.3, 0, 5.4);
    sign.rotation.y = 0.55;
    addBox(sign, 0.14, 1.65, 0.14, C.brown, -0.8, 0.82, 0);
    addBox(sign, 0.14, 1.65, 0.14, C.brown, 0.8, 0.82, 0);
    addBox(sign, 1.9, 0.75, 0.08, C.forestDeep, 0, 1.55, 0);
    const mat = new THREE.MeshBasicMaterial({ map: bannerTexture('LOVE ALL', { bg: C.forestDeep, fg: C.cream, accent: C.mustard, width: 256, height: 96 }), toneMapped: false });
    addBoxMat(sign, 1.55, 0.48, 0.01, mat, 0, 1.55, 0.05, false, false);
    addBox(sign, 1.9, 0.07, 0.14, C.cream, 0, 1.94, 0);
    this.root.add(sign);
  }

  private buildPlanting(): void {
    const rand = simpleRng(77);
    const poplarSpots: Array<[number, number, number]> = [
      [-15.8, -18.2, 1.25],
      [-16.6, -11.0, 1.1],
      [-16.0, 13.8, 1.2],
      [-13.3, 20.6, 0.95],
      [16.8, -16.7, 1.22],
      [17.0, -6.8, 1.1],
      [16.2, 8.8, 1.3],
      [15.0, 17.9, 0.9],
      [7.4, -23.2, 0.85],
      [-3.3, -23.5, 0.95],
    ];
    for (let i = 0; i < poplarSpots.length; i++) {
      const [x, z, s] = poplarSpots[i];
      this.trees.push(addPoplar(this.root, x, z, s, i + 1));
    }

    addRoundTree(this.root, 13.8, -19.6, 1.1, 4);
    addRoundTree(this.root, -15.0, 4.4, 1.0, 8);
    addRoundTree(this.root, 8.6, 22.0, 0.8, 5);

    for (let i = 0; i < 16; i++) {
      const a = rand() * Math.PI * 2;
      const r = 0.72 + rand() * 0.23;
      const x = Math.cos(a) * ISLAND.x * r;
      const z = Math.sin(a) * ISLAND.z * r;
      if (Math.abs(x) < 9.4 && Math.abs(z) < 18) continue;
      addBush(this.root, x, z, 0.5 + rand() * 0.6, rand() > 0.5 ? C.moss : C.green);
    }

    for (let i = 0; i < 60; i++) {
      const side = rand() > 0.5 ? 1 : -1;
      const x = side * (2.5 + rand() * 12);
      const z = (rand() > 0.5 ? 1 : -1) * (18.2 + rand() * 4);
      addBush(this.root, x, z, 0.2 + rand() * 0.3, C.grassLight);
    }

    const flowerColors = [C.rose, C.salmon, C.mustard, C.cream, C.peach];
    for (let i = 0; i < 90; i++) {
      const a = rand() * Math.PI * 2;
      const r = 0.73 + rand() * 0.2;
      const x = Math.cos(a) * ISLAND.x * r;
      const z = Math.sin(a) * ISLAND.z * r;
      if (Math.abs(x) < 9.3 && Math.abs(z) < 17.8) continue;
      const stem = addBox(this.root, 0.035, 0.18 + rand() * 0.15, 0.035, C.grass, x, 0.09, z, 0, false, false);
      const petal = addBox(this.root, 0.09 + rand() * 0.07, 0.07, 0.09, flowerColors[Math.floor(rand() * flowerColors.length)], x, 0.2, z, 0, false, false);
      stem.rotation.z = (rand() - 0.5) * 0.3;
      stem.castShadow = false;
      petal.castShadow = false;
    }
  }

  private buildDetails(): void {
    for (let i = 0; i < 22; i++) {
      const a = this.rand() * Math.PI * 2;
      const r = 0.9 + this.rand() * 0.07;
      addRock(
        this.root,
        Math.cos(a) * ISLAND.x * r,
        0.12,
        Math.sin(a) * ISLAND.z * r,
        0.25 + this.rand() * 0.45,
        i % 3 === 0 ? C.stone : C.sand,
        i + 90,
      );
    }

    const bench = new THREE.Group();
    bench.position.set(11.2, 0, 15.6);
    bench.rotation.y = -0.6;
    for (let i = 0; i < 3; i++) {
      addBox(bench, 1.8, 0.08, 0.14, C.leather, 0, 0.42 + i * 0.16, -0.08);
    }
    addBox(bench, 1.9, 0.12, 0.55, C.brown, 0, 0.5, 0.18);
    addBox(bench, 0.12, 0.5, 0.55, C.umber, -0.85, 0.25, 0.15);
    addBox(bench, 0.12, 0.5, 0.55, C.umber, 0.85, 0.25, 0.15);
    this.root.add(bench);

    const lampMat = new THREE.MeshBasicMaterial({ color: hexOf(C.paleYellow), toneMapped: false });
    for (const [x, z] of [
      [-11.6, 0.8],
      [-10.6, 10.6],
      [-6.8, 20.6],
      [11.8, 16.8],
    ] as Array<[number, number]>) {
      addBox(this.root, 0.1, 1.6, 0.1, C.ink, x, 0.8, z);
      addBox(this.root, 0.26, 0.05, 0.26, C.ink, x, 1.82, z, 0, false, false);
      addBoxMat(this.root, 0.2, 0.26, 0.2, lampMat, x, 1.66, z, false, false);
    }
  }

}
