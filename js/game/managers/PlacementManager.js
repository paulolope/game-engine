import * as THREE from "three";
import { getTreeCollisionRadius } from "../../utils/treeCollisions.js";

const rayOrigin = new THREE.Vector3();
const rayDirection = new THREE.Vector3();
const planePoint = new THREE.Vector3();
const worldDirection = new THREE.Vector3();
const tmpTreeWorldPosition = new THREE.Vector3();
const tmpClosestRayPoint = new THREE.Vector3();
const tmpToTree = new THREE.Vector3();
const tmpStandWorldPosition = new THREE.Vector3();
const tmpTreeForward = new THREE.Vector3();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

const TREE_TARGET_MIN_DISTANCE = 1.2;
const TREE_TARGET_MAX_DISTANCE = 11.5;
const TREE_TARGET_RADIUS_BIAS = 0.58;
const TREE_STAND_TRUNK_OFFSET = 0.42;
const TREE_STAND_OCCUPIED_RADIUS = 1.35;
const TREE_STAND_PROMPT_RADIUS = 4.2;
const TREE_STAND_REMOVE_RADIUS = 4.8;
const TREE_STAND_PLATFORM_HEIGHT = 2.08;
const TREE_STAND_MOUNT_OFFSET = 0.34;
const TREE_STAND_EXIT_OFFSET = 1.05;

function getSourcePath(entity) {
  return String(entity?.source?.path || "").trim().toLowerCase();
}

function isTreeStandEntity(entity) {
  if (!entity || entity.type !== "model") return false;
  if (entity.gameplay?.kind === "tree-stand") return true;
  const sourcePath = getSourcePath(entity);
  return sourcePath.includes("tree_stand.glb") || sourcePath === "builtin://tree-stand";
}

function buildTreeStandInteractionData(anchor = null, point = null) {
  if (!anchor || !Array.isArray(anchor.treePosition) || anchor.treePosition.length < 3 || !point) {
    return null;
  }

  const treeWorld = new THREE.Vector3(
    Number(anchor.treePosition[0]) || 0,
    Number(anchor.treePosition[1]) || 0,
    Number(anchor.treePosition[2]) || 0
  );
  const standPoint = point.clone();
  const ladderDirection = standPoint.clone().sub(treeWorld);
  ladderDirection.y = 0;
  if (ladderDirection.lengthSq() < 0.0001) {
    ladderDirection.set(0, 0, 1);
  } else {
    ladderDirection.normalize();
  }

  const mountPoint = standPoint.clone().addScaledVector(ladderDirection, TREE_STAND_MOUNT_OFFSET);
  mountPoint.y = treeWorld.y + TREE_STAND_PLATFORM_HEIGHT;

  const exitPoint = treeWorld.clone().addScaledVector(
    ladderDirection,
    Math.max(TREE_STAND_EXIT_OFFSET, (Number(anchor.treeRadius) || 0.5) + 0.8)
  );
  exitPoint.y = treeWorld.y + 0.02;

  return {
    interactionOrigin: standPoint.toArray(),
    ladderDirection: ladderDirection.toArray(),
    mountPoint: mountPoint.toArray(),
    exitPoint: exitPoint.toArray(),
    promptRadius: TREE_STAND_PROMPT_RADIUS,
    removeRadius: TREE_STAND_REMOVE_RADIUS,
  };
}

function applyTreeStandGameplay(entity, anchor = null, interaction = null) {
  if (!entity) return entity;
  entity.gameplay = {
    ...(entity.gameplay || {}),
    kind: "tree-stand",
    placedByPlayer: true,
    promptRadius: Number(interaction?.promptRadius) || TREE_STAND_PROMPT_RADIUS,
    removeRadius: Number(interaction?.removeRadius) || TREE_STAND_REMOVE_RADIUS,
    mountEyeHeightFactor: 0.92,
    mountBackOffsetFactor: 0.16,
    exitForwardFactor: 0.72,
    anchor,
    interactionOrigin: interaction?.interactionOrigin || null,
    ladderDirection: interaction?.ladderDirection || null,
    mountPoint: interaction?.mountPoint || null,
    exitPoint: interaction?.exitPoint || null,
  };
  return entity;
}

function makeMaterial(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.82,
    metalness: options.metalness ?? 0.06,
    transparent: options.transparent === true,
    opacity: options.opacity ?? 1,
    emissive: options.emissive ?? 0x000000,
  });
}

function createTreeStandGroup({ preview = false } = {}) {
  const root = new THREE.Group();
  const bodyMaterial = makeMaterial(preview ? 0x83c47f : 0x5a6f4d, {
    transparent: preview,
    opacity: preview ? 0.42 : 1,
    emissive: preview ? 0x18321a : 0x000000,
  });
  const metalMaterial = makeMaterial(preview ? 0x9cc0ff : 0x7a828c, {
    roughness: 0.62,
    metalness: 0.32,
    transparent: preview,
    opacity: preview ? 0.4 : 1,
    emissive: preview ? 0x132131 : 0x000000,
  });

  const pieces = [];

  const platform = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.08, 0.9), bodyMaterial);
  platform.position.set(0, 3.4, 0);
  pieces.push(platform);

  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.07, 0.48), bodyMaterial);
  seat.position.set(0, 2.9, -0.14);
  pieces.push(seat);

  const back = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.52, 0.06), bodyMaterial);
  back.position.set(0, 3.15, -0.34);
  pieces.push(back);

  const footRest = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.22), metalMaterial);
  footRest.position.set(0, 2.15, 0.36);
  pieces.push(footRest);

  const ladderLeft = new THREE.Mesh(new THREE.BoxGeometry(0.06, 3.2, 0.06), metalMaterial);
  ladderLeft.position.set(-0.28, 1.6, 0.38);
  pieces.push(ladderLeft);

  const ladderRight = new THREE.Mesh(new THREE.BoxGeometry(0.06, 3.2, 0.06), metalMaterial);
  ladderRight.position.set(0.28, 1.6, 0.38);
  pieces.push(ladderRight);

  for (let index = 0; index < 7; index += 1) {
    const rung = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.045, 0.045), metalMaterial);
    rung.position.set(0, 0.55 + index * 0.42, 0.38);
    pieces.push(rung);
  }

  const railOffsets = [
    [-0.48, 3.7, 0],
    [0.48, 3.7, 0],
    [0, 3.7, 0.4],
  ];
  railOffsets.forEach(([x, y, z]) => {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(z === 0 ? 0.06 : 0.92, 0.42, z === 0 ? 0.72 : 0.06),
      metalMaterial
    );
    rail.position.set(x, y, z);
    pieces.push(rail);
  });

  const supportA = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.5, 0.06), metalMaterial);
  supportA.position.set(-0.43, 2.2, -0.22);
  supportA.rotation.z = THREE.MathUtils.degToRad(-14);
  pieces.push(supportA);

  const supportB = supportA.clone();
  supportB.position.x = 0.43;
  supportB.rotation.z = THREE.MathUtils.degToRad(14);
  pieces.push(supportB);

  const trunkClamp = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.72), metalMaterial);
  trunkClamp.position.set(0, 3.05, -0.42);
  pieces.push(trunkClamp);

  pieces.forEach((mesh) => {
    mesh.castShadow = !preview;
    mesh.receiveShadow = true;
    mesh.userData.ignoreRaycast = true;
    root.add(mesh);
  });

  root.userData.ignoreRaycast = true;
  root.position.y = 0.02;
  return root;
}

export class PlacementManager {
  constructor({ scene, sceneStore, assetManager, inventoryManager, domElement, uiState, statusTarget, onPlaced }) {
    this.scene = scene;
    this.sceneStore = sceneStore;
    this.assetManager = assetManager;
    this.inventoryManager = inventoryManager;
    this.domElement = domElement;
    this.uiState = uiState || { isInventoryOpen: false };
    this.statusTarget = statusTarget || null;
    this.onPlaced = onPlaced || null;

    this.enabled = false;
    this.previewRoot = null;
    this.previewItemId = "";
    this.previewVisible = false;
    this.placeCounter = 0;
    this.assetAvailability = new Map();
    this.raycaster = new THREE.Raycaster();
    this.lastPlacementPoint = new THREE.Vector3();
    this.lastPlacementYaw = 0;
    this.lastPlacementContext = null;

    this.onPointerDown = (event) => {
      if (!this.enabled || this.uiState.isInventoryOpen) return;
      if (event.button !== 0) return;
      const item = this.getEquippedPlaceableItem();
      if (!item?.placement || item.placement.requiresInteractMenu === true) return;
      event.preventDefault();
      void this.placeCurrentItem(item);
    };
  }

  initialize() {
    this.domElement?.addEventListener("pointerdown", this.onPointerDown);
  }

  setEnabled(enabled) {
    this.enabled = enabled !== false;
    if (!this.enabled) {
      this.hidePreview();
      this.lastPlacementContext = null;
    }
  }

  getEquippedPlaceableItem() {
    const item = this.inventoryManager?.getEquippedItem?.() || null;
    return item?.placement ? item : null;
  }

  isTreePlacement(item) {
    return String(item?.placement?.surface || "").trim().toLowerCase() === "tree";
  }

  async resolveAssetAvailability(assetPath = "") {
    const key = String(assetPath || "").trim();
    if (!key) return false;
    if (this.assetAvailability.has(key)) {
      return this.assetAvailability.get(key);
    }
    const exists = await this.assetManager.assetExists(key);
    this.assetAvailability.set(key, exists);
    return exists;
  }

  ensurePreview(item) {
    if (!item?.id) {
      this.hidePreview();
      return;
    }
    if (this.previewRoot && this.previewItemId === item.id) {
      return;
    }
    this.hidePreview();
    this.previewItemId = item.id;
    this.previewRoot = createTreeStandGroup({ preview: true });
    this.previewRoot.visible = false;
    this.scene.add(this.previewRoot);
  }

  hidePreview() {
    if (this.previewRoot?.parent) {
      this.previewRoot.parent.remove(this.previewRoot);
    }
    this.previewRoot = null;
    this.previewItemId = "";
    this.previewVisible = false;
  }

  getTerrainMeshes() {
    return this.sceneStore
      .listEntities()
      .filter((entity) => entity?.type === "terrain" && entity.terrain?.mesh)
      .map((entity) => entity.terrain.mesh);
  }

  findGroundPlacementContext(camera) {
    if (!camera) return null;

    this.raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    rayOrigin.copy(this.raycaster.ray.origin);
    rayDirection.copy(this.raycaster.ray.direction);

    const terrainMeshes = this.getTerrainMeshes();
    if (terrainMeshes.length) {
      const hits = this.raycaster.intersectObjects(terrainMeshes, false);
      const hit = hits.find((entry) => entry?.point);
      if (hit?.point) {
        camera.getWorldDirection(worldDirection);
        worldDirection.y = 0;
        if (worldDirection.lengthSq() < 0.0001) {
          worldDirection.set(0, 0, -1);
        }
        worldDirection.normalize();
        return {
          mode: "ground",
          point: hit.point.clone(),
          yaw: Math.atan2(worldDirection.x, -worldDirection.z),
        };
      }
    }

    if (this.raycaster.ray.intersectPlane(groundPlane, planePoint)) {
      camera.getWorldDirection(worldDirection);
      worldDirection.y = 0;
      if (worldDirection.lengthSq() < 0.0001) {
        worldDirection.set(0, 0, -1);
      }
      worldDirection.normalize();
      return {
        mode: "ground",
        point: planePoint.clone(),
        yaw: Math.atan2(worldDirection.x, -worldDirection.z),
      };
    }

    return null;
  }

  findStandNearTree(worldPosition, maxDistance = TREE_STAND_OCCUPIED_RADIUS) {
    let best = null;
    let bestDistance = Infinity;

    this.sceneStore.listEntities().forEach((entity) => {
      if (!isTreeStandEntity(entity) || entity.active === false || !entity.three) return;

      const anchorTreePosition = entity.gameplay?.anchor?.treePosition;
      if (Array.isArray(anchorTreePosition) && anchorTreePosition.length >= 3) {
        tmpStandWorldPosition.set(
          Number(anchorTreePosition[0]) || 0,
          Number(anchorTreePosition[1]) || 0,
          Number(anchorTreePosition[2]) || 0
        );
      } else {
        entity.three.getWorldPosition(tmpStandWorldPosition);
      }

      const distance = tmpStandWorldPosition.distanceTo(worldPosition);
      if (distance > maxDistance || distance >= bestDistance) return;
      best = entity;
      bestDistance = distance;
    });

    return best;
  }

  findTreePlacementContext(camera) {
    if (!camera) return null;

    this.raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    rayOrigin.copy(this.raycaster.ray.origin);
    rayDirection.copy(this.raycaster.ray.direction).normalize();

    let best = null;
    let bestScore = Infinity;

    this.sceneStore.listEntities().forEach((terrainEntity) => {
      if (terrainEntity?.type !== "terrain" || terrainEntity.active === false || !terrainEntity.three) return;
      const trees = Array.isArray(terrainEntity.terrain?.trees) ? terrainEntity.terrain.trees : [];
      if (!trees.length) return;

      trees.forEach((tree, treeIndex) => {
        const localX = Number(tree?.x);
        const localY = Number(tree?.y);
        const localZ = Number(tree?.z);
        if (!Number.isFinite(localX) || !Number.isFinite(localZ)) return;

        tmpTreeWorldPosition.set(localX, Number.isFinite(localY) ? localY : 0, localZ);
        terrainEntity.three.localToWorld(tmpTreeWorldPosition);

        tmpToTree.copy(tmpTreeWorldPosition).sub(rayOrigin);
        const forwardDistance = tmpToTree.dot(rayDirection);
        if (forwardDistance < TREE_TARGET_MIN_DISTANCE || forwardDistance > TREE_TARGET_MAX_DISTANCE) return;

        tmpClosestRayPoint.copy(rayDirection).multiplyScalar(forwardDistance).add(rayOrigin);
        const treeRadius = Math.max(0.45, getTreeCollisionRadius(tree) * 0.75);
        const offAxisDistance = tmpClosestRayPoint.distanceTo(tmpTreeWorldPosition);
        const maxOffAxisDistance = treeRadius + TREE_TARGET_RADIUS_BIAS;
        if (offAxisDistance > maxOffAxisDistance) return;

        tmpTreeForward.set(rayOrigin.x - tmpTreeWorldPosition.x, 0, rayOrigin.z - tmpTreeWorldPosition.z);
        if (tmpTreeForward.lengthSq() < 0.0001) {
          tmpTreeForward.set(-rayDirection.x, 0, -rayDirection.z);
        }
        if (tmpTreeForward.lengthSq() < 0.0001) {
          tmpTreeForward.set(0, 0, 1);
        }
        tmpTreeForward.normalize();

        const offsetFromTree = Math.max(TREE_STAND_TRUNK_OFFSET + treeRadius * 0.45, treeRadius + 0.18);
        const placementPoint = tmpTreeWorldPosition.clone().addScaledVector(tmpTreeForward, offsetFromTree);
        placementPoint.y = tmpTreeWorldPosition.y + 0.02;

        const occupiedStand = this.findStandNearTree(
          tmpTreeWorldPosition,
          Math.max(TREE_STAND_OCCUPIED_RADIUS, treeRadius + 0.75)
        );
        const score = offAxisDistance * 5 + forwardDistance + (occupiedStand ? 6 : 0);
        if (score >= bestScore) return;

        bestScore = score;
        best = {
          mode: "tree",
          point: placementPoint,
          yaw: Math.atan2(tmpTreeForward.x, -tmpTreeForward.z),
          treeWorld: tmpTreeWorldPosition.clone(),
          treeLocal: {
            x: localX,
            y: Number.isFinite(localY) ? localY : 0,
            z: localZ,
          },
          treeRadius,
          treeIndex,
          terrainId: terrainEntity.id,
          occupiedStandId: occupiedStand?.id || "",
        };
      });
    });

    return best;
  }

  resolvePlacementContext(camera, item) {
    if (!item?.placement) return null;
    return this.isTreePlacement(item) ? this.findTreePlacementContext(camera) : this.findGroundPlacementContext(camera);
  }

  getPlacementContext() {
    return this.lastPlacementContext;
  }

  canPlaceCurrentItem() {
    const item = this.getEquippedPlaceableItem();
    return !!item?.placement && !!this.lastPlacementContext && !this.lastPlacementContext.occupiedStandId;
  }

  update(camera) {
    if (!this.enabled || this.uiState.isInventoryOpen) {
      if (this.previewRoot) this.previewRoot.visible = false;
      this.previewVisible = false;
      this.lastPlacementContext = null;
      return;
    }

    const item = this.getEquippedPlaceableItem();
    if (!item?.placement) {
      if (this.previewRoot) this.previewRoot.visible = false;
      this.previewVisible = false;
      this.lastPlacementContext = null;
      return;
    }

    this.ensurePreview(item);
    if (!this.previewRoot) return;

    const placementContext = this.resolvePlacementContext(camera, item);
    this.lastPlacementContext = placementContext;
    if (!placementContext || placementContext.occupiedStandId) {
      this.previewRoot.visible = false;
      this.previewVisible = false;
      return;
    }

    this.lastPlacementPoint.copy(placementContext.point);
    this.lastPlacementYaw = placementContext.yaw;
    this.previewRoot.position.copy(placementContext.point);
    this.previewRoot.rotation.set(0, placementContext.yaw, 0);
    this.previewRoot.visible = true;
    this.previewVisible = true;
  }

  async placeEquippedItem() {
    const item = this.getEquippedPlaceableItem();
    if (!item?.placement) return false;
    return this.placeCurrentItem(item);
  }

  async placeCurrentItem(item) {
    const placementContext = this.lastPlacementContext;
    if (!item?.placement || !placementContext) {
      const message = this.isTreePlacement(item)
        ? "Aponte para uma arvore valida para colocar o tree stand."
        : "Escolha um local valido para colocar este item.";
      this.statusTarget?.setStatus?.(message, 1200);
      return false;
    }

    if (placementContext.occupiedStandId) {
      this.statusTarget?.setStatus?.("Ja existe um tree stand nesta arvore.", 1200);
      return false;
    }

    const point = placementContext.point.clone();
    const yaw = placementContext.yaw;
    const assetPath = String(item.placement.assetPath || "").trim();
    const canUseAsset = await this.resolveAssetAvailability(assetPath);
    const name = `${item.label} ${++this.placeCounter}`;
    const anchor =
      placementContext.mode === "tree"
        ? {
            type: "tree",
            terrainId: placementContext.terrainId,
            treeIndex: placementContext.treeIndex,
            treePosition: placementContext.treeWorld?.toArray?.() || null,
            treeLocal: placementContext.treeLocal || null,
            treeRadius: placementContext.treeRadius,
          }
        : null;
    const interaction = buildTreeStandInteractionData(anchor, point);

    if (canUseAsset) {
      const entity = await this.sceneStore.createModelFromAsset({ path: assetPath, name }, name);
      applyTreeStandGameplay(entity, anchor, interaction);
      entity.three.position.copy(point);
      entity.three.rotation.set(0, yaw, 0);
      entity.three.updateMatrixWorld(true);
      await this.onPlaced?.(entity, item);
      this.statusTarget?.setStatus?.(`${item.label} colocado na arvore.`, 1100);
      return true;
    }

    const fallback = createTreeStandGroup({ preview: false });
    const entity = this.sceneStore.createEntityBase({
      name,
      type: "model",
      three: fallback,
    });
    entity.source = { path: "builtin://tree-stand" };
    applyTreeStandGameplay(entity, anchor, interaction);
    entity.three.position.copy(point);
    entity.three.rotation.set(0, yaw, 0);
    entity.three.updateMatrixWorld(true);
    await this.onPlaced?.(entity, item);
    this.statusTarget?.setStatus?.(`${item.label} colocado na arvore (modelo leve).`, 1400);
    return true;
  }
}
