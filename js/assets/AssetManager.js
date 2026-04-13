import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";

const SPEC_GLOSS_EXTENSION = "KHR_materials_pbrSpecularGlossiness";
let originalConsoleWarn = null;
let suppressedSpecGlossWarnCount = 0;

function isSpecGlossWarning(args = []) {
  const first = args[0];
  return typeof first === "string" && first.includes('Unknown extension "KHR_materials_pbrSpecularGlossiness"');
}

function beginSpecGlossWarningSuppression() {
  if (typeof console === "undefined" || typeof console.warn !== "function") {
    return () => {};
  }

  if (suppressedSpecGlossWarnCount === 0) {
    originalConsoleWarn = console.warn.bind(console);
    console.warn = (...args) => {
      if (isSpecGlossWarning(args)) return;
      originalConsoleWarn?.(...args);
    };
  }

  suppressedSpecGlossWarnCount += 1;

  return () => {
    suppressedSpecGlossWarnCount = Math.max(0, suppressedSpecGlossWarnCount - 1);
    if (suppressedSpecGlossWarnCount === 0 && originalConsoleWarn) {
      console.warn = originalConsoleWarn;
      originalConsoleWarn = null;
    }
  };
}

export class AssetManager {
  constructor() {
    this.loader = new GLTFLoader();
    this.dracoLoader = new DRACOLoader();
    this.dracoLoader.setDecoderPath("https://unpkg.com/three@0.164.1/examples/jsm/libs/draco/");
    this.loader.setDRACOLoader(this.dracoLoader);

    this.ktx2Loader = new KTX2Loader();
    this.ktx2Loader.setTranscoderPath("https://unpkg.com/three@0.164.1/examples/jsm/libs/basis/");
    this.ktx2Supported = false;

    this.cache = new Map();
    this.textureLoader = new THREE.TextureLoader();
    this.audioLoader = new THREE.AudioLoader();
    this.textureCache = new Map();
    this.audioCache = new Map();
    this.assetVersion = new Map();
    this.assetProbeCache = new Map();
  }

  setRenderer(renderer) {
    if (!renderer?.isWebGLRenderer) return;
    try {
      this.ktx2Loader.detectSupport(renderer);
      this.loader.setKTX2Loader(this.ktx2Loader);
      this.ktx2Supported = true;
    } catch (error) {
      this.ktx2Supported = false;
    }
  }

  async listAssets() {
    // Fetch server-side asset list for the Project panel.
    const response = await fetch(`api/list_assets.php?ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Falha ao listar assets");
    return response.json();
  }

  async uploadFiles(files) {
    const formData = new FormData();
    const paths = [];

    Array.from(files).forEach((file) => {
      formData.append("files[]", file, file.name);
      paths.push(file.webkitRelativePath || file.name);
    });

    formData.append("paths", JSON.stringify(paths));

    const response = await fetch("api/upload_model.php", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) throw new Error("Falha no upload");
    return response.json();
  }

  async uploadTextures(files) {
    const formData = new FormData();
    const paths = [];

    Array.from(files).forEach((file) => {
      formData.append("files[]", file, file.name);
      paths.push(file.webkitRelativePath || file.name);
    });

    formData.append("paths", JSON.stringify(paths));

    const response = await fetch("api/upload_texture.php", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || "Falha no upload de textura");
    }
    const data = await response.json();
    if (!data?.saved?.length) {
      throw new Error("Falha no upload de textura");
    }
    return data;
  }

  async uploadAudio(files) {
    const formData = new FormData();
    const paths = [];

    Array.from(files).forEach((file) => {
      formData.append("files[]", file, file.name);
      paths.push(file.webkitRelativePath || file.name);
    });

    formData.append("paths", JSON.stringify(paths));

    const response = await fetch("api/upload_audio.php", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || "Falha no upload de audio");
    }
    const data = await response.json();
    if (!data?.saved?.length) {
      throw new Error("Falha no upload de audio");
    }
    return data;
  }

  async loadGLTF(url) {
    if (this.cache.has(url)) {
      return this.cache.get(url).then((gltf) => gltf);
    }

    const requestUrl = this.resolveAssetUrl(url);
    const promise = new Promise((resolve, reject) => {
      const endSuppressSpecGlossWarn = beginSpecGlossWarningSuppression();
      this.loader.load(
        requestUrl,
        async (gltf) => {
          try {
            await this.applySpecGlossFallback(gltf);
          } catch (error) {
            console.warn("[GLTF] Falha no fallback de material:", error);
          } finally {
            endSuppressSpecGlossWarn();
          }
          resolve(gltf);
        },
        undefined,
        (err) => {
          endSuppressSpecGlossWarn();
          reject(err);
        }
      );
    });

    this.cache.set(url, promise);
    return promise;
  }

  async loadTexture(url, options = {}) {
    const { preferCompressed = true, colorSpace = THREE.SRGBColorSpace } = options;
    const cacheKey = `${url}|${preferCompressed ? "cmp" : "std"}|${String(colorSpace)}`;
    if (this.textureCache.has(cacheKey)) {
      return this.textureCache.get(cacheKey);
    }

    const promise = this.loadTextureWithCompression(url, { preferCompressed, colorSpace });
    this.textureCache.set(cacheKey, promise);
    return promise;
  }

  async loadAudioBuffer(url) {
    if (!url) {
      throw new Error("URL de audio invalida.");
    }
    if (this.audioCache.has(url)) {
      return this.audioCache.get(url);
    }

    const requestUrl = this.resolveAssetUrl(url);
    const promise = new Promise((resolve, reject) => {
      this.audioLoader.load(requestUrl, resolve, undefined, reject);
    }).catch((error) => {
      this.audioCache.delete(url);
      throw error;
    });
    this.audioCache.set(url, promise);
    return promise;
  }

  async loadTextureWithCompression(url, options = {}) {
    const { preferCompressed = true, colorSpace = THREE.SRGBColorSpace } = options;
    if (!url) {
      throw new Error("URL de textura invalida.");
    }

    if (preferCompressed && this.ktx2Supported) {
      const compressedUrl = this.resolveCompressedTextureUrl(url);
      if (compressedUrl) {
        const exists = await this.assetExists(compressedUrl);
        if (exists) {
          return this.loadKTX2Texture(compressedUrl, colorSpace);
        }
      }
    }

    return this.loadStandardTexture(url, colorSpace);
  }

  resolveCompressedTextureUrl(url) {
    const clean = String(url || "").trim();
    if (!clean) return "";
    if (/\.ktx2(\?.*)?$/i.test(clean)) return clean;
    const queryIndex = clean.indexOf("?");
    const base = queryIndex >= 0 ? clean.slice(0, queryIndex) : clean;
    return `${base}.ktx2`;
  }

  async assetExists(url) {
    const key = String(url || "").trim();
    if (!key) return false;
    if (this.assetProbeCache.has(key)) {
      return this.assetProbeCache.get(key);
    }

    const promise = fetch(this.resolveAssetUrl(key), { method: "HEAD", cache: "no-store" })
      .then((response) => response.ok)
      .catch(() => false);
    this.assetProbeCache.set(key, promise);
    return promise;
  }

  async loadKTX2Texture(url, colorSpace) {
    const requestUrl = this.resolveAssetUrl(url);
    return new Promise((resolve, reject) => {
      this.ktx2Loader.load(
        requestUrl,
        (texture) => {
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.colorSpace = colorSpace;
          texture.anisotropy = 4;
          texture.needsUpdate = true;
          resolve(texture);
        },
        undefined,
        (error) => reject(error)
      );
    });
  }

  async loadStandardTexture(url, colorSpace) {
    const requestUrl = this.resolveAssetUrl(url);
    return new Promise((resolve, reject) => {
      this.textureLoader.load(
        requestUrl,
        (texture) => {
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.colorSpace = colorSpace;
          texture.anisotropy = 4;
          resolve(texture);
        },
        undefined,
        (err) => reject(err)
      );
    });
  }

  resolveAssetUrl(url) {
    const version = this.assetVersion.get(url) || 0;
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}v=${version}`;
  }

  invalidateAsset(url) {
    if (!url) return;
    this.cache.delete(url);
    this.audioCache.delete(url);
    Array.from(this.textureCache.keys()).forEach((key) => {
      if (key.startsWith(`${url}|`)) {
        this.textureCache.delete(key);
      }
    });
    this.assetProbeCache.delete(url);
    this.assetProbeCache.delete(`${url}.ktx2`);
    this.assetVersion.set(url, (this.assetVersion.get(url) || 0) + 1);
  }

  async getSketchfabAuthStatus() {
    const response = await fetch(`api/sketchfab_auth_status.php?ts=${Date.now()}`, {
      cache: "no-store",
    });
    return this.parseApiResponse(response, "Falha ao consultar autenticacao Sketchfab.");
  }

  async logoutSketchfab() {
    const response = await fetch("api/sketchfab_auth_logout.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    return this.parseApiResponse(response, "Falha ao sair da sessao Sketchfab.");
  }

  async searchSketchfabModels({ q = "", cursor = "", count = 12, sortBy = "", fileFormat = "auto" } = {}) {
    const params = new URLSearchParams();
    params.set("count", String(count));
    if (fileFormat && fileFormat !== "auto" && fileFormat !== "all") {
      params.set("file_format", fileFormat);
    }
    if (q) params.set("q", q);
    if (cursor) params.set("cursor", cursor);
    if (sortBy) params.set("sort_by", sortBy);
    params.set("ts", String(Date.now()));

    const response = await fetch(`api/sketchfab_search.php?${params.toString()}`, {
      cache: "no-store",
    });
    return this.parseApiResponse(response, "Falha ao buscar modelos do Sketchfab.");
  }

  async importSketchfabModel(modelUid, { reimport = false } = {}) {
    const response = await fetch("api/sketchfab_import.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelUid, reimport }),
    });
    return this.parseApiResponse(response, "Falha ao importar asset do Sketchfab.");
  }

  async deleteAsset(path) {
    const response = await fetch("api/delete_asset.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });

    if (!response.ok) {
      let message = `Falha ao excluir asset (${response.status})`;
      try {
        const data = await response.json();
        if (data?.error) message = data.error;
      } catch (error) {
        // no-op
      }
      throw new Error(message);
    }

    const data = await response.json();
    if (Array.isArray(data?.deleted)) {
      data.deleted.forEach((deletedPath) => this.invalidateAsset(deletedPath));
    } else {
      this.invalidateAsset(path);
    }
    return data;
  }

  async parseApiResponse(response, fallbackMessage) {
    let data = null;
    try {
      data = await response.json();
    } catch (error) {
      // no-op
    }

    if (!response.ok || data?.ok === false) {
      const message = data?.error || fallbackMessage || `Falha na API (${response.status})`;
      const error = new Error(message);
      if (data?.stage) error.stage = data.stage;
      if (data?.details) error.details = data.details;
      error.status = response.status;
      throw error;
    }

    return data;
  }

  async applySpecGlossFallback(gltf) {
    const parser = gltf?.parser;
    const json = parser?.json;
    if (!parser || !json?.materials?.length) return;

    const needsFallback =
      (json.extensionsRequired || []).includes(SPEC_GLOSS_EXTENSION) ||
      (json.extensionsUsed || []).includes(SPEC_GLOSS_EXTENSION) ||
      json.materials.some((material) => material?.extensions?.[SPEC_GLOSS_EXTENSION]);
    if (!needsFallback) return;

    const tasks = [];
    const visited = new Set();
    const scene = gltf.scene;
    if (!scene) return;

    scene.traverse((object) => {
      if (!object?.isMesh || !object.material) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];

      materials.forEach((material) => {
        if (!material || visited.has(material)) return;
        visited.add(material);

        const extensionFromUserData =
          material.userData?.gltfExtensions?.[SPEC_GLOSS_EXTENSION] || null;
        let materialDef = null;
        let specGloss = extensionFromUserData;

        if (!specGloss) {
          const association = parser.associations?.get(material);
          const materialIndex = association?.materials;
          if (Number.isInteger(materialIndex)) {
            materialDef = json.materials?.[materialIndex] || null;
            specGloss = materialDef?.extensions?.[SPEC_GLOSS_EXTENSION] || null;
          }
        }

        if (!specGloss) return;

        if (!materialDef) {
          const association = parser.associations?.get(material);
          const materialIndex = association?.materials;
          if (Number.isInteger(materialIndex)) {
            materialDef = json.materials?.[materialIndex] || null;
          }
        }

        const factor = Array.isArray(specGloss.diffuseFactor) ? specGloss.diffuseFactor : [1, 1, 1, 1];
        if (material.color) {
          material.color.setRGB(factor[0] ?? 1, factor[1] ?? 1, factor[2] ?? 1);
        }
        material.opacity = factor[3] ?? 1;
        material.metalness = 0;
        material.roughness = THREE.MathUtils.clamp(1 - (specGloss.glossinessFactor ?? 1), 0, 1);

        const alphaMode = materialDef?.alphaMode || "OPAQUE";
        material.transparent = alphaMode === "BLEND";
        material.alphaTest = alphaMode === "MASK" ? materialDef?.alphaCutoff ?? 0.5 : 0;
        material.depthWrite = alphaMode !== "BLEND";
        material.side = materialDef?.doubleSided ? THREE.DoubleSide : THREE.FrontSide;

        const diffuseTextureIndex = specGloss.diffuseTexture?.index;
        if (Number.isInteger(diffuseTextureIndex)) {
          const task = parser
            .getDependency("texture", diffuseTextureIndex)
            .then((texture) => {
              if (!texture) return;
              texture.colorSpace = THREE.SRGBColorSpace;
              texture.needsUpdate = true;
              material.map = texture;
              material.needsUpdate = true;
            })
            .catch((error) => {
              console.warn("[GLTF] Falha ao aplicar diffuseTexture:", error);
            });
          tasks.push(task);
        } else {
          material.needsUpdate = true;
        }
      });
    });

    if (tasks.length) {
      await Promise.all(tasks);
    }
  }
}
