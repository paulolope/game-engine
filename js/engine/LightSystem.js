import * as THREE from "three";

const DEFAULT_KIND = "point";
const SHADOW_MAP_MIN = 256;
const SHADOW_MAP_MAX = 4096;

export const LIGHT_KINDS = ["directional", "point", "spot", "ambient", "hemisphere"];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function safeNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function safeBool(value, fallback = true) {
  if (typeof value === "boolean") return value;
  return fallback;
}

function toHexColor(value, fallback = "#ffffff") {
  try {
    const color = new THREE.Color(value ?? fallback);
    return `#${color.getHexString()}`;
  } catch (error) {
    const color = new THREE.Color(fallback);
    return `#${color.getHexString()}`;
  }
}

function safeVec3Array(value, fallback = [0, 0, 0]) {
  if (Array.isArray(value) && value.length >= 3) {
    return [
      safeNumber(value[0], fallback[0]),
      safeNumber(value[1], fallback[1]),
      safeNumber(value[2], fallback[2]),
    ];
  }
  return fallback.slice();
}

function baseDefaults(kind) {
  const commonShadow = {
    mapSize: 1024,
    bias: -0.0005,
    near: 0.5,
    far: 120,
    left: -30,
    right: 30,
    top: 30,
    bottom: -30,
  };

  switch (kind) {
    case "directional":
      return {
        kind,
        color: "#fff5d6",
        intensity: 1.1,
        enabled: true,
        castShadow: true,
        target: [0, 0, -5],
        shadow: { ...commonShadow, mapSize: 2048 },
      };
    case "spot":
      return {
        kind,
        color: "#ffe7bf",
        intensity: 1.4,
        enabled: true,
        castShadow: true,
        distance: 40,
        decay: 2,
        angle: Math.PI / 6,
        penumbra: 0.25,
        target: [0, 0, -5],
        shadow: { ...commonShadow, mapSize: 1024 },
      };
    case "ambient":
      return {
        kind,
        color: "#ffffff",
        intensity: 0.3,
        enabled: true,
      };
    case "hemisphere":
      return {
        kind,
        skyColor: "#d9efff",
        groundColor: "#4f5662",
        intensity: 0.45,
        enabled: true,
      };
    case "point":
    default:
      return {
        kind: "point",
        color: "#ffd39a",
        intensity: 1.25,
        enabled: true,
        castShadow: true,
        distance: 28,
        decay: 2,
        shadow: { ...commonShadow, mapSize: 1024 },
      };
  }
}

export function normalizeLightPayload(kind = DEFAULT_KIND, payload = {}) {
  const resolvedKind = LIGHT_KINDS.includes(kind) ? kind : DEFAULT_KIND;
  const defaults = baseDefaults(resolvedKind);
  const input = payload || {};
  const shadowInput = input.shadow || {};
  const shadowDefaults = defaults.shadow || {};

  const normalized = {
    ...defaults,
    ...input,
    kind: resolvedKind,
    enabled: safeBool(input.enabled, defaults.enabled),
    intensity: clamp(safeNumber(input.intensity, defaults.intensity), 0, 50),
  };

  if (resolvedKind === "ambient" || resolvedKind === "directional" || resolvedKind === "point" || resolvedKind === "spot") {
    normalized.color = toHexColor(input.color, defaults.color);
  }

  if (resolvedKind === "hemisphere") {
    normalized.skyColor = toHexColor(input.skyColor, defaults.skyColor);
    normalized.groundColor = toHexColor(input.groundColor, defaults.groundColor);
  }

  if (resolvedKind === "point" || resolvedKind === "spot") {
    normalized.distance = clamp(safeNumber(input.distance, defaults.distance), 0, 1000);
    normalized.decay = clamp(safeNumber(input.decay, defaults.decay), 0, 4);
  }

  if (resolvedKind === "spot") {
    normalized.angle = clamp(safeNumber(input.angle, defaults.angle), 0.05, Math.PI / 2);
    normalized.penumbra = clamp(safeNumber(input.penumbra, defaults.penumbra), 0, 1);
  }

  if (resolvedKind === "directional" || resolvedKind === "spot") {
    normalized.target = safeVec3Array(input.target, defaults.target);
  }

  if (resolvedKind === "directional" || resolvedKind === "point" || resolvedKind === "spot") {
    normalized.castShadow = safeBool(input.castShadow, defaults.castShadow);
    normalized.shadow = {
      mapSize: clamp(
        Math.round(safeNumber(shadowInput.mapSize, shadowDefaults.mapSize)),
        SHADOW_MAP_MIN,
        SHADOW_MAP_MAX
      ),
      bias: safeNumber(shadowInput.bias, shadowDefaults.bias),
      near: clamp(safeNumber(shadowInput.near, shadowDefaults.near), 0.01, 1000),
      far: clamp(safeNumber(shadowInput.far, shadowDefaults.far), 1, 5000),
      left: safeNumber(shadowInput.left, shadowDefaults.left),
      right: safeNumber(shadowInput.right, shadowDefaults.right),
      top: safeNumber(shadowInput.top, shadowDefaults.top),
      bottom: safeNumber(shadowInput.bottom, shadowDefaults.bottom),
    };
  }

  return normalized;
}

export function defaultLightPayload(kind = DEFAULT_KIND) {
  return normalizeLightPayload(kind, {});
}

function createLightForKind(kind, payload) {
  switch (kind) {
    case "directional":
      return new THREE.DirectionalLight(payload.color, payload.intensity);
    case "spot":
      return new THREE.SpotLight(payload.color, payload.intensity, payload.distance, payload.angle, payload.penumbra, payload.decay);
    case "ambient":
      return new THREE.AmbientLight(payload.color, payload.intensity);
    case "hemisphere":
      return new THREE.HemisphereLight(payload.skyColor, payload.groundColor, payload.intensity);
    case "point":
    default:
      return new THREE.PointLight(payload.color, payload.intensity, payload.distance, payload.decay);
  }
}

function createLightHelper(kind, light) {
  if (kind === "directional") return new THREE.DirectionalLightHelper(light, 1.4);
  if (kind === "point") return new THREE.PointLightHelper(light, 0.35);
  if (kind === "spot") return new THREE.SpotLightHelper(light);
  return null;
}

function createShadowHelper(kind, light) {
  if (kind === "directional" || kind === "spot") {
    return new THREE.CameraHelper(light.shadow.camera);
  }
  return null;
}

function applyShadowSettings(light, kind, payload) {
  if (!light.shadow) return;
  const nextShadow = payload.shadow || {};
  light.shadow.bias = nextShadow.bias ?? light.shadow.bias;
  if (light.shadow.mapSize) {
    const targetSize = nextShadow.mapSize ?? light.shadow.mapSize.x;
    if (light.shadow.mapSize.x !== targetSize || light.shadow.mapSize.y !== targetSize) {
      if (light.shadow.map) {
        light.shadow.map.dispose();
      }
      light.shadow.mapSize.set(targetSize, targetSize);
    }
  }

  if (light.shadow.camera) {
    light.shadow.camera.near = nextShadow.near ?? light.shadow.camera.near;
    light.shadow.camera.far = nextShadow.far ?? light.shadow.camera.far;

    if (kind === "directional") {
      light.shadow.camera.left = nextShadow.left ?? light.shadow.camera.left;
      light.shadow.camera.right = nextShadow.right ?? light.shadow.camera.right;
      light.shadow.camera.top = nextShadow.top ?? light.shadow.camera.top;
      light.shadow.camera.bottom = nextShadow.bottom ?? light.shadow.camera.bottom;
    }
    light.shadow.camera.updateProjectionMatrix();
  }
  light.shadow.needsUpdate = true;
}

export function createLightRuntime(payload, scene, helpersVisible = true) {
  const normalized = normalizeLightPayload(payload.kind, payload);
  const group = new THREE.Group();
  group.userData.isLightEntity = true;

  const light = createLightForKind(normalized.kind, normalized);
  light.position.set(0, 0, 0);
  light.userData.ignoreRaycast = true;
  group.add(light);

  let target = null;
  if (normalized.kind === "directional" || normalized.kind === "spot") {
    target = new THREE.Object3D();
    target.name = `${normalized.kind}-target`;
    target.userData.ignoreRaycast = true;
    target.visible = false;
    target.position.fromArray(normalized.target);
    scene.add(target);
    light.target = target;
  }

  const helper = createLightHelper(normalized.kind, light);
  if (helper) {
    helper.userData.ignoreRaycast = true;
    helper.visible = helpersVisible;
    scene.add(helper);
  }

  const shadowHelper = createShadowHelper(normalized.kind, light);
  if (shadowHelper) {
    shadowHelper.userData.ignoreRaycast = true;
    shadowHelper.visible = false;
    scene.add(shadowHelper);
  }

  const runtime = {
    kind: normalized.kind,
    data: normalized,
    group,
    light,
    target,
    helper,
    shadowHelper,
    helpersVisible,
  };

  applyLightPayload(runtime, normalized);
  return runtime;
}

export function applyLightPayload(runtime, payload) {
  if (!runtime?.light) return runtime?.data || payload;

  const normalized = normalizeLightPayload(runtime.kind, { ...runtime.data, ...payload });
  runtime.data = normalized;
  runtime.kind = normalized.kind;
  const light = runtime.light;

  if (runtime.kind === "ambient") {
    light.color.set(normalized.color);
    light.intensity = normalized.intensity;
    light.visible = normalized.enabled;
  } else if (runtime.kind === "hemisphere") {
    light.color.set(normalized.skyColor);
    light.groundColor.set(normalized.groundColor);
    light.intensity = normalized.intensity;
    light.visible = normalized.enabled;
  } else {
    light.color.set(normalized.color);
    light.intensity = normalized.intensity;
    light.visible = normalized.enabled;
    light.castShadow = normalized.castShadow;

    if (runtime.kind === "point" || runtime.kind === "spot") {
      light.distance = normalized.distance;
      light.decay = normalized.decay;
    }
    if (runtime.kind === "spot") {
      light.angle = normalized.angle;
      light.penumbra = normalized.penumbra;
    }
    applyShadowSettings(light, runtime.kind, normalized);
  }

  if (runtime.target) {
    runtime.target.position.fromArray(normalized.target || [0, 0, 0]);
    light.target = runtime.target;
    runtime.target.updateMatrixWorld();
  } else if ((runtime.kind === "directional" || runtime.kind === "spot") && !runtime.missingTargetWarned) {
    runtime.missingTargetWarned = true;
    console.warn("[LightSystem] Luz sem target configurado", runtime.kind);
  }
  light.updateMatrixWorld();
  updateLightRuntime(runtime);
  return normalized;
}

export function setLightRuntimeHelpersVisible(runtime, visible) {
  if (!runtime) return;
  runtime.helpersVisible = visible;
  updateLightRuntime(runtime);
}

export function updateLightRuntime(runtime) {
  if (!runtime?.light) return;
  const active = runtime.data?.enabled !== false;
  if (runtime.helper) {
    runtime.helper.visible = runtime.helpersVisible && active;
    if (runtime.helper.update) runtime.helper.update();
  }
  if (runtime.shadowHelper) {
    const castShadow = !!runtime.light.castShadow;
    runtime.shadowHelper.visible = runtime.helpersVisible && active && castShadow;
    runtime.shadowHelper.update();
  }
}

export function serializeLightRuntime(runtime) {
  if (!runtime?.light) return null;
  const light = runtime.light;
  const kind = runtime.kind || "point";
  const payload = {
    kind,
    enabled: runtime.data?.enabled !== false,
    intensity: safeNumber(light.intensity, runtime.data?.intensity ?? 1),
  };

  if (kind === "ambient" || kind === "directional" || kind === "point" || kind === "spot") {
    payload.color = `#${light.color.getHexString()}`;
  }
  if (kind === "hemisphere") {
    payload.skyColor = `#${light.color.getHexString()}`;
    payload.groundColor = `#${light.groundColor.getHexString()}`;
  }
  if (kind === "point" || kind === "spot") {
    payload.distance = safeNumber(light.distance, runtime.data?.distance ?? 0);
    payload.decay = safeNumber(light.decay, runtime.data?.decay ?? 2);
  }
  if (kind === "spot") {
    payload.angle = safeNumber(light.angle, runtime.data?.angle ?? Math.PI / 6);
    payload.penumbra = safeNumber(light.penumbra, runtime.data?.penumbra ?? 0);
  }
  if (kind === "directional" || kind === "spot") {
    if (runtime.target) {
      payload.target = runtime.target.position.toArray();
    } else {
      console.warn("[LightSystem] Target ausente ao serializar", kind);
      payload.target = runtime.data?.target || [0, 0, 0];
    }
  }

  if (kind === "directional" || kind === "point" || kind === "spot") {
    payload.castShadow = !!light.castShadow;
    payload.shadow = {
      mapSize: light.shadow?.mapSize?.x || runtime.data?.shadow?.mapSize || 1024,
      bias: light.shadow?.bias ?? runtime.data?.shadow?.bias ?? -0.0005,
      near: light.shadow?.camera?.near ?? runtime.data?.shadow?.near ?? 0.5,
      far: light.shadow?.camera?.far ?? runtime.data?.shadow?.far ?? 120,
      left: light.shadow?.camera?.left ?? runtime.data?.shadow?.left ?? -30,
      right: light.shadow?.camera?.right ?? runtime.data?.shadow?.right ?? 30,
      top: light.shadow?.camera?.top ?? runtime.data?.shadow?.top ?? 30,
      bottom: light.shadow?.camera?.bottom ?? runtime.data?.shadow?.bottom ?? -30,
    };
  }

  return normalizeLightPayload(kind, payload);
}

function disposeObject3D(obj) {
  if (!obj) return;
  if (obj.geometry) obj.geometry.dispose?.();
  if (obj.material) {
    if (Array.isArray(obj.material)) {
      obj.material.forEach((material) => material?.dispose?.());
    } else {
      obj.material.dispose?.();
    }
  }
}

export function disposeLightRuntime(runtime, scene) {
  if (!runtime) return;
  if (runtime.helper) {
    runtime.helper.parent?.remove(runtime.helper);
    disposeObject3D(runtime.helper);
  }
  if (runtime.shadowHelper) {
    runtime.shadowHelper.parent?.remove(runtime.shadowHelper);
    disposeObject3D(runtime.shadowHelper);
  }
  if (runtime.target) {
    runtime.target.parent?.remove(runtime.target);
  }
  if (runtime.light?.shadow?.map) {
    runtime.light.shadow.map.dispose();
  }
  if (scene && runtime.target && runtime.target.parent !== scene) {
    scene.remove(runtime.target);
  }
}
