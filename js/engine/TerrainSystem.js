import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { getTreeCollisionRadius, normalizeTreeCollision } from "../utils/treeCollisions.js";

const DEFAULT_SIZE = 200;
const DEFAULT_SEGMENTS = 64;
const MAX_LAYERS = 4;

let cachedGrass = null;
let cachedDirt = null;
let cachedTreeGeometry = null;
let cachedTreeMaterial = null;
let cachedFallbackTexture = null;
const textureCache = new Map();
const textureLoader = new THREE.TextureLoader();
const treeModelTemplateCache = new Map();
const treeDummy = new THREE.Object3D();

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  const num = parseInt(value, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function mixColor(a, b, t) {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

function createNoiseTexture(baseHex, detailHex) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const base = hexToRgb(baseHex);
  const detail = hexToRgb(detailHex);

  ctx.fillStyle = `rgb(${base.r}, ${base.g}, ${base.b})`;
  ctx.fillRect(0, 0, size, size);

  const pixels = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const t = Math.random() * 0.5;
    const mixed = mixColor(base, detail, t);
    pixels.data[i] = mixed.r;
    pixels.data[i + 1] = mixed.g;
    pixels.data[i + 2] = mixed.b;
    pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function getTerrainTextures() {
  if (!cachedGrass) {
    cachedGrass = createNoiseTexture("#8d9860", "#c7ba80");
  }
  if (!cachedDirt) {
    cachedDirt = createNoiseTexture("#8f7456", "#b69d78");
  }
  return { grass: cachedGrass, dirt: cachedDirt };
}

function normalizeLayers(layers = [], defaultScale) {
  const sanitized = Array.isArray(layers) ? layers : [];
  if (!sanitized.length) {
    return [
      { id: "layer-grass", name: "Grass", kind: "builtin", key: "grass", scale: defaultScale },
      { id: "layer-dirt", name: "Dirt", kind: "builtin", key: "dirt", scale: defaultScale },
    ];
  }

  return sanitized.slice(0, MAX_LAYERS).map((layer, index) => {
    const scale = Number(layer.scale);
    return {
      id: layer.id || `layer-${index + 1}`,
      name: layer.name || layer.label || `Layer ${index + 1}`,
      kind: layer.kind || (layer.path ? "texture" : "builtin"),
      path: layer.path || null,
      key: layer.key || layer.builtin || null,
      scale: Number.isFinite(scale) ? scale : defaultScale,
    };
  });
}

function resolveLayerTexture(layer) {
  if (!layer) return getFallbackTexture();
  if (layer.kind === "texture" && layer.path) {
    return loadTexture(layer.path);
  }
  const { grass, dirt } = getTerrainTextures();
  if (layer.key === "dirt") return dirt;
  return grass;
}

function applyLayerScales(textures, layers, defaultScale) {
  textures.forEach((texture, index) => {
    if (!texture) return;
    const scale = layers[index]?.scale ?? defaultScale;
    texture.repeat.set(scale, scale);
    texture.needsUpdate = true;
  });
}

function getFallbackTexture() {
  if (!cachedFallbackTexture) {
    const data = new Uint8Array([255, 255, 255, 255]);
    cachedFallbackTexture = new THREE.DataTexture(data, 1, 1);
    cachedFallbackTexture.needsUpdate = true;
    cachedFallbackTexture.colorSpace = THREE.SRGBColorSpace;
  }
  return cachedFallbackTexture;
}

function loadTexture(path) {
  if (!path) return getFallbackTexture();
  if (textureCache.has(path)) return textureCache.get(path);

  const texture = textureLoader.load(
    path,
    () => {
      texture.needsUpdate = true;
    },
    undefined,
    (err) => {
      console.warn("[Terrain] Falha ao carregar textura:", path, err);
    }
  );
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  textureCache.set(path, texture);
  return texture;
}

function buildTerrainMaterial(layers, defaultScale = 4) {
  const normalizedLayers = normalizeLayers(layers, defaultScale);
  const textures = normalizedLayers.map((layer) => resolveLayerTexture(layer));
  while (textures.length < MAX_LAYERS) textures.push(getFallbackTexture());
  applyLayerScales(textures, normalizedLayers, defaultScale);

  const material = new THREE.MeshStandardMaterial({
    color: 0xf1ead7,
    map: textures[0] || getFallbackTexture(),
    roughness: 0.9,
    metalness: 0,
    vertexColors: true,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
  });

  material.userData.layers = normalizedLayers;
  material.userData.textures = textures;

  material.onBeforeCompile = (shader) => {
    const activeLayers = material.userData.layers || normalizedLayers;
    const activeTextures = material.userData.textures || textures;
    shader.uniforms.map2 = { value: activeTextures[1] || getFallbackTexture() };
    shader.uniforms.map3 = { value: activeTextures[2] || getFallbackTexture() };
    shader.uniforms.map4 = { value: activeTextures[3] || getFallbackTexture() };
    shader.uniforms.layerScale = {
      value: new THREE.Vector4(
        activeLayers[0]?.scale ?? defaultScale,
        activeLayers[1]?.scale ?? defaultScale,
        activeLayers[2]?.scale ?? defaultScale,
        activeLayers[3]?.scale ?? defaultScale
      ),
    };

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `
      #include <common>
      uniform sampler2D map2;
      uniform sampler2D map3;
      uniform sampler2D map4;
      uniform vec4 layerScale;
      `
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `
      #ifdef USE_MAP
        vec2 uv = vMapUv;
        vec4 t0 = texture2D( map, uv * layerScale.x );
        vec4 t1 = texture2D( map2, uv * layerScale.y );
        vec4 t2 = texture2D( map3, uv * layerScale.z );
        vec4 t3 = texture2D( map4, uv * layerScale.w );
        vec3 vc = clamp(vColor, 0.0, 1.0);
        float base = clamp(1.0 - vc.r - vc.g - vc.b, 0.0, 1.0);
        vec4 weights = vec4(base, vc.r, vc.g, vc.b);
        float sum = weights.x + weights.y + weights.z + weights.w;
        if (sum < 0.0001) {
          weights = vec4(1.0, 0.0, 0.0, 0.0);
          sum = 1.0;
        }
        weights /= sum;
        vec4 mixed = t0 * weights.x + t1 * weights.y + t2 * weights.z + t3 * weights.w;
        diffuseColor *= mixed;
      #endif
      `
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `
      #ifdef USE_COLOR
        // vColor is used for terrain splat weights. Skip diffuse multiply.
      #endif
      `
    );

    material.userData.shader = shader;
  };

  material.customProgramCacheKey = () => "terrain-blend-v6";
  return material;
}

function ensureColorAttribute(geometry) {
  const pos = geometry.attributes.position;
  const current = geometry.attributes.color;
  if (!current || current.count !== pos.count) {
    const data = new Float32Array(pos.count * 3);
    geometry.setAttribute("color", new THREE.BufferAttribute(data, 3));
  }
}

export function createTerrainMesh({
  size = DEFAULT_SIZE,
  sizeZ = null,
  segments = DEFAULT_SEGMENTS,
  textureScale = null,
  layers = null,
  heights = null,
  paint = null,
  splat = null,
} = {}) {
  const terrainSize = safeSize(size);
  const terrainSizeZ = safeSize(sizeZ ?? size);
  const seg = safeSegments(segments);
  const repeat = textureScale ?? Math.max(1, Math.max(terrainSize, terrainSizeZ) / 4);

  const geometry = new THREE.PlaneGeometry(terrainSize, terrainSizeZ, seg, seg);
  geometry.rotateX(-Math.PI / 2);
  ensureColorAttribute(geometry);

  const material = buildTerrainMaterial(layers, repeat);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.visible = true;
  mesh.material.opacity = 1;
  mesh.material.transparent = false;
  mesh.userData.isTerrainMesh = true;

  if (heights) {
    applyHeights(mesh, heights);
  }
  if (splat || paint) {
    applyPaint(mesh, splat, paint);
  }

  geometry.computeVertexNormals();
  return mesh;
}

export function buildTerrainGroup(data = {}) {
  const payload = normalizeTerrainData(data);
  const group = new THREE.Group();
  const mesh = createTerrainMesh(payload);
  group.add(mesh);
  return { group, mesh, data: payload };
}

export function rebuildTerrainMesh(mesh, data) {
  if (!mesh) return null;
  const payload = normalizeTerrainData(data);
  const geometry = new THREE.PlaneGeometry(payload.size, payload.sizeZ, payload.segments, payload.segments);
  geometry.rotateX(-Math.PI / 2);
  ensureColorAttribute(geometry);

  mesh.geometry.dispose();
  mesh.geometry = geometry;

  updateTerrainTextureScale(mesh, payload.textureScale ?? Math.max(1, payload.size / 4));
  updateTerrainLayers(mesh, payload.layers, payload.textureScale);

  if (payload.heights) applyHeights(mesh, payload.heights);
  if (payload.splat || payload.paint) applyPaint(mesh, payload.splat, payload.paint);

  mesh.geometry.computeVertexNormals();
  return payload;
}

export function updateTerrainTextureScale(mesh, scale) {
  if (!mesh?.material) return;
  const layers = mesh.material.userData?.layers || [];
  const nextLayers = layers.map((layer) => ({ ...layer, scale }));
  updateTerrainLayers(mesh, nextLayers, scale);
}

export function updateTerrainLayers(mesh, layers, defaultScale) {
  if (!mesh?.material) return;
  const baseScale = Number.isFinite(defaultScale)
    ? defaultScale
    : mesh.material.userData?.layers?.[0]?.scale ?? 4;
  const normalizedLayers = normalizeLayers(layers, baseScale);
  const textures = normalizedLayers.map((layer) => resolveLayerTexture(layer));
  while (textures.length < MAX_LAYERS) textures.push(getFallbackTexture());
  applyLayerScales(textures, normalizedLayers, baseScale);

  mesh.material.map = textures[0] || getFallbackTexture();
  mesh.material.userData.layers = normalizedLayers;
  mesh.material.userData.textures = textures;

  const shader = mesh.material.userData.shader;
  if (shader) {
    shader.uniforms.map2.value = textures[1] || getFallbackTexture();
    shader.uniforms.map3.value = textures[2] || getFallbackTexture();
    shader.uniforms.map4.value = textures[3] || getFallbackTexture();
    shader.uniforms.layerScale.value.set(
      normalizedLayers[0]?.scale ?? baseScale,
      normalizedLayers[1]?.scale ?? baseScale,
      normalizedLayers[2]?.scale ?? baseScale,
      normalizedLayers[3]?.scale ?? baseScale
    );
  }

  mesh.material.needsUpdate = true;
}

export function extractTerrainData(entity) {
  if (!entity?.terrain?.mesh) return null;
  const mesh = entity.terrain.mesh;
  const geometry = mesh.geometry;
  const pos = geometry.attributes.position;
  const color = geometry.attributes.color;
  const splat = geometry.attributes.splat;

  const heights = [];
  const splatData = [];
  for (let i = 0; i < pos.count; i += 1) {
    heights.push(pos.getY(i));
    if (color) {
      const r = color.getX(i);
      const g = color.getY(i);
      const b = color.getZ(i);
      const base = Math.max(0, 1 - (r + g + b));
      splatData.push(base, r, g, b);
    } else if (splat) {
      splatData.push(splat.getX(i), splat.getY(i), splat.getZ(i), splat.getW(i));
    }
  }

  return {
    size: entity.terrain.size,
    sizeZ: entity.terrain.sizeZ ?? entity.terrain.size,
    segments: entity.terrain.segments,
    textureScale:
      entity.terrain.textureScale ??
      Math.max(1, Math.max(entity.terrain.size, entity.terrain.sizeZ ?? entity.terrain.size) / 4),
    maxHeight: entity.terrain.maxHeight ?? 6,
    heights,
    splat: splatData.length ? splatData : null,
    layers: entity.terrain.layers ? entity.terrain.layers.map((layer) => ({ ...layer })) : null,
    trees: entity.terrain.trees ? entity.terrain.trees.map((tree) => ({ ...tree })) : [],
  };
}

export function applyHeights(mesh, heights) {
  if (!mesh || !heights) return;
  const pos = mesh.geometry.attributes.position;
  const count = Math.min(pos.count, heights.length);
  for (let i = 0; i < count; i += 1) {
    pos.setY(i, heights[i]);
  }
  pos.needsUpdate = true;
}

export function applyPaint(mesh, splat, legacyPaint) {
  if (!mesh) return;
  ensureColorAttribute(mesh.geometry);
  const attr = mesh.geometry.attributes.color;
  const count = attr.count;

  const normalize = (w0, w1, w2, w3) => {
    let a = Math.max(0, w0);
    let b = Math.max(0, w1);
    let c = Math.max(0, w2);
    let d = Math.max(0, w3);
    const sum = a + b + c + d;
    if (sum <= 0.0001) return [1, 0, 0, 0];
    a /= sum;
    b /= sum;
    c /= sum;
    d /= sum;
    return [a, b, c, d];
  };

  if (splat && splat.length >= count * 4) {
    for (let i = 0; i < count; i += 1) {
      const index = i * 4;
      const weights = normalize(
        splat[index],
        splat[index + 1],
        splat[index + 2],
        splat[index + 3]
      );
      attr.setXYZ(i, weights[1], weights[2], weights[3]);
    }
  } else if (legacyPaint && legacyPaint.length >= count) {
    for (let i = 0; i < count; i += 1) {
      const value = legacyPaint[i];
      const weights = normalize(1 - value, value, 0, 0);
      attr.setXYZ(i, weights[1], weights[2], weights[3]);
    }
  } else {
    for (let i = 0; i < count; i += 1) {
      attr.setXYZ(i, 0, 0, 0);
    }
  }

  attr.needsUpdate = true;
  if (mesh.material) {
    mesh.material.needsUpdate = true;
  }
}

export function fillTerrainLayer(mesh, layerIndex = 0) {
  if (!mesh) return;
  ensureColorAttribute(mesh.geometry);
  const attr = mesh.geometry.attributes.color;
  const count = attr.count;
  const index = Math.max(0, Math.min(3, Number(layerIndex) || 0));

  let r = 0;
  let g = 0;
  let b = 0;
  if (index === 1) r = 1;
  if (index === 2) g = 1;
  if (index === 3) b = 1;

  for (let i = 0; i < count; i += 1) {
    attr.setXYZ(i, r, g, b);
  }
  attr.needsUpdate = true;
  if (mesh.material) {
    mesh.material.needsUpdate = true;
  }
}

function getFallbackTreeTemplate() {
  if (cachedTreeGeometry && cachedTreeMaterial) {
    return { meshes: [{ geometry: cachedTreeGeometry, material: cachedTreeMaterial }] };
  }

  const trunk = new THREE.CylinderGeometry(0.08, 0.12, 0.6, 6);
  trunk.translate(0, 0.3, 0);
  const leaves = new THREE.ConeGeometry(0.35, 0.9, 7);
  leaves.translate(0, 1.0, 0);

  const trunkColors = new Float32Array(trunk.attributes.position.count * 3);
  for (let i = 0; i < trunk.attributes.position.count; i += 1) {
    trunkColors[i * 3] = 0.45;
    trunkColors[i * 3 + 1] = 0.32;
    trunkColors[i * 3 + 2] = 0.2;
  }
  trunk.setAttribute("color", new THREE.BufferAttribute(trunkColors, 3));

  const leavesColors = new Float32Array(leaves.attributes.position.count * 3);
  for (let i = 0; i < leaves.attributes.position.count; i += 1) {
    leavesColors[i * 3] = 0.23;
    leavesColors[i * 3 + 1] = 0.55;
    leavesColors[i * 3 + 2] = 0.25;
  }
  leaves.setAttribute("color", new THREE.BufferAttribute(leavesColors, 3));

  const merged = mergeGeometries([trunk, leaves], true);
  merged.computeVertexNormals();

  cachedTreeGeometry = merged;
  cachedTreeMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
    flatShading: true,
  });

  return { meshes: [{ geometry: cachedTreeGeometry, material: cachedTreeMaterial }] };
}

function cloneTreeMaterial(material) {
  if (!material) {
    return new THREE.MeshStandardMaterial({ color: 0x4f7a3c, roughness: 0.95, metalness: 0 });
  }
  const cloned = material.clone ? material.clone() : material;
  if (cloned.map) cloned.map.colorSpace = THREE.SRGBColorSpace;
  if (cloned.emissiveMap) cloned.emissiveMap.colorSpace = THREE.SRGBColorSpace;
  if ("roughness" in cloned) cloned.roughness = Math.max(0.82, Number(cloned.roughness) || 0.82);
  if ("metalness" in cloned) cloned.metalness = Math.min(0.06, Number(cloned.metalness) || 0);
  if ("alphaTest" in cloned && cloned.transparent) {
    cloned.alphaTest = Math.max(cloned.alphaTest || 0, 0.22);
    cloned.side = THREE.DoubleSide;
  }
  return cloned;
}

function buildTreeModelTemplate(root) {
  if (!root) return null;

  const sceneRoot = root.clone(true);
  sceneRoot.updateMatrixWorld(true);

  const meshes = [];
  const bounds = new THREE.Box3();
  let hasBounds = false;

  sceneRoot.traverse((child) => {
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
      ? child.material.map((mat) => cloneTreeMaterial(mat))
      : cloneTreeMaterial(child.material);

    meshes.push({ geometry, material });
  });

  if (!meshes.length || !hasBounds) return null;

  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  bounds.getSize(size);
  bounds.getCenter(center);

  const targetHeight = 9.2; // Scale imported tree assets to forest-sized height by default.
  const height = Math.max(size.y, 0.001);
  const scaleValue = targetHeight / height;
  const toOrigin = new THREE.Matrix4().makeTranslation(-center.x, -bounds.min.y, -center.z);
  const toScale = new THREE.Matrix4().makeScale(scaleValue, scaleValue, scaleValue);
  const normalizeMatrix = new THREE.Matrix4().multiplyMatrices(toScale, toOrigin);

  meshes.forEach((entry) => {
    entry.geometry.applyMatrix4(normalizeMatrix);
    entry.geometry.computeBoundingBox();
    entry.geometry.computeBoundingSphere();
  });

  return { meshes };
}

function resolveTreeModelPath(tree) {
  if (!tree) return "";
  if (typeof tree.modelPath === "string" && tree.modelPath.trim()) return tree.modelPath.trim();
  if (typeof tree.model === "string" && tree.model.trim()) return tree.model.trim();
  return "";
}

function notifyTreeTemplateListeners(entry) {
  const listeners = Array.from(entry.listeners || []);
  listeners.forEach((listener) => {
    try {
      listener?.();
    } catch (error) {
      // no-op
    }
  });
  if (entry.listeners) {
    entry.listeners.clear();
  }
}

function getTreeModelTemplate(path, assetManager, onReady) {
  const key = String(path || "").trim();
  if (!key || !assetManager) return null;

  let entry = treeModelTemplateCache.get(key);
  if (entry?.status === "ready") return entry.template;
  if (entry?.status === "error") return null;

  if (entry?.status === "loading") {
    if (onReady) entry.listeners.add(onReady);
    return null;
  }

  entry = {
    status: "loading",
    template: null,
    listeners: new Set(),
  };
  if (onReady) entry.listeners.add(onReady);
  treeModelTemplateCache.set(key, entry);

  assetManager
    .loadGLTF(key)
    .then((gltf) => {
      const template = buildTreeModelTemplate(gltf?.scene);
      if (!template) {
        entry.status = "error";
        notifyTreeTemplateListeners(entry);
        return;
      }
      entry.template = template;
      entry.status = "ready";
      notifyTreeTemplateListeners(entry);
    })
    .catch((error) => {
      entry.status = "error";
      console.warn("[Terrain] Falha ao carregar modelo de arvore:", key, error);
      notifyTreeTemplateListeners(entry);
    });

  return null;
}

function clearTreeRenderGroup(group) {
  if (!group) return;
  while (group.children.length) {
    group.remove(group.children[0]);
  }
}

function createTreeInstances(group, trees, template) {
  if (!group || !Array.isArray(trees) || !trees.length) return;
  const entries = template?.meshes || [];
  if (!entries.length) return;

  entries.forEach((entry) => {
    const materials = Array.isArray(entry.material) ? entry.material : [entry.material];
    const hasCutoutFoliage = materials.some(
      (material) => material && (material.transparent || Number(material.alphaTest) > 0.01)
    );
    const instanced = new THREE.InstancedMesh(entry.geometry, entry.material, Math.max(1, trees.length));
    instanced.count = trees.length;
    instanced.castShadow = !hasCutoutFoliage;
    instanced.receiveShadow = true;
    instanced.frustumCulled = false;
    instanced.userData.ignoreRaycast = true;

    trees.forEach((tree, index) => {
      treeDummy.position.set(tree.x ?? 0, tree.y ?? 0, tree.z ?? 0);
      treeDummy.scale.setScalar(Math.max(0.01, Number(tree.scale) || 1));
      treeDummy.rotation.set(0, Number(tree.rotation) || 0, 0);
      treeDummy.updateMatrix();
      instanced.setMatrixAt(index, treeDummy.matrix);
    });
    instanced.instanceMatrix.needsUpdate = true;
    group.add(instanced);
  });
}

export function updateTerrainTrees(entity, assetManager = null) {
  if (!entity?.terrain?.mesh) return;
  const trees = Array.isArray(entity.terrain.trees) ? entity.terrain.trees.map((tree) => normalizeTreeCollision(tree)) : [];
  entity.terrain.trees = trees;

  if (entity.terrain.treesMesh?.parent) {
    entity.terrain.treesMesh.parent.remove(entity.terrain.treesMesh);
  }
  entity.terrain.treesMesh = null;

  if (!entity.terrain.treesGroup) {
    const treesGroup = new THREE.Group();
    treesGroup.name = "Terrain Trees";
    treesGroup.userData.ignoreRaycast = true;
    entity.terrain.treesGroup = treesGroup;
    entity.three.add(treesGroup);
  }

  const treesGroup = entity.terrain.treesGroup;
  clearTreeRenderGroup(treesGroup);
  if (!trees.length) return;

  const buckets = new Map();
  trees.forEach((tree) => {
    const modelPath = resolveTreeModelPath(tree);
    const key = modelPath || "__procedural__";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(tree);
  });

  buckets.forEach((bucketTrees, key) => {
    let template = null;
    if (key !== "__procedural__") {
      template = getTreeModelTemplate(key, assetManager, () => updateTerrainTrees(entity, assetManager));
    }
    if (!template) {
      template = getFallbackTreeTemplate();
    }
    createTreeInstances(treesGroup, bucketTrees, template);
  });
}

export function sampleTerrainHeight(entity, localX, localZ) {
  if (!entity?.terrain?.mesh) return 0;
  const size = entity.terrain.size;
  const sizeZ = entity.terrain.sizeZ ?? size;
  const segments = entity.terrain.segments;
  const mesh = entity.terrain.mesh;
  const pos = mesh.geometry.attributes.position;
  const halfX = size / 2;
  const halfZ = sizeZ / 2;
  const stepX = size / segments;
  const stepZ = sizeZ / segments;

  let x = localX + halfX;
  let z = localZ + halfZ;
  x = THREE.MathUtils.clamp(x, 0, size - 0.0001);
  z = THREE.MathUtils.clamp(z, 0, sizeZ - 0.0001);

  const ix = Math.floor(x / stepX);
  const iz = Math.floor(z / stepZ);
  const fx = (x - ix * stepX) / stepX;
  const fz = (z - iz * stepZ) / stepZ;

  const row = segments + 1;
  const i00 = iz * row + ix;
  const i10 = i00 + 1;
  const i01 = i00 + row;
  const i11 = i01 + 1;

  const y00 = pos.getY(i00);
  const y10 = pos.getY(i10);
  const y01 = pos.getY(i01);
  const y11 = pos.getY(i11);

  const y0 = y00 + (y10 - y00) * fx;
  const y1 = y01 + (y11 - y01) * fx;
  return y0 + (y1 - y0) * fz;
}

export function normalizeTerrainData(data = {}) {
  const size = safeSize(data.size ?? DEFAULT_SIZE);
  const sizeZ = safeSize(data.sizeZ ?? size);
  const segments = safeSegments(data.segments ?? DEFAULT_SEGMENTS);
  const textureScale = data.textureScale ?? Math.max(1, Math.max(size, sizeZ) / 4);
  const layers = normalizeLayers(data.layers, textureScale);
  const maxHeight = Number.isFinite(Number(data.maxHeight)) ? Number(data.maxHeight) : 6;
  return {
    size,
    sizeZ,
    segments,
    textureScale,
    maxHeight,
    heights: data.heights || null,
    paint: data.paint || null,
    splat: data.splat || null,
    layers,
    trees: Array.isArray(data.trees)
      ? data.trees.map((tree) => {
          const modelPath = resolveTreeModelPath(tree);
          const collision = normalizeTreeCollision(tree);
          return {
            ...(tree || {}),
            modelPath,
            collidable: collision.collidable,
            collisionRadius: getTreeCollisionRadius(collision),
          };
        })
      : [],
  };
}

export function safeSize(value) {
  const size = Number(value);
  if (!Number.isFinite(size)) return DEFAULT_SIZE;
  return Math.max(2, Math.min(2000, size));
}

export function safeSegments(value) {
  const seg = Math.round(Number(value));
  if (!Number.isFinite(seg)) return DEFAULT_SEGMENTS;
  return Math.max(8, Math.min(200, seg));
}

