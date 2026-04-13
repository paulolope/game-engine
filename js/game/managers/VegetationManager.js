import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const treeDummy = new THREE.Object3D();
const sharedFrustum = new THREE.Frustum();
const sharedProjScreenMatrix = new THREE.Matrix4();
const sharedWorldPos = new THREE.Vector3();
const sharedBoundingSphere = new THREE.Sphere();

function cloneMaterial(mat) {
  if (!mat) return new THREE.MeshStandardMaterial({ color: 0x5f7c4d, roughness: 0.9, metalness: 0.02 });
  const material = mat.clone ? mat.clone() : mat;
  material.roughness = Math.max(0.75, Number(material.roughness) || 0.78);
  material.metalness = Math.min(0.08, Number(material.metalness) || 0.02);
  if (material.map) material.map.colorSpace = THREE.SRGBColorSpace;
  if (material.emissiveMap) material.emissiveMap.colorSpace = THREE.SRGBColorSpace;
  return material;
}

function createFallbackTreeTemplate() {
  const trunk = new THREE.CylinderGeometry(0.1, 0.16, 0.82, 6);
  trunk.translate(0, 0.41, 0);
  const leaves = new THREE.ConeGeometry(0.48, 1.4, 7);
  leaves.translate(0, 1.46, 0);
  const merged = mergeGeometries([trunk, leaves], true);
  merged.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: 0x4f7440,
    roughness: 0.86,
    metalness: 0.02,
    flatShading: true,
  });
  return { meshes: [{ geometry: merged, material }] };
}

function createFarTreeGeometry() {
  const trunk = new THREE.CylinderGeometry(0.12, 0.14, 1.1, 5);
  trunk.translate(0, 0.55, 0);
  const crown = new THREE.ConeGeometry(0.7, 1.85, 6);
  crown.translate(0, 2.1, 0);
  const merged = mergeGeometries([trunk, crown], true);
  merged.computeVertexNormals();
  return merged;
}

function resolveTreeModelPath(tree) {
  if (typeof tree?.modelPath === "string" && tree.modelPath.trim()) return tree.modelPath.trim();
  if (typeof tree?.model === "string" && tree.model.trim()) return tree.model.trim();
  return "";
}

export class VegetationManager {
  constructor(sceneStore, assetManager) {
    this.sceneStore = sceneStore;
    this.assetManager = assetManager;
    this.terrains = [];
    this.templateCache = new Map();
    this.fallbackTemplate = createFallbackTreeTemplate();
    this.farTreeGeometry = createFarTreeGeometry();
    this.farTreeMaterial = new THREE.MeshLambertMaterial({ color: 0x4c6940 });
    this.lastAppliedDensity = null;
  }

  async rebuild() {
    this.disposeRuntime();
    const terrains = this.sceneStore.listEntities().filter((entity) => entity.type === "terrain");
    for (const terrainEntity of terrains) {
      const trees = Array.isArray(terrainEntity.terrain?.trees) ? terrainEntity.terrain.trees : [];
      if (!trees.length) continue;

      if (terrainEntity.terrain?.treesGroup) {
        terrainEntity.terrain.treesGroup.visible = false;
      }

      const runtime = {
        terrainEntity,
        group: new THREE.Group(),
        buckets: [],
      };
      runtime.group.name = "Vegetation Runtime";
      runtime.group.userData.ignoreRaycast = true;
      terrainEntity.three.add(runtime.group);

      const grouped = new Map();
      trees.forEach((tree) => {
        const key = resolveTreeModelPath(tree) || "__fallback__";
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push({
          x: Number(tree.x) || 0,
          y: Number(tree.y) || 0,
          z: Number(tree.z) || 0,
          scale: Math.max(0.01, Number(tree.scale) || 1),
          rotation: Number(tree.rotation) || 0,
        });
      });

      for (const [key, bucketTrees] of grouped.entries()) {
        const template = key === "__fallback__" ? this.fallbackTemplate : await this.getTemplateForPath(key);
        const bucket = this.createBucket(runtime.group, bucketTrees, template || this.fallbackTemplate);
        runtime.buckets.push(bucket);
      }

      this.terrains.push(runtime);
    }
  }

  async getTemplateForPath(path) {
    const cacheKey = String(path || "").trim();
    if (!cacheKey) return this.fallbackTemplate;

    const cached = this.templateCache.get(cacheKey);
    if (cached) return cached;

    try {
      const gltf = await this.assetManager.loadGLTF(cacheKey);
      const template = this.buildTemplateFromScene(gltf?.scene);
      this.templateCache.set(cacheKey, template || this.fallbackTemplate);
      return this.templateCache.get(cacheKey);
    } catch (error) {
      this.templateCache.set(cacheKey, this.fallbackTemplate);
      return this.fallbackTemplate;
    }
  }

  buildTemplateFromScene(sceneRoot) {
    if (!sceneRoot) return this.fallbackTemplate;

    const root = sceneRoot.clone(true);
    root.updateMatrixWorld(true);
    const meshes = [];
    const bounds = new THREE.Box3();
    let hasBounds = false;

    root.traverse((child) => {
      if (!child?.isMesh || !child.geometry) return;
      const geometry = child.geometry.clone();
      geometry.applyMatrix4(child.matrixWorld);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();

      if (geometry.boundingBox) {
        if (!hasBounds) {
          bounds.copy(geometry.boundingBox);
          hasBounds = true;
        } else {
          bounds.union(geometry.boundingBox);
        }
      }

      const material = Array.isArray(child.material)
        ? child.material.map((item) => cloneMaterial(item))
        : cloneMaterial(child.material);
      meshes.push({ geometry, material });
    });

    if (!meshes.length || !hasBounds) return this.fallbackTemplate;

    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    bounds.getSize(size);
    bounds.getCenter(center);
    const targetHeight = 9.2;
    const height = Math.max(size.y, 0.001);
    const scale = targetHeight / height;
    const toOrigin = new THREE.Matrix4().makeTranslation(-center.x, -bounds.min.y, -center.z);
    const toScale = new THREE.Matrix4().makeScale(scale, scale, scale);
    const normalizeMatrix = new THREE.Matrix4().multiplyMatrices(toScale, toOrigin);

    meshes.forEach((entry) => {
      entry.geometry.applyMatrix4(normalizeMatrix);
      entry.geometry.computeBoundingBox();
      entry.geometry.computeBoundingSphere();
    });
    return { meshes };
  }

  createBucket(parentGroup, trees, template) {
    const nearMeshes = (template?.meshes || []).map((entry) => {
      const instanced = new THREE.InstancedMesh(entry.geometry, entry.material, Math.max(1, trees.length));
      instanced.count = 0;
      instanced.frustumCulled = false;
      instanced.castShadow = true;
      instanced.receiveShadow = true;
      instanced.userData.ignoreRaycast = true;
      parentGroup.add(instanced);
      return instanced;
    });

    const farMesh = new THREE.InstancedMesh(this.farTreeGeometry, this.farTreeMaterial, Math.max(1, trees.length));
    farMesh.count = 0;
    farMesh.frustumCulled = false;
    farMesh.castShadow = false;
    farMesh.receiveShadow = true;
    farMesh.userData.ignoreRaycast = true;
    parentGroup.add(farMesh);

    return {
      trees,
      nearMeshes,
      farMesh,
    };
  }

  update(camera, settings) {
    if (!camera || !settings) return;
    if (!this.terrains.length) return;

    sharedProjScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    sharedFrustum.setFromProjectionMatrix(sharedProjScreenMatrix);
    const density = Math.max(0.05, Math.min(1, settings.vegetationDensity ?? 1));
    const densityStep = Math.max(1, Math.round(1 / density));
    const maxDistance = Math.max(24, settings.vegetationDistance ?? 100);
    const nearDistance = Math.max(8, settings.vegetationNearDistance ?? 36);

    this.terrains.forEach((runtime) => {
      runtime.terrainEntity.three.updateWorldMatrix(true, false);
      const worldMatrix = runtime.terrainEntity.three.matrixWorld;

      runtime.buckets.forEach((bucket) => {
        let nearCount = 0;
        let farCount = 0;

        for (let i = 0; i < bucket.trees.length; i += densityStep) {
          const tree = bucket.trees[i];
          sharedWorldPos.set(tree.x, tree.y, tree.z).applyMatrix4(worldMatrix);
          const distance = camera.position.distanceTo(sharedWorldPos);
          if (distance > maxDistance) continue;

          const radius = Math.max(1.8, tree.scale * 4.2);
          sharedBoundingSphere.center.copy(sharedWorldPos);
          sharedBoundingSphere.radius = radius;
          if (!sharedFrustum.intersectsSphere(sharedBoundingSphere)) continue;

          treeDummy.position.copy(sharedWorldPos);
          treeDummy.scale.setScalar(tree.scale);
          treeDummy.rotation.set(0, tree.rotation, 0);
          treeDummy.updateMatrix();

          if (distance <= nearDistance) {
            bucket.nearMeshes.forEach((mesh) => mesh.setMatrixAt(nearCount, treeDummy.matrix));
            nearCount += 1;
          } else {
            treeDummy.scale.setScalar(tree.scale * 0.95);
            treeDummy.updateMatrix();
            bucket.farMesh.setMatrixAt(farCount, treeDummy.matrix);
            farCount += 1;
          }
        }

        bucket.nearMeshes.forEach((mesh) => {
          mesh.count = nearCount;
          mesh.instanceMatrix.needsUpdate = true;
        });
        bucket.farMesh.count = farCount;
        bucket.farMesh.instanceMatrix.needsUpdate = true;
      });
    });
  }

  disposeRuntime() {
    this.terrains.forEach((runtime) => {
      runtime.group.parent?.remove(runtime.group);
      runtime.buckets.forEach((bucket) => {
        bucket.nearMeshes.forEach((mesh) => {
          mesh.parent?.remove(mesh);
        });
        bucket.farMesh.parent?.remove(bucket.farMesh);
      });
    });
    this.terrains = [];
  }
}
