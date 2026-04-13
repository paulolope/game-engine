const PRESET_ORDER = ["low", "medium", "high", "ultra"];
const QUALITY_STORAGE_KEY = "gamePreviewQualityPreset_v2";
const LEGACY_QUALITY_STORAGE_KEY = "gamePreviewQualityPreset";

const PRESETS = {
  low: {
    id: "low",
    label: "Low",
    renderScale: 0.68,
    maxPixelRatio: 1,
    antialias: false,
    viewDistance: 140,
    shadowDistance: 40,
    shadowMapSize: 512,
    shadowQuality: "low",
    vegetationDensity: 0.35,
    vegetationDistance: 60,
    vegetationNearDistance: 22,
    terrainDetailDistance: 26,
    effectDistance: 45,
    lodNear: 22,
    lodFar: 70,
    fog: true,
    post: {
      enabled: false,
      ssao: false,
      bloom: false,
    },
    ssaoIntensity: 0,
    bloomStrength: 0,
    bloomThreshold: 0.95,
    toneExposure: 1.02,
    textureAnisotropy: 2,
  },
  medium: {
    id: "medium",
    label: "Medium",
    renderScale: 0.82,
    maxPixelRatio: 1.25,
    antialias: true,
    viewDistance: 185,
    shadowDistance: 62,
    shadowMapSize: 1024,
    shadowQuality: "medium",
    vegetationDensity: 0.58,
    vegetationDistance: 86,
    vegetationNearDistance: 30,
    terrainDetailDistance: 34,
    effectDistance: 62,
    lodNear: 28,
    lodFar: 92,
    fog: true,
    post: {
      enabled: true,
      ssao: false,
      bloom: false,
    },
    ssaoIntensity: 0.18,
    bloomStrength: 0.1,
    bloomThreshold: 0.87,
    toneExposure: 1.02,
    textureAnisotropy: 4,
  },
  high: {
    id: "high",
    label: "High",
    renderScale: 0.95,
    maxPixelRatio: 1.6,
    antialias: true,
    viewDistance: 240,
    shadowDistance: 86,
    shadowMapSize: 1536,
    shadowQuality: "high",
    vegetationDensity: 0.82,
    vegetationDistance: 120,
    vegetationNearDistance: 42,
    terrainDetailDistance: 46,
    effectDistance: 82,
    lodNear: 38,
    lodFar: 128,
    fog: true,
    post: {
      enabled: true,
      ssao: true,
      bloom: true,
    },
    ssaoIntensity: 0.32,
    bloomStrength: 0.18,
    bloomThreshold: 0.84,
    toneExposure: 1.02,
    textureAnisotropy: 8,
  },
  ultra: {
    id: "ultra",
    label: "Ultra",
    renderScale: 1,
    maxPixelRatio: 2,
    antialias: true,
    viewDistance: 300,
    shadowDistance: 108,
    shadowMapSize: 2048,
    shadowQuality: "ultra",
    vegetationDensity: 1,
    vegetationDistance: 150,
    vegetationNearDistance: 58,
    terrainDetailDistance: 58,
    effectDistance: 102,
    lodNear: 48,
    lodFar: 156,
    fog: true,
    post: {
      enabled: true,
      ssao: true,
      bloom: true,
    },
    ssaoIntensity: 0.38,
    bloomStrength: 0.22,
    bloomThreshold: 0.82,
    toneExposure: 1.02,
    textureAnisotropy: 12,
  },
};

function clonePreset(id) {
  return JSON.parse(JSON.stringify(PRESETS[id] || PRESETS.high));
}

export class QualitySettingsManager {
  constructor(storageKey = QUALITY_STORAGE_KEY) {
    this.storageKey = storageKey;
    this.listeners = new Set();
    this.statusListeners = new Set();
    this.state = clonePreset("high");
    this.state.autoFallback = false;

    this.frameSamples = [];
    this.maxSamples = 120;
    this.lastAutoFallbackAt = 0;
    this.autoFallbackCooldownMs = 14000;
    this.lowFpsThreshold = {
      ultra: 53,
      high: 50,
      medium: 46,
      low: 40,
    };
  }

  initialize() {
    try {
      const stored =
        localStorage.getItem(this.storageKey) ??
        localStorage.getItem(LEGACY_QUALITY_STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (!parsed || typeof parsed !== "object") return;
      const presetId = PRESETS[parsed.id] ? parsed.id : "high";
      this.state = { ...clonePreset(presetId), ...parsed };
      this.state.id = presetId;
      this.state.label = PRESETS[presetId].label;
      this.state.autoFallback = parsed.autoFallback === true;
      this.persist();
    } catch (error) {
      // Ignore persisted corruption and use defaults.
    }
  }

  onChange(listener) {
    if (typeof listener === "function") {
      this.listeners.add(listener);
    }
    return () => this.listeners.delete(listener);
  }

  onStatus(listener) {
    if (typeof listener === "function") {
      this.statusListeners.add(listener);
    }
    return () => this.statusListeners.delete(listener);
  }

  getPresetList() {
    return PRESET_ORDER.map((id) => ({ id, label: PRESETS[id].label }));
  }

  getCurrent() {
    return this.state;
  }

  getCurrentId() {
    return this.state.id;
  }

  setAutoFallback(enabled) {
    this.state.autoFallback = enabled !== false;
    this.persist();
    this.emitChange("auto-fallback");
  }

  setPreset(id, reason = "manual") {
    if (!PRESETS[id]) return false;
    const previousAuto = this.state.autoFallback !== false;
    this.state = clonePreset(id);
    this.state.autoFallback = previousAuto;
    this.persist();
    this.emitChange(reason);
    return true;
  }

  setPostOption(key, enabled) {
    if (!this.state.post || !(key in this.state.post)) return;
    this.state.post[key] = enabled !== false;
    this.persist();
    this.emitChange("post-option");
  }

  setFogEnabled(enabled) {
    this.state.fog = enabled !== false;
    this.persist();
    this.emitChange("fog-option");
  }

  updatePerformance(fps) {
    if (!Number.isFinite(fps) || fps <= 0) return;
    this.frameSamples.push(fps);
    if (this.frameSamples.length > this.maxSamples) {
      this.frameSamples.shift();
    }
    if (!this.state.autoFallback) return;
    if (this.frameSamples.length < 80) return;

    const avgFps = this.frameSamples.reduce((sum, value) => sum + value, 0) / this.frameSamples.length;
    const currentId = this.state.id;
    const threshold = this.lowFpsThreshold[currentId] ?? 48;
    const now = performance.now();
    if (now - this.lastAutoFallbackAt < this.autoFallbackCooldownMs) return;
    if (avgFps >= threshold) return;

    const lowered = this.getLowerPresetId(currentId);
    if (!lowered) return;

    this.lastAutoFallbackAt = now;
    this.setPreset(lowered, "auto-fallback");
    this.emitStatus(`FPS medio ${avgFps.toFixed(1)}: preset reduzido para ${PRESETS[lowered].label}.`);
  }

  getLowerPresetId(currentId) {
    const index = PRESET_ORDER.indexOf(currentId);
    if (index <= 0) return null;
    return PRESET_ORDER[index - 1];
  }

  emitChange(reason = "manual") {
    this.listeners.forEach((listener) => {
      try {
        listener(this.state, reason);
      } catch (error) {
        // no-op
      }
    });
  }

  emitStatus(message) {
    this.statusListeners.forEach((listener) => {
      try {
        listener(message);
      } catch (error) {
        // no-op
      }
    });
  }

  persist() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.state));
    } catch (error) {
      // Ignore storage failures in private modes.
    }
  }
}
