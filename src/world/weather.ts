import * as THREE from 'three';
import { C, hexOf } from '../core/palette';
import type { PixelRenderer } from '../core/renderer';
import { COURT, type Court } from './court';
import { addBox, addCylinder, GEO, lambert, makeCanvasTexture, simpleRng } from './build';
import { drawPixelText } from './textures';

const PUDDLE_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const PUDDLE_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
varying vec3 vWorld;
uniform sampler2D uReflection;
uniform vec2 uResolution;
uniform float uWetness;
uniform float uTime;
uniform float uRain;
uniform vec3 uSkyTint;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec2 p = vUv - 0.5;
  float n = noise(vUv * 4.5 + 7.0) * 0.16 + noise(vUv * 11.0 - 3.0) * 0.06;
  float d = length(p * vec2(1.0, 1.18)) + n;
  float mask = 1.0 - smoothstep(0.36, 0.49, d);
  if (mask < 0.015) discard;

  vec2 uv = gl_FragCoord.xy / uResolution;
  float t = uTime;
  vec2 warp = vec2(
    sin(vUv.y * 34.0 + t * 2.2) + sin(vUv.x * 21.0 - t * 1.7),
    cos(vUv.x * 31.0 + t * 1.9) + cos(vUv.y * 19.0 + t * 1.3)
  ) * 0.0011 * (0.5 + uRain);
  vec3 refl = texture2D(uReflection, uv + warp).rgb;

  vec2 cell = floor(vUv * 16.0);
  float h = hash21(cell);
  float phase = fract(t * 0.42 + h);
  vec2 center = vec2(hash21(cell + 3.0), hash21(cell + 5.0)) - 0.5;
  float ringD = abs(length(p - center * 0.55) - phase * 0.19);
  float ring = (1.0 - smoothstep(0.0, 0.012, ringD)) * (1.0 - phase) * step(0.62, h) * uRain;

  vec3 water = mix(vec3(0.30, 0.40, 0.44), uSkyTint, 0.72);
  vec3 col = mix(water, refl, 0.52);
  col = mix(col, max(refl, uSkyTint * 0.72), 0.18);
  col += ring * 0.34;
  float fresnel = smoothstep(0.27, 0.52, d);
  col = mix(col, refl, fresnel * 0.28);
  float rim = smoothstep(0.34, 0.49, d);
  col += uSkyTint * rim * 0.14;
  col += vec3(0.28, 0.26, 0.20) * pow(max(refl.r, max(refl.g, refl.b)), 2.4) * 0.3;
  float alpha = mask * uWetness * 0.92;
  gl_FragColor = vec4(col, alpha);
}
`;

export class Weather {
  readonly root = new THREE.Group();
  readonly puddleMeshes: THREE.Mesh[] = [];
  readonly coverRoot = new THREE.Group();
  readonly coverMesh: THREE.Mesh;
  readonly reflectionRT: THREE.WebGLRenderTarget;
  readonly mirrorCam = new THREE.OrthographicCamera();
  private rainLines!: THREE.LineSegments;
  private rainPositions!: Float32Array;
  private rainBase!: Float32Array;
  private rainCount = 760;
  private rainSpeeds!: Float32Array;
  private rand = simpleRng(812);
  private puddleMaterial: THREE.ShaderMaterial;
  private wetness = 0;
  private rainAmount = 0;
  private cover = 0;
  private coverTarget = 0;
  private rainTarget = 0;
  private reflectionTimer = 0;
  private coverLength = COURT.fenceZ * 2 - 3.2;
  private coverWidth = 13.2;
  private reflectionClear: number = C.slate;
  private elapsed = 0;

  constructor(parent: THREE.Object3D, private court: Court, private px: PixelRenderer) {
    parent.add(this.root);
    this.reflectionRT = new THREE.WebGLRenderTarget(192, 108, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      stencilBuffer: false,
      generateMipmaps: false,
    });
    this.reflectionRT.texture.colorSpace = THREE.NoColorSpace;

    this.puddleMaterial = new THREE.ShaderMaterial({
      vertexShader: PUDDLE_VERT,
      fragmentShader: PUDDLE_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uReflection: { value: this.reflectionRT.texture },
        uResolution: { value: new THREE.Vector2(this.px.pixelWidth, this.px.pixelHeight) },
        uWetness: { value: 0 },
        uTime: { value: 0 },
        uRain: { value: 0 },
        uSkyTint: { value: new THREE.Color(hexOf(C.paleAqua)) },
      },
    });

    this.buildRain();
    this.buildPuddles();
    this.coverMesh = this.buildCover();
    this.rainLines.visible = false;
    this.coverRoot.visible = false;
  }

  get isRainy(): boolean {
    return this.rainTarget > 0;
  }

  get isWet(): boolean {
    return this.wetness > 0.02;
  }

  get rainLevel(): number {
    return this.rainAmount;
  }

  get wetnessLevel(): number {
    return this.wetness;
  }

  get coverAmount(): number {
    return this.cover;
  }

  get isCovered(): boolean {
    return this.cover > 0.96;
  }

  get coverLeadingEdge(): THREE.Vector3 {
    return new THREE.Vector3(0, 1.38, COURT.fenceZ - 1.6 - this.coverLength * this.cover);
  }

  setRain(on: boolean): void {
    this.rainTarget = on ? 1 : 0;
  }

  /** Forces court wetness, for demos and reproducible simulation runs. */
  setWetness(value: number): void {
    this.wetness = Math.max(0, Math.min(1, value));
  }

  setCoverTarget(value: number): void {
    this.coverTarget = Math.max(0, Math.min(1, value));
  }

  private buildRain(): void {
    const positions = new Float32Array(this.rainCount * 6);
    const base = new Float32Array(this.rainCount * 3);
    const speeds = new Float32Array(this.rainCount);
    for (let i = 0; i < this.rainCount; i++) {
      const x = (this.rand() - 0.5) * 64;
      const y = this.rand() * 32 - 3;
      const z = (this.rand() - 0.5) * 70;
      base[i * 3] = x;
      base[i * 3 + 1] = y;
      base[i * 3 + 2] = z;
      speeds[i] = 19 + this.rand() * 13;
      positions[i * 6] = x;
      positions[i * 6 + 1] = y;
      positions[i * 6 + 2] = z;
      positions[i * 6 + 3] = x + 0.14;
      positions[i * 6 + 4] = y - 0.75 - this.rand() * 0.5;
      positions[i * 6 + 5] = z + 0.02;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({
      color: hexOf(C.paleAqua),
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
    });
    this.rainLines = new THREE.LineSegments(geo, mat);
    this.rainLines.frustumCulled = false;
    this.rainLines.renderOrder = 3;
    this.root.add(this.rainLines);
    this.rainPositions = positions;
    this.rainBase = base;
    this.rainSpeeds = speeds;
  }

  private buildPuddles(): void {
    const spots = [
      ...this.court.puddleSpots(),
      new THREE.Vector3(-10.4, 0.06, 4.1),
      new THREE.Vector3(-11.4, 0.06, 10.1),
      new THREE.Vector3(-7.6, 0.06, 19.2),
      new THREE.Vector3(-4.1, 0.06, 22.4),
      new THREE.Vector3(9.4, 0.06, 17.4),
    ];
    for (let i = 0; i < spots.length; i++) {
      const spot = spots[i];
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.puddleMaterial);
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = this.rand() * Math.PI;
      mesh.position.copy(spot);
      const w = (1.2 + this.rand() * 2.5) * 1.22;
      const d = (0.7 + this.rand() * 1.6) * 1.22;
      mesh.scale.set(w, d, 1);
      mesh.visible = false;
      mesh.renderOrder = 2;
      this.root.add(mesh);
      this.puddleMeshes.push(mesh);
    }
  }

  private buildCover(): THREE.Mesh {
    this.root.add(this.coverRoot);
    this.coverRoot.position.set(0, 1.38, COURT.fenceZ - 1.6);
    const geo = new THREE.BoxGeometry(this.coverWidth, 0.06, this.coverLength);
    geo.translate(0, 0, -this.coverLength / 2);
    const tex = makeCanvasTexture(256, 512, (ctx) => {
      ctx.fillStyle = hexOf(C.forestDeep);
      ctx.fillRect(0, 0, 256, 512);
      ctx.fillStyle = hexOf(C.grass);
      ctx.fillRect(6, 6, 244, 500);
      ctx.fillStyle = hexOf(C.forest);
      for (let y = 10; y < 508; y += 32) ctx.fillRect(10, y, 236, 2);
      ctx.fillStyle = hexOf(C.cream);
      ctx.fillRect(10, 220, 236, 4);
      ctx.fillRect(10, 290, 236, 4);
      drawPixelText(ctx, 'LOVE ALL', 24, 235, 3, hexOf(C.cream));
      drawPixelText(ctx, 'COVER', 82, 260, 2, hexOf(C.mustard));
      ctx.fillStyle = hexOf(C.mustard);
      ctx.fillRect(10, 10, 6, 492);
      ctx.fillRect(240, 10, 6, 492);
    });
    const mat = new THREE.MeshLambertMaterial({ map: tex, flatShading: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.coverRoot.add(mesh);
    const roller = addCylinder(this.coverRoot, 0.28, this.coverWidth, C.cream, 0, 0.23, 0, 8);
    roller.rotation.z = Math.PI / 2;
    this.coverRoot.scale.z = 0.001;
    return mesh;
  }

  setSkyTint(index: number): void {
    (this.puddleMaterial.uniforms.uSkyTint.value as THREE.Color).set(hexOf(index));
    this.reflectionClear = index;
  }

  update(dt: number, elapsed: number, camera: THREE.OrthographicCamera): void {
    this.elapsed = elapsed;
    const rainGoal = this.rainTarget;
    this.rainAmount += (rainGoal - this.rainAmount) * Math.min(1, dt * 1.2);
    if (this.rainTarget > 0) this.wetness = Math.min(1, this.wetness + dt * 0.14);
    else this.wetness = Math.max(0, this.wetness - dt * 0.012);
    this.cover += (this.coverTarget - this.cover) * Math.min(1, dt * 1.5);
    this.coverRoot.visible = this.cover > 0.008;
    this.coverRoot.scale.z = Math.max(0.001, this.cover);

    const rainVisible = this.rainAmount > 0.04;
    this.rainLines.visible = rainVisible;
    (this.rainLines.material as THREE.LineBasicMaterial).opacity = 0.42 * this.rainAmount;
    this.updateRain(dt);

    const pudVisible = this.wetness > 0.02;
    for (const p of this.puddleMeshes) p.visible = pudVisible;
    this.puddleMaterial.uniforms.uWetness.value = this.wetness;
    this.puddleMaterial.uniforms.uTime.value = elapsed;
    this.puddleMaterial.uniforms.uRain.value = this.rainAmount;
    (this.puddleMaterial.uniforms.uResolution.value as THREE.Vector2).set(this.px.pixelWidth, this.px.pixelHeight);

    const rw = Math.max(64, Math.floor(this.px.pixelWidth / 3));
    const rh = Math.max(54, Math.floor(this.px.pixelHeight / 3));
    if (this.reflectionRT.width !== rw || this.reflectionRT.height !== rh) this.reflectionRT.setSize(rw, rh);
    this.reflectionTimer += dt;
    if (pudVisible && this.reflectionTimer > 0.2) {
      this.reflectionTimer = 0;
      this.updateReflection(camera);
    }
  }

  private updateRain(dt: number): void {
    if (!this.rainLines.visible) return;
    const p = this.rainPositions;
    const base = this.rainBase;
    const speed = this.rainSpeeds;
    const wind = 3.4;
    for (let i = 0; i < this.rainCount; i++) {
      base[i * 3] += wind * dt;
      base[i * 3 + 1] -= speed[i] * dt;
      if (base[i * 3 + 1] < -2.4) {
        base[i * 3] = (this.rand() - 0.5) * 64;
        base[i * 3 + 1] = 28 + this.rand() * 4;
        base[i * 3 + 2] = (this.rand() - 0.5) * 70;
      }
      if (base[i * 3] > 34) base[i * 3] -= 68;
      const x = base[i * 3];
      const y = base[i * 3 + 1];
      const z = base[i * 3 + 2];
      p[i * 6] = x;
      p[i * 6 + 1] = y;
      p[i * 6 + 2] = z;
      p[i * 6 + 3] = x + 0.18;
      p[i * 6 + 4] = y - 0.8 - speed[i] * 0.012;
      p[i * 6 + 5] = z + 0.03;
    }
    (this.rainLines.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  private updateReflection(camera: THREE.OrthographicCamera): void {
    if (!this.court || this.puddleMeshes.length === 0) return;
    const visible = this.puddleMeshes.map((p) => p.visible);
    for (const p of this.puddleMeshes) p.visible = false;
    const rainWasVisible = this.rainLines.visible;
    this.rainLines.visible = false;

    const pos = camera.position.clone();
    pos.y = COURT.groundY * 2 - pos.y;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.y *= -1;
    this.mirrorCam.copy(camera);
    this.mirrorCam.position.copy(pos);
    this.mirrorCam.up.set(0, -1, 0);
    this.mirrorCam.lookAt(pos.clone().add(dir));
    this.mirrorCam.updateMatrixWorld();
    this.mirrorCam.projectionMatrix.copy(camera.projectionMatrix);
    this.mirrorCam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);

    const oldClear = this.px.renderer.getClearColor(new THREE.Color());
    const oldAlpha = this.px.renderer.getClearAlpha();
    const oldPlanes = this.px.renderer.clippingPlanes;
    this.px.renderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -COURT.groundY + 0.02)];
    const shadowAutoUpdate = this.px.renderer.shadowMap.autoUpdate;
    this.px.renderer.shadowMap.autoUpdate = false;
    this.px.renderer.setRenderTarget(this.reflectionRT);
    this.px.renderer.setClearColor(hexOf(this.reflectionClear), 1);
    this.px.renderer.clear();
    this.px.renderer.render(this.px.scene, this.mirrorCam);
    this.px.renderer.setRenderTarget(null);
    this.px.renderer.shadowMap.autoUpdate = shadowAutoUpdate;
    this.px.renderer.clippingPlanes = oldPlanes;
    this.px.renderer.setClearColor(oldClear, oldAlpha);
    this.puddleMeshes.forEach((p, i) => (p.visible = visible[i]));
    this.rainLines.visible = rainWasVisible;
  }
}

