import * as THREE from "three";
import { sampleTerrainHeight } from "../engine/TerrainSystem.js?v=20260413a";

const CALL_PROFILE_OPTIONS = [
  { value: "", label: "(Auto pelo modelo)" },
  { value: "stag", label: "stag" },
];

const REGION_SPAWNER_AI_PROPS = [
  "targetId",
  "detectionRadius",
  "safeDistance",
  "alertDuration",
  "wanderRadius",
  "wanderInterval",
  "grazeChance",
  "grazeDuration",
  "moveSpeed",
  "runSpeed",
  "turnSpeed",
  "avoidDistance",
  "avoidStrength",
  "fleeFacingOffset",
  "useAnimation",
  "autoDetectClips",
  "respondToCalls",
  "callProfile",
  "callResponseRadius",
  "callApproachDistance",
  "callInvestigateDuration",
  "maxHealth",
  "despawnOnDeath",
  "deathDespawnDelay",
  "vocalizationAsset",
  "vocalizationRadius",
  "vocalizationVolume",
  "vocalizationMinDistance",
  "vocalizationMaxDistance",
  "vocalizationRolloff",
  "vocalizationIntervalMin",
  "vocalizationIntervalMax",
  "vocalizationChance",
];

function clampSpawnCount(value) {
  return THREE.MathUtils.clamp(Math.round(Number(value) || 0), 1, 64);
}

function deriveAssetName(path = "") {
  const clean = String(path || "").trim();
  if (!clean) return "Animal";
  const file = clean.split(/[\\/]/).pop() || clean;
  const dot = file.lastIndexOf(".");
  return dot > 0 ? file.slice(0, dot) : file;
}

export class RegionSpawner {
  static type = "RegionSpawner";
  static label = "Region Spawner";
  static defaults = {
    animalAssetPath: "",
    spawnCount: 3,
    alignToTerrain: true,
    spawnHeightOffset: 0,
    randomYaw: true,
    targetId: "",
    detectionRadius: 8,
    safeDistance: 12,
    alertDuration: 1.2,
    wanderRadius: 6,
    wanderInterval: 3,
    grazeChance: 0.4,
    grazeDuration: 2.5,
    moveSpeed: 1.5,
    runSpeed: 3.5,
    turnSpeed: 6,
    avoidDistance: 1.2,
    avoidStrength: 1.5,
    fleeFacingOffset: 180,
    useAnimation: true,
    autoDetectClips: true,
    respondToCalls: true,
    callProfile: "",
    callResponseRadius: 26,
    callApproachDistance: 2.4,
    callInvestigateDuration: 8,
    maxHealth: 1,
    despawnOnDeath: true,
    deathDespawnDelay: 0,
    vocalizationAsset: "",
    vocalizationRadius: 18,
    vocalizationVolume: 1,
    vocalizationMinDistance: 4,
    vocalizationMaxDistance: 24,
    vocalizationRolloff: 1.2,
    vocalizationIntervalMin: 6,
    vocalizationIntervalMax: 14,
    vocalizationChance: 1,
  };

  static schema = [
    {
      key: "animalAssetPath",
      label: "Animal",
      type: "asset",
      assetType: "model",
      emptyLabel: "(Escolher animal)",
    },
    { key: "spawnCount", label: "Quantidade", type: "number", step: 1 },
    { key: "alignToTerrain", label: "Alinhar Terreno", type: "boolean" },
    { key: "spawnHeightOffset", label: "Offset Y", type: "number", step: 0.1 },
    { key: "randomYaw", label: "Rotacao Aleatoria", type: "boolean" },
    { key: "targetId", label: "Player", type: "entity" },
    { key: "detectionRadius", label: "Detect", type: "number", step: 0.1 },
    { key: "safeDistance", label: "Safe", type: "number", step: 0.1 },
    { key: "alertDuration", label: "Alerta", type: "number", step: 0.1 },
    { key: "wanderRadius", label: "Wander", type: "number", step: 0.1 },
    { key: "wanderInterval", label: "Intervalo", type: "number", step: 0.1 },
    { key: "grazeChance", label: "Pastar", type: "number", step: 0.05 },
    { key: "grazeDuration", label: "Tempo Pasto", type: "number", step: 0.1 },
    { key: "moveSpeed", label: "Velocidade", type: "number", step: 0.1 },
    { key: "runSpeed", label: "Fuga", type: "number", step: 0.1 },
    { key: "turnSpeed", label: "Virar", type: "number", step: 0.5 },
    { key: "avoidDistance", label: "Avoid Dist", type: "number", step: 0.1 },
    { key: "avoidStrength", label: "Avoid Forca", type: "number", step: 0.1 },
    { key: "fleeFacingOffset", label: "Offset Fuga", type: "number", step: 1 },
    { key: "useAnimation", label: "Usar Anim", type: "boolean" },
    { key: "autoDetectClips", label: "Auto Detect", type: "boolean" },
    { key: "respondToCalls", label: "Responder Call", type: "boolean" },
    { key: "callProfile", label: "Perfil Call", type: "select", options: CALL_PROFILE_OPTIONS },
    { key: "callResponseRadius", label: "Raio Call", type: "number", step: 0.1 },
    { key: "callApproachDistance", label: "Aproximar Ate", type: "number", step: 0.1 },
    { key: "callInvestigateDuration", label: "Tempo Call", type: "number", step: 0.1 },
    { key: "maxHealth", label: "Vida", type: "number", step: 1 },
    { key: "despawnOnDeath", label: "Sumir ao Morrer", type: "boolean" },
    { key: "deathDespawnDelay", label: "Tempo Sumir", type: "number", step: 0.1 },
    {
      key: "vocalizationAsset",
      label: "Audio Vocal",
      type: "asset",
      assetType: "audio",
      emptyLabel: "(Sem audio)",
    },
    { key: "vocalizationRadius", label: "Raio Audio", type: "number", step: 0.1 },
    { key: "vocalizationVolume", label: "Volume Audio", type: "number", step: 0.05 },
    { key: "vocalizationMinDistance", label: "Audio Perto", type: "number", step: 0.1 },
    { key: "vocalizationMaxDistance", label: "Audio Longe", type: "number", step: 0.1 },
    { key: "vocalizationRolloff", label: "Audio Queda", type: "number", step: 0.1 },
    { key: "vocalizationIntervalMin", label: "Audio Min", type: "number", step: 0.1 },
    { key: "vocalizationIntervalMax", label: "Audio Max", type: "number", step: 0.1 },
    { key: "vocalizationChance", label: "Chance Audio", type: "number", step: 0.05 },
  ];

  constructor(entity, props, context) {
    this.entity = entity;
    this.props = props;
    this.sceneStore = context.sceneStore;
    this.scriptSystem = context.sceneStore?.scriptSystem || null;
    this.mode = context.mode || "game";

    this.worldPoint = new THREE.Vector3();
    this.localPoint = new THREE.Vector3();
    this.terrainLocalPoint = new THREE.Vector3();
    this.spawnRotation = new THREE.Euler();
    this.spawnedEntityIds = [];
    this.spawnedPositions = [];
    this.spawnToken = 0;
    this.hasSpawned = false;
  }

  start() {
    if (this.enabled === false) return;
    if (this.mode !== "game") return;
    if (this.entity.active === false) {
      this.entity.three.visible = false;
      return;
    }

    this.entity.three.visible = false;
    this.spawnInitialAnimals();
  }

  update() {
    // One-shot spawner for scene startup.
  }

  destroy() {
    this.spawnToken += 1;
  }

  async spawnInitialAnimals() {
    if (this.hasSpawned) return;
    this.hasSpawned = true;

    const assetPath = String(this.props.animalAssetPath || "").trim();
    if (!assetPath || !this.sceneStore?.createModelFromAsset) return;

    const count = clampSpawnCount(this.props.spawnCount);
    const token = ++this.spawnToken;
    this.spawnedPositions.length = 0;

    for (let index = 0; index < count; index += 1) {
      if (token !== this.spawnToken) return;

      const spawnPosition = this.pickSpawnPosition();
      if (!spawnPosition) continue;

      const asset = {
        path: assetPath,
        name: deriveAssetName(assetPath),
      };

      try {
        const entity = await this.sceneStore.createModelFromAsset(asset, `${asset.name}_${index + 1}`);
        if (token !== this.spawnToken || !entity) {
          if (entity?.id) this.sceneStore.removeEntity(entity.id);
          return;
        }

        entity.runtimeFlags = {
          ...(entity.runtimeFlags || {}),
          transient: true,
          regionSpawned: true,
          spawnerId: this.entity.id,
        };
        entity.gameplay = {
          ...(entity.gameplay || {}),
          regionSpawner: {
            spawnerId: this.entity.id,
          },
        };
        entity.three.position.copy(spawnPosition);
        if (this.props.randomYaw !== false) {
          entity.three.rotation.set(0, Math.random() * Math.PI * 2, 0);
        }
        entity.three.updateMatrixWorld(true);

        const componentData = {
          id: crypto.randomUUID(),
          type: "AnimalAI",
          enabled: true,
          props: this.buildAnimalAIProps(),
        };
        entity.components.push(componentData);
        this.scriptSystem?.rebuildComponents?.(entity);

        this.spawnedEntityIds.push(entity.id);
      } catch (error) {
        console.warn("[RegionSpawner] Falha ao criar animal da regiao:", assetPath, error);
      }
    }
  }

  buildAnimalAIProps() {
    const props = {};
    REGION_SPAWNER_AI_PROPS.forEach((key) => {
      props[key] = this.props[key];
    });

    const targetId = String(this.props.targetId || "").trim() || this.findDefaultTargetId();
    if (targetId) {
      props.targetId = targetId;
    }

    return props;
  }

  findDefaultTargetId() {
    const player = this.sceneStore
      ?.listEntities?.()
      ?.find?.((entity) =>
        entity.components?.some?.(
          (component) => component.type === "FPSController" || component.type === "PlayerMovement"
        )
      );
    return player?.id || "";
  }

  pickSpawnPosition() {
    const attempts = Math.max(8, clampSpawnCount(this.props.spawnCount) * 4);
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const candidate = this.sampleSpawnPoint();
      if (!candidate) continue;
      const tooClose = this.spawnedPositions.some((existing) => existing.distanceToSquared(candidate) < 2.25);
      if (tooClose) continue;
      this.spawnedPositions.push(candidate.clone());
      return candidate;
    }

    const fallback = this.sampleSpawnPoint(true);
    if (fallback) {
      this.spawnedPositions.push(fallback.clone());
    }
    return fallback;
  }

  sampleSpawnPoint(forceCenter = false) {
    const sx = Math.max(0.25, Math.abs(Number(this.entity.three.scale.x) || 0.25));
    const sy = Math.max(0.25, Math.abs(Number(this.entity.three.scale.y) || 0.25));
    const sz = Math.max(0.25, Math.abs(Number(this.entity.three.scale.z) || 0.25));

    const localX = forceCenter ? 0 : (Math.random() - 0.5) * sx;
    const localZ = forceCenter ? 0 : (Math.random() - 0.5) * sz;
    const localY = forceCenter ? 0 : (Math.random() - 0.5) * sy;

    this.localPoint.set(localX, localY, localZ);
    this.worldPoint.copy(this.localPoint);
    this.entity.three.localToWorld(this.worldPoint);

    const terrainHeight = this.props.alignToTerrain !== false ? this.resolveTerrainHeight(this.worldPoint) : null;
    if (terrainHeight !== null) {
      this.worldPoint.y = terrainHeight + (Number(this.props.spawnHeightOffset) || 0);
      return this.worldPoint.clone();
    }

    this.worldPoint.y += Number(this.props.spawnHeightOffset) || 0;
    return this.worldPoint.clone();
  }

  resolveTerrainHeight(worldPoint) {
    const terrains = this.sceneStore?.listEntities?.().filter?.((entity) => entity.type === "terrain") || [];
    if (!terrains.length) return null;

    for (const terrain of terrains) {
      const sizeX = Number(terrain.terrain?.size) || 0;
      const sizeZ = Number(terrain.terrain?.sizeZ ?? terrain.terrain?.size) || sizeX;
      if (sizeX <= 0 || sizeZ <= 0) continue;

      this.terrainLocalPoint.copy(worldPoint);
      terrain.three.worldToLocal(this.terrainLocalPoint);
      if (
        this.terrainLocalPoint.x < -sizeX / 2 ||
        this.terrainLocalPoint.x > sizeX / 2 ||
        this.terrainLocalPoint.z < -sizeZ / 2 ||
        this.terrainLocalPoint.z > sizeZ / 2
      ) {
        continue;
      }

      const localY = sampleTerrainHeight(terrain, this.terrainLocalPoint.x, this.terrainLocalPoint.z);
      const surfacePoint = new THREE.Vector3(this.terrainLocalPoint.x, localY, this.terrainLocalPoint.z);
      terrain.three.localToWorld(surfacePoint);
      return surfacePoint.y;
    }

    return null;
  }
}
