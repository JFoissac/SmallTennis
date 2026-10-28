import * as THREE from 'three';
import { C, hexOf, nearestPaletteIndex } from '../core/palette';
import type { PixelRenderer, SkyLook } from '../core/renderer';

export type TimeMode = 'day' | 'dusk' | 'night';

const PRESETS: Record<TimeMode, {
  top: number;
  mid: number;
  horizon: number;
  sun: number;
  sunPos: [number, number, number];
  hemiSky: number;
  hemiGround: number;
  hemi: number;
  ambient: number;
  sunIntensity: number;
  celestialX: number;
  celestialY: number;
  celestialRadius: number;
  celestialColor: number;
}> = {
  day: {
    top: C.tealLight,
    mid: C.paleAqua,
    horizon: C.paper,
    sun: C.paleYellow,
    sunPos: [42, 44, 28],
    hemiSky: C.paleAqua,
    hemiGround: C.umber,
    hemi: 2.15,
    ambient: 0.34,
    sunIntensity: 2.25,
    celestialX: 0.78,
    celestialY: 0.82,
    celestialRadius: 0.012,
    celestialColor: C.paleYellow,
  },
  dusk: {
    top: C.plumDeep,
    mid: C.mauve,
    horizon: C.peach,
    sun: C.salmon,
    sunPos: [-42, 15, 30],
    hemiSky: C.rose,
    hemiGround: C.umber,
    hemi: 1.15,
    ambient: 0.28,
    sunIntensity: 1.45,
    celestialX: 0.17,
    celestialY: 0.58,
    celestialRadius: 0.026,
    celestialColor: C.peach,
  },
  night: {
    top: C.ink,
    mid: C.night,
    horizon: C.slate,
    sun: C.paleAqua,
    sunPos: [22, 45, -28],
    hemiSky: C.plumDeep,
    hemiGround: C.midnight,
    hemi: 0.42,
    ambient: 0.12,
    sunIntensity: 0.4,
    celestialX: 0.7,
    celestialY: 0.8,
    celestialRadius: 0.012,
    celestialColor: C.bone,
  },
};

function mixHex(a: number, b: number, t: number): THREE.Color {
  const ca = new THREE.Color(hexOf(a));
  const cb = new THREE.Color(hexOf(b));
  return ca.lerp(cb, t);
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export class SkySystem {
  readonly hemi: THREE.HemisphereLight;
  readonly sun: THREE.DirectionalLight;
  readonly fill: THREE.DirectionalLight;
  readonly ambient: THREE.AmbientLight;
  private px: PixelRenderer;
  private scene: THREE.Scene;
  private phase = 0;
  private targetPhase = 0;
  private gloom = 0;
  private currentLook: SkyLook;

  constructor(scene: THREE.Scene, px: PixelRenderer) {
    this.scene = scene;
    this.px = px;
    this.hemi = new THREE.HemisphereLight(hexOf(C.paleAqua), hexOf(C.forestDeep), 1.4);
    this.scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(hexOf(C.paper), 0.18);
    this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(hexOf(C.paper), 2.7);
    this.sun.position.set(34, 58, 22);
    this.sun.castShadow = true;
    const lowPower = typeof window !== 'undefined' && (window.innerWidth < 820 || window.matchMedia('(pointer: coarse)').matches);
    this.sun.shadow.mapSize.set(lowPower ? 512 : 1024, lowPower ? 512 : 1024);
    this.sun.shadow.camera.left = -33;
    this.sun.shadow.camera.right = 33;
    this.sun.shadow.camera.top = 34;
    this.sun.shadow.camera.bottom = -34;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 160;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.025;
    this.sun.target.position.set(0, 0, 0);
    this.scene.add(this.sun, this.sun.target);
    this.fill = new THREE.DirectionalLight(hexOf(C.cream), 0.6);
    this.fill.position.set(38, 22, 46);
    this.fill.castShadow = false;
    this.scene.add(this.fill);
    this.currentLook = {
      top: C.tealLight,
      mid: C.paleAqua,
      horizon: C.paper,
      night: 0,
      outline: C.ink,
      tint: C.grey,
      tintStrength: 0,
      celestialX: 0.78,
      celestialY: 0.82,
      celestialRadius: 0.034,
      celestialColor: C.paleYellow,
      celestialAlpha: 1,
    };
    this.px.setSky(this.currentLook);
  }

  setMode(mode: TimeMode): void {
    this.targetPhase = mode === 'day' ? 0 : mode === 'dusk' ? 1 : 2;
  }

  setGloom(value: number): void {
    this.gloom = Math.max(0, Math.min(1, value));
  }

  get phaseValue(): number {
    return this.phase;
  }

  get nightFactor(): number {
    return smoothstep(0.35, 1, this.phase / 2);
  }

  get duskFactor(): number {
    return Math.max(0, 1 - Math.abs(this.phase - 1));
  }

  get floodFactor(): number {
    return clamp01(smoothstep(0.4, 0.9, this.phase / 2) + this.duskFactor * 0.52);
  }

  update(dt: number): void {
    const speed = 1.4;
    const diff = this.targetPhase - this.phase;
    if (Math.abs(diff) > 0.0001) {
      const step = Math.sign(diff) * Math.min(Math.abs(diff), dt * speed);
      this.phase += step;
    } else {
      this.phase = this.targetPhase;
    }

    const t = Math.max(0, Math.min(2, this.phase));
    const day = PRESETS.day;
    const dusk = PRESETS.dusk;
    const night = PRESETS.night;
    const a = t <= 1 ? day : dusk;
    const b = t <= 1 ? dusk : night;
    const f = t <= 1 ? t : t - 1;
    const gloom = this.gloom;

    const topColor = mixHex(a.top, b.top, f);
    const midColor = mixHex(a.mid, b.mid, f);
    const horizonColor = mixHex(a.horizon, b.horizon, f);
    const grey = new THREE.Color(hexOf(C.grey));
    topColor.lerp(grey, gloom * 0.45);
    midColor.lerp(grey, gloom * 0.52);
    horizonColor.lerp(grey, gloom * 0.3);

    const sunColor = mixHex(a.sun, b.sun, f);
    sunColor.lerp(new THREE.Color(hexOf(C.silver)), gloom * 0.5);
    const sunPos = new THREE.Vector3(
      a.sunPos[0] + (b.sunPos[0] - a.sunPos[0]) * f,
      a.sunPos[1] + (b.sunPos[1] - a.sunPos[1]) * f,
      a.sunPos[2] + (b.sunPos[2] - a.sunPos[2]) * f,
    );
    this.sun.position.copy(sunPos);
    this.sun.color.copy(sunColor);
    this.sun.intensity = (a.sunIntensity + (b.sunIntensity - a.sunIntensity) * f) * (1 - gloom * 0.55);
    this.fill.intensity = (0.62 - 0.42 * (t / 2)) * (1 - gloom * 0.4);
    this.fill.color.copy(sunColor).lerp(new THREE.Color(hexOf(C.paleAqua)), 0.5);

    const hemiSky = mixHex(a.hemiSky, b.hemiSky, f);
    const hemiGround = mixHex(a.hemiGround, b.hemiGround, f);
    hemiSky.lerp(grey, gloom * 0.3);
    this.hemi.color.copy(hemiSky);
    this.hemi.groundColor.copy(hemiGround);
    this.hemi.intensity = (a.hemi + (b.hemi - a.hemi) * f) * (1 - gloom * 0.28);
    this.ambient.intensity = (a.ambient + (b.ambient - a.ambient) * f) * (1 - gloom * 0.2);

    const nightness = smoothstep(0.35, 1, t / 2);
    const look: SkyLook = {
      top: paletteIndex(topColor),
      mid: paletteIndex(midColor),
      horizon: paletteIndex(horizonColor),
      night: nightness,
      outline: C.ink,
      tint: C.grey,
      tintStrength: gloom * 0.25,
      celestialX: a.celestialX + (b.celestialX - a.celestialX) * f,
      celestialY: a.celestialY + (b.celestialY - a.celestialY) * f,
      celestialRadius: a.celestialRadius + (b.celestialRadius - a.celestialRadius) * f,
      celestialColor: paletteIndex(mixHex(a.celestialColor, b.celestialColor, f).lerp(new THREE.Color(hexOf(C.grey)), gloom * 0.5)),
      celestialAlpha: (t < 0.05 || t > 1.95 ? 1 : 0.9) * (1 - gloom * 0.55),
    };
    this.currentLook = look;
    this.px.setSky(look);
  }
}

function paletteIndex(c: THREE.Color): number {
  return nearestPaletteIndex(c.r, c.g, c.b);
}

