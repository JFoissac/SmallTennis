import * as THREE from 'three';
import { C, PALETTE_HEX, createPaletteLutData, hexToRgb } from './palette';

export interface SkyLook {
  top: number;
  mid: number;
  horizon: number;
  night: number;
  outline: number;
  tint: number;
  tintStrength: number;
  celestialX: number;
  celestialY: number;
  celestialRadius: number;
  celestialColor: number;
  celestialAlpha: number;
}

function vec3Of(index: number): THREE.Vector3 {
  const c = hexToRgb(PALETTE_HEX[index]);
  return new THREE.Vector3(c.r, c.g, c.b);
}

const PALETTE_VEC = PALETTE_HEX.map((hex) => {
  const c = hexToRgb(hex);
  return new THREE.Vector3(c.r, c.g, c.b);
});

const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const POST_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uSkyTop;
uniform vec3 uSkyMid;
uniform vec3 uSkyHorizon;
uniform float uNight;
uniform float uOutlineThreshold;
uniform vec3 uOutline;
uniform vec3 uTint;
uniform float uTintStrength;
uniform vec2 uCelestialPos;
uniform float uCelestialRadius;
uniform vec3 uCelestialColor;
uniform float uCelestialAlpha;
uniform sampler2D tLut;
uniform vec3 uPalette[64];

vec2 lutUv(vec3 color) {
  vec3 c = clamp(color, 0.0, 0.99999);
  float slice = floor(c.b * 64.0);
  float tileX = mod(slice, 8.0);
  float tileY = floor(slice / 8.0);
  return vec2((tileX + c.r) / 8.0, (tileY + c.g) / 8.0);
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float bayer4(vec2 p) {
  vec2 f = floor(mod(p, 4.0));
  float x = f.x;
  float y = f.y;
  float b0 = mod(x + y * 2.0, 4.0);
  float v[16];
  v[0] = 0.0; v[1] = 8.0; v[2] = 2.0; v[3] = 10.0;
  v[4] = 12.0; v[5] = 4.0; v[6] = 14.0; v[7] = 6.0;
  v[8] = 3.0; v[9] = 11.0; v[10] = 1.0; v[11] = 9.0;
  v[12] = 15.0; v[13] = 7.0; v[14] = 13.0; v[15] = 5.0;
  int idx = int(x) + int(y) * 4;
  float outv = 0.0;
  for (int i = 0; i < 16; i++) {
    if (i == idx) outv = v[i];
  }
  return outv / 16.0 - 0.5;
}

vec3 skyColor(vec2 uv) {
  float y = clamp(uv.y, 0.0, 1.0);
  vec3 low = mix(uSkyHorizon, uSkyMid, smoothstep(0.0, 0.46, y));
  return mix(low, uSkyTop, smoothstep(0.42, 1.0, y));
}

void main() {
  vec3 col = texture2D(tColor, vUv).rgb;
  float depth = texture2D(tDepth, vUv).x;

  vec2 px = 1.0 / uResolution;
  float dl = texture2D(tDepth, vUv + vec2(-px.x, 0.0)).x;
  float dr = texture2D(tDepth, vUv + vec2(px.x, 0.0)).x;
  float du = texture2D(tDepth, vUv + vec2(0.0, px.y)).x;
  float dd = texture2D(tDepth, vUv + vec2(0.0, -px.y)).x;
  float maxDiff = max(max(abs(depth - dl), abs(depth - dr)), max(abs(depth - du), abs(depth - dd)));
  float edge = step(uOutlineThreshold, maxDiff);
  if (depth < 0.0002) edge = 0.0;

  if (depth >= 0.99999) {
    col = skyColor(vUv);
    if (uNight > 0.12) {
      vec2 cell = floor(gl_FragCoord.xy * 0.75);
      float star = hash21(cell);
      float twinkle = 0.55 + 0.45 * sin(uTime * 1.3 + star * 62.0);
      if (star > 0.9972 && vUv.y > 0.30) {
        float bright = smoothstep(0.9972, 1.0, star) * uNight * twinkle;
        col = mix(col, uPalette[14], bright);
      }
      vec2 moonCell = floor(gl_FragCoord.xy * 0.5);
      float m = hash21(moonCell + 21.0);
      if (m > 0.99985 && vUv.y > 0.6) col = mix(col, uPalette[13], 0.45 * uNight);
    }
    if (uCelestialAlpha > 0.001) {
      vec2 d = vUv - uCelestialPos;
      d.x *= uResolution.x / max(1.0, uResolution.y);
      float r = length(d);
      float disc = 1.0 - smoothstep(uCelestialRadius - 0.004, uCelestialRadius + 0.004, r);
      float glow = exp(-r * 11.0) * 0.4;
      col = mix(col, uCelestialColor, clamp(disc + glow * uCelestialAlpha, 0.0, 1.0) * uCelestialAlpha);
    }
  }

  if (edge > 0.5) {
    col = uOutline;
  }

  if (uTintStrength > 0.0) {
    col = mix(col, col * uTint, uTintStrength);
  }

  col += bayer4(gl_FragCoord.xy) * (5.0 / 255.0);
  gl_FragColor = texture2D(tLut, lutUv(col));
}
`;

export class PixelRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly postScene = new THREE.Scene();
  readonly postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly canvas: HTMLCanvasElement;

  private readonly rt: THREE.WebGLRenderTarget;
  readonly paletteLut: THREE.DataTexture;
  private readonly postMaterial: THREE.ShaderMaterial;
  private readonly depthTexture: THREE.DepthTexture;
  private width = 384;
  private height = 216;

  readonly lastFrameStats = {
    calls: 0,
    triangles: 0,
    lines: 0,
    points: 0,
  };

  sky: SkyLook = {
    top: C.tealLight,
    mid: C.paleAqua,
    horizon: C.paper,
    night: 0,
    outline: C.ink,
    tint: C.paper,
    tintStrength: 0,
    celestialX: 0.75,
    celestialY: 0.8,
    celestialRadius: 0.045,
    celestialColor: C.paleYellow,
    celestialAlpha: 1,
  };

  constructor(container: HTMLElement) {
    THREE.ColorManagement.enabled = false;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'pixel-canvas';
    this.canvas.setAttribute('aria-label', 'Love All pixel tennis club');
    container.appendChild(this.canvas);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = false;
    this.renderer.setClearColor(0x000000, 1);

    this.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
    this.depthTexture.format = THREE.DepthFormat;
    this.depthTexture.minFilter = THREE.NearestFilter;
    this.depthTexture.magFilter = THREE.NearestFilter;

    this.rt = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      stencilBuffer: false,
      depthTexture: this.depthTexture,
      generateMipmaps: false,
    });
    this.rt.texture.colorSpace = THREE.NoColorSpace;

    this.paletteLut = new THREE.DataTexture(
      createPaletteLutData(),
      512,
      512,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    this.paletteLut.minFilter = THREE.NearestFilter;
    this.paletteLut.magFilter = THREE.NearestFilter;
    this.paletteLut.generateMipmaps = false;
    this.paletteLut.flipY = false;
    this.paletteLut.unpackAlignment = 1;
    this.paletteLut.colorSpace = THREE.NoColorSpace;
    this.paletteLut.needsUpdate = true;

    this.postMaterial = new THREE.ShaderMaterial({
      vertexShader: POST_VERT,
      fragmentShader: POST_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tColor: { value: this.rt.texture },
        tDepth: { value: this.depthTexture },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uSkyTop: { value: vec3Of(C.tealLight) },
        uSkyMid: { value: vec3Of(C.paleAqua) },
        uSkyHorizon: { value: vec3Of(C.paper) },
        uNight: { value: 0 },
        uOutlineThreshold: { value: 0.004 },
        uOutline: { value: new THREE.Vector3(0.03, 0.035, 0.055) },
        uTint: { value: vec3Of(C.paper) },
        uTintStrength: { value: 0 },
        uCelestialPos: { value: new THREE.Vector2(0.75, 0.8) },
        uCelestialRadius: { value: 0.045 },
        uCelestialColor: { value: vec3Of(C.paleYellow) },
        uCelestialAlpha: { value: 1 },
        tLut: { value: this.paletteLut },
        uPalette: { value: PALETTE_VEC },
      },
    });

    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMaterial);
    quad.frustumCulled = false;
    this.postScene.add(quad);

    this.resize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
  }

  get renderTarget(): THREE.WebGLRenderTarget {
    return this.rt;
  }

  get pixelWidth(): number {
    return this.width;
  }

  get pixelHeight(): number {
    return this.height;
  }

  setSky(look: SkyLook): void {
    this.sky = look;
    const u = this.postMaterial.uniforms;
    const set = (name: string, index: number) => {
      const v = vec3Of(index);
      (u[name].value as THREE.Vector3).copy(v);
    };
    set('uSkyTop', look.top);
    set('uSkyMid', look.mid);
    set('uSkyHorizon', look.horizon);
    u.uNight.value = look.night;
    set('uOutline', look.outline);
    set('uTint', look.tint);
    u.uTintStrength.value = look.tintStrength;
    (u.uCelestialPos.value as THREE.Vector2).set(look.celestialX, look.celestialY);
    u.uCelestialRadius.value = look.celestialRadius;
    set('uCelestialColor', look.celestialColor);
    u.uCelestialAlpha.value = look.celestialAlpha;
  }

  resize(cssWidth: number, cssHeight: number): void {
    const pixelScale = cssWidth < 700 ? 1.5 : 2;
    let w = Math.max(1, Math.round(cssWidth / pixelScale));
    let h = Math.max(1, Math.round(cssHeight / pixelScale));
    const maxPixels = 1_100_000;
    if (w * h > maxPixels) {
      const shrink = Math.sqrt(maxPixels / (w * h));
      w = Math.max(1, Math.round(w * shrink));
      h = Math.max(1, Math.round(h * shrink));
    }
    this.width = w;
    this.height = h;
    this.rt.setSize(w, h);
    this.depthTexture.image.width = w;
    this.depthTexture.image.height = h;
    this.depthTexture.needsUpdate = true;
    this.renderer.setSize(w, h, false);
    (this.postMaterial.uniforms.uResolution.value as THREE.Vector2).set(w, h);
    this.postMaterial.uniforms.uOutlineThreshold.value = 0.0125 * Math.min(1, 270 / h);
  }

  render(scene: THREE.Scene, camera: THREE.OrthographicCamera, elapsed: number): void {
    this.postMaterial.uniforms.uTime.value = elapsed;
    this.renderer.info.reset();
    this.renderer.setRenderTarget(this.rt);
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.clear(true, true, false);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.clear(true, true, false);
    this.renderer.render(this.postScene, this.postCamera);
    const info = this.renderer.info.render;
    this.lastFrameStats.calls = info.calls;
    this.lastFrameStats.triangles = info.triangles;
    this.lastFrameStats.lines = info.lines;
    this.lastFrameStats.points = info.points;
  }
}

