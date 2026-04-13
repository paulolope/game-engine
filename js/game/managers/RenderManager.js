import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

export class RenderManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = null;
    this.rendererType = "webgl";
    this.webgpuRequested = false;
    this.scene = null;
    this.camera = null;
    this.size = { width: 1, height: 1 };
    this.settings = null;

    this.composer = null;
    this.renderPass = null;
    this.ssaoPass = null;
    this.bloomPass = null;
    this.outputPass = null;
    this.postEnabled = false;
  }

  async initialize({ preferWebGPU = true, antialias = true } = {}) {
    if (this.renderer) {
      return this.renderer;
    }
    this.webgpuRequested = preferWebGPU;

    if (preferWebGPU) {
      const webgpuRenderer = await this.tryCreateWebGPURenderer(antialias);
      if (webgpuRenderer) {
        this.renderer = webgpuRenderer;
        this.rendererType = "webgpu";
      }
    }

    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias,
        powerPreference: "high-performance",
      });
      this.rendererType = "webgl";
    }

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.info.autoReset = true;

    return this.renderer;
  }

  async tryCreateWebGPURenderer(antialias = true) {
    if (!("gpu" in navigator)) return null;
    try {
      const timeoutMs = 1800;
      const timeout = new Promise((resolve) => {
        setTimeout(() => resolve(null), timeoutMs);
      });

      const setup = (async () => {
      const [{ default: WebGPU }, { default: WebGPURenderer }] = await Promise.all([
        import("three/addons/capabilities/WebGPU.js"),
        import("three/addons/renderers/webgpu/WebGPURenderer.js"),
      ]);
      if (!WebGPU?.isAvailable?.()) return null;

      const renderer = new WebGPURenderer({
        canvas: this.canvas,
        antialias,
        alpha: false,
      });
      await renderer.init();
      renderer.shadowMap.enabled = true;
      return renderer;
      })();

      const resolvedRenderer = await Promise.race([setup, timeout]);
      return resolvedRenderer || null;
    } catch (error) {
      return null;
    }
  }

  getRenderer() {
    return this.renderer;
  }

  setRenderer(renderer, type = "webgl") {
    this.renderer = renderer || null;
    this.rendererType = type || "webgl";
  }

  getRendererType() {
    return this.rendererType;
  }

  attach(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.rebuildPostPipeline();
  }

  setCamera(camera) {
    this.camera = camera;
    if (this.renderPass) this.renderPass.camera = camera;
    if (this.ssaoPass) this.ssaoPass.camera = camera;
  }

  applyQuality(settings) {
    if (!this.renderer || !settings) return;
    this.settings = settings;

    const devicePixelRatio = window.devicePixelRatio || 1;
    const maxPixelRatio = settings.maxPixelRatio ?? 1.5;
    const renderScale = settings.renderScale ?? 1;
    const targetPixelRatio = Math.min(devicePixelRatio, maxPixelRatio) * renderScale;
    this.renderer.setPixelRatio(Math.max(0.5, targetPixelRatio));
    this.renderer.toneMappingExposure = settings.toneExposure ?? 1.02;
    this.renderer.shadowMap.enabled = settings.shadowQuality !== "off";
    this.renderer.shadowMap.type =
      settings.shadowQuality === "ultra" ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;

    this.setPostProcessingEnabled(settings.post?.enabled === true);
    this.updatePostSettings(settings);
    this.resize(this.size.width, this.size.height);
  }

  setPostProcessingEnabled(enabled) {
    const canUseComposer = this.renderer?.isWebGLRenderer === true;
    this.postEnabled = enabled && canUseComposer;
    if (!canUseComposer) {
      this.postEnabled = false;
      return;
    }
    if (this.postEnabled && !this.composer) {
      this.rebuildPostPipeline();
    }
  }

  updatePostSettings(settings) {
    if (!settings) return;
    if (this.ssaoPass) {
      this.ssaoPass.enabled = settings.post?.enabled === true && settings.post?.ssao === true;
      this.ssaoPass.kernelRadius = 7;
      this.ssaoPass.minDistance = 0.0005;
      this.ssaoPass.maxDistance = 0.18;
    }
    if (this.bloomPass) {
      this.bloomPass.enabled = settings.post?.enabled === true && settings.post?.bloom === true;
      this.bloomPass.strength = settings.bloomStrength ?? 0.18;
      this.bloomPass.threshold = settings.bloomThreshold ?? 0.84;
      this.bloomPass.radius = 0.2;
    }
  }

  rebuildPostPipeline() {
    if (!this.renderer?.isWebGLRenderer || !this.scene || !this.camera) return;

    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.ssaoPass = new SSAOPass(this.scene, this.camera, this.size.width || 1, this.size.height || 1);
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(this.size.width || 1, this.size.height || 1), 0.18, 0.2, 0.84);
    this.outputPass = new OutputPass();

    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.ssaoPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.outputPass);
  }

  resize(width, height) {
    if (!this.renderer) return;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 2 || height < 2) return;

    this.size.width = width;
    this.size.height = height;
    this.renderer.setSize(width, height, false);

    if (this.composer) {
      this.composer.setSize(width, height);
    }
    if (this.ssaoPass) {
      this.ssaoPass.setSize(width, height);
    }
  }

  render(scene, camera) {
    if (!this.renderer || !scene || !camera) return;
    if (this.renderer.info?.reset) {
      this.renderer.info.reset();
    }

    if (this.postEnabled && this.composer) {
      this.composer.render();
      return;
    }
    this.renderer.render(scene, camera);
  }

  getFrameStats() {
    if (!this.renderer || !this.renderer.info) return null;
    const info = this.renderer.info;
    const renderInfo = info.render || {};
    const memoryInfo = info.memory || {};
    return {
      calls: renderInfo.calls || 0,
      triangles: renderInfo.triangles || 0,
      lines: renderInfo.lines || 0,
      points: renderInfo.points || 0,
      geometries: memoryInfo.geometries || 0,
      textures: memoryInfo.textures || 0,
    };
  }

  estimateTextureMemoryMB(scene) {
    if (!scene) return 0;
    const textures = new Set();
    scene.traverse((object) => {
      if (!object?.material) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        if (!material) return;
        Object.values(material).forEach((value) => {
          if (value?.isTexture) textures.add(value);
        });
      });
    });

    let totalBytes = 0;
    textures.forEach((texture) => {
      const width = texture.image?.width || 0;
      const height = texture.image?.height || 0;
      if (!width || !height) return;
      const mipFactor = 1.33;
      const rgbaBytes = 4;
      totalBytes += width * height * rgbaBytes * mipFactor;
    });
    return totalBytes / (1024 * 1024);
  }
}
