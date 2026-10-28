import * as THREE from 'three';
import { PALETTE_HEX, hexOf } from '../core/palette';

export const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  plane: new THREE.PlaneGeometry(1, 1),
  cylinder8: new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1),
  cylinder6: new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1),
  cylinder12: new THREE.CylinderGeometry(0.5, 0.5, 1, 12, 1),
  cone6: new THREE.ConeGeometry(0.5, 1, 6, 1),
  cone8: new THREE.ConeGeometry(0.5, 1, 8, 1),
  sphere: new THREE.IcosahedronGeometry(0.5, 1),
  ico: new THREE.IcosahedronGeometry(0.5, 0),
  dodeca: new THREE.DodecahedronGeometry(0.5, 0),
  circle: new THREE.CircleGeometry(0.5, 12),
};

export interface LambertOptions {
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  map?: THREE.Texture | null;
  emissive?: number;
  emissiveIntensity?: number;
  depthWrite?: boolean;
  vertexColors?: boolean;
  toneMapped?: boolean;
}

const lambertCache = new Map<string, THREE.MeshLambertMaterial>();

export function lambert(index: number, opts: LambertOptions = {}): THREE.MeshLambertMaterial {
  const key = `${index}|${opts.transparent ?? false}|${opts.opacity ?? 1}|${opts.side ?? THREE.FrontSide}|${
    opts.map ? 'map' : 'plain'
  }|${opts.emissive ?? -1}|${opts.emissiveIntensity ?? 1}|${opts.depthWrite ?? true}|${opts.vertexColors ?? false}`;
  if (!opts.map) {
    const cached = lambertCache.get(key);
    if (cached) return cached;
  }
  const material = new THREE.MeshLambertMaterial({
    color: hexOf(index),
    flatShading: true,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
    map: opts.map ?? null,
    depthWrite: opts.depthWrite ?? true,
    vertexColors: opts.vertexColors ?? false,
  });
  if (opts.emissive !== undefined) {
    material.emissive.set(hexOf(opts.emissive));
    material.emissiveIntensity = opts.emissiveIntensity ?? 1;
  }
  if (!opts.map) lambertCache.set(key, material);
  return material;
}

export function basic(index: number, opts: { transparent?: boolean; opacity?: number; side?: THREE.Side; map?: THREE.Texture | null } = {}): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: hexOf(index),
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
    map: opts.map ?? null,
    toneMapped: false,
  });
}

export function addMesh(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  cast = true,
  receive = true,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  parent.add(mesh);
  return mesh;
}

export function addBox(
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  index: number,
  x = 0,
  y = 0,
  z = 0,
  rotY = 0,
  cast = true,
  receive = true,
): THREE.Mesh {
  const mesh = addMesh(parent, GEO.box, lambert(index), x, y, z, cast, receive);
  mesh.scale.set(w, h, d);
  mesh.rotation.y = rotY;
  return mesh;
}

export function addBoxMat(
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  cast = true,
  receive = true,
): THREE.Mesh {
  const mesh = addMesh(parent, GEO.box, material, x, y, z, cast, receive);
  mesh.scale.set(w, h, d);
  return mesh;
}

export function addPlane(
  parent: THREE.Object3D,
  w: number,
  h: number,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  rotX = -Math.PI / 2,
  rotY = 0,
  rotZ = 0,
): THREE.Mesh {
  const mesh = addMesh(parent, GEO.plane, material, x, y, z, false, true);
  mesh.scale.set(w, h, 1);
  mesh.rotation.set(rotX, rotY, rotZ);
  return mesh;
}

export function addCylinder(
  parent: THREE.Object3D,
  radius: number,
  height: number,
  index: number,
  x = 0,
  y = 0,
  z = 0,
  segments: 6 | 8 | 12 = 8,
  topScale = 1,
  cast = true,
  receive = true,
): THREE.Mesh {
  const geo = segments === 6 ? GEO.cylinder6 : segments === 12 ? GEO.cylinder12 : GEO.cylinder8;
  const mesh = addMesh(parent, geo, lambert(index), x, y, z, cast, receive);
  mesh.scale.set(radius * 2 * Math.sqrt(topScale), height, radius * 2 * Math.sqrt(topScale));
  return mesh;
}

export function addCylinderGeo(
  parent: THREE.Object3D,
  rTop: number,
  rBottom: number,
  height: number,
  index: number,
  x = 0,
  y = 0,
  z = 0,
  segments = 8,
): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, height, segments, 1);
  return addMesh(parent, geo, lambert(index), x, y, z, true, true);
}

export function addCone(
  parent: THREE.Object3D,
  radius: number,
  height: number,
  index: number,
  x = 0,
  y = 0,
  z = 0,
  segments: 6 | 8 = 6,
): THREE.Mesh {
  const mesh = addMesh(parent, segments === 6 ? GEO.cone6 : GEO.cone8, lambert(index), x, y, z, true, true);
  mesh.scale.set(radius * 2, height, radius * 2);
  return mesh;
}

export function addSphere(
  parent: THREE.Object3D,
  radius: number,
  index: number,
  x = 0,
  y = 0,
  z = 0,
  detail: 'sphere' | 'ico' | 'dodeca' = 'ico',
  scaleY = 1,
): THREE.Mesh {
  const geo = detail === 'sphere' ? GEO.sphere : detail === 'dodeca' ? GEO.dodeca : GEO.ico;
  const mesh = addMesh(parent, geo, lambert(index), x, y, z, true, true);
  mesh.scale.set(radius * 2, radius * 2 * scaleY, radius * 2);
  return mesh;
}

export function orientBetween(mesh: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, axis: 'y' | 'z' = 'y'): void {
  const delta = new THREE.Vector3().subVectors(b, a);
  const len = delta.length();
  if (len < 1e-5) return;
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  mesh.position.copy(mid);
  if (axis === 'y') {
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize());
  } else {
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), delta.clone().normalize());
  }
}

export function segment(
  parent: THREE.Object3D,
  a: THREE.Vector3,
  b: THREE.Vector3,
  radius: number,
  index: number,
  segments: 6 | 8 = 6,
): THREE.Mesh {
  const mesh = addCylinder(parent, radius, 1, index, 0, 0, 0, segments);
  orientBetween(mesh, a, b);
  const d = a.distanceTo(b);
  mesh.scale.set(radius * 2, d, radius * 2);
  return mesh;
}

export function simpleRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeCanvasTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
  repeat?: { x: number; y: number },
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat.x, repeat.y);
  }
  return texture;
}

export function circleTexture(color = '#fff6e0', size = 32): THREE.CanvasTexture {
  return makeCanvasTexture(size, size, (ctx) => {
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = color;
    const c = size / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = Math.hypot(x - c + 0.5, y - c + 0.5);
        if (d < c * 0.62) {
          ctx.globalAlpha = d < c * 0.35 ? 1 : 0.45;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
    ctx.globalAlpha = 1;
  });
}

export function paletteColor(index: number): THREE.Color {
  return new THREE.Color(hexOf(index));
}

export function paletteList(): string[] {
  return [...PALETTE_HEX];
}
