import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";

export class LightingManager {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.sky = null;
    this.skyUniforms = null;
    this.sun = null;
    this.ambient = null;
    this.hemi = null;
    this.pmremGenerator = null;
    this.environmentRT = null;
    this.lastEnvUpdate = 0;
    this.shadowCameraTarget = new THREE.Vector3();
  }

  initialize() {
    this.ensureSky();
    this.ensureFallbackLights();
    if (this.renderer?.isWebGLRenderer) {
      this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
      this.pmremGenerator.compileEquirectangularShader();
      this.refreshEnvironmentMap();
    }
  }

  ensureSky() {
    if (this.sky) return;
    this.sky = new Sky();
    this.sky.scale.setScalar(9000);
    this.sky.name = "ProceduralSky";
    this.scene.add(this.sky);
    this.skyUniforms = this.sky.material.uniforms;
    this.setSkyPreset();
  }

  setSkyPreset() {
    if (!this.skyUniforms) return;
    this.skyUniforms.turbidity.value = 3.8;
    this.skyUniforms.rayleigh.value = 2.2;
    this.skyUniforms.mieCoefficient.value = 0.0032;
    this.skyUniforms.mieDirectionalG.value = 0.78;

    const sunPosition = new THREE.Vector3();
    const phi = THREE.MathUtils.degToRad(64);
    const theta = THREE.MathUtils.degToRad(218);
    sunPosition.setFromSphericalCoords(1, phi, theta);
    this.skyUniforms.sunPosition.value.copy(sunPosition);
  }

  ensureFallbackLights() {
    if (!this.sun) {
      this.sun = new THREE.DirectionalLight(0xfff0d8, 1.34);
      this.sun.name = "Preview Sun";
      this.sun.position.set(42, 58, 34);
      this.sun.castShadow = true;
      this.sun.shadow.bias = -0.00014;
      this.sun.shadow.normalBias = 0.026;
      this.sun.shadow.mapSize.set(1536, 1536);
      this.sun.shadow.camera.near = 0.5;
      this.sun.shadow.camera.far = 140;
      this.sun.shadow.camera.left = -42;
      this.sun.shadow.camera.right = 42;
      this.sun.shadow.camera.top = 42;
      this.sun.shadow.camera.bottom = -42;
      this.scene.add(this.sun);
      this.scene.add(this.sun.target);
    }

    if (!this.hemi) {
      this.hemi = new THREE.HemisphereLight(0xdbe9ff, 0x625548, 0.42);
      this.hemi.name = "Preview Hemisphere";
      this.scene.add(this.hemi);
    }

    if (!this.ambient) {
      this.ambient = new THREE.AmbientLight(0xf4f7ff, 0.1);
      this.ambient.name = "Preview Ambient";
      this.scene.add(this.ambient);
    }
  }

  setFallbackVisible(visible) {
    if (this.sun) this.sun.visible = visible;
    if (this.hemi) this.hemi.visible = visible;
    if (this.ambient) this.ambient.visible = visible;
  }

  refreshEnvironmentMap() {
    if (!this.pmremGenerator || !this.sky) return;
    this.environmentRT?.dispose?.();
    this.environmentRT = this.pmremGenerator.fromScene(this.sky);
    this.scene.environment = this.environmentRT.texture;
  }

  applyQuality(settings) {
    if (!settings) return;
    const shadowMapSize = settings.shadowMapSize ?? 1024;
    const shadowDistance = settings.shadowDistance ?? 70;

    if (this.sun) {
      this.sun.castShadow = settings.shadowQuality !== "off";
      this.sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
      this.sun.shadow.camera.far = shadowDistance * 2.1;
      this.sun.shadow.camera.left = -shadowDistance;
      this.sun.shadow.camera.right = shadowDistance;
      this.sun.shadow.camera.top = shadowDistance;
      this.sun.shadow.camera.bottom = -shadowDistance;
      this.sun.shadow.camera.updateProjectionMatrix();
      this.sun.intensity = settings.id === "low" ? 1.18 : 1.34;
    }

    const authoredLightsBlend = this.sun?.visible === false;
    if (this.ambient) {
      this.ambient.intensity = authoredLightsBlend ? 0.08 : settings.id === "low" ? 0.08 : 0.1;
    }
    if (this.hemi) {
      this.hemi.intensity = authoredLightsBlend ? 0.22 : settings.id === "low" ? 0.34 : 0.42;
    }

    if (settings.fog) {
      const fogColor = 0xd0dbe3;
      const near = Math.max(40, settings.viewDistance * 0.58);
      const far = Math.max(near + 72, settings.viewDistance * 1.42);
      this.scene.fog = new THREE.Fog(fogColor, near, far);
    } else {
      this.scene.fog = null;
    }

    if (this.renderer?.capabilities?.getMaxAnisotropy) {
      const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
      this.textureAnisotropy = Math.min(maxAniso, settings.textureAnisotropy ?? 8);
    }
  }

  syncSunToCamera(camera, settings) {
    if (!camera || !this.sun || !settings) return;
    const shadowDistance = settings.shadowDistance ?? 70;
    this.shadowCameraTarget.copy(camera.position);
    this.sun.target.position.copy(this.shadowCameraTarget);
    this.sun.position.set(
      this.shadowCameraTarget.x + shadowDistance * 0.45,
      this.shadowCameraTarget.y + shadowDistance * 0.85,
      this.shadowCameraTarget.z + shadowDistance * 0.3
    );
    this.sun.target.updateMatrixWorld();
  }

  update(camera, settings) {
    if (!camera || !settings) return;
    this.syncSunToCamera(camera, settings);

    if (!this.pmremGenerator) return;
    const now = performance.now();
    if (now - this.lastEnvUpdate < 14000) return;
    this.lastEnvUpdate = now;
    this.refreshEnvironmentMap();
  }

  dispose() {
    this.environmentRT?.dispose?.();
    this.pmremGenerator?.dispose?.();
  }
}
