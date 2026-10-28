import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export interface BatchStats {
  root: string;
  meshesBefore: number;
  meshesAfter: number;
  batches: number;
}

interface BatchGroup {
  material: THREE.Material;
  castShadow: boolean;
  receiveShadow: boolean;
  geometries: THREE.BufferGeometry[];
  meshes: THREE.Mesh[];
}

interface ColorBatchGroup {
  material: THREE.MeshLambertMaterial;
  castShadow: boolean;
  receiveShadow: boolean;
  geometries: THREE.BufferGeometry[];
  meshes: THREE.Mesh[];
}

function attributeSignature(geometry: THREE.BufferGeometry): string {
  const keys = Object.keys(geometry.attributes).sort();
  return keys
    .map((key) => {
      const attribute = geometry.attributes[key];
      return `${key}:${attribute.itemSize}:${attribute.normalized ? 1 : 0}`;
    })
    .join(',');
}

export function batchStatic(root: THREE.Object3D, label = root.name || root.type): BatchStats {
  root.updateWorldMatrix(true, true);
  const inverseRoot = root.matrixWorld.clone().invert();
  const groups = new Map<string, BatchGroup>();
  let meshesBefore = 0;

  const collect = (object: THREE.Object3D, blocked: boolean): void => {
    const isBlocked = blocked || object.userData.noBatch === true;
    if ((object as THREE.Mesh).isMesh && !isBlocked) {
      const mesh = object as THREE.Mesh;
      const isSkinned = (mesh as unknown as { isSkinnedMesh?: boolean }).isSkinnedMesh;
      const isInstanced = (mesh as unknown as { isInstancedMesh?: boolean }).isInstancedMesh;
      if (
        !isSkinned &&
        !isInstanced &&
        mesh.visible &&
        !Array.isArray(mesh.material) &&
        mesh.material &&
        !mesh.material.transparent &&
        mesh.geometry &&
        Object.keys(mesh.geometry.morphAttributes).length === 0
      ) {
        meshesBefore++;
        const material = mesh.material as THREE.Material;
        const key = [
          material.uuid,
          mesh.castShadow ? 1 : 0,
          mesh.receiveShadow ? 1 : 0,
          mesh.geometry.index ? 'indexed' : 'plain',
          attributeSignature(mesh.geometry),
        ].join('|');
        let group = groups.get(key);
        if (!group) {
          group = {
            material,
            castShadow: mesh.castShadow,
            receiveShadow: mesh.receiveShadow,
            geometries: [],
            meshes: [],
          };
          groups.set(key, group);
        }
        const geometry = mesh.geometry.clone();
        const relative = new THREE.Matrix4().multiplyMatrices(inverseRoot, mesh.matrixWorld);
        geometry.applyMatrix4(relative);
        geometry.clearGroups();
        group.geometries.push(geometry);
        group.meshes.push(mesh);
      }
    }
    for (const child of object.children) collect(child, isBlocked);
  };

  collect(root, false);

  let batches = 0;
  for (const group of groups.values()) {
    if (group.geometries.length < 2) {
      group.geometries.forEach((geometry) => geometry.dispose());
      continue;
    }
    const merged = mergeGeometries(group.geometries, false);
    group.geometries.forEach((geometry) => geometry.dispose());
    if (!merged) {
      console.warn(`[love-all] Could not batch ${group.geometries.length} meshes in ${label}`);
      continue;
    }
    for (const mesh of group.meshes) mesh.removeFromParent();
    const mesh = new THREE.Mesh(merged, group.material);
    mesh.castShadow = group.castShadow;
    mesh.receiveShadow = group.receiveShadow;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.frustumCulled = true;
    root.add(mesh);
    batches++;
  }

  root.updateWorldMatrix(true, true);
  const meshesAfter = countMeshes(root);
  if (batches > 0) {
    console.info(`[love-all] batched ${label}: ${meshesBefore} → ${meshesAfter} meshes (${batches} batches)`);
  }
  return { root: label, meshesBefore, meshesAfter, batches };
}

function isColorMergeable(material: THREE.Material): material is THREE.MeshLambertMaterial {
  const m = material as THREE.MeshLambertMaterial;
  return (
    m.isMeshLambertMaterial === true &&
    !m.transparent &&
    m.opacity === 1 &&
    m.alphaTest === 0 &&
    !m.map &&
    !m.alphaMap &&
    !m.lightMap &&
    !m.aoMap &&
    !m.emissiveMap &&
    !m.bumpMap &&
    !m.normalMap &&
    !m.displacementMap &&
    !m.envMap &&
    m.emissive.getHex() === 0
  );
}

export function batchColoredStatic(roots: THREE.Object3D[], parent: THREE.Object3D, label = 'static'): BatchStats {
  parent.updateWorldMatrix(true, true);
  const inverseParent = parent.matrixWorld.clone().invert();
  const groups = new Map<string, ColorBatchGroup>();
  let meshesBefore = 0;

  const collect = (object: THREE.Object3D, blocked: boolean): void => {
    const isBlocked = blocked || object.userData.noBatch === true;
    if ((object as THREE.Mesh).isMesh && !isBlocked) {
      const mesh = object as THREE.Mesh;
      const isSkinned = (mesh as unknown as { isSkinnedMesh?: boolean }).isSkinnedMesh;
      const isInstanced = (mesh as unknown as { isInstancedMesh?: boolean }).isInstancedMesh;
      const material = Array.isArray(mesh.material) ? null : mesh.material;
      if (
        !isSkinned &&
        !isInstanced &&
        mesh.visible &&
        material &&
        isColorMergeable(material) &&
        mesh.geometry &&
        mesh.geometry.getAttribute('position') &&
        Object.keys(mesh.geometry.morphAttributes).length === 0 &&
        mesh.geometry.drawRange.count === Infinity
      ) {
        const geometry = mesh.geometry.clone();
        const relative = new THREE.Matrix4().multiplyMatrices(inverseParent, mesh.matrixWorld);
        geometry.applyMatrix4(relative);
        geometry.clearGroups();
        const positions = geometry.getAttribute('position');
        const sourceColor = geometry.getAttribute('color') as THREE.BufferAttribute | undefined;
        const color = material.vertexColors && sourceColor ? sourceColor : null;
        const colors = new Float32Array(positions.count * 3);
        for (let i = 0; i < positions.count; i++) {
          const r = color ? color.getX(i) : 1;
          const g = color ? color.getY(i) : 1;
          const b = color ? color.getZ(i) : 1;
          colors[i * 3] = material.color.r * r;
          colors[i * 3 + 1] = material.color.g * g;
          colors[i * 3 + 2] = material.color.b * b;
        }
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        meshesBefore++;
        const key = [
          material.side,
          material.flatShading ? 1 : 0,
          material.toneMapped ? 1 : 0,
          material.fog ? 1 : 0,
          mesh.castShadow ? 1 : 0,
          mesh.receiveShadow ? 1 : 0,
          geometry.index ? 'indexed' : 'plain',
          attributeSignature(geometry),
        ].join('|');
        let group = groups.get(key);
        if (!group) {
          group = {
            material,
            castShadow: mesh.castShadow,
            receiveShadow: mesh.receiveShadow,
            geometries: [],
            meshes: [],
          };
          groups.set(key, group);
        }
        group.geometries.push(geometry);
        group.meshes.push(mesh);
      }
    }
    for (const child of object.children) collect(child, isBlocked);
  };

  for (const root of roots) collect(root, false);

  let batches = 0;
  for (const group of groups.values()) {
    if (group.geometries.length < 2) {
      group.geometries.forEach((geometry) => geometry.dispose());
      continue;
    }
    const merged = mergeGeometries(group.geometries, false);
    group.geometries.forEach((geometry) => geometry.dispose());
    if (!merged) {
      console.warn(`[love-all] Could not color-batch ${group.meshes.length} meshes in ${label}`);
      continue;
    }
    for (const mesh of group.meshes) mesh.removeFromParent();
    const material = new THREE.MeshLambertMaterial({
      vertexColors: true,
      flatShading: group.material.flatShading,
      side: group.material.side,
    });
    material.toneMapped = group.material.toneMapped;
    material.fog = group.material.fog;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = group.castShadow;
    mesh.receiveShadow = group.receiveShadow;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    parent.add(mesh);
    batches++;
  }

  parent.updateWorldMatrix(true, true);
  const stats = {
    root: label,
    meshesBefore,
    meshesAfter: countMeshes(parent),
    batches,
  };
  if (batches > 0) {
    console.info(`[love-all] color-batched ${label}: ${meshesBefore} meshes -> ${batches} batches`);
  }
  return stats;
}

function countMeshes(root: THREE.Object3D): number {
  let count = 0;
  root.traverse((object) => {
    if ((object as THREE.Mesh).isMesh) count++;
  });
  return count;
}


