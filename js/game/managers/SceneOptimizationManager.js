import * as THREE from "three";

const sharedFrustum = new THREE.Frustum();
const sharedProjScreenMatrix = new THREE.Matrix4();
const sharedWorldPos = new THREE.Vector3();
const sharedSize = new THREE.Vector3();
const sharedSphere = new THREE.Sphere();

function getFirstMesh(root) {
  let found = null;
  root?.traverse((child) => {
    if (found || !child?.isMesh) return;
    found = child;
  });
  return found;
}

function estimateColorFromMaterial(material) {
  if (!material) return 0x9ca28f;
  if (Array.isArray(material)) {
    return estimateColorFromMaterial(material[0]);
  }
  return material.color?.getHex?.() || 0x9ca28f;
}

export class SceneOptimizationManager {
  constructor(sceneStore, scene) {
    this.sceneStore = sceneStore;
    this.scene = scene;
    this.trackables = [];
    this.instancedGroups = [];
    this.frame = 0;
    this.lastViewDistance = null;
  }

  rebuild() {
    this.clearStaticInstancing();
    this.trackables = this.sceneStore
      .listEntities()
      .filter((entity) => !["camera", "light"].includes(entity.type))
      .map((entity) => ({
        entity,
        radius: this.computeEntityRadius(entity),
      }));
  }

  applyQuality(settings) {
    if (!settings) return;
    this.prepareModelLods(settings);
    if (this.lastViewDistance !== settings.viewDistance) {
      this.lastViewDistance = settings.viewDistance;
      this.rebuildStaticInstancing();
    }
  }

  computeEntityRadius(entity) {
    if (!entity?.three) return 1;
    const box = new THREE.Box3().setFromObject(entity.three);
    if (box.isEmpty()) return 1;
    box.getSize(sharedSize);
    return Math.max(1, sharedSize.length() * 0.5);
  }

  prepareModelLods(settings) {
    const lodNear = settings.lodNear ?? 30;
    const lodFar = settings.lodFar ?? 95;

    this.sceneStore.listEntities().forEach((entity) => {
      if (entity.type !== "model") return;
      if (!entity.three?.children?.length) return;
      if (entity.three.userData.runtimeLod) return;
      if ((entity.components?.length || 0) > 0) return;
      if ((entity.animations?.length || 0) > 0) return;

      const modelRoot = entity.three.children[0];
      if (!modelRoot) return;
      let hasSkinnedMesh = false;
      modelRoot.traverse((child) => {
        if (child?.isSkinnedMesh) hasSkinnedMesh = true;
      });
      if (hasSkinnedMesh) return;
      const box = new THREE.Box3().setFromObject(modelRoot);
      if (box.isEmpty()) return;

      const center = new THREE.Vector3();
      const size = new THREE.Vector3();
      box.getCenter(center);
      box.getSize(size);
      const dominant = Math.max(size.x, size.y, size.z, 0.001);

      const baseMesh = getFirstMesh(modelRoot);
      const baseColor = estimateColorFromMaterial(baseMesh?.material);

      const midMesh = new THREE.Mesh(
        new THREE.BoxGeometry(size.x || dominant * 0.8, size.y || dominant, size.z || dominant * 0.8),
        new THREE.MeshStandardMaterial({
          color: baseColor,
          roughness: 0.88,
          metalness: 0.03,
        })
      );
      midMesh.position.copy(center);
      midMesh.castShadow = false;
      midMesh.receiveShadow = true;

      const farMesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(dominant * 0.36, 0),
        new THREE.MeshLambertMaterial({ color: baseColor })
      );
      farMesh.position.copy(center);
      farMesh.castShadow = false;
      farMesh.receiveShadow = false;

      const lod = new THREE.LOD();
      lod.addLevel(modelRoot, 0);
      lod.addLevel(midMesh, lodNear);
      lod.addLevel(farMesh, lodFar);
      lod.matrixAutoUpdate = true;
      lod.userData.ignoreRaycast = true;

      entity.three.add(lod);
      entity.three.userData.runtimeLod = lod;
      modelRoot.visible = true;
    });
  }

  rebuildStaticInstancing() {
    this.clearStaticInstancing();

    const groups = new Map();
    this.sceneStore.listEntities().forEach((entity) => {
      if (entity.type !== "model") return;
      if (!entity.source?.path) return;
      if ((entity.components?.length || 0) > 0) return;
      if (entity.animation?.playing) return;
      const key = entity.source.path;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(entity);
    });

    groups.forEach((entities) => {
      if (entities.length < 3) return;
      const root = entities[0]?.three?.children?.[0];
      const mesh = getFirstMesh(root);
      if (!mesh?.geometry || !mesh?.material) return;

      const instanced = new THREE.InstancedMesh(mesh.geometry, mesh.material, entities.length);
      instanced.userData.ignoreRaycast = true;
      instanced.castShadow = !!mesh.castShadow;
      instanced.receiveShadow = !!mesh.receiveShadow;

      entities.forEach((entity, index) => {
        entity.three.updateWorldMatrix(true, false);
        instanced.setMatrixAt(index, entity.three.matrixWorld);
        entity.three.visible = false;
      });
      instanced.count = entities.length;
      instanced.instanceMatrix.needsUpdate = true;
      this.scene.add(instanced);

      this.instancedGroups.push({ instanced, entities });
    });
  }

  clearStaticInstancing() {
    this.instancedGroups.forEach((entry) => {
      entry.instanced.parent?.remove(entry.instanced);
      entry.entities.forEach((entity) => {
        if (entity?.three) entity.three.visible = entity.active !== false;
      });
    });
    this.instancedGroups = [];
  }

  update(camera, settings) {
    if (!camera || !settings) return;
    this.frame += 1;
    if (this.frame % 120 === 0) {
      this.prepareModelLods(settings);
    }

    sharedProjScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    sharedFrustum.setFromProjectionMatrix(sharedProjScreenMatrix);

    const viewDistance = settings.viewDistance ?? 200;
    const shadowDistance = settings.shadowDistance ?? 70;
    const effectDistance = settings.effectDistance ?? 65;

    this.trackables.forEach((item) => {
      const entity = item.entity;
      if (!entity?.three) return;
      if (this.isEntityInstanced(entity)) return;

      entity.three.getWorldPosition(sharedWorldPos);
      const distance = camera.position.distanceTo(sharedWorldPos);
      const radius = item.radius || 1;
      sharedSphere.center.copy(sharedWorldPos);
      sharedSphere.radius = radius;
      let inFrustum = true;
      if (entity.type !== "model" || (!(entity.components?.length) && !(entity.animations?.length))) {
        inFrustum = sharedFrustum.intersectsSphere(sharedSphere);
      }
      const visible = distance <= viewDistance && inFrustum && entity.active !== false;
      entity.three.visible = visible;

      if (visible && entity.three.userData.runtimeLod) {
        entity.three.userData.runtimeLod.update(camera);
      }

      if (this.frame % 6 === 0) {
        this.updateShadowAndEffects(entity.three, distance, shadowDistance, effectDistance);
      }
    });
  }

  updateShadowAndEffects(root, distance, shadowDistance, effectDistance) {
    root.traverse((child) => {
      if (!child?.isMesh) return;
      if (!child.userData.baseShadowState) {
        child.userData.baseShadowState = {
          castShadow: !!child.castShadow,
          receiveShadow: !!child.receiveShadow,
        };
      }

      const base = child.userData.baseShadowState;
      child.castShadow = base.castShadow && distance <= shadowDistance;
      child.receiveShadow = base.receiveShadow && distance <= effectDistance;
    });
  }

  isEntityInstanced(entity) {
    return this.instancedGroups.some((entry) => entry.entities.includes(entity));
  }
}
