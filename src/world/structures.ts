import * as THREE from 'three';
import { C, hexOf } from '../core/palette';
import {
  addBox,
  addBoxMat,
  addCone,
  addCylinder,
  addCylinderGeo,
  addMesh,
  addPlane,
  addSphere,
  basic,
  circleTexture,
  GEO,
  lambert,
  makeCanvasTexture,
  segment,
  simpleRng,
} from './build';
import { addStringLight, SeatedPerson, StandingPerson, type PersonLook } from './models';
import { batchStatic } from './batch';
import { bannerTexture, createClockTexture, drawPixelText, flagTexture, grungeBannerTexture, pixelTextWidth, roofTexture } from './textures';

export class Flag {
  readonly root = new THREE.Group();
  private mesh: THREE.Mesh;
  private basePositions: Float32Array;
  private time = 0;

  constructor(parent: THREE.Object3D, x: number, y: number, z: number, scale = 1) {
    this.root.position.set(x, y, z);
    this.root.scale.setScalar(scale);
    parent.add(this.root);
    addCylinder(this.root, 0.045, 7.2, C.cream, 0, 3.6, 0, 6);
    addBox(this.root, 0.16, 0.08, 0.16, C.mustard, 0, 7.18, 0);
    const geo = new THREE.PlaneGeometry(2.2, 1.35, 9, 6);
    geo.translate(1.1, 0, 0);
    const mat = new THREE.MeshLambertMaterial({ map: flagTexture(), side: THREE.DoubleSide, flatShading: true });
    this.mesh = addMesh(this.root, geo, mat, 0.02, 5.9, 0, false, false);
    this.mesh.rotation.y = 0.03;
    this.basePositions = new Float32Array(geo.attributes.position.array as Float32Array);
  }

  update(dt: number): void {
    this.time += dt;
    const pos = this.mesh.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      const x = this.basePositions[i];
      const y = this.basePositions[i + 1];
      const wave = Math.sin(x * 2.5 - this.time * 4.2 + y * 0.8) * 0.11 * (x / 2.2);
      arr[i + 2] = wave + Math.sin(x * 5.1 - this.time * 6.3) * 0.03 * (x / 2.2);
    }
    pos.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
  }
}

export class Clubhouse {
  readonly root = new THREE.Group();
  readonly clockTexture = createClockTexture();
  readonly clockFace: THREE.Mesh;
  readonly terrace = new THREE.Group();
  private readonly windowMaterial = new THREE.MeshBasicMaterial({ color: hexOf(C.hardDeep), toneMapped: false });
  private windows: THREE.MeshBasicMaterial[] = [this.windowMaterial];
  private smokePuffs: THREE.Mesh[] = [];
  private smokeT = 0;
  private lamp: THREE.PointLight;
  private stringLights: THREE.Mesh[] = [];
  private lastClockSecond = -1;
  private rand = simpleRng(31);

  constructor(parent: THREE.Object3D) {
    parent.add(this.root);
    this.root.position.set(-14.1, 0, -5.6);
    this.buildHouse();
    this.buildTerrace();
    this.stringLights = addStringLight(
      this.root,
      new THREE.Vector3(-4.4, 3.4, 2.2),
      new THREE.Vector3(-8.9, 2.6, 7.8),
      11,
    );
    this.stringLights.forEach((b) => (b.visible = false));

    this.lamp = new THREE.PointLight(0xffc979, 0, 17, 1.3);
    this.lamp.position.set(-8.9, 3.3, 1.8);
    this.root.add(this.lamp);

    this.clockFace = addMesh(
      this.root,
      new THREE.CircleGeometry(0.92, 24),
      new THREE.MeshBasicMaterial({ map: this.clockTexture.texture, toneMapped: false }),
      3.81,
      4.78,
      0,
      false,
      false,
    );
    this.clockFace.rotation.y = Math.PI / 2;
    const rim = addMesh(this.root, new THREE.CircleGeometry(1.02, 24), basic(C.ink), 3.78, 4.78, 0, false, false);
    rim.rotation.y = Math.PI / 2;
    this.root.add(rim);
    this.clockFace.renderOrder = 2;
  }

  private buildHouse(): void {
    const stone = lambert(C.stone);
    const wall = lambert(C.bone);
    const trim = lambert(C.leather);
    addBox(this.root, 7.4, 0.5, 9.2, C.stone, 0, 0.25, 0);
    const body = addBox(this.root, 7.2, 3.8, 9.0, C.bone, 0, 2.25, 0);
    body.castShadow = true;
    addBox(this.root, 7.25, 0.25, 9.05, C.cream, 0, 4.02, 0, 0, false, false);
    addBox(this.root, 7.3, 0.18, 9.1, C.leather, 0, 0.58, 0, 0, false, false);

    const roofMat = new THREE.MeshLambertMaterial({ map: roofTexture(), flatShading: true });
    const slope = Math.hypot(4.9, 2.6);
    const angle = Math.atan2(2.6, 4.9);
    for (const side of [-1, 1]) {
      const roof = addBoxMat(this.root, 7.9, 0.16, slope, roofMat, 0, 5.23, side * 2.45, false, true);
      roof.rotation.x = side * angle;
      addBox(this.root, 7.85, 0.13, 0.18, C.roofDark, 0, 6.5, 0, 0, false, false);
    }

    const gableShape = new THREE.Shape();
    gableShape.moveTo(-4.5, 0);
    gableShape.lineTo(4.5, 0);
    gableShape.lineTo(0, 2.62);
    gableShape.closePath();
    const gableGeo = new THREE.ExtrudeGeometry(gableShape, { depth: 0.16, bevelEnabled: false });
    const gable = new THREE.Mesh(gableGeo, wall);
    gable.rotation.y = Math.PI / 2;
    gable.position.set(3.56, 4.04, 0);
    gable.castShadow = true;
    gable.receiveShadow = true;
    this.root.add(gable);

    addBox(this.root, 0.32, 1.25, 0.32, C.brickDark, -2.2, 6.5, 2.2);
    addBox(this.root, 0.7, 0.18, 0.7, C.ink, -2.2, 7.15, 2.2);
    addBox(this.root, 0.55, 0.2, 0.55, C.stone, -2.2, 7.25, 2.2);

    const tower = new THREE.Group();
    tower.position.set(0, 6.55, 0);
    this.root.add(tower);
    addBox(tower, 1.55, 1.35, 1.55, C.bone, 0, 0.64, 0);
    addBox(tower, 1.68, 0.12, 1.68, C.leather, 0, 1.32, 0);
    const pyramid = new THREE.Mesh(new THREE.ConeGeometry(1.16, 1.15, 4), lambert(C.roof));
    pyramid.position.y = 1.94;
    pyramid.rotation.y = Math.PI / 4;
    pyramid.castShadow = true;
    tower.add(pyramid);
    addBox(tower, 0.06, 0.62, 0.06, C.mustard, 0, 2.66, 0);
    addBox(tower, 0.4, 0.05, 0.05, C.mustard, 0.1, 2.88, 0);
    const faceMat = new THREE.MeshBasicMaterial({ map: this.clockTexture.texture, toneMapped: false });
    const rimEast = addMesh(tower, new THREE.CircleGeometry(0.6, 20), basic(C.ink), 0.79, 0.68, 0, false, false);
    rimEast.rotation.y = Math.PI / 2;
    const clockEast = addMesh(tower, new THREE.CircleGeometry(0.52, 20), faceMat, 0.803, 0.68, 0, false, false);
    clockEast.rotation.y = Math.PI / 2;
    clockEast.renderOrder = 2;
    const rimSouth = addMesh(tower, new THREE.CircleGeometry(0.6, 20), basic(C.ink), 0, 0.68, 0.79, false, false);
    const clockSouth = addMesh(tower, new THREE.CircleGeometry(0.52, 20), faceMat, 0, 0.68, 0.803, false, false);
    clockSouth.renderOrder = 2;
    addBox(tower, 1.7, 0.06, 1.7, C.cream, 0, -0.02, 0, 0, false, false);

    const door = addBox(this.root, 0.12, 2.0, 1.1, C.brown, 3.64, 1.55, 2.1);
    addBox(this.root, 0.08, 1.2, 0.48, C.leather, 3.72, 1.55, 2.1);
    addBox(this.root, 0.08, 1.2, 0.48, C.leather, 3.72, 1.55, 2.1);
    addBox(this.root, 0.16, 0.16, 1.6, C.cream, 3.7, 2.72, 2.1, 0, false, false);
    addBox(this.root, 0.7, 0.16, 2.0, C.stone, 3.78, 0.64, 2.1, 0, false, false);

    for (const side of [-1, 1]) {
      this.addWindowX(3.64, 2.15, side * 1.2, 1.1, 1.0);
    }
    this.addWindowZ(1.9, 2.25, 4.53, 1.1, 1.1);
    this.addWindowZ(-2.1, 2.25, 4.53, 1.1, 1.1);
    this.addWindowX(-3.64, 2.15, 1.7, 1.0, 1.0);

    const signTex = bannerTexture('LOVE ALL', { bg: C.cream, fg: C.forestDeep, accent: C.clay, width: 512, height: 112, sub: 'TENNIS CLUB' });
    const signMat = new THREE.MeshBasicMaterial({ map: signTex, toneMapped: false });
    addBoxMat(this.root, 0.06, 1.0, 4.8, signMat, 3.71, 3.48, 0.0, false, false);
    addBox(this.root, 0.12, 1.12, 4.95, C.leather, 3.66, 3.48, 0, 0, false, false);

    this.buildChimneySmoke();
  }

  private addWindowX(x: number, y: number, z: number, w: number, h: number): THREE.Mesh {
    const frame = addBox(this.root, 0.08, h + 0.18, w + 0.18, C.leather, x, y, z, 0, false, false);
    const glass = addMesh(this.root, GEO.plane, this.windowMaterial, x + 0.05, y, z, false, false);
    glass.scale.set(w, h, 1);
    glass.rotation.y = Math.PI / 2;
    addBox(this.root, 0.06, 0.05, w, C.leather, x + 0.08, y, z, 0, false, false);
    addBox(this.root, 0.06, h, 0.04, C.leather, x + 0.08, y, z, 0, false, false);
    return frame;
  }

  private addWindowZ(x: number, y: number, z: number, w: number, h: number): THREE.Mesh {
    const frame = addBox(this.root, w + 0.18, h + 0.18, 0.08, C.leather, x, y, z, 0, false, false);
    const glass = addMesh(this.root, GEO.plane, this.windowMaterial, x, y, z + 0.05, false, false);
    glass.scale.set(w, h, 1);
    addBox(this.root, w, 0.05, 0.06, C.leather, x, y, z + 0.08, 0, false, false);
    addBox(this.root, 0.04, h, 0.06, C.leather, x, y, z + 0.08, 0, false, false);
    return frame;
  }

  private buildTerrace(): void {
    const deck = new THREE.Group();
    deck.position.set(4.2, 0.16, 2.0);
    this.root.add(deck);
    addBox(deck, 3.2, 0.18, 7.0, C.leather, 0, 0, 0, 0, false, true);
    addBox(deck, 3.1, 0.06, 6.9, C.tan, 0, 0.1, 0, 0, false, true);
    for (const z of [-3.4, 0, 3.4]) {
      addBox(deck, 0.08, 0.9, 0.08, C.cream, 1.55, 0.45, z, 0, false, false);
      addBox(deck, 0.08, 0.9, 0.08, C.cream, -1.55, 0.45, z, 0, false, false);
    }
    addBox(deck, 0.08, 0.06, 6.9, C.cream, 1.55, 0.88, 0, 0, false, false);
    addBox(deck, 0.08, 0.06, 6.9, C.cream, -1.55, 0.88, 0, 0, false, false);

    for (const [x, z] of [
      [-0.7, -2.3],
      [0.7, 0],
      [-0.7, 2.3],
    ] as Array<[number, number]>) {
      addCylinder(deck, 0.035, 1.5, C.brown, x, 0.83, z, 6);
      addCylinder(deck, 1.0, 0.05, C.paper, x, 2.3, z, 12);
      addCone(deck, 1.15, 0.42, C.clay, x, 2.14, z, 8);
      addCylinder(deck, 0.52, 0.12, C.leather, x, 0.78, z, 8);
      addCylinder(deck, 0.06, 0.72, C.umber, x, 0.4, z, 6);
      for (const a of [0, 2.1, 4.2]) {
        addBox(deck, 0.28, 0.06, 0.28, C.forest, x + Math.cos(a) * 0.9, 0.55, z + Math.sin(a) * 0.9, a, false, false);
        addBox(deck, 0.3, 0.5, 0.06, C.forest, x + Math.cos(a) * 0.9, 0.32, z + Math.sin(a) * 0.9, a, false, false);
      }
    }

    const railMat = lambert(C.cream);
    for (const z of [-3.5, 3.5]) {
      addBox(deck, 3.2, 0.08, 0.08, C.cream, 0, 0.9, z, 0, false, false);
      for (const x of [-1.5, -0.5, 0.5, 1.5]) addBox(deck, 0.06, 0.8, 0.06, C.cream, x, 0.52, z, 0, false, false);
    }

    const menu = new THREE.MeshBasicMaterial({
      map: makeCanvasTexture(256, 128, (ctx) => {
        ctx.fillStyle = hexOf(C.forestDeep);
        ctx.fillRect(0, 0, 256, 128);
        drawPixelText(ctx, 'TEA', 20, 18, 3, hexOf(C.cream));
        drawPixelText(ctx, 'AND', 20, 44, 3, hexOf(C.cream));
        drawPixelText(ctx, 'CAKE', 20, 70, 3, hexOf(C.mustard));
        drawPixelText(ctx, 'TODAY', 20, 98, 2, hexOf(C.cream));
      }),
      toneMapped: false,
    });
    addBoxMat(this.root, 0.06, 0.8, 1.1, menu, -0.2, 1.3, 7.2, false, false);
  }

  private buildChimneySmoke(): void {
    const mat = new THREE.MeshBasicMaterial({ color: hexOf(C.silver), transparent: true, opacity: 0.25, depthWrite: false });
    for (let i = 0; i < 5; i++) {
      const puff = addMesh(this.root, GEO.ico, mat.clone(), -2.2, 7.4, 2.2, false, false);
      puff.scale.setScalar(0.2 + i * 0.1);
      this.smokePuffs.push(puff);
    }
  }

  optimizeStatic(): void {
    this.clockFace.userData.noBatch = true;
    for (const puff of this.smokePuffs) puff.userData.noBatch = true;
    for (const bulb of this.stringLights) bulb.userData.noBatch = true;
    batchStatic(this.root, 'clubhouse');
  }

  setNight(night: number, dusk: number): void {
    const dayColor = new THREE.Color(hexOf(C.hardDeep));
    const duskColor = new THREE.Color(hexOf(C.ochre));
    const nightColor = new THREE.Color(hexOf(C.paleYellow));
    const c = dayColor.clone().lerp(duskColor, Math.min(1, dusk * 0.9)).lerp(nightColor, night);
    for (const mat of this.windows) mat.color.copy(c);
    this.lamp.intensity = night * 18;
    this.stringLights.forEach((b) => (b.visible = night > 0.2));
  }

  update(dt: number, elapsed: number): void {
    const now = new Date();
    if (now.getSeconds() !== this.lastClockSecond) {
      this.lastClockSecond = now.getSeconds();
      this.clockTexture.redraw(now);
    }
    this.smokeT += dt;
    this.smokePuffs.forEach((puff, i) => {
      const t = (this.smokeT * 0.15 + i * 0.2) % 1;
      puff.position.y = 7.35 + t * 2.6;
      puff.position.x = -2.2 + Math.sin(t * 4 + i) * 0.25 + t * 0.5;
      puff.position.z = 2.2 + Math.cos(t * 3 + i) * 0.2;
      const s = 0.2 + t * 0.5;
      puff.scale.setScalar(s);
      (puff.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.18;
    });
  }
}

export class Stand {
  readonly root = new THREE.Group();
  readonly people: SeatedPerson[] = [];
  private look = new THREE.Vector3();
  private clap = 0;
  private maxClap = 0;
  private rand = simpleRng(88);
  private attendanceTarget = 0.82;
  private readonly presence: number[] = [];
  private readonly homes: THREE.Vector3[] = [];
  private readonly exitDir: number[] = [];
  private readonly seatThreshold: number[] = [];
  private readonly hideMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  private armInstances: THREE.InstancedMesh | null = null;
  private standInverse = new THREE.Matrix4();
  private readonly armMatrix = new THREE.Matrix4();
  private readonly armOffset = new THREE.Matrix4().makeTranslation(0, -0.18, 0);

  constructor(parent: THREE.Object3D) {
    parent.add(this.root);
    this.root.position.set(0, 0, -20.2);
    this.build();
  }

  private build(): void {
    const width = 10.8;
    addBox(this.root, width, 0.18, 4.2, C.stone, 0, 0.09, 0, 0, false, true);
    for (let row = 0; row < 3; row++) {
      const z = -1.45 + row * 1.25;
      const y = 0.3 + row * 0.6;
      addBox(this.root, width, 0.34, 1.25, row % 2 === 0 ? C.brown : C.leather, 0, y, z, 0, false, true);
      addBox(this.root, width, 0.08, 1.15, C.tan, 0, y + 0.18, z + 0.01, 0, false, false);
      addBox(this.root, width, 0.5, 0.08, C.umber, 0, y + 0.25, z - 0.65, 0, false, false);
      for (let s = 0; s < 9; s++) {
        const x = -4.6 + s * 1.15;
        addBox(this.root, 0.9, 0.06, 0.7, C.forest, x, y + 0.25, z + 0.1, 0, false, false);
      }
    }

    const back = addBox(this.root, width + 0.4, 1.15, 0.14, C.forestDeep, 0, 1.15, -2.2, 0, false, false);
    const bannerMat = new THREE.MeshBasicMaterial({
      map: bannerTexture('LOVE ALL', { bg: C.forestDeep, fg: C.cream, accent: C.mustard, width: 512, height: 96 }),
      toneMapped: false,
    });
    addBoxMat(this.root, 7.4, 0.8, 0.05, bannerMat, 0, 1.55, -2.12, false, false);
    for (const x of [-4.9, -1.7, 1.7, 4.9]) {
      addBox(this.root, 0.08, 1.1, 0.08, C.cream, x, 2.2, 1.75);
    }
    addBox(this.root, width, 0.08, 0.08, C.cream, 0, 2.72, 1.75, 0, false, false);
    for (const x of [-5.2, 5.2]) {
      addBox(this.root, 0.1, 2.7, 0.1, C.cream, x, 1.4, 1.75);
    }

    const shirtColors = [C.cream, C.clay, C.teal, C.mustard, C.rose, C.bone, C.forest, C.plum];
    const skinColors = [C.skinDark, C.skinMid, C.skinLight];
    for (let row = 0; row < 3; row++) {
      const z = -1.45 + row * 1.25;
      const y = 0.02 + row * 0.6;
      for (let s = 0; s < 8; s++) {
        if (this.rand() > 0.92) continue;
        const look: PersonLook = {
          shirt: shirtColors[Math.floor(this.rand() * shirtColors.length)],
          shorts: this.rand() > 0.5 ? C.slate : C.umber,
          skin: skinColors[Math.floor(this.rand() * skinColors.length)],
          hair: this.rand() > 0.4 ? C.darkBrown : C.ink,
          cap: this.rand() > 0.65 ? C.cream : null,
          accent: this.rand() > 0.7 ? C.mustard : C.clay,
        };
        const person = new SeatedPerson(look, 0.85 + this.rand() * 0.15);
        person.root.position.set(-4.35 + s * 1.25 + (this.rand() - 0.5) * 0.2, y, z + 0.08);
        this.root.add(person.root);
        this.people.push(person);
        this.homes.push(person.root.position.clone());
        this.presence.push(1);
        this.exitDir.push(this.rand() > 0.5 ? 1 : -1);
        this.seatThreshold.push(0.06 + this.rand() * 0.88);
      }
    }

    for (const x of [-5.5, 5.5]) {
      addBox(this.root, 0.1, 2.5, 0.1, C.cream, x, 1.25, 1.6);
      addBox(this.root, 0.1, 0.1, 2.1, C.cream, x, 2.48, 0.7);
    }

    const armGeometry = new THREE.BoxGeometry(0.1, 0.36, 0.11);
    const armMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.armInstances = new THREE.InstancedMesh(armGeometry, armMaterial, this.people.length * 2);
    this.armInstances.castShadow = false;
    this.armInstances.receiveShadow = true;
    this.armInstances.frustumCulled = false;
    const armColor = new THREE.Color();
    for (let i = 0; i < this.people.length; i++) {
      armColor.set(hexOf(this.people[i].skinColor));
      this.armInstances.setColorAt(i * 2, armColor);
      this.armInstances.setColorAt(i * 2 + 1, armColor);
    }
    if (this.armInstances.instanceColor) this.armInstances.instanceColor.needsUpdate = true;
    this.root.add(this.armInstances);
    this.root.updateMatrixWorld(true);
    this.standInverse.copy(this.root.matrixWorld).invert();
    this.updateArms();
  }

  cheer(strength = 1): void {
    this.maxClap = Math.min(1.4, this.maxClap + strength);
    this.clap = Math.min(1.3, this.clap + strength);
  }

  /** Target share of the stand that should be seated, 0..1. */
  setAttendance(target: number): void {
    this.attendanceTarget = Math.max(0, Math.min(1, target));
  }

  /** Seated spectators right now, for evidence and HUD-free debugging. */
  get presentCount(): number {
    let count = 0;
    for (const presence of this.presence) if (presence > 0.5) count++;
    return count;
  }

  get capacity(): number {
    return this.people.length;
  }

  get attendanceGoal(): number {
    return this.attendanceTarget;
  }

  setBall(pos: THREE.Vector3): void {
    this.look.copy(pos);
  }

  private updateArms(): void {
    if (!this.armInstances) return;
    for (let i = 0; i < this.people.length; i++) {
      const person = this.people[i];
      if ((this.presence[i] ?? 1) <= 0.02) {
        this.armInstances.setMatrixAt(i * 2, this.hideMatrix);
        this.armInstances.setMatrixAt(i * 2 + 1, this.hideMatrix);
        continue;
      }
      person.armL.updateWorldMatrix(true, false);
      person.armR.updateWorldMatrix(true, false);
      this.armMatrix.multiplyMatrices(this.standInverse, person.armL.matrixWorld).multiply(this.armOffset);
      this.armInstances.setMatrixAt(i * 2, this.armMatrix);
      this.armMatrix.multiplyMatrices(this.standInverse, person.armR.matrixWorld).multiply(this.armOffset);
      this.armInstances.setMatrixAt(i * 2 + 1, this.armMatrix);
    }
    this.armInstances.instanceMatrix.needsUpdate = true;
  }

  update(dt: number): void {
    this.clap = Math.max(0, this.clap - dt * 0.28);
    const target = this.attendanceTarget;
    for (let i = 0; i < this.people.length; i++) {
      const person = this.people[i];
      const current = this.presence[i] ?? 1;
      const goal = target >= (this.seatThreshold[i] ?? 0.5) ? 1 : 0;
      const rate = goal > current ? 0.7 : 1.25;
      const next = current + (goal - current) * Math.min(1, dt * rate);
      this.presence[i] = next;
      const home = this.homes[i];
      const slide = (1 - next) * 4.6 * this.exitDir[i];
      person.root.position.set(home.x + slide, home.y, home.z + (1 - next) * 1.1);
      person.root.visible = next > 0.02;
      const clap = Math.max(0, Math.min(1, this.clap - (i % 7) * 0.05)) * next;
      person.update(dt, clap, this.look);
    }
    this.updateArms();
  }
}

export class GroundsShed {
  readonly root = new THREE.Group();
  constructor(parent: THREE.Object3D) {
    parent.add(this.root);
    this.root.position.set(14.0, 0, -10.6);
    addBox(this.root, 4.4, 0.25, 3.4, C.stone, 0, 0.13, 0, 0, false, true);
    addBox(this.root, 4.2, 2.4, 3.2, C.forest, 0, 1.35, 0, 0, true, true);
    addBox(this.root, 0.1, 2.0, 0.9, C.leather, 2.12, 1.2, 0.2, 0, false, false);
    const roofMat = new THREE.MeshLambertMaterial({ map: roofTexture(), color: hexOf(C.gunmetal), flatShading: true });
    const roofA = addBoxMat(this.root, 4.8, 0.1, 2.1, roofMat, 0, 2.72, -0.86, false, false);
    roofA.rotation.x = -0.48;
    const roofB = addBoxMat(this.root, 4.8, 0.1, 2.1, roofMat, 0, 2.72, 0.86, false, false);
    roofB.rotation.x = 0.48;
    addBox(this.root, 0.1, 0.1, 3.6, C.ink, 2.12, 1.98, 0, 0, false, false);

    addBox(this.root, 0.1, 1.1, 0.8, C.cream, -0.3, 1.7, 1.62, 0, false, false);
    const sign = new THREE.MeshBasicMaterial({
      map: makeCanvasTexture(256, 96, (ctx) => {
        ctx.fillStyle = hexOf(C.cream);
        ctx.fillRect(0, 0, 256, 96);
        ctx.fillStyle = hexOf(C.forestDeep);
        ctx.fillRect(0, 0, 256, 5);
        drawPixelText(ctx, 'GROUNDS', 25, 26, 3, hexOf(C.forestDeep));
      }),
      toneMapped: false,
    });
    addBoxMat(this.root, 1.7, 0.55, 0.04, sign, 1.5, 1.9, 1.62, false, false);

    addCylinder(this.root, 0.32, 0.7, C.umber, -2.45, 0.45, 0.8, 8);
    addCylinder(this.root, 0.3, 0.55, C.leather, -2.4, 0.38, -0.1, 8);
    for (let i = 0; i < 4; i++) {
      addBox(this.root, 0.8, 0.18, 0.35, C.sand, 2.6 + (i % 2) * 0.45, 0.12 + i * 0.17, 1.0 - Math.floor(i / 2) * 0.42, 0, false, false);
    }
    addBox(this.root, 0.7, 0.5, 0.7, C.hardDark, -1.7, 0.25, 1.7, 0.3, false, false);
    addBox(this.root, 0.5, 0.2, 0.5, C.teal, -1.7, 0.55, 1.65, 0.3, false, false);
  }
}

export interface UmpireChair {
  root: THREE.Group;
  seat: THREE.Vector3;
  base: THREE.Vector3;
  look: THREE.Vector3;
}

export class CourtFurniture {
  readonly root = new THREE.Group();
  readonly umpire: UmpireChair;
  readonly playerChairs: Array<{ root: THREE.Group; position: THREE.Vector3; sit: THREE.Vector3 }> = [];
  readonly ballKidSpots: THREE.Vector3[] = [];
  readonly ballCart: THREE.Group;

  constructor(parent: THREE.Object3D) {
    parent.add(this.root);
    this.umpire = this.buildUmpireChair(-7.55, 0, 0.1);
    this.root.add(this.umpire.root);
    this.playerChairs.push(this.buildPlayerChair(-7.45, 5.1, Math.PI / 2));
    this.playerChairs.push(this.buildPlayerChair(-7.45, -5.1, Math.PI / 2));
    this.ballKidSpots.push(new THREE.Vector3(6.9, 0.16, 1.6));
    this.ballKidSpots.push(new THREE.Vector3(6.9, 0.16, -1.6));
    this.ballKidSpots.push(new THREE.Vector3(6.9, 0.16, 14.8));
    this.ballKidSpots.push(new THREE.Vector3(6.9, 0.16, -14.8));
    this.ballCart = new THREE.Group();
    this.ballCart.position.set(-7.1, 0.16, 8.3);
    addBox(this.ballCart, 0.9, 0.55, 0.55, C.forest, 0, 0.4, 0);
    addCylinder(this.ballCart, 0.18, 0.08, C.ink, -0.35, 0.2, 0.2, 8);
    addCylinder(this.ballCart, 0.18, 0.08, C.ink, 0.35, 0.2, 0.2, 8);
    addBox(this.ballCart, 0.95, 0.06, 0.6, C.cream, 0, 0.7, 0);
    for (let i = 0; i < 8; i++) {
      addSphere(this.ballCart, 0.06, C.yellow, -0.32 + (i % 4) * 0.21, 0.8 + Math.floor(i / 4) * 0.1, 0.1, 'ico');
    }
    this.root.add(this.ballCart);
  }

  private buildUmpireChair(x: number, z: number, rotY: number): UmpireChair {
    const root = new THREE.Group();
    root.position.set(x, 0, z);
    root.rotation.y = rotY;
    this.root.add(root);
    for (const [lx, lz] of [
      [-0.6, -0.55],
      [0.6, -0.55],
      [-0.6, 0.55],
      [0.6, 0.55],
    ] as Array<[number, number]>) {
      addBox(root, 0.1, 2.25, 0.1, C.ink, lx, 1.13, lz);
    }
    addBox(root, 1.45, 0.16, 1.3, C.forest, 0, 2.25, 0);
    addBox(root, 1.4, 0.25, 0.18, C.cream, 0, 2.45, -0.58);
    addBox(root, 1.35, 0.7, 1.05, C.forestDeep, 0, 2.48, 0, 0, false, false);
    addBox(root, 0.9, 0.55, 0.55, C.forest, 0, 2.65, 0, 0, false, false);
    addBox(root, 0.06, 0.8, 0.06, C.cream, -0.68, 2.75, 0.6);
    addBox(root, 0.06, 0.8, 0.06, C.cream, 0.68, 2.75, 0.6);
    addBox(root, 1.4, 0.06, 0.06, C.cream, 0, 3.15, 0.6);
    addBox(root, 0.12, 2.5, 0.12, C.paper, 0, 3.55, 0);
    addCone(root, 1.7, 0.6, C.clay, 0, 4.95, 0, 8);
    addCylinder(root, 1.7, 0.06, C.paper, 0, 5.22, 0, 12);
    addBox(root, 0.5, 0.45, 0.06, C.cream, 0, 2.85, -0.62, 0, false, false);
    for (let i = 0; i < 6; i++) {
      addBox(root, 0.6, 0.08, 0.08, C.stone, 0, 0.1 + i * 0.35, 0.85 - i * 0.05);
    }
    const seat = new THREE.Vector3(x, 2.52, z);
    const base = new THREE.Vector3(x, 0.16, z + 0.95);
    const look = new THREE.Vector3(0, 1.2, 0);
    return { root, seat, base, look };
  }

  private buildPlayerChair(x: number, z: number, rotY: number): { root: THREE.Group; position: THREE.Vector3; sit: THREE.Vector3 } {
    const root = new THREE.Group();
    root.position.set(x, 0.16, z);
    root.rotation.y = rotY;
    this.root.add(root);
    addBox(root, 0.75, 0.08, 0.55, C.cream, 0, 0.48, 0, 0, false, false);
    addBox(root, 0.8, 0.55, 0.08, C.cream, 0, 0.72, -0.27, 0, false, false);
    for (const [lx, lz] of [
      [-0.31, -0.2],
      [0.31, -0.2],
      [-0.31, 0.2],
      [0.31, 0.2],
    ] as Array<[number, number]>) {
      addBox(root, 0.07, 0.48, 0.07, C.leather, lx, 0.24, lz, 0, false, false);
    }
    addBox(root, 0.6, 0.07, 0.14, C.mustard, 0, 0.54, -0.24, 0, false, false);
    addBox(root, 0.25, 0.06, 0.6, C.paper, -0.65, 0.25, 0.15, 0.2, false, false);
    addBox(root, 0.2, 0.28, 0.22, C.clay, 0.65, 0.3, 0.1, 0.1, false, false);
    addCylinder(root, 0.035, 2.25, C.cream, 0.9, 1.2, 0.7, 6);
    addCone(root, 1.35, 0.42, C.cream, 0.9, 2.35, 0.7, 8);
    addCylinder(root, 1.33, 0.04, C.clay, 0.9, 2.57, 0.7, 12);
    addBox(root, 0.12, 0.5, 0.12, C.forestDeep, -0.9, 0.4, 0.5);
    addBox(root, 0.55, 0.18, 0.35, C.forest, -0.9, 0.72, 0.5);
    return { root, position: new THREE.Vector3(x, 0.16, z), sit: new THREE.Vector3(x + Math.cos(rotY) * 0.05, 0.52, z + 0.05) };
  }
}

export class Floodlights {
  readonly root = new THREE.Group();
  readonly spots: THREE.SpotLight[] = [];
  private glows: THREE.Sprite[] = [];
  private lampMats: THREE.MeshBasicMaterial[] = [];
  private baseIntensity = 3.2;
  private lowPower = false;

  constructor(parent: THREE.Object3D) {
    parent.add(this.root);
    const spots: Array<[number, number]> = [
      [-11.4, -19.2],
      [11.4, -19.2],
      [-11.4, 19.2],
      [11.4, 19.2],
    ];
    const glowTex = circleTexture(hexOf(C.paleYellow), 48);
    this.lowPower = typeof window !== 'undefined' && (window.innerWidth < 820 || window.matchMedia('(pointer: coarse)').matches);
    const lampMat = new THREE.MeshBasicMaterial({ color: hexOf(C.blueGrey), toneMapped: false });
    this.lampMats.push(lampMat);
    spots.forEach(([x, z], i) => {
      const group = new THREE.Group();
      group.position.set(x, 0, z);
      this.root.add(group);
      addCylinder(group, 0.22, 11.4, C.stone, 0, 5.7, 0, 8);
      addCylinder(group, 0.3, 0.3, C.gunmetal, 0, 11.25, 0, 8);
      const head = new THREE.Group();
      head.position.set(0, 11.5, 0);
      const target = new THREE.Vector3(-x * 0.2, 0.2, -z * 0.42);
      head.lookAt(target);
      group.add(head);
      addBox(head, 1.8, 0.2, 0.6, C.ink, 0, 0, 0, 0, false, false);
      for (let l = 0; l < 4; l++) {
        addBoxMat(head, 0.34, 0.28, 0.08, lampMat, -0.63 + l * 0.42, -0.04, 0.32, false, false);
      }
      const spot = new THREE.SpotLight(0xffe2a6, 0, 58, 0.46, 0.32, 0);
      spot.position.set(x, 11.7, z);
      spot.target.position.copy(target);
      spot.castShadow = false;
      spot.shadow.mapSize.set(this.lowPower ? 256 : 512, this.lowPower ? 256 : 512);
      spot.shadow.bias = -0.0006;
      spot.shadow.normalBias = 0.03;
      this.root.add(spot, spot.target);
      this.spots.push(spot);

      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xf0d77c, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      sprite.position.set(x, 11.55, z);
      sprite.scale.set(5, 5, 1);
      this.root.add(sprite);
      this.glows.push(sprite);
    });
  }

  setNight(night: number): void {
    this.spots.forEach((spot, index) => {
      spot.intensity = night * this.baseIntensity;
      spot.castShadow = night > 0.3 && index < (this.lowPower ? 1 : 2);
    });
    this.glows.forEach((g) => ((g.material as THREE.SpriteMaterial).opacity = night * 0.85));
    this.lampMats.forEach((m) => m.color.set(hexOf(night > 0.25 ? C.paleYellow : C.blueGrey)));
  }
}

export class BallKidStation {
  readonly people: StandingPerson[] = [];
  readonly root = new THREE.Group();
  constructor(parent: THREE.Object3D, spots: THREE.Vector3[]) {
    parent.add(this.root);
    const looks: PersonLook[] = [
      { shirt: C.mustard, shorts: C.paper, skin: C.skinMid, hair: C.darkBrown, cap: C.forestDeep },
      { shirt: C.mustard, shorts: C.paper, skin: C.skinLight, hair: C.brown, cap: C.clay },
      { shirt: C.mustard, shorts: C.paper, skin: C.skinDark, hair: C.ink, cap: C.forestDeep },
      { shirt: C.mustard, shorts: C.paper, skin: C.skinMid, hair: C.darkBrown, cap: C.clay },
    ];
    for (let i = 0; i < spots.length; i++) {
      const person = new StandingPerson(looks[i % looks.length], 0.82);
      person.setPosition(spots[i].x, spots[i].y, spots[i].z);
      person.root.rotation.y = i % 2 === 0 ? Math.PI : 0;
      this.root.add(person.root);
      this.people.push(person);
    }
  }
}



