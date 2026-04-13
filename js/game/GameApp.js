import * as THREE from "three";
import { AssetManager } from "../assets/AssetManager.js?v=20260413a";
import { AnimatorSystem } from "../engine/AnimatorSystem.js";
import { SceneStore } from "../scene/SceneStore.js?v=20260413a";
import { ScriptRegistry } from "../scripts/ScriptRegistry.js";
import { ScriptSystem } from "../scripts/ScriptSystem.js";
import { Input } from "../core/Input.js";
import { sampleTerrainHeight } from "../engine/TerrainSystem.js?v=20260413a";

import { AutoRotate } from "../components/AutoRotate.js";
import { PlayerMovement } from "../components/PlayerMovement.js?v=20260411c";
import { PlayAnimation } from "../components/PlayAnimation.js";
import { FollowTarget } from "../components/FollowTarget.js";
import { FPSController } from "../components/FPSController.js?v=20260413c";
import { AnimalAI } from "../components/AnimalAI.js?v=20260413d";
import { RegionSpawner } from "../components/RegionSpawner.js?v=20260413a";

import { RenderManager } from "./managers/RenderManager.js?v=20260411c";
import { LightingManager } from "./managers/LightingManager.js?v=20260411c";
import { TerrainMaterialManager } from "./managers/TerrainMaterialManager.js?v=20260411c";
import { QualitySettingsManager } from "./managers/QualitySettingsManager.js?v=20260411c";
import { VegetationManager } from "./managers/VegetationManager.js?v=20260411c";
import { SceneOptimizationManager } from "./managers/SceneOptimizationManager.js?v=20260411c";
import { GraphicsSettingsPanel } from "./managers/GraphicsSettingsPanel.js?v=20260411c";
import { DebugPanelManager } from "./managers/DebugPanelManager.js?v=20260411c";
import { MiniMapManager } from "./managers/MiniMapManager.js?v=20260411d";
import { InventoryManager } from "./managers/InventoryManager.js?v=20260412a";
import { PlacementManager } from "./managers/PlacementManager.js?v=20260412b";
import { WildlifeCallManager } from "./managers/WildlifeCallManager.js?v=20260412a";
import { TreeStandInteractionManager } from "./managers/TreeStandInteractionManager.js?v=20260412b";

const tmpEnsureVisiblePos = new THREE.Vector3();

export class GameApp {
  constructor() {
    this.canvas = document.getElementById("game-canvas");
    this.sceneLabel = document.getElementById("scene-label");
    this.overlay = document.getElementById("game-overlay");
    this.menuRoot = document.getElementById("game-menu");
    this.menuStartStep = document.getElementById("menu-step-start");
    this.menuMapStep = document.getElementById("menu-step-map");
    this.btnMenuStart = document.getElementById("btn-menu-start");
    this.btnMenuBack = document.getElementById("btn-menu-back");
    this.mapButtonsContainer = document.getElementById("menu-map-regions");
    this.btnMapButtons = Array.from(this.mapButtonsContainer?.querySelectorAll(".menu-map-btn") || []);
    this.menuStatus = document.getElementById("menu-map-status");
    this.loadingRoot = document.getElementById("game-loading");
    this.loadingLabel = document.getElementById("game-loading-label");
    this.bootConfig = this.readBootConfig();
    this.queryParams = new URLSearchParams(window.location.search);
    this.queryScene = this.getBootString("scene");
    const requestedMenuStep = this.getBootString("menu").toLowerCase();
    this.forceMenuStep = requestedMenuStep === "map" || requestedMenuStep === "start" ? requestedMenuStep : "";
    const requestedView = this.getBootString("view").toLowerCase();
    if (requestedView === "editor" || requestedView === "game") {
      this.previewView = requestedView;
    } else {
      this.previewView = "game";
    }
    this.editorLikeView = this.previewView === "editor";
    const requestedVisual = this.getBootString("visual").toLowerCase();
    if (requestedVisual === "editor" || requestedVisual === "game") {
      this.visualMode = requestedVisual;
    } else {
      // Old links keep gameplay, but with editor-like visuals by default.
      this.visualMode = this.queryScene ? "editor" : "game";
    }
    this.editorVisualMode = this.visualMode === "editor";
    this.editorCameraPosition = this.parseBootVector("camPos");
    this.editorCameraTarget = this.parseBootVector("camTarget");

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x93abc0);

    this.assetManager = new AssetManager();
    this.animator = new AnimatorSystem();
    this.sceneStore = new SceneStore(this.scene, this.assetManager, this.animator);
    this.sceneStore.setLightHelpersVisible(false);

    this.registry = new ScriptRegistry();
    this.registry.register(AutoRotate);
    this.registry.register(PlayerMovement);
    this.registry.register(PlayAnimation);
    this.registry.register(FollowTarget);
    this.registry.register(FPSController);
    this.registry.register(AnimalAI);
    this.registry.register(RegionSpawner);

    this.input = new Input();
    this.uiState = {
      isInventoryOpen: false,
      interactionConsumesReload: false,
      interactionConsumesFire: false,
      playerMovementLocked: false,
    };
    this.scriptSystem = new ScriptSystem(this.registry, {
      input: this.input,
      sceneStore: this.sceneStore,
      animator: this.animator,
      assetManager: this.assetManager,
      mode: this.editorLikeView ? "editor" : "game",
      domElement: this.canvas,
      uiState: this.uiState,
      getAudioListener: () => this.audioListener,
    });
    this.sceneStore.setScriptSystem(this.scriptSystem);

    this.fallbackCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
    this.fallbackCamera.position.set(0, 2, 5);
    this.activeCamera = this.fallbackCamera;
    this.audioListener = new THREE.AudioListener();
    this.audioUnlockTargets = [this.canvas, window];
    this.onUserGestureResumeAudio = () => this.resumeAudioContext();
    this.activeCamera.add(this.audioListener);
    this.gameCameraId = null;
    this.playerEntity = null;
    this.sceneLoadPromise = null;
    this.sceneLoadName = "";
    this.loadingHideTimer = null;

    this.renderManager = new RenderManager(this.canvas);
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderManager.setRenderer(this.renderer, "webgl");
    this.renderManager.attach(this.scene, this.activeCamera);

    this.loopStarted = false;
    this.lightingManager = null;
    this.terrainMaterialManager = new TerrainMaterialManager(this.sceneStore);
    this.vegetationManager = new VegetationManager(this.sceneStore, this.assetManager);
    this.sceneOptimizationManager = new SceneOptimizationManager(this.sceneStore, this.scene);
    this.qualitySettings = new QualitySettingsManager();
    this.qualitySettings.initialize();

    this.debugPanel = new DebugPanelManager();
    try {
      this.miniMap = new MiniMapManager(this.sceneStore);
    } catch (error) {
      this.miniMap = {
        setVisible: () => {},
        setScene: () => {},
        update: () => {},
      };
    }
    this.inventoryManager = new InventoryManager({
      sceneStore: this.sceneStore,
      scriptSystem: this.scriptSystem,
      input: this.input,
      uiState: this.uiState,
    });
    this.inventoryManager.initialize();
    this.inventoryManager.setEnabled(false);
    this.placementManager = new PlacementManager({
      scene: this.scene,
      sceneStore: this.sceneStore,
      assetManager: this.assetManager,
      inventoryManager: this.inventoryManager,
      domElement: this.canvas,
      uiState: this.uiState,
      statusTarget: {
        setStatus: (message, duration) => {
          const controller = this.findFPSControllerInstance();
          controller?.setStatus?.(message, duration);
        },
      },
      onPlaced: async () => {
        await this.persistRuntimeScene();
      },
    });
    this.placementManager.initialize();
    this.placementManager.setEnabled(false);
    this.wildlifeCallManager = new WildlifeCallManager({
      sceneStore: this.sceneStore,
      scriptSystem: this.scriptSystem,
      inventoryManager: this.inventoryManager,
      domElement: this.canvas,
      uiState: this.uiState,
      getOrigin: () => {
        const controller = this.findFPSControllerInstance();
        if (controller?.entity?.three) {
          return controller.entity.three.getWorldPosition(new THREE.Vector3());
        }
        if (this.activeCamera) {
          return this.activeCamera.getWorldPosition(new THREE.Vector3());
        }
        return new THREE.Vector3();
      },
      statusTarget: {
        setStatus: (message, duration) => {
          const controller = this.findFPSControllerInstance();
          controller?.setStatus?.(message, duration);
        },
      },
    });
    this.wildlifeCallManager.initialize();
    this.wildlifeCallManager.setEnabled(false);
    this.treeStandInteractionManager = new TreeStandInteractionManager({
      sceneStore: this.sceneStore,
      input: this.input,
      uiState: this.uiState,
      inventoryManager: this.inventoryManager,
      placementManager: this.placementManager,
      getPlayerEntity: () => this.findFPSPlayerEntity(),
      getPlayerController: () => this.findFPSControllerInstance(),
      statusTarget: {
        setStatus: (message, duration) => {
          const controller = this.findFPSControllerInstance();
          controller?.setStatus?.(message, duration);
        },
      },
      promptElement: document.getElementById("interaction-prompt"),
      onRemoved: async () => {
        await this.persistRuntimeScene();
      },
    });
    this.treeStandInteractionManager.setEnabled(false);
    this.graphicsPanel = new GraphicsSettingsPanel(this.qualitySettings, {
      onChanged: () => this.applyQualitySettings(),
      onDebugToggle: (enabled) => this.setDebugVisible(enabled),
    });
    this.debugEnabled = true;

    this.lastTime = performance.now();
    this.smoothedFps = 60;
    this.lastDebugUpdate = 0;
    this.lastRuntimeErrorAt = 0;
    this.runtimeFlags = {
      scripts: true,
      optimization: true,
      vegetation: true,
      lighting: true,
      advancedRender: true,
    };
    if (this.editorLikeView) {
      this.runtimeFlags.scripts = false;
      this.runtimeFlags.optimization = false;
      this.runtimeFlags.vegetation = false;
      this.runtimeFlags.lighting = false;
    }
    this.availableScenes = [];
    this.mainSceneName = this.getBootString("mainSceneName") || "hunter";
    this.mapRegions = [
      { id: "layton-valley", label: "Vale de Layton", left: 23.5, top: 58.5, slot: "map1" },
      { id: "north-lakes", label: "Lagos do Norte", left: 67.2, top: 30.5 },
      { id: "central-passage", label: "Passagem Central", left: 39.0, top: 43.0 },
      { id: "south-ridge", label: "Arete Sud", left: 70.5, top: 68.0, slot: "map2" },
    ];
    this.sceneSlots = {
      map1: {
        label: "map1",
        aliases: ["map1"],
        minimapLabel: "Map1",
      },
      map2: {
        label: "map2",
        aliases: ["map2", "mapa_2"],
        minimapLabel: "Map2",
      },
    };
    this.updateMapButtons();

    document.getElementById("btn-back").addEventListener("click", () => {
      window.location.href = "index.php";
    });
    window.addEventListener("resize", () => this.resize());

    this.bindMenuEvents();
    this.bindAudioUnlock();
    this.cleanRuntimeUrlIfNeeded();
    this.startLoop();
    this.bootstrap();
  }

  readBootConfig() {
    const config = window.__GAME_BOOT_CONFIG__;
    return config && typeof config === "object" ? config : {};
  }

  getBootValue(key) {
    if (Object.prototype.hasOwnProperty.call(this.bootConfig, key)) {
      return this.bootConfig[key];
    }
    return this.queryParams.get(key);
  }

  getBootString(key) {
    return String(this.getBootValue(key) || "").trim();
  }

  parseBootVector(key) {
    const value = this.getBootValue(key);
    if (Array.isArray(value)) {
      const vector = value.slice(0, 3).map((entry) => Number(entry));
      if (vector.length === 3 && vector.every((entry) => Number.isFinite(entry))) {
        return new THREE.Vector3(vector[0], vector[1], vector[2]);
      }
      return null;
    }
    return this.parseVectorQuery(value);
  }

  cleanRuntimeUrlIfNeeded() {
    if (this.bootConfig.cleanUrl !== true) return;
    if (!window.history?.replaceState) return;
    const cleanUrl = `${window.location.pathname}${window.location.hash || ""}`;
    window.history.replaceState(window.history.state, document.title, cleanUrl);
  }

  startLoop() {
    if (this.loopStarted) return;
    this.loopStarted = true;
    this.animate();
  }

  bindAudioUnlock() {
    this.audioUnlockTargets.forEach((target) => {
      target?.addEventListener?.("pointerdown", this.onUserGestureResumeAudio, { passive: true });
      target?.addEventListener?.("keydown", this.onUserGestureResumeAudio);
    });
  }

  async resumeAudioContext() {
    const context = this.audioListener?.context;
    if (!context || context.state === "running") return true;
    try {
      await context.resume();
      return true;
    } catch (error) {
      return false;
    }
  }

  attachAudioListenerToCamera(camera) {
    if (!this.audioListener || !camera || this.audioListener.parent === camera) return;
    camera.add(this.audioListener);
  }

  async bootstrap() {
    const menuPromise = this.prepareMenu();
    try {
      await this.initializeRenderStack();
    } catch (error) {
      console.error("[GamePreview] Falha no pipeline avancado:", error);
      this.initializeEmergencyRenderStack();
      this.graphicsPanel?.setStatus("Fallback de render ativado.");
    }
    this.resize();
    this.startLoop();
    await menuPromise;
  }

  async initializeRenderStack() {
    // Keep startup stable with immediate WebGL; advanced renderer remains optional.
    await this.renderManager.initialize({
      preferWebGPU: false,
      antialias: true,
    });

    this.renderer = this.renderManager.getRenderer() || this.renderer;
    this.assetManager.setRenderer(this.renderer);
    this.renderManager.attach(this.scene, this.activeCamera);

    this.lightingManager = new LightingManager(this.scene, this.renderer);
    this.lightingManager.initialize();

    this.graphicsPanel.initialize();
    const debugToggle = document.getElementById("gfx-debug-enabled");
    this.setDebugVisible(debugToggle ? debugToggle.checked : this.debugEnabled);

    this.qualitySettings.onChange(() => {
      this.applyQualitySettings();
      this.graphicsPanel.refreshFromState();
    });
    this.qualitySettings.onStatus((message) => {
      this.graphicsPanel.setStatus(message);
    });

    this.graphicsPanel.refreshFromState();
    this.applyQualitySettings();
  }

  initializeEmergencyRenderStack() {
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: false,
        powerPreference: "high-performance",
      });
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.0;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
      this.renderManager.setRenderer(this.renderer, "webgl");
      this.assetManager.setRenderer(this.renderer);
      this.renderManager.attach(this.scene, this.activeCamera);
    }

    if (!this.lightingManager) {
      this.lightingManager = new LightingManager(this.scene, this.renderer);
      this.lightingManager.initialize();
    }

    try {
      this.graphicsPanel.initialize();
    } catch (error) {
      // no-op
    }
    this.setDebugVisible(true);
  }

  disableRuntimeFlag(flag, error) {
    if (!flag || this.runtimeFlags[flag] === false) return;
    this.runtimeFlags[flag] = false;
    console.error(`[GamePreview] Subsystem disabled: ${flag}`, error);
    if (this.graphicsPanel) {
      this.graphicsPanel.setStatus(`Modo seguro: ${flag} desativado.`);
    }
  }

  ensureRendererReady() {
    if (this.renderer) return;
    this.initializeEmergencyRenderStack();
  }

  bindMenuEvents() {
    if (this.btnMenuStart) {
      this.btnMenuStart.addEventListener("click", async () => {
        await this.onStartGame();
      });
    }

    if (this.btnMenuBack) {
      this.btnMenuBack.addEventListener("click", () => this.showMenuStep("start"));
    }

    this.mapButtonsContainer?.addEventListener("click", async (event) => {
      const button = event.target?.closest?.(".menu-map-btn");
      if (!button || button.disabled) return;
      try {
        const slot = String(button.dataset.mapSlot || "").trim();
        const hintedSceneName = String(button.dataset.sceneName || "").trim();
        await this.onSelectMap(slot, hintedSceneName);
      } catch (error) {
        this.setMenuStatus("Falha ao selecionar mapa.", "error");
      }
    });
  }

  resolveMainSceneName() {
    const main = String(this.mainSceneName || "").trim().toLowerCase();
    if (!main) return "";
    return this.availableScenes.find((sceneName) => String(sceneName || "").trim().toLowerCase() === main) || "";
  }

  async onStartGame() {
    this.setMenuBusy(true);
    this.availableScenes = await this.fetchScenes();
    this.updateMapButtons();
    const mainScene = this.resolveMainSceneName();

    if (!mainScene) {
      this.setMenuBusy(false);
      this.showMenuStep("map");
      this.setMenuStatus(`Cena principal "${this.mainSceneName}" nao encontrada. Escolha uma cena disponivel.`, "warn");
      return;
    }

    this.setMenuStatus(`Carregando ${mainScene}...`, "");
    const loaded = await this.loadScene(mainScene);
    this.setMenuBusy(false);
    if (loaded) {
      this.hideMenu();
      return;
    }

    this.showMenuStep("map");
    this.setMenuStatus(`Falha ao carregar ${mainScene}. Escolha uma cena disponivel.`, "error");
  }

  async prepareMenu() {
    const forceMapMenu = this.forceMenuStep === "map";
    const forceStartMenu = this.forceMenuStep === "start";
    if (!forceMapMenu && !forceStartMenu && this.editorLikeView && this.queryScene) {
      this.hideMenu();
      const loaded = await this.loadScene(this.queryScene);
      if (loaded) return;
      this.setMenuStatus(`Falha ao abrir ${this.queryScene}. Escolha uma cena disponivel.`, "error");
      this.showMenuStep("map");
      return;
    }

    this.availableScenes = await this.fetchScenes();
    this.updateMapButtons();
    const mainScene = this.resolveMainSceneName();
    const hasPlayableMap = this.availableScenes.length > 0;
    if (forceMapMenu) {
      this.showMenuStep("map");
      if (!hasPlayableMap) {
        this.setMenuStatus("Nenhuma cena disponivel. Crie e salve uma cena no editor.", "warn");
      } else {
        this.setMenuStatus("Escolha uma cena para iniciar.", "");
      }
      return;
    }

    if (forceStartMenu) {
      this.showMenuStep("start");
      if (!hasPlayableMap) {
        this.setMenuStatus("Nenhuma cena disponivel. Crie e salve uma cena no editor.", "warn");
      } else if (mainScene) {
        this.setMenuStatus(`Cena principal: ${mainScene}. Clique em Iniciar Game.`, "");
      } else {
        this.setMenuStatus(`Defina a cena "${this.mainSceneName}" para iniciar direto ou escolha um mapa.`, "warn");
      }
      return;
    }

    this.showMenuStep("start");

    if (!hasPlayableMap) {
      this.setMenuStatus("Nenhuma cena disponivel. Crie e salve uma cena no editor.", "warn");
      this.showMenuStep("map");
      return;
    }

    if (this.queryScene) {
      const fromQuery = this.availableScenes.includes(this.queryScene);
      if (fromQuery) {
        this.setMenuStatus(`Cena atual detectada: ${this.queryScene}. Carregando...`, "");
        const loaded = await this.loadScene(this.queryScene);
        if (loaded) {
          this.hideMenu();
          return;
        }
        this.setMenuStatus(`Falha ao abrir ${this.queryScene}. Escolha outra cena.`, "error");
      } else {
        this.setMenuStatus(`Cena ${this.queryScene} nao encontrada. Escolha uma cena disponivel.`, "warn");
      }
    } else {
      if (mainScene) {
        this.setMenuStatus(`Cena principal: ${mainScene}. Clique em Iniciar Game.`, "");
      } else {
        this.setMenuStatus(`Defina a cena "${this.mainSceneName}" para iniciar direto ou escolha um mapa.`, "warn");
      }
    }
  }

  resolveSceneForSlot(slot) {
    const config = this.sceneSlots[slot];
    if (!config) return null;
    return config.aliases.find((name) => this.availableScenes.includes(name)) || null;
  }

  resolveSlotKeyForScene(sceneName) {
    const normalized = String(sceneName || "").trim().toLowerCase();
    if (!normalized) return "";

    for (const [slotKey, config] of Object.entries(this.sceneSlots)) {
      const aliases = [slotKey, ...(config.aliases || [])].map((value) => String(value).trim().toLowerCase());
      if (aliases.includes(normalized)) {
        return slotKey;
      }
    }

    return "";
  }

  getSlotConfigForScene(sceneName) {
    const slotKey = this.resolveSlotKeyForScene(sceneName);
    if (!slotKey) return {};
    return this.sceneSlots[slotKey] || {};
  }

  getRegionSceneAssignments() {
    const assignments = new Map();
    const claimedScenes = new Set();
    const mainScene = this.resolveMainSceneName();
    const mainSceneNormalized = String(mainScene || "").trim().toLowerCase();

    this.mapRegions.forEach((region) => {
      if (!region.slot) return;
      const resolvedScene = this.resolveSceneForSlot(region.slot);
      const normalized = String(resolvedScene || "").trim().toLowerCase();
      if (!normalized) return;
      if (normalized === mainSceneNormalized) return;
      if (claimedScenes.has(normalized)) return;
      assignments.set(region.id, resolvedScene);
      claimedScenes.add(normalized);
    });

    const remainingScenes = this.availableScenes.filter((sceneName) => {
      const normalized = String(sceneName || "").trim().toLowerCase();
      if (!normalized) return false;
      if (normalized === mainSceneNormalized) return false;
      return !claimedScenes.has(normalized);
    });

    this.mapRegions.forEach((region) => {
      if (assignments.has(region.id)) return;
      const sceneName = remainingScenes.shift();
      if (!sceneName) return;
      assignments.set(region.id, sceneName);
      claimedScenes.add(String(sceneName).trim().toLowerCase());
    });

    return assignments;
  }

  updateMapButtons() {
    if (!this.mapButtonsContainer) return;
    this.mapButtonsContainer.innerHTML = "";

    const assignments = this.getRegionSceneAssignments();
    this.mapRegions.forEach((region) => {
      const sceneName = assignments.get(region.id) || "";
      const button = document.createElement("button");
      const slot = region.slot || "scene";
      button.type = "button";
      button.className = "menu-map-btn menu-map-region";
      if (!sceneName) {
        button.classList.add("is-empty");
      }
      button.dataset.mapSlot = slot;
      button.dataset.sceneName = sceneName;
      button.style.left = `${region.left}%`;
      button.style.top = `${region.top}%`;
      button.disabled = !sceneName;
      button.setAttribute(
        "aria-label",
        sceneName ? `${region.label}: ${sceneName}` : `${region.label}: indisponivel`
      );
      button.title = sceneName ? `${region.label} - ${sceneName}` : `${region.label} - indisponivel`;

      const label = document.createElement("span");
      label.className = "menu-map-label";
      label.textContent = region.label;
      const scene = document.createElement("span");
      scene.className = "menu-map-scene";
      scene.textContent = sceneName || "Indisponivel";
      label.appendChild(scene);
      button.appendChild(label);
      this.mapButtonsContainer.appendChild(button);
    });

    this.btnMapButtons = Array.from(this.mapButtonsContainer.querySelectorAll(".menu-map-btn"));
  }

  showMenuStep(step = "start") {
    if (!this.menuRoot) return;
    this.menuRoot.classList.remove("hidden");
    this.menuStartStep?.classList.toggle("active", step === "start");
    this.menuMapStep?.classList.toggle("active", step === "map");
    this.inventoryManager?.setEnabled(false);
    this.placementManager?.setEnabled(false);
    this.wildlifeCallManager?.setEnabled(false);
    this.treeStandInteractionManager?.setEnabled(false);
  }

  hideMenu() {
    this.menuRoot?.classList.add("hidden");
    if (!this.editorLikeView) {
      this.inventoryManager?.setEnabled(true);
      this.placementManager?.setEnabled(true);
      this.wildlifeCallManager?.setEnabled(true);
      this.treeStandInteractionManager?.setEnabled(true);
    }
  }

  setMenuStatus(message = "", tone = "") {
    if (!this.menuStatus) return;
    this.menuStatus.textContent = message;
    this.menuStatus.classList.remove("error", "warn");
    if (tone === "error") this.menuStatus.classList.add("error");
    if (tone === "warn") this.menuStatus.classList.add("warn");
  }

  setLoadingState(message = "", visible = false) {
    if (this.loadingHideTimer) {
      window.clearTimeout(this.loadingHideTimer);
      this.loadingHideTimer = null;
    }
    if (this.loadingLabel && message) {
      this.loadingLabel.textContent = message;
    }
    if (this.loadingRoot) {
      this.loadingRoot.classList.toggle("hidden", !visible);
    }
  }

  hideLoading(delayMs = 0) {
    if (!this.loadingRoot) return;
    if (this.loadingHideTimer) {
      window.clearTimeout(this.loadingHideTimer);
      this.loadingHideTimer = null;
    }
    if (delayMs > 0) {
      this.loadingHideTimer = window.setTimeout(() => {
        this.loadingRoot?.classList.add("hidden");
        this.loadingHideTimer = null;
      }, delayMs);
      return;
    }
    this.loadingRoot.classList.add("hidden");
  }

  waitForNextFrame() {
    return new Promise((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
  }

  async stabilizeLoadedScene() {
    this.playerEntity?.three?.updateMatrixWorld?.(true);
    this.getGameCameraEntity()?.three?.updateMatrixWorld?.(true);
    this.activeCamera?.updateMatrixWorld?.(true);
    this.scene.updateMatrixWorld(true);
    await this.waitForNextFrame();
    this.scene.updateMatrixWorld(true);
    await this.waitForNextFrame();
    await new Promise((resolve) => window.setTimeout(resolve, 140));
  }

  setMenuBusy(busy) {
    this.btnMenuStart && (this.btnMenuStart.disabled = busy);
    this.btnMenuBack && (this.btnMenuBack.disabled = busy);
    const mapButtons = this.mapButtonsContainer
      ? Array.from(this.mapButtonsContainer.querySelectorAll(".menu-map-btn"))
      : this.btnMapButtons;
    mapButtons.forEach((button) => {
      if (button.dataset.sceneName) {
        button.disabled = busy;
      } else {
        button.disabled = true;
      }
    });
  }

  async onSelectMap(slot, hintedSceneName = "") {
    const slotConfig = this.sceneSlots[slot] || null;
    let sceneName = String(hintedSceneName || "").trim() || this.resolveSceneForSlot(slot);
    if (!sceneName) {
      this.availableScenes = await this.fetchScenes();
      this.updateMapButtons();
      sceneName = this.resolveSceneForSlot(slot) || "";
    }
    if (!sceneName && this.availableScenes.includes(slot)) {
      sceneName = slot;
    }

    if (!sceneName) {
      this.setMenuStatus(`Cena ${slot || hintedSceneName || ""} nao encontrada.`, "error");
      return;
    }

    const candidates = [];
    const pushCandidate = (value) => {
      const normalized = String(value || "").trim();
      if (!normalized) return;
      if (candidates.includes(normalized)) return;
      candidates.push(normalized);
    };

    pushCandidate(sceneName);
    if (slotConfig) {
      pushCandidate(slot);
    } else if (this.availableScenes.includes(slot)) {
      pushCandidate(slot);
    }
    if (slotConfig?.aliases?.length) {
      slotConfig.aliases.forEach((alias) => pushCandidate(alias));
    }

    this.setMenuBusy(true);
    for (const candidate of candidates) {
      this.setMenuStatus(`Carregando ${candidate}...`, "");
      const loaded = await this.loadScene(candidate);
      if (loaded) {
        this.setMenuBusy(false);
        this.hideMenu();
        return;
      }
    }
    this.setMenuBusy(false);
    this.setMenuStatus(`Falha ao carregar ${sceneName}.`, "error");
  }

  async fetchScenes() {
    try {
      const res = await fetch(`api/list_scenes.php?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return [];
      const data = await res.json();
      return data.scenes || [];
    } catch (error) {
      return [];
    }
  }

  async fetchSceneData(name) {
    const sceneName = String(name || "").trim();
    if (!sceneName) return null;
    const encoded = encodeURIComponent(sceneName);
    const requests = [
      `api/load_scene.php?name=${encoded}&t=${Date.now()}`,
      `data/scenes/${sceneName}.json?t=${Date.now()}`,
    ];

    for (const url of requests) {
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) continue;
        const data = await response.json();
        if (!data || typeof data !== "object") continue;
        if (!Array.isArray(data.objects)) continue;
        return data;
      } catch (error) {
        // try next source
      }
    }

    return null;
  }

  async loadScene(name) {
    const sceneName = String(name || "").trim();
    if (!sceneName) return false;

    if (
      this.sceneStore.currentSceneName === sceneName &&
      this.sceneStore.listEntities().length > 0
    ) {
      this.setMenuStatus(`Mapa ${sceneName} pronto.`, "");
      this.graphicsPanel.setStatus(`Mapa ${sceneName} pronto.`);
      return true;
    }

    if (this.sceneLoadPromise && this.sceneLoadName === sceneName) {
      return this.sceneLoadPromise;
    }

    this.sceneLoadName = sceneName;
    const task = (async () => {
      let loaded = false;

      try {
        this.setMenuStatus(`Carregando ${sceneName}...`, "");
        this.setLoadingState(`Carregando ${sceneName}...`, true);

        const data = await this.fetchSceneData(sceneName);
        if (!data) {
          this.setMenuStatus(`Falha ao carregar ${sceneName}.`, "error");
          return false;
        }

        this.setLoadingState(`Montando ${sceneName}...`, true);
        const cameraHint = this.activeCamera?.position?.toArray?.() || [0, 2, 5];
        await this.sceneStore.loadFromData(data, {
          lazyModelLoading: false,
          cameraPosition: cameraHint,
          lazyDistance: 82,
        });

        this.sceneStore.currentSceneName = sceneName;
        this.gameCameraId = data.gameCameraId || null;
        this.playerEntity = this.findFPSPlayerEntity();
        this.inventoryManager?.setScene(sceneName);
        this.placementManager?.setEnabled(false);
        this.wildlifeCallManager?.setEnabled(false);
        this.treeStandInteractionManager?.setEnabled(false);
        this.sceneLabel.textContent = sceneName ? `(${sceneName})` : "";
        try {
          this.miniMap.setScene(sceneName, this.getSlotConfigForScene(sceneName));
        } catch (error) {
          console.warn("[GamePreview] MiniMap setScene falhou:", error);
        }

        if (!this.editorLikeView) {
          this.prepareCameras();
          if (!this.editorVisualMode) {
            this.placePlayerInsideForest();
          }
        }
        this.syncFallbackLights();

        if (this.editorLikeView) {
          this.applyEditorCamera();
          this.activeCamera = this.fallbackCamera;
        } else {
          this.activeCamera = this.getGameCamera() || this.fallbackCamera;
        }
        this.attachAudioListenerToCamera(this.activeCamera);
        this.renderManager.setCamera(this.activeCamera);
        this.overlay.classList.toggle("hidden", this.editorLikeView ? true : !!this.getGameCamera());

        if (!this.editorLikeView && !this.editorVisualMode) {
          this.setLoadingState(`Finalizando ${sceneName}...`, true);
          this.terrainMaterialManager.upgradeAllTerrains();
          await this.vegetationManager.rebuild();
          this.sceneOptimizationManager.rebuild();
        } else {
          this.applyEditorSky();
          this.scene.fog = null;
        }
        this.applyQualitySettings();
        await this.stabilizeLoadedScene();
        this.graphicsPanel.setStatus(`Mapa ${sceneName} carregado.`);
        this.setMenuStatus(`Mapa ${sceneName} pronto.`, "");
        this.setLoadingState(`Mapa ${sceneName} pronto.`, true);
        loaded = true;
        return true;
      } catch (error) {
        console.error(`[GamePreview] Falha ao carregar cena "${sceneName}"`, error);
        this.setMenuStatus(`Falha ao carregar ${sceneName}.`, "error");
        return false;
      } finally {
        if (this.sceneLoadPromise === task) {
          this.sceneLoadPromise = null;
          this.sceneLoadName = "";
        }
        this.hideLoading(loaded ? 420 : 0);
      }
    })();

    this.sceneLoadPromise = task;
    return task;
  }

  async persistRuntimeScene() {
    const sceneName = String(this.sceneStore.currentSceneName || "").trim();
    if (!sceneName) return false;

    try {
      const payload = this.sceneStore.serialize();
      const response = await fetch("api/save_scene.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: sceneName,
          scene: payload,
        }),
      });
      return response.ok;
    } catch (error) {
      console.warn("[GamePreview] Falha ao persistir cena runtime:", error);
      return false;
    }
  }

  applyQualitySettings() {
    if (!this.renderer) return;
    const settings = this.qualitySettings.getCurrent();

    if (this.editorLikeView || this.editorVisualMode) {
      const editorSettings = {
        ...settings,
        fog: false,
        post: {
          ...(settings.post || {}),
          enabled: false,
          ssao: false,
          bloom: false,
        },
      };
      this.renderManager.applyQuality(editorSettings);
      this.applyTextureAnisotropy(settings.textureAnisotropy ?? 8);
      this.updateCameraFarPlanes(settings.viewDistance ?? 220);
      this.scene.fog = null;
      return;
    }

    this.renderManager.applyQuality(settings);
    this.lightingManager?.applyQuality(settings);
    this.terrainMaterialManager.applyQuality(settings, this.renderer);
    this.sceneOptimizationManager.applyQuality(settings);
    this.applyTextureAnisotropy(settings.textureAnisotropy ?? 8);
    this.updateCameraFarPlanes(settings.viewDistance ?? 220);
  }

  applyTextureAnisotropy(value) {
    if (!this.renderer?.capabilities?.getMaxAnisotropy) return;
    const max = this.renderer.capabilities.getMaxAnisotropy();
    const anisotropy = Math.max(1, Math.min(max, value || 8));

    this.scene.traverse((object) => {
      if (!object?.material) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        if (!material) return;
        Object.values(material).forEach((entry) => {
          if (entry?.isTexture) {
            entry.anisotropy = anisotropy;
            entry.needsUpdate = true;
          }
        });
      });
    });
  }

  updateCameraFarPlanes(viewDistance) {
    const far = Math.max(130, viewDistance * 1.2);
    const cameras = [this.fallbackCamera];
    const gameCamera = this.getGameCamera();
    if (gameCamera) cameras.push(gameCamera);

    cameras.forEach((camera) => {
      if (!camera || Math.abs((camera.far || 0) - far) < 0.01) return;
      camera.far = far;
      camera.updateProjectionMatrix();
    });
  }

  hasActiveLights() {
    return this.sceneStore.listEntities().some((entity) => {
      if (entity.type !== "light") return false;
      if (entity.active === false) return false;
      return entity.light?.data?.enabled !== false;
    });
  }

  hasAuthoredDaylightRig() {
    let hasDirectional = false;
    let hasSkylight = false;

    this.sceneStore.listEntities().forEach((entity) => {
      if (entity.type !== "light" || entity.active === false) return;
      if (entity.light?.data?.enabled === false) return;
      const kind = entity.light?.kind || entity.light?.data?.kind || "";
      if (kind === "directional") hasDirectional = true;
      if (kind === "hemisphere" || kind === "ambient") hasSkylight = true;
    });

    return hasDirectional && hasSkylight;
  }

  syncFallbackLights() {
    const hasLights = this.hasActiveLights();
    const hasDaylightRig = this.hasAuthoredDaylightRig();
    if (!this.lightingManager) return;

    if (this.editorLikeView || this.editorVisualMode) {
      this.lightingManager.setFallbackVisible(false);
      if (this.lightingManager.sky) {
        this.lightingManager.sky.visible = false;
      }
      return;
    }

    if (this.lightingManager.sky) {
      this.lightingManager.sky.visible = true;
    }

    if (!hasLights) {
      this.lightingManager.setFallbackVisible(true);
      return;
    }

    if (hasDaylightRig) {
      this.lightingManager.setFallbackVisible(false);
      return;
    }

    // Keep only a very soft fill when the scene has partial authored lighting.
    this.lightingManager.setFallbackVisible(true);
    if (this.lightingManager.sun) this.lightingManager.sun.visible = false;
    if (this.lightingManager.hemi) this.lightingManager.hemi.intensity = 0.18;
    if (this.lightingManager.ambient) this.lightingManager.ambient.intensity = 0.04;
  }

  prepareCameras() {
    this.sceneStore.listEntities().forEach((entity) => {
      if (entity.type !== "camera") return;
      if (entity.three.userData.cameraHelper) {
        entity.three.userData.cameraHelper.visible = false;
      }
      entity.three.traverse((child) => {
        if (child.type === "CameraHelper") child.visible = false;
        if (child.isMesh && child.userData?.keepVisibleInGame !== true) {
          child.visible = false;
        }
      });
    });
  }

  getForestTerrainEntity() {
    const terrains = this.sceneStore.listEntities().filter((entity) => entity.type === "terrain");
    if (!terrains.length) return null;
    return terrains.reduce((best, current) => {
      const currentCount = current.terrain?.trees?.length || 0;
      const bestCount = best?.terrain?.trees?.length || 0;
      return currentCount > bestCount ? current : best;
    }, null);
  }

  getTerrainTrees(terrainEntity) {
    if (!terrainEntity?.terrain?.trees) return [];
    return terrainEntity.terrain.trees.filter((tree) => Number.isFinite(Number(tree?.x)) && Number.isFinite(Number(tree?.z)));
  }

  findForestSpawnPoint(terrainEntity) {
    const trees = this.getTerrainTrees(terrainEntity);
    if (trees.length < 20) return null;

    let centerX = 0;
    let centerZ = 0;
    trees.forEach((tree) => {
      centerX += Number(tree.x);
      centerZ += Number(tree.z);
    });
    centerX /= trees.length;
    centerZ /= trees.length;

    let best = null;
    const radii = [0, 1.4, 2.8, 4.2, 5.6];
    const angleStep = Math.PI / 12;

    for (const radius of radii) {
      for (let angle = 0; angle < Math.PI * 2; angle += angleStep) {
        const x = centerX + Math.cos(angle) * radius;
        const z = centerZ + Math.sin(angle) * radius;

        let nearestSq = Number.POSITIVE_INFINITY;
        let nearby = 0;

        trees.forEach((tree) => {
          const dx = Number(tree.x) - x;
          const dz = Number(tree.z) - z;
          const distSq = dx * dx + dz * dz;
          if (distSq < nearestSq) nearestSq = distSq;
          if (distSq <= 72.25) nearby += 1;
        });

        const nearest = Math.sqrt(nearestSq);
        if (nearest < 1.2) continue;

        const score = nearby * 1.2 - Math.abs(nearest - 2.4) * 2.8;
        if (!best || score > best.score) {
          best = { x, z, score };
        }
      }
    }

    if (!best) {
      best = { x: centerX, z: centerZ, score: 0 };
    }

    const fallbackY = trees[0]?.y ?? 0;
    const localY = Number.isFinite(fallbackY)
      ? Number(fallbackY)
      : sampleTerrainHeight(terrainEntity, best.x, best.z);

    return { x: best.x, y: localY, z: best.z, trees };
  }

  getGameCameraEntity() {
    if (this.gameCameraId) {
      const entity = this.sceneStore.getEntity(this.gameCameraId);
      if (entity?.type === "camera") return entity;
    }
    return this.sceneStore.listEntities().find((entity) => entity.type === "camera") || null;
  }

  getGameCamera() {
    const entity = this.getGameCameraEntity();
    if (entity?.three?.userData?.camera) return entity.three.userData.camera;
    return null;
  }

  findFPSPlayerEntity() {
    return (
      this.sceneStore
        .listEntities()
        .find((entity) => entity.components?.some((component) => component.type === "FPSController")) || null
    );
  }

  findFPSControllerInstance() {
    const entity = this.findFPSPlayerEntity();
    if (!entity) return null;
    const component = entity.components?.find((entry) => entry.type === "FPSController");
    if (!component) return null;
    return this.scriptSystem.getComponentInstance(component.id);
  }

  placePlayerInsideForest() {
    const terrainEntity = this.getForestTerrainEntity();
    if (!terrainEntity) return;
    if ((terrainEntity.terrain?.trees?.length || 0) < 80) return;

    const playerEntity = this.findFPSPlayerEntity();
    if (playerEntity?.three?.position && playerEntity.three.position.lengthSq() > 9) {
      return;
    }

    const spawn = this.findForestSpawnPoint(terrainEntity);
    if (!spawn) return;

    const localPoint = new THREE.Vector3(
      spawn.x,
      sampleTerrainHeight(terrainEntity, spawn.x, spawn.z),
      spawn.z
    );
    const worldPoint = terrainEntity.three.localToWorld(localPoint.clone());

    if (playerEntity?.three) {
      playerEntity.three.position.copy(worldPoint);
      playerEntity.three.rotation.set(0, 0, 0);
    }

    const cameraEntity = this.getGameCameraEntity();
    if (cameraEntity?.three) {
      if (!cameraEntity.parentId) {
        cameraEntity.three.position.set(worldPoint.x, worldPoint.y + 1.6, worldPoint.z);
      }

      if (spawn.trees?.length) {
        let centerX = 0;
        let centerZ = 0;
        spawn.trees.forEach((tree) => {
          centerX += Number(tree.x);
          centerZ += Number(tree.z);
        });
        centerX /= spawn.trees.length;
        centerZ /= spawn.trees.length;

        const lookDx = centerX - spawn.x;
        const lookDz = centerZ - spawn.z;
        if (Math.abs(lookDx) + Math.abs(lookDz) > 0.001) {
          const yaw = Math.atan2(lookDx, -lookDz);
          cameraEntity.three.rotation.set(0, yaw, 0, "YXZ");
        }
      }
    }
  }

  setDebugVisible(visible) {
    this.debugEnabled = visible !== false;
    this.debugPanel.setVisible(false);
    this.miniMap.setVisible(this.debugEnabled);
  }

  countVisibleRenderables() {
    let visible = 0;
    this.scene.traverse((object) => {
      if (!object.visible) return;
      if (object.isMesh || object.isInstancedMesh) {
        visible += 1;
      }
    });
    return visible;
  }

  ensureVisibleContent(camera) {
    const settings = this.qualitySettings.getCurrent();
    const viewDistance = settings?.viewDistance ?? 220;
    let visibleCount = 0;
    this.sceneStore.listEntities().forEach((entity) => {
      if (!entity?.three) return;
      if (entity.type === "camera") return;
      entity.three.getWorldPosition(tmpEnsureVisiblePos);
      const distance = camera.position.distanceTo(tmpEnsureVisiblePos);
      const shouldBeVisible = entity.active !== false && distance <= viewDistance * 1.2;
      entity.three.visible = shouldBeVisible;
      if (shouldBeVisible) visibleCount += 1;
    });
    return visibleCount;
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    if (!Number.isFinite(dt) || dt <= 0) return;

    this.ensureRendererReady();
    const active = this.activeCamera;
    const camera = active?.isCamera ? active : this.fallbackCamera;
    const settings = this.qualitySettings.getCurrent();

    if (this.runtimeFlags.scripts) {
      try {
        this.scriptSystem.update(dt);
        this.animator.update(dt);
      } catch (error) {
        this.disableRuntimeFlag("scripts", error);
      }
    }

    if (this.runtimeFlags.optimization) {
      try {
        this.sceneOptimizationManager.update(camera, settings);
      } catch (error) {
        this.disableRuntimeFlag("optimization", error);
      }
    } else {
      this.ensureVisibleContent(camera);
    }

    if (this.runtimeFlags.vegetation) {
      try {
        this.vegetationManager.update(camera, settings);
      } catch (error) {
        this.disableRuntimeFlag("vegetation", error);
      }
    }

    try {
      this.placementManager?.update(camera);
    } catch (error) {
      console.warn("[GamePreview] Placement update falhou:", error);
    }

    try {
      this.treeStandInteractionManager?.update();
    } catch (error) {
      console.warn("[GamePreview] Tree stand interaction falhou:", error);
    }

    if (this.runtimeFlags.lighting) {
      try {
        this.lightingManager?.update(camera, settings);
      } catch (error) {
        this.disableRuntimeFlag("lighting", error);
      }
    }

    if (this.runtimeFlags.advancedRender) {
      try {
        this.renderManager.render(this.scene, camera);
      } catch (error) {
        this.disableRuntimeFlag("advancedRender", error);
        try {
          this.ensureVisibleContent(camera);
          this.renderer?.render?.(this.scene, camera);
        } catch (fallbackError) {
          if (now - this.lastRuntimeErrorAt > 2000) {
            this.lastRuntimeErrorAt = now;
            console.error("[GamePreview] Render fallback error:", fallbackError);
          }
        }
      }
    } else {
      try {
        this.ensureVisibleContent(camera);
        this.renderer?.render?.(this.scene, camera);
      } catch (error) {
        if (now - this.lastRuntimeErrorAt > 2000) {
          this.lastRuntimeErrorAt = now;
          console.error("[GamePreview] Basic render error:", error);
        }
      }
    }

    const instantFps = 1 / dt;
    this.smoothedFps = THREE.MathUtils.lerp(this.smoothedFps, instantFps, 0.14);
    this.qualitySettings.updatePerformance(this.smoothedFps);

    this.miniMap.update(this.playerEntity, camera);

    const debugRootVisible = !!this.debugPanel?.root && !this.debugPanel.root.classList.contains("hidden");
    if (debugRootVisible && now - this.lastDebugUpdate > 240) {
      this.lastDebugUpdate = now;
      const stats = this.renderManager.getFrameStats();
      const textureMB = this.renderManager.estimateTextureMemoryMB(this.scene);
      this.debugPanel.update({
        fps: this.smoothedFps,
        stats,
        visibleObjects: this.countVisibleRenderables(),
        textureMemoryMB: textureMB,
        preset: this.qualitySettings.getCurrent().label,
        rendererType: this.renderManager.getRendererType().toUpperCase(),
      });
    }
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) return;
    this.renderManager.resize(rect.width, rect.height);
    const camera = this.activeCamera || this.fallbackCamera;
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
  }

  parseVectorQuery(rawValue) {
    if (!rawValue) return null;
    const parts = String(rawValue)
      .split(",")
      .map((part) => Number(part.trim()));
    if (parts.length !== 3 || parts.some((value) => !Number.isFinite(value))) {
      return null;
    }
    return new THREE.Vector3(parts[0], parts[1], parts[2]);
  }

  applyEditorCamera() {
    if (this.editorCameraPosition) {
      this.fallbackCamera.position.copy(this.editorCameraPosition);
    } else {
      this.fallbackCamera.position.set(6, 5, 8);
    }

    if (this.editorCameraTarget) {
      this.fallbackCamera.lookAt(this.editorCameraTarget);
    } else {
      this.fallbackCamera.lookAt(0, 0, 0);
    }
    this.fallbackCamera.updateProjectionMatrix();
  }

  applyEditorSky() {
    if (this.editorSkyTexture) {
      this.scene.background = this.editorSkyTexture;
      this.scene.environment = this.editorSkyTexture;
      return;
    }
    if (this.editorSkyLoading) return;
    this.editorSkyLoading = true;

    const loader = new THREE.TextureLoader();
    loader.load(
      "assets/skybox/custom/skybox.jpg",
      (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        texture.colorSpace = THREE.SRGBColorSpace;
        this.editorSkyTexture = texture;
        this.scene.background = texture;
        this.scene.environment = texture;
        this.editorSkyLoading = false;
      },
      undefined,
      () => {
        this.editorSkyLoading = false;
      }
    );
  }
}
