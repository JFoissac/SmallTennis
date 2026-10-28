import * as THREE from 'three';
import { C } from '../core/palette';
import { COURT } from '../world/court';
import { GEO, lambert, makeCanvasTexture } from '../world/build';
import type { PlayerProfile } from './players';

export type SwingType = 'forehand' | 'backhand' | 'volley' | 'smash' | 'serve';

export interface SwingVisual {
  type: SwingType;
  start: number;
  contact: number;
  end: number;
  contactWorld: THREE.Vector3;
  outWorld: THREE.Vector3;
}

export interface RigInput {
  time: number;
  speed: number;
  facing: number;
  swing: SwingVisual | null;
  ballWorld: THREE.Vector3 | null;
  sitting: boolean;
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const RACKET_LENGTH = 0.58;
const ARM_UPPER = 0.27;
const ARM_LOWER = 0.245;
const LEG_UPPER = 0.43;
const LEG_LOWER = 0.43;

interface Seg {
  mesh: THREE.Mesh;
  thickness: number;
  depth: number;
}

function segmentMesh(index: number, w: number, d: number): Seg {
  const mesh = new THREE.Mesh(GEO.box, lambert(index));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return { mesh, thickness: w, depth: d };
}

function placeSeg(seg: Seg, a: THREE.Vector3, b: THREE.Vector3, tweak = 0): void {
  const delta = new THREE.Vector3().subVectors(b, a);
  const len = Math.max(0.001, delta.length());
  seg.mesh.position.copy(a).add(b).multiplyScalar(0.5);
  seg.mesh.quaternion.setFromUnitVectors(Y_AXIS, delta.normalize());
  seg.mesh.scale.set(seg.thickness + tweak, len, seg.depth);
}

function solveTwoBone(
  root: THREE.Vector3,
  target: THREE.Vector3,
  l1: number,
  l2: number,
  pole: THREE.Vector3,
): { mid: THREE.Vector3; end: THREE.Vector3 } {
  const toTarget = new THREE.Vector3().subVectors(target, root);
  const dist = THREE.MathUtils.clamp(toTarget.length(), Math.abs(l1 - l2) + 0.002, l1 + l2 - 0.002);
  if (toTarget.lengthSq() < 1e-8) toTarget.set(0, -1, 0);
  const dir = toTarget.clone().normalize();
  const end = root.clone().addScaledVector(dir, dist);
  const cosA = THREE.MathUtils.clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1);
  const a = Math.acos(cosA);
  const side = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir)));
  if (side.lengthSq() < 1e-6) side.set(0, 0, 1);
  side.normalize();
  const mid = root.clone().addScaledVector(dir, Math.cos(a) * l1).addScaledVector(side, Math.sin(a) * l1);
  return { mid, end };
}

function ease(t: number): number {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function lerpVec(a: THREE.Vector3, b: THREE.Vector3, t: number): THREE.Vector3 {
  return new THREE.Vector3().lerpVectors(a, b, ease(t));
}

export class PlayerRig {
  readonly root = new THREE.Group();
  readonly profile: PlayerProfile;
  readonly racketGroup = new THREE.Group();
  readonly racketHeadWorld = new THREE.Vector3();
  readonly leftHandWorld = new THREE.Vector3();
  readonly rightHandWorld = new THREE.Vector3();
  private pelvis = new THREE.Vector3();
  private chest = new THREE.Vector3();
  private headCenter = new THREE.Vector3();
  private shoulderL = new THREE.Vector3();
  private shoulderR = new THREE.Vector3();
  private handL = new THREE.Vector3();
  private handR = new THREE.Vector3();
  private footL = new THREE.Vector3();
  private footR = new THREE.Vector3();
  private kneeL = new THREE.Vector3();
  private kneeR = new THREE.Vector3();
  private elbowL = new THREE.Vector3();
  private elbowR = new THREE.Vector3();
  private wristL = new THREE.Vector3();
  private wristR = new THREE.Vector3();

  private hips: THREE.Mesh;
  private torso: Seg;
  private neck: THREE.Mesh;
  private headGroup = new THREE.Group();
  private headMesh: THREE.Mesh;
  private hairTop: THREE.Mesh;
  private hairBack: THREE.Mesh;
  private headband: THREE.Mesh | null;
  private thighL: Seg;
  private shinL: Seg;
  private shoeL: THREE.Mesh;
  private thighR: Seg;
  private shinR: Seg;
  private shoeR: THREE.Mesh;
  private sockL: THREE.Mesh;
  private sockR: THREE.Mesh;
  private upperArmL: Seg;
  private forearmL: Seg;
  private handMeshL: THREE.Mesh;
  private upperArmR: Seg;
  private forearmR: Seg;
  private handMeshR: THREE.Mesh;
  private runPhase = 0;
  private faceYaw = 0;
  private initialisedYaw = false;
  private sitBlend = 0;
  private lastInput: RigInput | null = null;
  private jumpHeight = 0;

  constructor(profile: PlayerProfile, parent?: THREE.Object3D) {
    this.profile = profile;
    const s = profile.height / 1.8;
    this.root.scale.setScalar(s * 1.25);
    parent?.add(this.root);

    const look = profile.look;
    this.hips = new THREE.Mesh(GEO.box, lambert(look.shorts));
    this.hips.castShadow = true;
    this.hips.receiveShadow = true;
    this.root.add(this.hips);

    this.torso = segmentMesh(look.shirt, 0.34, 0.21);
    this.root.add(this.torso.mesh);

    this.neck = new THREE.Mesh(GEO.box, lambert(look.skin));
    this.neck.castShadow = true;
    this.root.add(this.neck);

    this.headMesh = new THREE.Mesh(GEO.box, lambert(look.skin));
    this.headMesh.castShadow = true;
    this.headMesh.receiveShadow = true;
    this.headMesh.scale.set(0.23, 0.25, 0.22);
    this.headMesh.position.y = 0.1;
    this.headGroup.add(this.headMesh);
    this.hairTop = new THREE.Mesh(GEO.box, lambert(look.hair));
    this.hairTop.scale.set(0.25, 0.08, 0.24);
    this.hairTop.position.set(0, 0.245, -0.005);
    this.headGroup.add(this.hairTop);
    this.hairBack = new THREE.Mesh(GEO.box, lambert(look.hair));
    this.hairBack.scale.set(0.24, 0.17, 0.06);
    this.hairBack.position.set(0, 0.14, -0.1);
    this.headGroup.add(this.hairBack);
    this.headband = new THREE.Mesh(GEO.box, lambert(look.headband));
    this.headband.scale.set(0.26, 0.035, 0.225);
    this.headband.position.set(0, 0.185, 0);
    this.headGroup.add(this.headband);
    const eyeL = new THREE.Mesh(GEO.box, lambert(C.ink));
    eyeL.scale.set(0.028, 0.028, 0.02);
    eyeL.position.set(-0.055, 0.12, 0.112);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.055;
    this.headGroup.add(eyeL, eyeR);
    this.headGroup.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.root.add(this.headGroup);

    this.thighL = segmentMesh(look.shorts, 0.135, 0.15);
    this.thighR = segmentMesh(look.shorts, 0.135, 0.15);
    this.shinL = segmentMesh(look.skin, 0.095, 0.105);
    this.shinR = segmentMesh(look.skin, 0.095, 0.105);
    this.root.add(this.thighL.mesh, this.thighR.mesh, this.shinL.mesh, this.shinR.mesh);

    this.shoeL = new THREE.Mesh(GEO.box, lambert(look.shoe));
    this.shoeR = new THREE.Mesh(GEO.box, lambert(look.shoe));
    this.shoeL.scale.set(0.13, 0.08, 0.26);
    this.shoeR.scale.set(0.13, 0.08, 0.26);
    this.shoeL.castShadow = true;
    this.shoeR.castShadow = true;
    this.root.add(this.shoeL, this.shoeR);

    this.sockL = new THREE.Mesh(GEO.box, lambert(C.cream));
    this.sockR = new THREE.Mesh(GEO.box, lambert(C.cream));
    this.sockL.scale.set(0.105, 0.09, 0.115);
    this.sockR.scale.set(0.105, 0.09, 0.115);
    this.root.add(this.sockL, this.sockR);

    this.upperArmL = segmentMesh(look.skin, 0.095, 0.1);
    this.upperArmR = segmentMesh(look.skin, 0.095, 0.1);
    this.forearmL = segmentMesh(look.skin, 0.08, 0.085);
    this.forearmR = segmentMesh(look.skin, 0.08, 0.085);
    this.root.add(this.upperArmL.mesh, this.upperArmR.mesh, this.forearmL.mesh, this.forearmR.mesh);

    this.handMeshL = new THREE.Mesh(GEO.box, lambert(look.skin));
    this.handMeshR = new THREE.Mesh(GEO.box, lambert(look.skin));
    this.handMeshL.scale.set(0.085, 0.1, 0.075);
    this.handMeshR.scale.set(0.085, 0.1, 0.075);
    this.handMeshL.castShadow = true;
    this.handMeshR.castShadow = true;
    this.root.add(this.handMeshL, this.handMeshR);

    addBoxMesh(this.root, 0.07, 0.05, 0.24, look.accent, 0.09, 0.1, 0.015);
    addBoxMesh(this.root, 0.07, 0.05, 0.24, look.accent, -0.09, 0.1, 0.015);

    this.buildRacket();
    this.root.add(this.racketGroup);
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.racketGroup.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = false;
    });
    this.neck.castShadow = false;
    this.handMeshL.castShadow = false;
    this.handMeshR.castShadow = false;
    this.sockL.castShadow = false;
    this.sockR.castShadow = false;
    this.shoeL.castShadow = false;
    this.shoeR.castShadow = false;
  }

  private buildRacket(): void {
    const accent = this.profile.look.racket;
    const handle = new THREE.Mesh(GEO.box, lambert(C.ink));
    handle.scale.set(0.04, 0.3, 0.035);
    handle.position.y = 0.15;
    this.racketGroup.add(handle);
    for (let i = 0; i < 4; i++) {
      const tape = new THREE.Mesh(GEO.box, lambert(accent));
      tape.scale.set(0.05, 0.014, 0.042);
      tape.position.y = 0.055 + i * 0.032;
      this.racketGroup.add(tape);
    }
    const throatA = new THREE.Mesh(GEO.box, lambert(accent));
    throatA.scale.set(0.02, 0.24, 0.025);
    throatA.position.set(-0.055, 0.37, 0);
    throatA.rotation.z = 0.34;
    const throatB = throatA.clone();
    throatB.position.x = 0.055;
    throatB.rotation.z = -0.34;
    this.racketGroup.add(throatA, throatB);
    const torus = new THREE.TorusGeometry(0.175, 0.02, 3, 12);
    torus.scale(1, 1.32, 1);
    const frame = new THREE.Mesh(torus, lambert(accent));
    frame.position.y = 0.58;
    frame.castShadow = true;
    this.racketGroup.add(frame);
    const strings = makeCanvasTexture(32, 32, (ctx) => {
      ctx.clearRect(0, 0, 32, 32);
      ctx.strokeStyle = 'rgba(255,246,224,0.55)';
      ctx.lineWidth = 1;
      for (let i = 2; i < 32; i += 4) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 32);
        ctx.moveTo(0, i);
        ctx.lineTo(32, i);
        ctx.stroke();
      }
    });
    const stringMat = new THREE.MeshBasicMaterial({
      map: strings,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(0.31, 0.42), stringMat);
    bed.position.y = 0.58;
    this.racketGroup.add(bed);
    const bumper = new THREE.Mesh(GEO.box, lambert(C.cream));
    bumper.scale.set(0.2, 0.025, 0.03);
    bumper.position.y = 0.815;
    this.racketGroup.add(bumper);
    this.racketGroup.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
      }
    });
  }

  setPosition(x: number, z: number, y = COURT.groundY): void {
    this.root.position.x = x;
    this.root.position.z = z;
    this.root.position.y = y;
  }

  get position(): THREE.Vector3 {
    return this.root.position;
  }

  get facing(): number {
    return this.faceYaw;
  }

  setSitting(sitting: boolean): void {
    if (sitting) this.sitBlend = Math.min(1, this.sitBlend + 0.1);
  }

  update(dt: number, input: RigInput): void {
    this.lastInput = input;
    if (!this.initialisedYaw) {
      this.faceYaw = input.facing;
      this.initialisedYaw = true;
    }
    let delta = input.facing - this.faceYaw;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this.faceYaw += delta * Math.min(1, dt * 11);
    this.root.rotation.y = this.faceYaw;

    if (input.speed > 0.15) {
      this.runPhase += dt * (3.2 + input.speed * 1.15);
    }

    const sitTarget = input.sitting ? 1 : 0;
    this.sitBlend += (sitTarget - this.sitBlend) * Math.min(1, dt * 5);

    const jump = input.swing?.type === 'serve' ? this.serveJump(input) : 0;
    this.jumpHeight = jump;
    this.root.position.y = COURT.groundY + jump;
    this.root.updateMatrixWorld(true);

    let contactLocal: THREE.Vector3 | null = null;
    let outLocal = new THREE.Vector3(0, 0, 1);
    let swingU = -1;
    let swingType: SwingType | null = null;
    if (input.swing) {
      contactLocal = this.root.worldToLocal(input.swing.contactWorld.clone());
      outLocal = input.swing.outWorld.clone().applyQuaternion(this.root.quaternion.clone().invert()).normalize();
      const span = Math.max(0.001, input.swing.end - input.swing.start);
      swingU = THREE.MathUtils.clamp((input.time - input.swing.start) / span, 0, 1);
      swingType = input.swing.type;
    }

    const running = input.speed > 0.25 && !input.swing;
    const approach = input.speed > 0.25 ? 0.02 : 0;
    const bob = running ? Math.abs(Math.sin(this.runPhase * 2)) * 0.018 : Math.sin(input.time * 1.7) * 0.005;
    const crouch = running ? 0.045 : 0;
    const sit = this.sitBlend;

    let pelvisY = 0.88 - crouch + bob + sit * -0.23;
    let leanZ = running ? 0.08 : 0.015;
    let leanX = 0;
    if (swingType && input.swing) {
      leanZ += Math.sin(Math.min(1, swingU) * Math.PI) * 0.06;
      if (swingType === 'serve') leanZ = -0.02 + Math.sin(Math.min(1, swingU) * Math.PI) * 0.04;
    }
    if (contactLocal && swingType !== 'serve' && swingType !== 'smash') {
      pelvisY -= Math.max(0, 1.0 - contactLocal.y) * 0.08;
    }

    this.pelvis.set(0, pelvisY, 0);
    this.chest.set(leanX, pelvisY + 0.47, leanZ);
    this.headCenter.set(leanX * 1.3, pelvisY + 0.84, leanZ + 0.01);

    const stride = running ? 0.34 : 0;
    const footLift = running ? 0.18 : 0;
    const runSin = Math.sin(this.runPhase * 2.4);
    const runCos = Math.cos(this.runPhase * 2.4);
    this.footL.set(-0.17, 0.095 + (running ? Math.max(0, runSin) * footLift : 0), 0.14 + runSin * stride);
    this.footR.set(0.19, 0.095 + (running ? Math.max(0, -runSin) * footLift : 0), -0.08 - runSin * stride);

    if (!running) {
      this.footL.set(-0.19, 0.095, 0.25);
      this.footR.set(0.21, 0.095, -0.16);
      this.footL.x += Math.sin(input.time * 0.8) * 0.012;
      this.footR.x += Math.cos(input.time * 0.7) * 0.01;
    }
    if (sit > 0.01) {
      this.footL.lerp(new THREE.Vector3(-0.17, 0.095, 0.55), sit);
      this.footR.lerp(new THREE.Vector3(0.17, 0.095, 0.55), sit);
      this.footL.y += sit * 0.0;
    }

    let racketHead = new THREE.Vector3(0.32, 1.6, 0.34);
    let racketNormal = new THREE.Vector3(0, 0.25, 1).normalize();
    let leftTarget = new THREE.Vector3(0.08, 1.06, 0.3);
    let handOffsetTwoHanded = false;
    let headTarget = input.ballWorld;

    if (running) {
      const swingArm = Math.sin(this.runPhase * 2.4) * 0.12;
      racketHead.set(0.3 + swingArm, 1.48 + Math.abs(Math.sin(this.runPhase * 2)) * 0.05, 0.24);
      leftTarget.set(-0.15 - swingArm * 0.6, 1.12 + Math.abs(runCos) * 0.08, 0.2);
      racketNormal.set(0, 0.45, 0.8).normalize();
    }

    if (sit > 0.01) {
      this.pelvis.y = THREE.MathUtils.lerp(this.pelvis.y, 0.63, sit);
      this.chest.set(0, this.pelvis.y + 0.46, 0.06);
      this.headCenter.set(0, this.pelvis.y + 0.82, 0.04);
      this.footL.set(-0.2, 0.1, 0.62);
      this.footR.set(0.2, 0.1, 0.62);
      racketHead.set(0.45, this.pelvis.y + 0.3, 0.25);
      leftTarget.set(0.1, this.pelvis.y + 0.25, 0.2);
      rackerNormalFrom(racketNormal, 0, 0.3, 1);
      headTarget = null;
    }

    if (input.swing && contactLocal && swingU >= 0) {
      const pose = this.swingPose(swingType!, swingU, input.swing, contactLocal, outLocal);
      racketHead = pose.racketHead;
      racketNormal = pose.racketNormal;
      leftTarget = pose.leftHand;
      handOffsetTwoHanded = pose.twoHanded;
      if (pose.kind === 'serve') {
        pelvisY = pose.pelvisY;
        this.pelvis.set(0, pelvisY, 0);
        this.chest.set(0, pelvisY + 0.47, pose.leanZ);
        this.headCenter.set(0, pelvisY + 0.84, pose.leanZ + 0.03);
        this.footL.set(-0.2, 0.095 + pose.jump, 0.24);
        this.footR.set(0.16, 0.095 + pose.jump, -0.22);
      }
    }

    this.shoulderL.set(this.chest.x - 0.23, this.chest.y + 0.03, this.chest.z);
    this.shoulderR.set(this.chest.x + 0.23, this.chest.y + 0.03, this.chest.z);

    const racketDir = new THREE.Vector3().subVectors(racketHead, this.shoulderR);
    if (racketDir.lengthSq() < 1e-5) racketDir.set(0, 0, 1);
    racketDir.normalize();
    const desiredHand = racketHead.clone().addScaledVector(racketDir, -RACKET_LENGTH);

    this.handR.copy(desiredHand);
    const poleR = new THREE.Vector3(racketDir.x > 0 ? 0.7 : -0.7, -0.2, -0.35);
    const solvedR = solveTwoBone(this.shoulderR, desiredHand, ARM_UPPER, ARM_LOWER, poleR);
    this.elbowR.copy(solvedR.mid);
    this.wristR.copy(solvedR.end);

    let desiredLeft = leftTarget;
    if (handOffsetTwoHanded) {
      desiredLeft = this.wristR.clone().addScaledVector(racketDir, 0.09).add(new THREE.Vector3(0.02, 0.02, 0));
    }
    if (sit > 0.3) {
      desiredLeft = new THREE.Vector3(0.1, this.pelvis.y + 0.22, 0.18);
    }
    const poleL = new THREE.Vector3(desiredLeft.x > this.shoulderL.x ? -0.5 : 0.5, -0.2, -0.3);
    const solvedL = solveTwoBone(this.shoulderL, desiredLeft, ARM_UPPER, ARM_LOWER, poleL);
    this.elbowL.copy(solvedL.mid);
    this.wristL.copy(solvedL.end);

    const kneePoleL = new THREE.Vector3(-0.16, -0.1, 0.75);
    const kneePoleR = new THREE.Vector3(0.2, -0.1, 0.75);
    const hipL = new THREE.Vector3(this.pelvis.x - 0.11, this.pelvis.y - 0.03, this.pelvis.z);
    const hipR = new THREE.Vector3(this.pelvis.x + 0.11, this.pelvis.y - 0.03, this.pelvis.z);
    const legL = solveTwoBone(hipL, this.footL, LEG_UPPER, LEG_LOWER, kneePoleL);
    const legR = solveTwoBone(hipR, this.footR, LEG_UPPER, LEG_LOWER, kneePoleR);
    this.kneeL.copy(legL.mid);
    this.kneeR.copy(legR.mid);
    const ankleL = legL.end;
    const ankleR = legR.end;

    this.placeBody();
    placeSeg(this.thighL, hipL, this.kneeL);
    placeSeg(this.shinL, this.kneeL, ankleL);
    placeSeg(this.thighR, hipR, this.kneeR);
    placeSeg(this.shinR, this.kneeR, ankleR);
    this.shoeL.position.set(ankleL.x, ankleL.y + 0.015, ankleL.z + 0.055);
    this.shoeL.rotation.y = Math.atan2(this.footR.x - ankleL.x, this.footR.z - ankleL.z) * 0.25;
    this.shoeR.position.set(ankleR.x, ankleR.y + 0.015, ankleR.z + 0.055);
    this.shoeR.rotation.y = Math.atan2(ankleR.x - ankleL.x, ankleR.z - ankleL.z) * 0.15;
    this.sockL.position.set(ankleL.x, ankleL.y + 0.06, ankleL.z);
    this.sockR.position.set(ankleR.x, ankleR.y + 0.06, ankleR.z);

    placeSeg(this.upperArmL, this.shoulderL, this.elbowL);
    placeSeg(this.forearmL, this.elbowL, this.wristL);
    placeSeg(this.upperArmR, this.shoulderR, this.elbowR);
    placeSeg(this.forearmR, this.elbowR, this.wristR);
    this.handMeshL.position.copy(this.wristL);
    this.handMeshR.position.copy(this.wristR);
    this.handMeshL.rotation.set(0, 0, 0);
    this.handMeshR.rotation.set(0, 0, 0);

    this.leftHandWorld.copy(this.wristL).applyMatrix4(this.root.matrixWorld);
    this.rightHandWorld.copy(this.wristR).applyMatrix4(this.root.matrixWorld);

    const faceDir = racketNormal.clone();
    const headFar = this.wristR.clone().addScaledVector(racketDir, RACKET_LENGTH);
    const racketBasisY = racketDir.clone();
    const racketBasisZ = faceDir.clone().sub(racketBasisY.clone().multiplyScalar(faceDir.dot(racketBasisY)));
    if (racketBasisZ.lengthSq() < 1e-5) racketBasisZ.set(0, 0, 1);
    racketBasisZ.normalize();
    const racketBasisX = new THREE.Vector3().crossVectors(racketBasisY, racketBasisZ).normalize();
    const basis = new THREE.Matrix4().makeBasis(racketBasisX, racketBasisY, racketBasisZ);
    this.racketGroup.quaternion.setFromRotationMatrix(basis);
    this.racketGroup.position.copy(this.wristR);
    this.racketGroup.visible = true;
    this.racketGroup.updateMatrixWorld(true);
    this.racketHeadWorld.copy(headFar).applyMatrix4(this.root.matrixWorld);

    const headLook = headTarget ? this.root.worldToLocal(headTarget.clone()) : null;
    if (headLook && !input.sitting) {
      const hx = headLook.x - this.headCenter.x;
      const hz = headLook.z - this.headCenter.z;
      const hy = headLook.y - this.headCenter.y;
      const targetYaw = THREE.MathUtils.clamp(Math.atan2(hx, hz), -1.1, 1.1);
      const targetPitch = THREE.MathUtils.clamp(-Math.atan2(hy, Math.hypot(hx, hz)), -0.6, 0.5);
      this.headGroup.rotation.y += (targetYaw - this.headGroup.rotation.y) * Math.min(1, dt * 6);
      this.headGroup.rotation.x += (targetPitch - this.headGroup.rotation.x) * Math.min(1, dt * 6);
    } else {
      this.headGroup.rotation.y *= 1 - Math.min(1, dt * 4);
      this.headGroup.rotation.x *= 1 - Math.min(1, dt * 4);
    }

    this.root.updateMatrixWorld(true);
  }

  private placeBody(): void {
    this.hips.position.copy(this.pelvis);
    this.hips.scale.set(0.35, 0.19, 0.24);
    placeSeg(this.torso, this.pelvis, this.chest);
    this.neck.position.copy(this.chest).add(new THREE.Vector3(0, 0.1, 0));
    this.neck.scale.set(0.11, 0.13, 0.11);
    this.headGroup.position.copy(this.headCenter);
  }

  private serveJump(input: RigInput): number {
    if (!input.swing) return 0;
    const u = (input.time - input.swing.start) / Math.max(0.001, input.swing.end - input.swing.start);
    if (u < 0.45 || u > 0.85) return 0;
    return Math.sin(((u - 0.45) / 0.4) * Math.PI) * 0.16;
  }

  private swingPose(
    type: SwingType,
    u: number,
    swing: SwingVisual,
    contact: THREE.Vector3,
    outDir: THREE.Vector3,
  ): {
    kind: SwingType;
    racketHead: THREE.Vector3;
    racketNormal: THREE.Vector3;
    leftHand: THREE.Vector3;
    twoHanded: boolean;
    pelvisY: number;
    leanZ: number;
    jump: number;
  } {
    const span = Math.max(0.001, swing.end - swing.start);
    const cu = THREE.MathUtils.clamp((swing.contact - swing.start) / span, 0.1, 0.92);
    const ready = new THREE.Vector3(0.3, 1.58, 0.32);
    const side = contact.x >= 0 ? 1 : -1;
    let back = new THREE.Vector3(side * 0.62, 1.9, -0.5);
    let follow = new THREE.Vector3(-side * 0.38, 1.52, 0.6);
    let twoHanded = false;
    let leftHand = new THREE.Vector3(0.08, 1.12, 0.3);
    let pelvisY = 0.88;
    let leanZ = 0.02;
    let jump = 0;
    const normal = outDir.clone().normalize();

    if (type === 'backhand') {
      twoHanded = true;
      back = new THREE.Vector3(-side * 0.68, 1.88, -0.48);
      follow = new THREE.Vector3(side * 0.46, 1.5, 0.55);
      leftHand = contact.clone();
    } else if (type === 'volley') {
      back = new THREE.Vector3(side * 0.55, 1.65, -0.12);
      follow = contact.clone().addScaledVector(outDir, 0.18).add(new THREE.Vector3(0, 0.04, 0));
      leftHand = new THREE.Vector3(-0.18, 1.2, 0.2);
    } else if (type === 'smash') {
      back = new THREE.Vector3(side * 0.35, 2.2, -0.22);
      follow = contact.clone().add(new THREE.Vector3(-side * 0.25, -0.5, 0.35));
      leftHand = new THREE.Vector3(0.02, 1.75, 0.28);
      pelvisY = 0.88;
    } else if (type === 'serve') {
      back = new THREE.Vector3(0.12, 2.2, -0.38);
      follow = new THREE.Vector3(-0.35, 1.45, 0.45);
      leftHand = new THREE.Vector3(0.08, 1.2, 0.26);
      pelvisY = 0.9;
      leanZ = -0.02;
      jump = this.jumpHeight;
    }

    let headTarget: THREE.Vector3;
    if (u <= cu) {
      const p = ease(u / cu);
      if (type === 'serve') {
        if (p < 0.52) {
          headTarget = lerpVec(ready, back, p / 0.52);
        } else {
          headTarget = lerpVec(back, contact, (p - 0.52) / 0.48);
        }
      } else {
        if (p < 0.55) {
          headTarget = lerpVec(ready, back, p / 0.55);
        } else {
          headTarget = lerpVec(back, contact, (p - 0.55) / 0.45);
        }
      }
    } else {
      const p = ease((u - cu) / Math.max(0.001, 1 - cu));
      headTarget = lerpVec(contact, follow, p);
    }

    if (Math.abs(u - cu) < 0.08) {
      headTarget.copy(contact);
    }

    if (type === 'backhand') {
      twoHanded = true;
      leftHand = contact.clone().addScaledVector(outDir, -0.1);
      if (u > cu + 0.08) {
        leftHand = headTarget.clone().add(new THREE.Vector3(0.12, -0.16, 0));
      }
    }
    if (type === 'volley') {
      leftHand.set(-0.14, 1.24, 0.22);
    }
    if (type === 'smash') {
      leftHand.lerp(new THREE.Vector3(-0.15, 1.65, 0.22), 0.4);
    }
    if (type === 'serve') {
      const tossUp = THREE.MathUtils.smoothstep(u, 0.05, 0.4);
      const tossDown = THREE.MathUtils.smoothstep(u, 0.58, 0.9);
      leftHand = new THREE.Vector3(0.08, 1.2 + tossUp * 1.0 - tossDown * 0.9, 0.26 + tossUp * 0.15);
    }

    return {
      kind: type,
      racketHead: headTarget,
      racketNormal: normal,
      leftHand,
      twoHanded,
      pelvisY,
      leanZ,
      jump,
    };
  }

  getServeContactLocal(): THREE.Vector3 {
    return new THREE.Vector3(0.2, 2.72, 0.28);
  }

  getServeContactWorld(): THREE.Vector3 {
    const local = this.getServeContactLocal();
    return this.root.localToWorld(local.clone());
  }

  getLeftHandWorld(): THREE.Vector3 {
    return this.leftHandWorld.clone();
  }

  isSwingContact(time: number, swing: SwingVisual): boolean {
    return time >= swing.contact;
  }
}

function addBoxMesh(
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  color: number,
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(GEO.box, lambert(color));
  mesh.scale.set(w, h, d);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function rackerNormalFrom(target: THREE.Vector3, x: number, y: number, z: number): void {
  target.set(x, y, z).normalize();
}
