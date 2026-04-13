import * as THREE from "three";

let sharedTextures = null;

function createDataTexture(data, size, format = THREE.RGBAFormat, colorSpace = THREE.NoColorSpace) {
  const texture = new THREE.DataTexture(data, size, size, format, THREE.UnsignedByteType);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = colorSpace;
  texture.needsUpdate = true;
  return texture;
}

function fract(value) {
  return value - Math.floor(value);
}

function noise2D(x, y, seed = 1) {
  return fract(Math.sin(x * 127.1 + y * 311.7 + seed * 17.3) * 43758.5453123);
}

function fbm(x, y, seed = 1) {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let i = 0; i < 4; i += 1) {
    value += amplitude * noise2D(x * frequency, y * frequency, seed + i * 3.1);
    frequency *= 2;
    amplitude *= 0.5;
  }
  return value;
}

function createTerrainDetailTextures() {
  if (sharedTextures) return sharedTextures;

  const size = 256;
  const albedoData = new Uint8Array(size * size * 4);
  const normalData = new Uint8Array(size * size * 4);
  const roughnessData = new Uint8Array(size * size * 4);
  const aoData = new Uint8Array(size * size * 4);
  const heightField = new Float32Array(size * size);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const n = fbm(u * 8, v * 8, 3.7);
      const cell = fbm(u * 14, v * 14, 9.2);
      const height = THREE.MathUtils.clamp(0.35 + n * 0.6 + cell * 0.28, 0, 1);
      heightField[y * size + x] = height;

      const base = new THREE.Color(0x8f9a63);
      const tint = new THREE.Color(0xc6b57a);
      const rock = new THREE.Color(0x93806a);
      const lerpA = base.clone().lerp(tint, n * 0.72);
      const color = lerpA.lerp(rock, Math.max(0, height - 0.72) * 0.58);

      const index = (y * size + x) * 4;
      albedoData[index] = Math.round(color.r * 255);
      albedoData[index + 1] = Math.round(color.g * 255);
      albedoData[index + 2] = Math.round(color.b * 255);
      albedoData[index + 3] = 255;

      const rough = THREE.MathUtils.clamp(0.58 + n * 0.16 + (1 - cell) * 0.08, 0.38, 0.94);
      const roughByte = Math.round(rough * 255);
      roughnessData[index] = roughByte;
      roughnessData[index + 1] = roughByte;
      roughnessData[index + 2] = roughByte;
      roughnessData[index + 3] = 255;

      const ao = THREE.MathUtils.clamp(0.92 + n * 0.07, 0.84, 1);
      const aoByte = Math.round(ao * 255);
      aoData[index] = aoByte;
      aoData[index + 1] = aoByte;
      aoData[index + 2] = aoByte;
      aoData[index + 3] = 255;
    }
  }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const x0 = (x - 1 + size) % size;
      const x1 = (x + 1) % size;
      const y0 = (y - 1 + size) % size;
      const y1 = (y + 1) % size;

      const hL = heightField[y * size + x0];
      const hR = heightField[y * size + x1];
      const hD = heightField[y0 * size + x];
      const hU = heightField[y1 * size + x];

      const nx = hL - hR;
      const ny = 0.48;
      const nz = hD - hU;
      const normal = new THREE.Vector3(nx, ny, nz).normalize();

      const index = (y * size + x) * 4;
      normalData[index] = Math.round((normal.x * 0.5 + 0.5) * 255);
      normalData[index + 1] = Math.round((normal.y * 0.5 + 0.5) * 255);
      normalData[index + 2] = Math.round((normal.z * 0.5 + 0.5) * 255);
      normalData[index + 3] = 255;
    }
  }

  const albedo = createDataTexture(albedoData, size, THREE.RGBAFormat, THREE.SRGBColorSpace);
  const normal = createDataTexture(normalData, size, THREE.RGBAFormat, THREE.NoColorSpace);
  const roughness = createDataTexture(roughnessData, size, THREE.RGBAFormat, THREE.NoColorSpace);
  const ao = createDataTexture(aoData, size, THREE.RGBAFormat, THREE.NoColorSpace);

  sharedTextures = { albedo, normal, roughness, ao };
  return sharedTextures;
}

function ensureUv2(geometry) {
  if (!geometry?.attributes?.uv) return;
  if (geometry.attributes.uv2) return;
  geometry.setAttribute("uv2", geometry.attributes.uv.clone());
}

export class TerrainMaterialManager {
  constructor(sceneStore) {
    this.sceneStore = sceneStore;
    this.detailFadeDistance = 42;
    this.detailTextures = createTerrainDetailTextures();
  }

  applyQuality(settings, renderer) {
    if (!settings) return;
    this.detailFadeDistance = settings.terrainDetailDistance ?? 42;
    const anisotropy = renderer?.capabilities?.getMaxAnisotropy
      ? Math.min(renderer.capabilities.getMaxAnisotropy(), settings.textureAnisotropy ?? 8)
      : 4;

    const textures = Object.values(this.detailTextures);
    textures.forEach((texture) => {
      texture.anisotropy = anisotropy;
      texture.repeat.set(18, 18);
      texture.needsUpdate = true;
    });

    this.upgradeAllTerrains();
  }

  upgradeAllTerrains() {
    const terrains = this.sceneStore.listEntities().filter((entity) => entity.type === "terrain");
    terrains.forEach((terrainEntity) => this.upgradeTerrainEntity(terrainEntity));
  }

  upgradeTerrainEntity(terrainEntity) {
    const mesh = terrainEntity?.terrain?.mesh;
    if (!mesh?.material) return;
    ensureUv2(mesh.geometry);

    const material = mesh.material;
    material.roughness = 0.86;
    material.metalness = 0.02;
    material.normalMap = this.detailTextures.normal;
    material.normalScale = new THREE.Vector2(0.38, 0.38);
    material.roughnessMap = this.detailTextures.roughness;
    material.aoMap = this.detailTextures.ao;
    material.aoMapIntensity = 0.18;

    if (material.userData.terrainUpgraded) {
      const shader = material.userData.terrainShader;
      if (shader?.uniforms?.detailFadeDistance) {
        shader.uniforms.detailFadeDistance.value = this.detailFadeDistance;
      }
      material.needsUpdate = true;
      return;
    }

    const previousCompile = material.onBeforeCompile?.bind(material);
    material.onBeforeCompile = (shader) => {
      if (previousCompile) previousCompile(shader);
      shader.uniforms.detailAlbedoMap = { value: this.detailTextures.albedo };
      shader.uniforms.detailFadeDistance = { value: this.detailFadeDistance };

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        `
        #include <common>
        uniform sampler2D detailAlbedoMap;
        uniform float detailFadeDistance;
      `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <fog_fragment>",
        `
        float terrainCameraDist = length(vViewPosition);
        float detailWeight = 1.0 - smoothstep(detailFadeDistance * 0.5, detailFadeDistance, terrainCameraDist);
        vec4 detailTex = texture2D(detailAlbedoMap, vMapUv * 10.0);
        vec3 variation = vec3(
          sin(vMapUv.x * 41.0) * 0.5 + 0.5,
          sin(vMapUv.y * 37.0 + 1.7) * 0.5 + 0.5,
          sin((vMapUv.x + vMapUv.y) * 27.0 + 2.2) * 0.5 + 0.5
        ) * 0.02 - 0.01;
        vec3 warmLift = vec3(0.03, 0.024, 0.01);
        vec3 detailColor = diffuseColor.rgb * (detailTex.rgb * 1.06) + warmLift;
        diffuseColor.rgb = mix(diffuseColor.rgb, detailColor, detailWeight * 0.16);
        diffuseColor.rgb += variation * detailWeight * 0.5;
        #include <fog_fragment>
      `
      );

      material.userData.terrainShader = shader;
    };

    material.customProgramCacheKey = () => "terrain-detail-pbr-v1";
    material.userData.terrainUpgraded = true;
    material.needsUpdate = true;
  }
}
