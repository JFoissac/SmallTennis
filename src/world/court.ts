import * as THREE from 'three';
import { C, hexOf } from '../core/palette';
import {
  addBox,
  addBoxMat,
  addCylinder,
  addCylinderGeo,
  addMesh,
  addPlane,
  basic,
  GEO,
  lambert,
  makeCanvasTexture,
  segment,
  simpleRng,
} from './build';
import { bannerTexture, chainlinkTexture, courtTexture, grassTexture } from './textures';
import { batchStatic } from './batch';

export const COURT = {
  length: 23.77,
  doublesWidth: 10.97,
  singlesWidth: 8.23,
  serviceLine: 6.4,
  netPostX: 6.4,
  netCenterHeight: 0.914,
  netPostHeight: 1.07,
  fenceX: 8.6,
  fenceZ: 17.1,
  fenceHeight: 3.05,
  groundY: 0.16,
  lineWidth: 0.27,
} as const;

export type SurfaceType = 'clay' | 'grass' | 'hard';

export interface CourtMark {
  x: number;
  z: number;
  kind: 'in' | 'out';
  strength: number;
  age: number;
}

export function netHeightAt(x: number): number {
  const half = COURT.netPostX;
  const t = Math.min(1, Math.abs(x) / half);
  return COURT.netCenterHeight + (COURT.netPostHeight - COURT.netCenterHeight) * t * t;
}

export class Court {
  readonly group = new THREE.Group();
  readonly fenceGroup = new THREE.Group();
  readonly netGroup = new THREE.Group();
  readonly surfaceGroup = new THREE.Group();
  readonly linesGroup = new THREE.Group();
  readonly screenGroup = new THREE.Group();
  private surface: SurfaceType = 'clay';
  private clayGroup = new THREE.Group();
  private grassGroup = new THREE.Group();
  private hardGroup = new THREE.Group();
  private topBand!: THREE.Mesh;
  private netMesh!: THREE.LineSegments;
  private netRippleT = 10;
  private netRippleSide = 0;
  private marks!: THREE.InstancedMesh;
  private markCursor = 0;
  private readonly markMatrix = new THREE.Matrix4();
  private readonly markQuat = new THREE.Quaternion();
  private readonly markPosition = new THREE.Vector3();
  private readonly markScale = new THREE.Vector3();
  private readonly markColor = new THREE.Color();
  private markData: CourtMark[] = [];
  private grassWearCanvas!: HTMLCanvasElement;
  private grassWearTexture!: THREE.CanvasTexture;
  private grassWearMeshes: THREE.Mesh[] = [];
  private grassWearLevel = 0;
  private rand = simpleRng(11);

  constructor(parent: THREE.Object3D) {
    parent.add(this.group);
    this.group.add(this.surfaceGroup, this.linesGroup, this.netGroup, this.fenceGroup, this.screenGroup);
    this.buildSurface();
    this.buildLines();
    this.buildNet();
    this.buildFence();
    this.buildScreens();
    this.buildMarks();
    this.setSurface('clay', true);
  }

  get surfaceType(): SurfaceType {
    return this.surface;
  }

  private buildSurface(): void {
    const apronW = COURT.fenceX * 2 - 0.25;
    const apronD = COURT.fenceZ * 2 - 0.25;

    const clayMat = new THREE.MeshLambertMaterial({ map: courtTexture('clay'), flatShading: true });
    const clay = addPlane(this.clayGroup, apronW, apronD, clayMat, 0, COURT.groundY, 0);
    clay.receiveShadow = true;
    const clayEdge = addBox(this.clayGroup, apronW + 0.3, 0.16, apronD + 0.3, C.clayDark, 0, COURT.groundY - 0.09, 0);
    clayEdge.castShadow = false;

    const grassMat = new THREE.MeshLambertMaterial({ map: grassTexture(), color: hexOf(C.forest), flatShading: true });
    const grass = addPlane(this.grassGroup, apronW, apronD, grassMat, 0, COURT.groundY, 0);
    grass.receiveShadow = true;
    const mowedMat = new THREE.MeshLambertMaterial({ map: courtTexture('grass'), flatShading: true });
    const mowed = addPlane(this.grassGroup, 15.2, 28.2, mowedMat, 0, COURT.groundY + 0.002, 0);
    mowed.receiveShadow = true;

    const hardMat = new THREE.MeshLambertMaterial({ map: courtTexture('hard'), flatShading: true });
    const hardApron = addPlane(this.hardGroup, apronW, apronD, hardMat, 0, COURT.groundY, 0);
    hardApron.receiveShadow = true;
    const innerMat = new THREE.MeshLambertMaterial({ map: courtTexture('hard'), color: hexOf(C.hard), flatShading: true });
    const inner = addPlane(this.hardGroup, COURT.doublesWidth + 3.2, COURT.length + 3.2, innerMat, 0, COURT.groundY + 0.002, 0);
    inner.receiveShadow = true;
    const hardEdge = addBox(this.hardGroup, apronW + 0.3, 0.16, apronD + 0.3, C.hardDeep, 0, COURT.groundY - 0.09, 0);
    hardEdge.castShadow = false;

    const claySkirt = addBox(this.clayGroup, apronW + 0.3, 0.1, apronD + 0.3, C.clayDark, 0, COURT.groundY - 0.06, 0);
    claySkirt.castShadow = false;

    this.surfaceGroup.add(this.clayGroup, this.grassGroup, this.hardGroup);
  }

  private buildLines(): void {
    const G = COURT.groundY + 0.008;
    const white = new THREE.MeshBasicMaterial({ color: hexOf(C.paper) });
    const halfL = COURT.length / 2;
    const halfD = COURT.doublesWidth / 2;
    const halfS = COURT.singlesWidth / 2;
    const line = (w: number, d: number, x: number, z: number) =>
      addPlane(this.linesGroup, w, d, white, x, G, z);

    line(COURT.doublesWidth + COURT.lineWidth, COURT.lineWidth, 0, -halfL);
    line(COURT.doublesWidth + COURT.lineWidth, COURT.lineWidth, 0, halfL);
    line(COURT.lineWidth, COURT.length, -halfD, 0);
    line(COURT.lineWidth, COURT.length, halfD, 0);
    line(COURT.lineWidth, COURT.length, -halfS, 0);
    line(COURT.lineWidth, COURT.length, halfS, 0);
    line(COURT.singlesWidth, COURT.lineWidth, 0, -COURT.serviceLine);
    line(COURT.singlesWidth, COURT.lineWidth, 0, COURT.serviceLine);
    line(COURT.lineWidth, COURT.serviceLine * 2, 0, 0);
    line(COURT.lineWidth, 0.31, 0, -halfL + 0.155);
    line(COURT.lineWidth, 0.31, 0, halfL - 0.155);

    const netShadow = addPlane(this.linesGroup, COURT.netPostX * 2 - 0.2, 1.0, new THREE.MeshBasicMaterial({ color: hexOf(C.clayDark), transparent: true, opacity: 0.15, depthWrite: false }), 0, G + 0.001, 0.55);
    netShadow.rotation.y = 0;
  }

  private buildNet(): void {
    this.netGroup.position.y = COURT.groundY;
    const half = COURT.netPostX;
    for (const side of [-1, 1]) {
      const post = addCylinder(this.netGroup, 0.105, 1.07, C.mustard, side * half, 0.535, 0, 8);
      post.castShadow = true;
      addBox(this.netGroup, 0.2, 0.11, 0.2, C.paper, side * half, 1.12, 0);
      addBox(this.netGroup, 0.28, 0.06, 0.28, C.ink, side * half, 1.18, 0);
      addBox(this.netGroup, 0.1, 0.25, 0.1, C.ink, side * half, 0.76, 0.1);
      addBox(this.netGroup, 0.03, 1.06, 0.03, C.cream, side * half, 0.53, -0.11, 0, false, false);
      addBox(this.netGroup, 0.18, 0.06, 0.12, C.mustard, side * half, 0.68, 0.14);
    }

    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 32; i++) {
      const x = -half + (i / 32) * half * 2;
      points.push(new THREE.Vector3(x, netHeightAt(x), 0));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const bandGeo = new THREE.TubeGeometry(curve, 64, 0.038, 4, false);
    this.topBand = addMesh(this.netGroup, bandGeo, basic(C.paper), 0, 0, 0, true, false);
    this.topBand.castShadow = false;

    const cols = 28;
    const rows = 6;
    const verts: number[] = [];
    const uvs: number[] = [];
    const idx: number[] = [];
    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c <= cols; c++) {
        const x = -half + (c / cols) * half * 2;
        const bottom = 0.03;
        const top = netHeightAt(x) - 0.055;
        const y = bottom + (top - bottom) * (r / rows);
        verts.push(x, y, 0);
        uvs.push(c / cols, r / rows);
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const a = r * (cols + 1) + c;
        const b = a + 1;
        const d = a + cols + 1;
        const e = d + 1;
        idx.push(a, b, d, b, e, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    const gridTex = makeCanvasTexture(128, 64, (ctx) => {
      ctx.clearRect(0, 0, 128, 64);
      ctx.fillStyle = hexOf(C.cream);
      for (let x = 0; x < 128; x += 7) ctx.fillRect(x, 0, 1, 64);
      for (let y = 0; y < 64; y += 11) ctx.fillRect(0, y, 128, 1);
      ctx.fillStyle = hexOf(C.paper);
      ctx.fillRect(0, 62, 128, 2);
    });
    const haze = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ color: hexOf(C.forestDeep), transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide }),
    );
    haze.renderOrder = 1;
    this.netGroup.add(haze);
    const mat = new THREE.MeshBasicMaterial({
      map: gridTex,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.netMesh = new THREE.Mesh(geo, mat) as unknown as THREE.LineSegments;
    this.netMesh.renderOrder = 2;
    this.netGroup.add(this.netMesh);

    const shadowPlane = addMesh(
      this.netGroup,
      new THREE.BoxGeometry(half * 2, 0.96, 0.045),
      new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
      0,
      0.5,
      0,
      true,
      false,
    );
    shadowPlane.castShadow = true;

    addBox(this.netGroup, 0.12, 0.88, 0.018, C.paper, 0, 0.46, 0.035, 0, false, false);
    addBox(this.netGroup, 0.12, 0.88, 0.018, C.cream, 0, 0.46, -0.035, 0, false, false);
    addBox(this.netGroup, 0.05, 0.06, 1.1, C.paper, 0, 0.04, 0.55, 0, false, false);

    this.netGroup.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o !== this.topBand) {
        o.receiveShadow = true;
      }
    });
  }

  private buildFence(): void {
    const x = COURT.fenceX;
    const z = COURT.fenceZ;
    const h = COURT.fenceHeight;
    const linkTex = chainlinkTexture();
    const linkMat = new THREE.MeshLambertMaterial({
      map: linkTex,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
      color: hexOf(C.silver),
      flatShading: true,
    });
    linkMat.alphaTest = 0.2;

    const postMat = lambert(C.stone);
    const addPost = (px: number, pz: number) => {
      addCylinder(this.fenceGroup, 0.085, h, C.stone, px, h / 2, pz, 6);
      addBox(this.fenceGroup, 0.08, 0.08, 0.08, C.gunmetal, px, h + 0.03, pz, 0, false, false);
    };

    const rail = (w: number, d: number, px: number, pz: number) => {
      addBox(this.fenceGroup, w, 0.09, d, C.blueGrey, px, h - 0.03, pz, 0, false, false);
      addBox(this.fenceGroup, w, 0.07, d, C.blueGrey, px, 0.09, pz, 0, false, false);
    };

    const addLinkPanel = (w: number, px: number, pz: number, rotY: number, repeatX: number) => {
      const tex = linkTex.clone();
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(Math.max(4, Math.round(repeatX * 0.45)), Math.max(2, Math.round((w / 1.25) * 0.45)));
      const mat = linkMat.clone();
      mat.map = tex;
      const panel = addPlane(this.fenceGroup, w, h - 0.14, mat, px, (h - 0.14) / 2 + 0.08, pz, 0, rotY, 0);
      panel.rotation.x = 0;
      panel.receiveShadow = false;
      panel.renderOrder = 1;
    };

    for (const side of [-1, 1]) {
      for (let i = 0; i <= 7; i++) {
        addPost(side * x, -z + (i / 7) * z * 2);
      }
      for (let i = 0; i <= 5; i++) {
        addPost(-x + (i / 5) * x * 2, side * z);
      }
    }

    rail(x * 2, 0.06, 0, -z);
    rail(x * 2, 0.06, 0, z);
    rail(0.06, z * 2, -x, 0);
    rail(0.06, z * 2, x, 0);

    addLinkPanel(x * 2, 0, -z, 0, 26);
    addLinkPanel(x * 2, 0, z, 0, 26);
    addLinkPanel(25.7, -x, -4.15, Math.PI / 2, 20);
    addLinkPanel(6.7, -x, 13.7, Math.PI / 2, 6);
    addLinkPanel(z * 2, x, 0, Math.PI / 2, 26);

    addBox(this.fenceGroup, 0.08, 1.65, 0.08, C.paper, -x + 0.02, 0.83, 8.65, 0, false, false);
    addBox(this.fenceGroup, 0.08, 1.65, 0.08, C.paper, -x + 0.02, 0.83, 10.3, 0, false, false);
    const gate = new THREE.Group();
    gate.position.set(-x + 0.12, 0.82, 9.48);
    addBox(gate, 0.05, 1.55, 1.55, C.forestDeep, 0, 0, 0, 0, false, false);
    addBox(gate, 0.04, 1.2, 1.25, C.grass, 0.02, 0, 0, 0, false, false);
    gate.rotation.y = -0.75;
    this.fenceGroup.add(gate);
  }

  private buildScreens(): void {
    const banner = bannerTexture('LOVE ALL', { bg: C.forestDeep, fg: C.cream, accent: C.mustard, sub: 'TENNIS CLUB' });
    const screenMat = lambert(C.forestDeep);
    const halfW = 7.2;
    for (const side of [-1, 1]) {
      const z = side * (COURT.fenceZ - 0.18);
      const screen = addBoxMat(this.screenGroup, halfW * 2, 1.9, 0.04, screenMat, 0, 1.05, z, false, true);
      screen.castShadow = false;
      addBox(this.screenGroup, halfW * 2 + 0.12, 0.06, 0.06, C.paper, 0, 2.0, z, 0, false, false);
      const matOut = new THREE.MeshBasicMaterial({ map: banner, transparent: true, opacity: 0.98, side: THREE.FrontSide, toneMapped: false });
      const outside = addPlane(this.screenGroup, halfW * 1.75, 1.35, matOut, 0, 1.17, z + side * 0.028, 0, side > 0 ? 0 : Math.PI, 0);
      outside.rotation.x = 0;
      outside.receiveShadow = false;
      outside.renderOrder = 2;
      const matIn = new THREE.MeshBasicMaterial({ map: banner, transparent: true, opacity: 0.98, side: THREE.FrontSide, toneMapped: false });
      const inside = addPlane(this.screenGroup, halfW * 1.75, 1.35, matIn, 0, 1.17, z - side * 0.028, 0, side > 0 ? Math.PI : 0, 0);
      inside.rotation.x = 0;
      inside.receiveShadow = false;
      inside.renderOrder = 2;
    }
  }

  private buildMarks(): void {
    const geo = new THREE.CircleGeometry(0.5, 7);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    this.marks = new THREE.InstancedMesh(geo, mat, 56);
    this.marks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.marks.frustumCulled = false;
    this.marks.castShadow = false;
    this.marks.receiveShadow = false;
    this.marks.renderOrder = 1;
    this.markScale.set(0, 0, 0);
    this.markMatrix.compose(this.markPosition.set(0, -10, 0), this.markQuat, this.markScale);
    for (let i = 0; i < 56; i++) {
      this.marks.setMatrixAt(i, this.markMatrix);
      this.marks.setColorAt(i, this.markColor.set(hexOf(C.clayDark)));
    }
    this.marks.instanceMatrix.needsUpdate = true;
    if (this.marks.instanceColor) this.marks.instanceColor.needsUpdate = true;
    this.clayGroup.add(this.marks);

    this.grassWearCanvas = document.createElement('canvas');
    this.grassWearCanvas.width = 256;
    this.grassWearCanvas.height = 128;
    this.grassWearTexture = new THREE.CanvasTexture(this.grassWearCanvas);
    this.grassWearTexture.colorSpace = THREE.NoColorSpace;
    this.grassWearTexture.minFilter = THREE.NearestFilter;
    this.grassWearTexture.magFilter = THREE.NearestFilter;
    const wearMat = new THREE.MeshLambertMaterial({
      map: this.grassWearTexture,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    for (const side of [-1, 1]) {
      const wear = addPlane(this.grassGroup, COURT.doublesWidth + 2.5, 4.2, wearMat, 0, COURT.groundY + 0.006, side * 14.0);
      wear.receiveShadow = true;
      wear.renderOrder = 1;
      this.grassWearMeshes.push(wear);
    }
  }

  optimizeStatic(): void {
    this.netGroup.userData.noBatch = true;
    for (const wear of this.grassWearMeshes) wear.userData.noBatch = true;
    batchStatic(this.clayGroup, 'clay');
    batchStatic(this.grassGroup, 'grass');
    batchStatic(this.hardGroup, 'hard');
    batchStatic(this.linesGroup, 'court-lines');
    batchStatic(this.fenceGroup, 'fence');
    batchStatic(this.screenGroup, 'windscreens');
  }

  setSurface(surface: SurfaceType, immediate = false): void {
    this.surface = surface;
    this.clayGroup.visible = surface === 'clay';
    this.grassGroup.visible = surface === 'grass';
    this.hardGroup.visible = surface === 'hard';
    if (immediate) {
      this.grassWearMeshes.forEach((m) => (m.visible = surface === 'grass'));
    }
  }

  netHeight(x: number): number {
    return netHeightAt(x) + COURT.groundY;
  }

  registerBounce(x: number, z: number, strength = 1, inBounds = true): CourtMark {
    const mark: CourtMark = { x, z, kind: inBounds ? 'in' : 'out', strength, age: 0 };
    this.markData.push(mark);
    if (this.markData.length > 240) this.markData.shift();

    if (this.surface === 'clay') {
      const index = this.markCursor % 56;
      this.markCursor++;
      const s = (0.08 + strength * 0.09) * (0.7 + this.rand() * 0.6);
      this.markPosition.set(x, COURT.groundY + 0.012 + (index % 8) * 0.00005, z);
      this.markScale.set(s * (1.4 + this.rand() * 0.6), 1, s);
      this.markQuat.identity();
      this.markMatrix.compose(this.markPosition, this.markQuat, this.markScale);
      this.marks.setMatrixAt(index, this.markMatrix);
      this.markColor.set(hexOf(this.rand() > 0.45 ? C.clayDark : C.clayPale));
      this.marks.setColorAt(index, this.markColor);
      this.marks.instanceMatrix.needsUpdate = true;
      if (this.marks.instanceColor) this.marks.instanceColor.needsUpdate = true;
    }

    if (this.surface === 'grass' && Math.abs(z) > 9.6) {
      this.addGrassWear(x, z, strength);
    }
    return mark;
  }

  private addGrassWear(x: number, z: number, strength: number): void {
    const ctx = this.grassWearCanvas.getContext('2d')!;
    const px = Math.round(((x + (COURT.doublesWidth + 2.5) / 2) / (COURT.doublesWidth + 2.5)) * 256);
    const local = z > 0 ? z - 14.0 : z + 14.0;
    const py = Math.round(((local + 2.1) / 4.2) * 128);
    ctx.fillStyle = this.rand() > 0.5 ? 'rgba(116,74,50,0.3)' : 'rgba(58,45,18,0.22)';
    const w = 3 + this.rand() * 8;
    const h = 1 + this.rand() * 4;
    ctx.fillRect(px - w / 2, py - h / 2, w, h);
    this.grassWearTexture.needsUpdate = true;
    this.grassWearLevel = Math.min(1, this.grassWearLevel + 0.012 * strength);
    this.grassWearMeshes.forEach((m) => {
      const mat = m.material as THREE.MeshLambertMaterial;
      mat.opacity = 0.45 + this.grassWearLevel * 0.5;
    });
  }

  clearClayMarks(): void {
    this.markData = [];
    this.markCursor = 0;
    this.markScale.set(0, 0, 0);
    this.markMatrix.compose(this.markPosition.set(0, -10, 0), this.markQuat.identity(), this.markScale);
    for (let i = 0; i < 56; i++) this.marks.setMatrixAt(i, this.markMatrix);
    this.marks.instanceMatrix.needsUpdate = true;
  }

  replaceGrassWear(): void {
    const ctx = this.grassWearCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, this.grassWearCanvas.width, this.grassWearCanvas.height);
    this.grassWearTexture.needsUpdate = true;
    this.grassWearLevel = 0;
  }

  lastMarks(): CourtMark[] {
    return this.markData.slice(-12);
  }

  triggerNetRipple(side: number, strength = 1): void {
    this.netRippleT = 0;
    this.netRippleSide = Math.sign(side) * Math.min(1.5, strength);
  }

  update(dt: number): void {
    if (this.netRippleT < 1) {
      this.netRippleT = Math.min(1, this.netRippleT + dt * 3.6);
      const amp = (1 - this.netRippleT) * 0.06 * this.netRippleSide;
      this.netMesh.position.x = Math.sin(this.netRippleT * 34) * amp;
      this.topBand.position.x = Math.sin(this.netRippleT * 28) * amp * 0.5;
    } else {
      this.netMesh.position.x *= 0.8;
      this.topBand.position.x *= 0.8;
    }
    for (const mark of this.markData) mark.age += dt;
  }

  puddleSpots(): THREE.Vector3[] {
    return [
      new THREE.Vector3(-5.4, COURT.groundY + 0.015, 8.8),
      new THREE.Vector3(4.7, COURT.groundY + 0.015, -6.2),
      new THREE.Vector3(1.5, COURT.groundY + 0.015, 13.8),
      new THREE.Vector3(-7.1, COURT.groundY + 0.015, -12.8),
      new THREE.Vector3(6.4, COURT.groundY + 0.015, 1.6),
      new THREE.Vector3(-2.8, COURT.groundY + 0.015, -2.2),
    ];
  }
}
