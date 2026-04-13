import * as THREE from "three";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import {
  extractTerrainData,
  normalizeTerrainData,
  updateTerrainTrees,
} from "../engine/TerrainSystem.js?v=20260413a";
import {
  createLightRuntime,
  defaultLightPayload,
  applyLightPayload,
  serializeLightRuntime,
  disposeLightRuntime,
  setLightRuntimeHelpersVisible,
  updateLightRuntime,
} from "../engine/LightSystem.js";
import { TerrainData } from "../engine/terrain/TerrainData.js";
import { TerrainComponent } from "../engine/terrain/TerrainComponent.js";
import { TerrainRenderer } from "../engine/terrain/TerrainRenderer.js";
import { serializeTerrain } from "../engine/terrain/TerrainSerializer.js";

export class SceneStore {
  constructor(scene, assetManager, animator) {
    this.scene = scene;
    this.assetManager = assetManager;
    this.animator = animator;
    this.entities = new Map();
    this.entityOrder = [];
    this.currentSceneName = "";
    this.scriptSystem = null;
    this.lightHelpersVisible = true;
    this.pendingModelLoads = new Set();
  }

  setScriptSystem(scriptSystem) {
    this.scriptSystem = scriptSystem;
  }

  createEntityBase({ id = crypto.randomUUID(), name, type, three }) {
    const entity = {
      id,
      name,
      type,
      three,
      parentId: null,
      components: [],
      active: true,
      source: null,
      animations: [],
      animation: null,
      gameplay: null,
      runtimeFlags: null,
    };

    this.entities.set(id, entity);
    this.entityOrder.push(id);

    three.name = name;
    this.assignEntityId(three, id);
    three.userData.isEntityRoot = true;

    this.scene.add(three);
    return entity;
  }

  assignEntityId(root, entityId) {
    if (!root || !entityId) return;
    root.traverse((child) => {
      child.userData.entityId = entityId;
    });
  }

  createEmpty(name = "Empty", id = null) {
    const group = new THREE.Group();
    const helper = new THREE.AxesHelper(0.5);
    group.add(helper);
    return this.createEntityBase({ id: id || crypto.randomUUID(), name, type: "empty", three: group });
  }

  createSpawnVolume(nameOverride = "Spawn Volume", id = null) {
    const group = new THREE.Group();
    const fill = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({
        color: 0x62d28f,
        transparent: true,
        opacity: 0.15,
        depthWrite: false,
      })
    );
    fill.renderOrder = 2;
    fill.userData.keepVisibleInGame = false;

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({ color: 0x62d28f, transparent: true, opacity: 0.92 })
    );
    edges.userData.ignoreRaycast = true;
    edges.renderOrder = 3;

    group.add(fill);
    group.add(edges);
    const entity = this.createEntityBase({
      id: id || crypto.randomUUID(),
      name: nameOverride || "Spawn Volume",
      type: "spawn_volume",
      three: group,
    });
    entity.three.scale.set(6, 2, 6);
    return entity;
  }

  createPrimitive(type, nameOverride, id = null) {
    let geometry;
    let material;
    let mesh;
    let name;

    switch (type) {
      case "cube":
        geometry = new THREE.BoxGeometry(1, 1, 1);
        material = new THREE.MeshStandardMaterial({ color: 0xcbbba0 });
        mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        name = nameOverride || "Cubo";
        break;
      case "sphere":
        geometry = new THREE.SphereGeometry(0.5, 24, 16);
        material = new THREE.MeshStandardMaterial({ color: 0xaac4d6 });
        mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        name = nameOverride || "Esfera";
        break;
      case "plane":
        return this.createTerrain(nameOverride || "Plano", {}, id || crypto.randomUUID());
      default:
        return this.createEmpty(nameOverride);
    }

    return this.createEntityBase({ id: id || crypto.randomUUID(), name, type, three: mesh });
  }

  createTerrain(nameOverride = "Terreno", data = {}, id = null) {
    const terrainData = new TerrainData(data);
    const { group, mesh } = TerrainRenderer.create(terrainData.toJSON());
    const entity = this.createEntityBase({
      id: id || crypto.randomUUID(),
      name: nameOverride,
      type: "terrain",
      three: group,
    });
    entity.terrain = new TerrainComponent({ mesh, data: terrainData });
    updateTerrainTrees(entity, this.assetManager);
    return entity;
  }

  rebuildTerrain(entity, data = {}) {
    if (!entity?.terrain?.mesh) return;
    const existing = extractTerrainData(entity);
    const payload = normalizeTerrainData({
      size: data.size ?? entity.terrain.size,
      sizeZ: data.sizeZ ?? entity.terrain.sizeZ ?? entity.terrain.size,
      segments: data.segments ?? entity.terrain.segments,
      textureScale: data.textureScale ?? entity.terrain.textureScale,
      maxHeight: data.maxHeight ?? entity.terrain.maxHeight ?? 6,
      layers: data.layers ?? entity.terrain.layers ?? existing?.layers,
      heights: data.heights ?? existing?.heights ?? null,
      paint: data.paint ?? existing?.paint ?? null,
      splat: data.splat ?? existing?.splat ?? null,
      trees: entity.terrain.trees || [],
    });
    entity.terrain.applyData(payload);
    TerrainRenderer.rebuild(entity.terrain.mesh, payload);
    updateTerrainTrees(entity, this.assetManager);
  }

  createLight(kindOrName = "point", nameOverride = null, id = null, payload = {}) {
    const knownKinds = new Set(["directional", "point", "spot", "ambient", "hemisphere"]);
    let kind = kindOrName;
    let resolvedName = nameOverride;
    let resolvedId = id;
    let resolvedPayload = payload;

    // Backward-compatible signature: createLight(name, id)
    if (!knownKinds.has(kindOrName)) {
      kind = "point";
      resolvedName = kindOrName;
      resolvedId = nameOverride ?? id ?? null;
      resolvedPayload = typeof id === "object" && id !== null ? id : payload;
    }

    const group = new THREE.Group();
    const entity = this.createEntityBase({
      id: resolvedId || crypto.randomUUID(),
      name: resolvedName || this.defaultLightName(kind),
      type: "light",
      three: group,
    });
    this.attachLightRuntime(entity, { ...resolvedPayload, kind });
    return entity;
  }

  defaultLightName(kind = "point") {
    switch (kind) {
      case "directional":
        return "Directional Light";
      case "spot":
        return "Spot Light";
      case "ambient":
        return "Ambient Light";
      case "hemisphere":
        return "Hemisphere Light";
      case "point":
      default:
        return "Point Light";
    }
  }

  attachLightRuntime(entity, payload = {}) {
    if (!entity || entity.type !== "light") return;
    if (entity.light) {
      disposeLightRuntime(entity.light, this.scene);
      entity.three.clear();
    }

    const fallback = defaultLightPayload(payload.kind || "point");
    const runtime = createLightRuntime({ ...fallback, ...payload }, this.scene, this.lightHelpersVisible);
    entity.light = runtime;
    entity.three.add(runtime.light);
    entity.three.userData.light = runtime.light;
    this.updateLightHelpers(entity);
  }

  updateLight(entityOrId, patch = {}) {
    const entity = typeof entityOrId === "string" ? this.entities.get(entityOrId) : entityOrId;
    if (!entity?.light) return;
    applyLightPayload(entity.light, patch);
    if (entity.active === false) {
      entity.light.light.visible = false;
    }
    this.updateLightHelpers(entity);
  }

  updateLightHelpers(entityOrId) {
    const entity = typeof entityOrId === "string" ? this.entities.get(entityOrId) : entityOrId;
    if (!entity?.light) return;
    setLightRuntimeHelpersVisible(entity.light, this.lightHelpersVisible && entity.active !== false);
    updateLightRuntime(entity.light);
  }

  updateRuntimeHelpers() {
    this.listEntities().forEach((entity) => {
      if (entity.type === "light") {
        this.updateLightHelpers(entity);
      }
      if (entity.type === "camera" && entity.three.userData.cameraHelper) {
        entity.three.userData.cameraHelper.visible = this.lightHelpersVisible && entity.active !== false;
        entity.three.userData.cameraHelper.update();
      }
    });
  }

  setLightHelpersVisible(visible) {
    this.lightHelpersVisible = visible;
    this.updateRuntimeHelpers();
  }

  serializeLight(entity) {
    if (!entity?.light) return null;
    return serializeLightRuntime(entity.light);
  }

  disposeLight(entity) {
    if (!entity?.light) return;
    disposeLightRuntime(entity.light, this.scene);
    entity.light = null;
    delete entity.three.userData.light;
  }

  createCamera(nameOverride, id = null) {
    const group = new THREE.Group();
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 2000);
    camera.position.set(0, 0, 0);

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.2, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x8fa1b3 })
    );
    body.castShadow = true;

    const helper = new THREE.CameraHelper(camera);
    helper.userData.ignoreRaycast = true;
    helper.visible = this.lightHelpersVisible;

    group.add(camera);
    group.add(body);
    group.add(helper);
    group.userData.camera = camera;
    group.userData.cameraHelper = helper;

    return this.createEntityBase({
      id: id || crypto.randomUUID(),
      name: nameOverride || "Camera",
      type: "camera",
      three: group,
    });
  }

  async createModelFromAsset(asset, nameOverride, id = null) {
    const group = new THREE.Group();
    const name = nameOverride || asset.name || "Modelo";
    const entity = this.createEntityBase({
      id: id || crypto.randomUUID(),
      name,
      type: "model",
      three: group,
    });
    entity.source = { path: asset.path };
    await this.hydrateModelEntity(entity, {
      sourcePath: asset.path,
      defaultAnimation: true,
    });
    return entity;
  }

  async hydrateModelEntity(entity, options = {}) {
    if (!entity || entity.type !== "model") return null;
    if (!this.entities.has(entity.id)) return null;
    const sourcePath = options.sourcePath || entity.source?.path;
    if (!sourcePath) return null;

    const gltf = await this.assetManager.loadGLTF(sourcePath);
    if (!gltf?.scene) return null;
    if (!this.entities.has(entity.id)) return null;

    const cloned = cloneSkeleton(gltf.scene);
    cloned.traverse((child) => {
      if (!child?.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
    });
    this.prepareModelMaterials(cloned);

    entity.three.clear();
    entity.three.add(cloned);
    this.assignEntityId(entity.three, entity.id);
    entity.source = { path: sourcePath };
    entity.animations = gltf.animations?.map((clip) => clip.name) || [];

    if (this.animator) {
      this.animator.unregister(entity);
      if (gltf.animations?.length) {
        this.animator.register(entity, cloned, gltf.animations);
      }
    }

    if (options.defaultAnimation && gltf.animations?.length) {
      entity.animation = {
        clip: gltf.animations[0].name,
        loop: true,
        speed: 1,
        playing: false,
      };
    }

    return cloned;
  }

  isModelEligibleForLazyLoad(obj = {}, options = {}) {
    if (!options.lazyModelLoading) return false;
    if (obj.type !== "model" || !obj.source?.path) return false;
    if ((obj.components?.length || 0) > 0) return false;
    if (obj.animation?.playing === true) return false;

    const lazyDistance = Number(options.lazyDistance) || 80;
    const cameraPosition = Array.isArray(options.cameraPosition) ? options.cameraPosition : [0, 0, 0];
    const position = Array.isArray(obj.transform?.position) ? obj.transform.position : [0, 0, 0];

    const dx = Number(position[0] || 0) - Number(cameraPosition[0] || 0);
    const dy = Number(position[1] || 0) - Number(cameraPosition[1] || 0);
    const dz = Number(position[2] || 0) - Number(cameraPosition[2] || 0);
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return distance > lazyDistance;
  }

  queueLazyModelHydration(entity, obj) {
    const task = () =>
      this.hydrateModelEntity(entity, {
        sourcePath: obj.source?.path,
        defaultAnimation: false,
      })
        .then(() => {
          if (entity.animation?.clip) {
            this.animator.play(entity, entity.animation.clip, entity.animation.loop, entity.animation.speed);
            if (entity.animation.playing === false) {
              this.animator.stop(entity);
            }
          }
        })
        .catch((error) => {
          console.warn("[SceneStore] Lazy model load falhou:", obj?.source?.path, error);
        })
        .finally(() => {
          this.pendingModelLoads.delete(task);
        });

    this.pendingModelLoads.add(task);
    if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(() => task(), { timeout: 900 });
    } else {
      setTimeout(() => task(), 0);
    }
  }

  prepareModelMaterials(root) {
    if (!root) return;
    root.traverse((child) => {
      if (!child?.isMesh || !child.material) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];

      materials.forEach((material) => {
        if (!material) return;
        const colorMaps = ["map", "emissiveMap", "specularMap"];
        const dataMaps = ["normalMap", "metalnessMap", "roughnessMap", "aoMap", "alphaMap"];

        colorMaps.forEach((slot) => {
          const texture = material[slot];
          if (!texture) return;
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.needsUpdate = true;
        });

        dataMaps.forEach((slot) => {
          const texture = material[slot];
          if (!texture) return;
          texture.needsUpdate = true;
        });

        material.needsUpdate = true;
      });
    });
  }

  getEntity(id) {
    return this.entities.get(id);
  }

  listEntities() {
    return this.entityOrder.map((id) => this.entities.get(id)).filter(Boolean);
  }

  getChildren(parentId) {
    return this.listEntities().filter((entity) => entity.parentId === parentId);
  }

  setParent(childId, parentId, { preserveWorld = true } = {}) {
    const child = this.entities.get(childId);
    if (!child) return;
    if (childId === parentId) return;

    if (parentId && this.isDescendant(parentId, childId)) {
      return;
    }

    const parent = parentId ? this.entities.get(parentId) : null;
    child.parentId = parentId || null;

    if (parent) {
      if (preserveWorld) {
        parent.three.attach(child.three);
      } else {
        parent.three.add(child.three);
      }
    } else {
      if (preserveWorld) {
        this.scene.attach(child.three);
      } else {
        this.scene.add(child.three);
      }
    }
  }

  isDescendant(targetId, potentialAncestorId) {
    let current = this.entities.get(targetId);
    while (current) {
      if (current.parentId === potentialAncestorId) return true;
      current = current.parentId ? this.entities.get(current.parentId) : null;
    }
    return false;
  }

  renameEntity(id, name) {
    const entity = this.entities.get(id);
    if (!entity) return;
    entity.name = name;
    entity.three.name = name;
  }

  setActive(id, active) {
    const entity = this.entities.get(id);
    if (!entity) return;
    entity.active = active;
    entity.three.visible = active;
    if (entity.type === "light" && entity.light) {
      const enabled = entity.light.data?.enabled !== false;
      entity.light.light.visible = active && enabled;
      this.updateLightHelpers(entity);
    }
  }

  removeEntity(id) {
    const root = this.entities.get(id);
    if (!root) return;

    const stack = [id];
    const toRemove = [];
    while (stack.length) {
      const currentId = stack.pop();
      toRemove.push(currentId);
      const children = this.getChildren(currentId).map((child) => child.id);
      stack.push(...children);
    }

    toRemove.reverse().forEach((entityId) => {
      const entity = this.entities.get(entityId);
      if (!entity) return;

      if (entity.three.parent) {
        entity.three.parent.remove(entity.three);
      }

      if (entity.type === "light") {
        this.disposeLight(entity);
      }

      if (this.animator) {
        this.animator.unregister(entity);
      }

      if (this.scriptSystem) {
        entity.components.forEach((comp) => {
          this.scriptSystem.removeComponent(entity, comp.id);
        });
      }

      this.entities.delete(entityId);
      this.entityOrder = this.entityOrder.filter((storedId) => storedId !== entityId);
    });
  }

  duplicateEntity(id) {
    const entity = this.entities.get(id);
    if (!entity) return null;

    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    const worldScale = new THREE.Vector3();
    const copyWorldTransform = (source, target) => {
      source.updateWorldMatrix(true, false);
      source.matrixWorld.decompose(worldPos, worldQuat, worldScale);
      target.position.copy(worldPos);
      target.quaternion.copy(worldQuat);
      target.scale.copy(worldScale);
    };

    if (entity.type === "terrain" && entity.terrain) {
      const terrainData = extractTerrainData(entity);
      const clone = this.createTerrain(`${entity.name}_Copy`, terrainData);
      copyWorldTransform(entity.three, clone.three);

      clone.components = entity.components.map((comp) => ({
        id: crypto.randomUUID(),
        type: comp.type,
        props: { ...comp.props },
        enabled: comp.enabled !== false,
      }));

      if (this.scriptSystem) {
        this.scriptSystem.rebuildComponents(clone);
      }

      if (entity.parentId) {
        this.setParent(clone.id, entity.parentId, { preserveWorld: true });
      }

      return clone;
    }

    if (entity.type === "camera") {
      const clone = this.createCamera(`${entity.name}_Copy`);
      copyWorldTransform(entity.three, clone.three);

      clone.components = entity.components.map((comp) => ({
        id: crypto.randomUUID(),
        type: comp.type,
        props: { ...comp.props },
        enabled: comp.enabled !== false,
      }));

      if (this.scriptSystem) {
        this.scriptSystem.rebuildComponents(clone);
      }

      if (entity.parentId) {
        this.setParent(clone.id, entity.parentId, { preserveWorld: true });
      }

      return clone;
    }

    if (entity.type === "light" && entity.light) {
      const lightData = this.serializeLight(entity);
      const clone = this.createLight(lightData?.kind || "point", `${entity.name}_Copy`, null, lightData || {});
      copyWorldTransform(entity.three, clone.three);

      clone.components = entity.components.map((comp) => ({
        id: crypto.randomUUID(),
        type: comp.type,
        props: { ...comp.props },
        enabled: comp.enabled !== false,
      }));

      if (this.scriptSystem) {
        this.scriptSystem.rebuildComponents(clone);
      }

      if (entity.parentId) {
        this.setParent(clone.id, entity.parentId, { preserveWorld: true });
      }

      return clone;
    }

    let cloneObject;
    if (entity.type === "model") {
      const gltfRoot = entity.three.children[0];
      cloneObject = new THREE.Group();
      cloneObject.add(cloneSkeleton(gltfRoot));
    } else {
      cloneObject = entity.three.clone(true);
    }

    const clone = this.createEntityBase({
      name: `${entity.name}_Copy`,
      type: entity.type,
      three: cloneObject,
    });

    copyWorldTransform(entity.three, clone.three);

    clone.source = entity.source ? { ...entity.source } : null;
    clone.animations = [...(entity.animations || [])];
    clone.animation = entity.animation ? { ...entity.animation } : null;
    clone.runtimeFlags = entity.runtimeFlags ? { ...entity.runtimeFlags } : null;

    if (clone.type === "model" && clone.three.children[0]) {
      const gltfScene = clone.three.children[0];
      const animations = this.animator.getClips(entity) || [];
      if (animations.length > 0) {
        this.animator.register(clone, gltfScene, animations);
        if (clone.animation && clone.animation.clip) {
          this.animator.play(clone, clone.animation.clip, clone.animation.loop, clone.animation.speed);
          if (clone.animation.playing === false) {
            this.animator.stop(clone);
          }
        }
      }
    }

    clone.components = entity.components.map((comp) => ({
      id: crypto.randomUUID(),
      type: comp.type,
      props: { ...comp.props },
      enabled: comp.enabled !== false,
    }));

    if (this.scriptSystem) {
      this.scriptSystem.rebuildComponents(clone);
    }

    if (entity.parentId) {
      this.setParent(clone.id, entity.parentId, { preserveWorld: true });
    }

    return clone;
  }

  clear() {
    this.pendingModelLoads.clear();
    this.entities.forEach((entity) => {
      if (this.animator) {
        this.animator.unregister(entity);
      }
      if (this.scriptSystem) {
        entity.components.forEach((comp) => {
          this.scriptSystem.removeComponent(entity, comp.id);
        });
      }
      if (entity.type === "light") {
        this.disposeLight(entity);
      }
      if (entity.three.parent) {
        entity.three.parent.remove(entity.three);
      }
    });
    this.entities.clear();
    this.entityOrder = [];
    this.currentSceneName = "";
  }

  serialize() {
    // Convert the current scene graph into a JSON-friendly payload.
    const objects = this.listEntities().filter((entity) => entity.runtimeFlags?.transient !== true).map((entity) => {
      const terrain = entity.type === "terrain" ? serializeTerrain(entity) : null;
      const light = entity.type === "light" ? this.serializeLight(entity) : null;
      return {
        id: entity.id,
        name: entity.name,
        type: entity.type,
        parentId: entity.parentId,
        active: entity.active,
        transform: {
          position: entity.three.position.toArray(),
          rotation: [
            THREE.MathUtils.radToDeg(entity.three.rotation.x),
            THREE.MathUtils.radToDeg(entity.three.rotation.y),
            THREE.MathUtils.radToDeg(entity.three.rotation.z),
          ],
          scale: entity.three.scale.toArray(),
        },
        source: entity.source,
        animation: entity.animation,
        components: entity.components,
        gameplay: entity.gameplay,
        terrain,
        light,
      };
    });

    return {
      name: this.currentSceneName || "NovaCena",
      createdAt: new Date().toISOString(),
      objects,
    };
  }

  async loadFromData(data, options = {}) {
    // Rebuild the scene graph from a saved JSON payload.
    this.clear();
    this.currentSceneName = data.name || "Cena";

    const legacyTerrainNames = new Set(["terreno", "terrain"]);
    const getLegacyTerrainData = (obj) => {
      if (!obj || obj.type !== "plane" || obj.terrain) return null;
      const name = (obj.name || "").trim().toLowerCase();
      if (!legacyTerrainNames.has(name)) return null;
      const scale = obj.transform?.scale || [1, 1, 1];
      const scaleX = Number(scale[0]) || 1;
      const scaleZ = Number(scale[1]) || 1;
      const baseSize = 6;
      const size = baseSize * scaleX;
      const sizeZ = baseSize * scaleZ;
      return normalizeTerrainData({ size, sizeZ });
    };

    const objects = Array.isArray(data.objects) ? data.objects : [];
    const eagerModelLoads = [];
    const lazyModelLoads = [];

    for (const obj of objects) {
      let entity = null;
      const legacyTerrain = getLegacyTerrainData(obj);
      if (obj.type === "model" && obj.source?.path) {
        const group = new THREE.Group();
        entity = this.createEntityBase({ id: obj.id, name: obj.name, type: obj.type, three: group });
        entity.source = { ...obj.source };
        entity.animations = [];

        const modelTask = () =>
          this.hydrateModelEntity(entity, {
            sourcePath: obj.source.path,
            defaultAnimation: false,
          }).catch((error) => {
            console.warn("[SceneStore] Falha ao carregar modelo:", obj.source.path, error);
          });

        if (this.isModelEligibleForLazyLoad(obj, options)) {
          lazyModelLoads.push({ entity, obj, modelTask });
        } else {
          eagerModelLoads.push({ entity, obj, modelTask });
        }
      } else if (obj.type === "terrain" || legacyTerrain) {
        entity = this.createTerrain(obj.name, obj.terrain || legacyTerrain || {}, obj.id);
      } else if (obj.type === "spawn_volume") {
        entity = this.createSpawnVolume(obj.name, obj.id);
      } else if (obj.type === "camera") {
        entity = this.createCamera(obj.name, obj.id);
      } else if (obj.type === "cube" || obj.type === "sphere" || obj.type === "plane") {
        entity = this.createPrimitive(obj.type, obj.name, obj.id);
      } else if (obj.type === "light") {
        entity = this.createLight(obj.light?.kind || "point", obj.name, obj.id, obj.light || {});
      } else {
        entity = this.createEmpty(obj.name, obj.id);
      }

      if (entity) {
        entity.parentId = obj.parentId || null;
        entity.active = obj.active !== false;
        entity.three.visible = entity.active;
        entity.animation = obj.animation || entity.animation;
        entity.gameplay = obj.gameplay ? { ...obj.gameplay } : null;
        entity.components = (obj.components || []).map((comp) => ({
          id: comp.id || crypto.randomUUID(),
          type: comp.type,
          props: { ...(comp.props || {}) },
          enabled: comp.enabled !== false,
        }));
      }
    }

    objects.forEach((obj) => {
      if (obj.parentId) {
        this.setParent(obj.id, obj.parentId, { preserveWorld: false });
      }
    });

    objects.forEach((obj) => {
      const entity = this.entities.get(obj.id);
      if (!entity || !obj.transform) return;
      const { position, rotation, scale } = obj.transform;
      if (position) entity.three.position.fromArray(position);
      if (rotation) {
        entity.three.rotation.set(
          THREE.MathUtils.degToRad(rotation[0] || 0),
          THREE.MathUtils.degToRad(rotation[1] || 0),
          THREE.MathUtils.degToRad(rotation[2] || 0)
        );
      }
      if (scale) entity.three.scale.fromArray(scale);

      if (entity.type === "terrain") {
        entity.three.rotation.set(0, 0, 0);
        entity.three.scale.set(1, 1, 1);
      }

      if (entity.type === "light") {
        this.updateLight(entity, obj.light || entity.light?.data || {});
      }
    });

    if (eagerModelLoads.length) {
      await Promise.all(eagerModelLoads.map((entry) => entry.modelTask()));
    }

    if (lazyModelLoads.length) {
      if (options.lazyModelLoading) {
        lazyModelLoads.forEach(({ entity, obj }) => this.queueLazyModelHydration(entity, obj));
      } else {
        await Promise.all(lazyModelLoads.map((entry) => entry.modelTask()));
      }
    }

    objects.forEach((obj) => {
      const entity = this.entities.get(obj.id);
      if (!entity) return;

      if (entity.type === "model" && entity.animation?.clip && entity.three.children.length) {
        this.animator.play(entity, entity.animation.clip, entity.animation.loop, entity.animation.speed);
        if (entity.animation.playing === false) {
          this.animator.stop(entity);
        }
      }

      this.setActive(entity.id, obj.active !== false);
    });

    if (this.scriptSystem) {
      objects.forEach((obj) => {
        const entity = this.entities.get(obj.id);
        if (!entity) return;
        this.scriptSystem.rebuildComponents(entity);
      });
    }

    this.updateRuntimeHelpers();
  }
}
