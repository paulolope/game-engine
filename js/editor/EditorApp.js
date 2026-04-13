import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";

import { AssetManager } from "../assets/AssetManager.js?v=20260413a";
import { AnimatorSystem } from "../engine/AnimatorSystem.js";
import { SceneStore } from "../scene/SceneStore.js?v=20260413a";
import { ScriptRegistry } from "../scripts/ScriptRegistry.js";
import { ScriptSystem } from "../scripts/ScriptSystem.js";
import { Input } from "../core/Input.js";
import { clamp, sanitizeName, safeNumber } from "../utils/utils.js";
import { getTreeCollisionRadius } from "../utils/treeCollisions.js";
import {
  sampleTerrainHeight,
  updateTerrainTrees,
} from "../engine/TerrainSystem.js?v=20260413a";
import { sculptTerrain } from "../engine/terrain/TerrainSculptor.js";
import { paintTerrain } from "../engine/terrain/TerrainPainter.js";

import { AutoRotate } from "../components/AutoRotate.js";
import { PlayerMovement } from "../components/PlayerMovement.js?v=20260411c";
import { PlayAnimation } from "../components/PlayAnimation.js";
import { FollowTarget } from "../components/FollowTarget.js";
import { FPSController } from "../components/FPSController.js?v=20260413c";
import { AnimalAI } from "../components/AnimalAI.js?v=20260413d";
import { RegionSpawner } from "../components/RegionSpawner.js?v=20260413a";
import { ViewportController } from "./ViewportController.js";
import { cacheEditorDom } from "../ui/editorDom.js?v=20260412a";
import { HierarchyPanel } from "./panels/HierarchyPanel.js";
import { InspectorPanel } from "./panels/InspectorPanel.js?v=20260413n";
import { ToolbarController } from "./ToolbarController.js";
import { TerrainToolController } from "./terrain/TerrainToolController.js";
import { SketchfabBrowser } from "../../modules/ui_asset_browser/SketchfabBrowser.js?v=20260412c";

export class EditorApp {
  // Main editor application: wires Three.js, UI panels, and runtime systems.
  constructor() {
    this.dom = cacheEditorDom();
    this.assetManager = new AssetManager();
    this.sketchfabBrowser = new SketchfabBrowser({
      modalEl: this.dom.sketchfabModal,
      rootEl: this.dom.sketchfabBrowserRoot,
      closeButton: this.dom.sketchfabBrowserClose,
      assetManager: this.assetManager,
      onImported: async (result) => {
        await this.refreshAssets();
        const localPath = result?.asset?.localFilePath || "";
        if (!localPath) return;
        const importedAsset = this.assetsCache.find((asset) => asset.path === localPath);
        if (!importedAsset) return;
        this.selectedAsset = importedAsset;
        this.renderAssetsList(this.assetsCache);
      },
      onClose: () => this.setViewportTabActive("scene"),
    });
    this.animator = new AnimatorSystem();
    this.registry = new ScriptRegistry();
    this.input = new Input();

    this.viewport = new ViewportController({
      canvas: this.dom.sceneCanvas,
      onTransformChange: () => this.syncInspectorTransform(),
    });
    this.scene = this.viewport.scene;
    this.camera = this.viewport.camera;
    this.renderer = this.viewport.renderer;
    this.orbit = this.viewport.orbit;
    this.transformControls = this.viewport.transformControls;
    this.grid = this.viewport.grid;

    this.sceneStore = new SceneStore(this.scene, this.assetManager, this.animator);
    this.scriptSystem = new ScriptSystem(this.registry, {
      input: this.input,
      sceneStore: this.sceneStore,
      animator: this.animator,
      assetManager: this.assetManager,
      mode: "editor",
      domElement: this.dom.sceneCanvas,
      getAudioListener: () => this.audioListener,
    });
    this.sceneStore.setScriptSystem(this.scriptSystem);

    this.toolbar = new ToolbarController({
      toolButtons: this.dom.toolButtons,
      snapToggle: this.dom.snapToggle,
      snapMove: this.dom.snapMove,
      snapRot: this.dom.snapRot,
      snapScale: this.dom.snapScale,
      onToolChange: (tool) => this.setTool(tool),
      onSnapChange: (snap) => this.applySnapFromToolbar(snap),
    });

    this.hierarchyPanel = new HierarchyPanel({
      listEl: this.dom.hierarchyList,
      parentSelect: this.dom.parentSelect,
      sceneStore: this.sceneStore,
      onSelect: (id) => this.selectEntity(id),
    });
    this.registry.register(AutoRotate);
    this.registry.register(PlayerMovement);
    this.registry.register(PlayAnimation);
    this.registry.register(FollowTarget);
    this.registry.register(FPSController);
    this.registry.register(AnimalAI);
    this.registry.register(RegionSpawner);

    this.selection = {
      id: null,
      helper: null,
    };

    this.terrainTool = {
      enabled: false,
      mode: "sculpt",
      sculptOp: "raise",
      paintLayerIndex: 0,
      treeOp: "add",
      treeModelPath: "assets/models/pine_tree.glb",
      treeCollision: true,
      brushSize: 1.8,
      strength: 0.35,
      falloff: 0.5,
      flattenHeight: 0,
      treeDensity: 4,
      treeScale: 1,
    };
    this.inspectorPanel = new InspectorPanel({
      container: this.dom.inspectorContent,
      sceneStore: this.sceneStore,
      scriptSystem: this.scriptSystem,
      registry: this.registry,
      animator: this.animator,
      terrainTool: this.terrainTool,
      getGameCameraId: () => this.gameCameraId,
      onSetGameCamera: (id) => {
        this.gameCameraId = id;
        this.refreshGameCameraSelect();
      },
      onApplyTransform: (entity) => this.applyTransformFromInspector(entity),
      onSetTerrainToolEnabled: (enabled) => this.setTerrainToolEnabled(enabled),
      onUploadTexture: async (files) => {
        try {
          const data = await this.assetManager.uploadTextures(files);
          this.invalidateImportedAssets(data?.saved || []);
          this.mergeAssetsFromPaths(data?.saved || [], "texture");
          await this.refreshAssets();
        } catch (error) {
          console.error(error);
          alert("Falha no upload da textura. Verifique permissões/formatos.");
        }
      },
      onRefreshHierarchy: () => this.refreshHierarchy(),
    });
    this.terrainBrushHelper = null;
    this.terrainController = new TerrainToolController({
      toolState: this.terrainTool,
      orbit: this.orbit,
      canvas: this.dom.sceneCanvas,
      getSelectedTerrain: () => this.getSelectedTerrain(),
      getTerrainHit: (event, terrain) => this.getTerrainHit(event, terrain),
      applyEdit: (point, terrain) => this.applyTerrainEdit(point, terrain),
      updateBrushPreview: (hit) => this.updateTerrainBrushPreview(hit),
      getFlattenHeight: (point, terrain) => {
        const local = terrain.terrain.mesh.worldToLocal(point.clone());
        return sampleTerrainHeight(terrain, local.x, local.z);
      },
      isEditBlocked: () => this.isCameraLookMode,
    });

    this.isPlaying = false;
    this.lastTime = performance.now();
    this.lastRuntimeHelpersUpdate = this.lastTime;
    this.initialSceneLoaded = false;
    this.gameCameraId = null;
    this.assetsCollapsed = false;
    this.consoleCollapsed = false;
    this.assetsCache = [];
    this.selectedAsset = null;
    this.sceneNames = [];
    this.lastSceneStorageKey = "editor:lastScene";
    this.isCameraLookMode = false;
    this.previousTransformVisible = true;
    this.panelResizeState = null;
    this.panelStackResizeState = null;
    this.panelResizers = { left: null, right: null, stack: null };
    this.panelWidthStorageKeys = {
      hierarchy: "layoutHierarchyWidth",
      inspector: "layoutInspectorWidth",
    };
    this.panelHeightStorageKey = "layoutRightStackTopHeight";
    this.onPanelResizePointerMove = (event) => this.handlePanelResizePointerMove(event);
    this.onPanelResizePointerUp = () => this.finishPanelResize();
    this.onPanelStackResizePointerMove = (event) => this.handlePanelStackResizePointerMove(event);
    this.onPanelStackResizePointerUp = () => this.finishPanelStackResize();
    this.onWindowResize = () => this.resize();
    this.onVisibilityChange = () => this.handleVisibilityChange();
    this.onPageHide = () => this.handlePageHide();
    this.onPageShow = () => this.handlePageShow();
    this.animationFrameId = null;
    this.isLoopRunning = false;
    this.isDisposed = false;
    this.previewCanvasSize = { width: 0, height: 0 };
    this.assetPreviewAudio = null;
    this.assetPreviewAudioPath = "";
    this.audioListener = new THREE.AudioListener();
    this.audioUnlockTargets = [this.dom.sceneCanvas, window];
    this.onUserGestureResumeAudio = () => this.resumeAudioContext();
    this.viewport.camera.add(this.audioListener);
    this.bindAudioUnlock();

    this.gameRenderer = new THREE.WebGLRenderer({ canvas: this.dom.gameModalCanvas, antialias: true });
    this.gameRenderer.setPixelRatio(window.devicePixelRatio || 1);
    this.gameRenderer.setClearColor(0x111318, 1);

    this.setupScene();
    this.initUI();
    this.initPanelResizers();
    this.refreshHierarchy();
    this.resize();

    window.addEventListener("resize", this.onWindowResize);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    window.addEventListener("pagehide", this.onPageHide);
    window.addEventListener("pageshow", this.onPageShow);

    this.startAnimationLoop();
    this.scheduleInitialDataRefresh();
  }

  setupScene() {
    const defaultTerrain = this.sceneStore.createTerrain("Terreno");
    defaultTerrain.three.receiveShadow = true;
    this.createDefaultLights();
    this.applySkyImage();
    this.toolbar.setTool("translate");
  }

  applySkyImage() {
    const loader = new THREE.TextureLoader();
    const texture = loader.load("assets/skybox/custom/skybox.jpg");
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = texture;
    this.scene.environment = texture;
  }

  initUI() {
    this.toolbar.bind();

    this.initViewportTabs();

    this.dom.btnNew.addEventListener("click", () => this.newScene());
    this.dom.btnSave.addEventListener("click", async () => {
      try {
        await this.saveScene();
      } catch (error) {
        console.error(error);
        alert(error?.message || "Falha ao salvar cena.");
      }
    });
    this.dom.btnLoad.addEventListener("click", () => this.loadScene());
    if (this.dom.sceneList) {
      this.dom.sceneList.addEventListener("change", async () => {
        const selected = sanitizeName(this.dom.sceneList.value || "", "");
        if (!selected) return;
        this.setSceneSelectorsValue(selected);
        if (this.sceneStore.currentSceneName === selected) {
          this.dom.sceneName.value = selected;
          this.rememberSceneName(selected);
          return;
        }
        const loaded = await this.loadScene(selected);
        if (!loaded) {
          alert("Falha ao carregar a cena selecionada.");
        }
      });
    }
    if (this.dom.btnProjectNewScene) {
      this.dom.btnProjectNewScene.addEventListener("click", () => this.createProjectScene());
    }
    if (this.dom.btnProjectOpenScene) {
      this.dom.btnProjectOpenScene.addEventListener("click", () => this.openProjectScene());
    }
    if (this.dom.btnProjectDeleteScene) {
      this.dom.btnProjectDeleteScene.addEventListener("click", () => this.deleteProjectScene());
    }
    if (this.dom.projectSceneList) {
      this.dom.projectSceneList.addEventListener("change", () => {
        const selected = String(this.dom.projectSceneList.value || "");
        if (!selected) return;
        this.setSceneSelectorsValue(selected);
      });
    }
    if (this.dom.btnExportGame) {
      this.dom.btnExportGame.addEventListener("click", () => this.exportGame());
    }
    if (this.dom.menuAssets) {
      this.dom.menuAssets.addEventListener("click", () => this.setAssetsCollapsed(!this.assetsCollapsed));
    }
    if (this.dom.btnCameraLook) {
      this.dom.btnCameraLook.addEventListener("click", () => {
        this.setCameraLookMode(!this.isCameraLookMode);
      });
    }

    this.dom.btnPlay.addEventListener("click", () => this.togglePlay());
    this.dom.btnGamePreview.addEventListener("click", () => this.openGamePreview());
    if (this.dom.btnWindowFullscreen) {
      this.dom.btnWindowFullscreen.addEventListener("click", () => this.toggleWindowFullscreen());
    }
    this.dom.btnToggleAssets.addEventListener("click", () => this.toggleAssetsPanel());
    if (this.dom.btnToggleProject) {
      this.dom.btnToggleProject.addEventListener("click", () => this.setAssetsCollapsed(!this.assetsCollapsed));
    }
    if (this.dom.btnToggleConsole) {
      this.dom.btnToggleConsole.addEventListener("click", () => this.setConsoleCollapsed(!this.consoleCollapsed));
    }
    if (this.dom.btnConsoleToggle) {
      this.dom.btnConsoleToggle.addEventListener("click", () => this.setConsoleCollapsed(!this.consoleCollapsed));
    }

    this.dom.createSelect.addEventListener("change", () => {
      const value = this.dom.createSelect.value;
      if (!value) return;
      if (value === "empty") this.sceneStore.createEmpty("Empty");
      if (value === "spawn_volume") this.createRegionSpawner();
      if (value === "fps_player") this.createFpsPlayer();
      if (value === "camera") this.sceneStore.createCamera("Camera");
      if (value === "terrain") this.sceneStore.createTerrain("Terreno");
      if (value === "cube" || value === "sphere" || value === "plane") this.sceneStore.createPrimitive(value);
      if (value === "light_directional") this.sceneStore.createLight("directional");
      if (value === "light_point") this.sceneStore.createLight("point");
      if (value === "light_spot") this.sceneStore.createLight("spot");
      if (value === "light_ambient") this.sceneStore.createLight("ambient");
      if (value === "light_hemisphere") this.sceneStore.createLight("hemisphere");
      if (value === "light") this.sceneStore.createLight("point");
      this.dom.createSelect.value = "";
      this.refreshHierarchy();
    });

    this.dom.btnDuplicate.addEventListener("click", () => {
      if (!this.selection.id) return;
      this.sceneStore.duplicateEntity(this.selection.id);
      this.refreshHierarchy();
    });

    this.dom.btnDelete.addEventListener("click", () => {
      if (!this.selection.id) return;
      this.sceneStore.removeEntity(this.selection.id);
      this.selectEntity(null);
      this.refreshHierarchy();
    });

    const duplicateTop = document.getElementById("btn-duplicate-top");
    if (duplicateTop) {
      duplicateTop.addEventListener("click", () => this.dom.btnDuplicate.click());
    }
    const deleteTop = document.getElementById("btn-delete-top");
    if (deleteTop) {
      deleteTop.addEventListener("click", () => this.dom.btnDelete.click());
    }

    this.dom.btnSetParent.addEventListener("click", () => {
      if (!this.selection.id) return;
      const parentId = this.dom.parentSelect.value || null;
      if (parentId === "none") {
        this.sceneStore.setParent(this.selection.id, null);
      } else {
        this.sceneStore.setParent(this.selection.id, parentId || null);
      }
      this.refreshHierarchy();
    });

    this.dom.btnClearParent.addEventListener("click", () => {
      if (!this.selection.id) return;
      this.sceneStore.setParent(this.selection.id, null);
      this.refreshHierarchy();
    });

    this.dom.fileGlb.addEventListener("change", async (event) => {
      if (!event.target.files?.length) return;
      const data = await this.assetManager.uploadFiles(event.target.files);
      event.target.value = "";
      this.invalidateImportedAssets(data?.saved || []);
      await this.refreshAssets();
    });

    this.dom.fileGltf.addEventListener("change", async (event) => {
      if (!event.target.files?.length) return;
      const data = await this.assetManager.uploadFiles(event.target.files);
      event.target.value = "";
      this.invalidateImportedAssets(data?.saved || []);
      await this.refreshAssets();
    });

    if (this.dom.fileTexture) {
      this.dom.fileTexture.addEventListener("change", async (event) => {
        if (!event.target.files?.length) return;
        try {
          const data = await this.assetManager.uploadTextures(event.target.files);
          event.target.value = "";
          this.invalidateImportedAssets(data?.saved || []);
          this.mergeAssetsFromPaths(data?.saved || [], "texture");
          await this.refreshAssets();
        } catch (error) {
          console.error(error);
          alert("Falha no upload da textura. Verifique permissões/formatos.");
        }
      });
    }

    if (this.dom.fileAudio) {
      this.dom.fileAudio.addEventListener("change", async (event) => {
        if (!event.target.files?.length) return;
        try {
          const data = await this.assetManager.uploadAudio(event.target.files);
          event.target.value = "";
          this.invalidateImportedAssets(data?.saved || []);
          this.mergeAssetsFromPaths(data?.saved || [], "audio");
          await this.refreshAssets();
        } catch (error) {
          console.error(error);
          alert("Falha no upload do audio. Verifique permissoes/formatos.");
        }
      });
    }

    this.dom.previewClose.addEventListener("click", () => this.closePreview());
    this.dom.gameClose.addEventListener("click", () => this.closeGamePreview());
    this.dom.gameModal.addEventListener("click", (event) => {
      if (event.target === this.dom.gameModal) {
        this.closeGamePreview();
      }
    });

    const assetsRestore = document.getElementById("btn-assets-restore");
    if (assetsRestore) {
      assetsRestore.addEventListener("click", () => this.setAssetsCollapsed(false));
    }

    const focusBtn = document.getElementById("btn-viewport-focus");
    if (focusBtn) {
      focusBtn.addEventListener("click", () => this.focusSelection());
    }
    const gridBtn = document.getElementById("btn-viewport-grid");
    if (gridBtn) {
      gridBtn.addEventListener("click", () => {
        if (!this.grid) return;
        this.grid.visible = !this.grid.visible;
        gridBtn.classList.toggle("active", this.grid.visible);
      });
    }
    const gizmoBtn = document.getElementById("btn-viewport-gizmos");
    if (gizmoBtn) {
      gizmoBtn.addEventListener("click", () => {
        this.transformControls.visible = !this.transformControls.visible;
        gizmoBtn.classList.toggle("active", this.transformControls.visible);
        this.sceneStore.setLightHelpersVisible(this.transformControls.visible);
      });
      this.sceneStore.setLightHelpersVisible(this.transformControls.visible);
    }

    this.dom.gameCameraSelect.addEventListener("change", (event) => {
      const value = event.target.value;
      this.gameCameraId = value || null;
      this.updateGameCameraLabel();
    });

    this.dom.sceneCanvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      if (this.handleTerrainPointerDown(event)) return;
      if (this.transformControls.dragging) return;
      if (this.isCameraLookMode) return;
      const rect = this.dom.sceneCanvas.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, this.camera);
      if (this.transformControls.visible) {
        const gizmoHits = raycaster.intersectObject(this.transformControls, true);
        if (gizmoHits.length) return;
      }
      const intersects = raycaster.intersectObjects(this.scene.children, true);

      const hit = intersects.find((intersect) => {
        const object = intersect.object;
        if (object.userData.ignoreRaycast) return false;
        return this.findEntityId(object) !== null;
      });

      if (hit) {
        const entityId = this.findEntityId(hit.object);
        this.selectEntity(entityId);
      } else {
        this.selectEntity(null);
      }
    });

    this.dom.sceneCanvas.addEventListener("pointermove", (event) => {
      this.handleTerrainPointerMove(event);
    });

    window.addEventListener("pointerup", (event) => {
      this.handleTerrainPointerUp(event);
    });

    window.addEventListener("keydown", (event) => {
      if (document.activeElement && ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) {
        return;
      }

      if (event.code === "KeyW") this.toolbar.setTool("translate");
      if (event.code === "KeyE") this.toolbar.setTool("rotate");
      if (event.code === "KeyR") this.toolbar.setTool("scale");
      if (event.code === "KeyF") this.focusSelection();
      if (event.code === "Delete" && this.selection.id) {
        this.sceneStore.removeEntity(this.selection.id);
        this.selectEntity(null);
        this.refreshHierarchy();
      }
      if (event.code === "Escape") this.selectEntity(null);
      if (event.ctrlKey && event.code === "KeyD") {
        if (this.selection.id) {
          this.sceneStore.duplicateEntity(this.selection.id);
          this.refreshHierarchy();
        }
      }
    });

    document.addEventListener("focusin", (event) => {
      if (["INPUT", "SELECT", "TEXTAREA"].includes(event.target.tagName)) {
        this.input.enabled = false;
        this.input.clear();
      }
    });

    document.addEventListener("focusout", (event) => {
      if (["INPUT", "SELECT", "TEXTAREA"].includes(event.target.tagName)) {
        this.input.enabled = true;
      }
    });

    this.toolbar.applySnap();
    this.updateCameraModeLabel();

    const assetsStored = localStorage.getItem("assetsCollapsed");
    const consoleStored = localStorage.getItem("consoleCollapsed");
    const assetsCollapsed = assetsStored === null ? true : assetsStored === "true";
    const consoleCollapsed = consoleStored === null ? true : consoleStored === "true";
    this.consoleCollapsed = consoleCollapsed;
    this.setAssetsCollapsed(assetsCollapsed);
    this.setConsoleCollapsed(consoleCollapsed);
  }

  setViewportTabActive(tabName) {
    const tabs = [
      { name: "scene", el: this.dom.tabScene },
      { name: "game", el: this.dom.tabGame },
      { name: "animator", el: this.dom.tabAnimator },
      { name: "assets", el: this.dom.tabAssetStore },
    ];
    tabs.forEach((tab) => {
      if (!tab.el) return;
      tab.el.classList.toggle("active", tab.name === tabName);
    });
  }

  showSceneSwitcher() {
    if (!this.dom.sceneSwitcher) return;
    this.dom.sceneSwitcher.hidden = false;
    this.setViewportTabActive("scene");
  }

  hideSceneSwitcher() {
    if (!this.dom.sceneSwitcher) return;
    this.dom.sceneSwitcher.hidden = true;
  }

  toggleSceneSwitcher() {
    if (!this.dom.sceneSwitcher) return;
    if (this.dom.sceneSwitcher.hidden) {
      this.showSceneSwitcher();
    } else {
      this.hideSceneSwitcher();
      this.setViewportTabActive("scene");
    }
  }

  initViewportTabs() {
    if (this.dom.tabScene) {
      this.dom.tabScene.addEventListener("click", (event) => {
        event.preventDefault();
        this.toggleSceneSwitcher();
      });
    }

    if (this.dom.tabGame) {
      this.dom.tabGame.addEventListener("click", (event) => {
        event.preventDefault();
        this.hideSceneSwitcher();
        this.setViewportTabActive("game");
        this.openGamePreview();
      });
    }

    if (this.dom.tabAnimator) {
      this.dom.tabAnimator.addEventListener("click", (event) => {
        event.preventDefault();
        this.hideSceneSwitcher();
        this.setViewportTabActive("animator");
        alert("Animator em desenvolvimento.");
        this.setViewportTabActive("scene");
      });
    }

    if (this.dom.tabAssetStore) {
      this.dom.tabAssetStore.addEventListener("click", (event) => {
        event.preventDefault();
        this.hideSceneSwitcher();
        this.openSketchfabBrowser();
      });
    }

    if (this.dom.sceneSwitcherList) {
      this.dom.sceneSwitcherList.addEventListener("change", () => {
        const selected = String(this.dom.sceneSwitcherList.value || "");
        if (!selected) return;
        if (this.dom.sceneList) this.dom.sceneList.value = selected;
        if (this.dom.projectSceneList) this.dom.projectSceneList.value = selected;
      });
    }

    if (this.dom.btnSceneSwitcherOpen) {
      this.dom.btnSceneSwitcherOpen.addEventListener("click", async () => {
        const name = String(this.dom.sceneSwitcherList?.value || "").trim();
        if (!name) {
          alert("Selecione uma cena.");
          return;
        }
        const loaded = await this.loadScene(name);
        if (!loaded) {
          alert("Falha ao abrir a cena selecionada.");
          return;
        }
        this.hideSceneSwitcher();
      });
    }

    if (this.dom.btnSceneSwitcherNew) {
      this.dom.btnSceneSwitcherNew.addEventListener("click", async () => {
        await this.createProjectScene();
        this.hideSceneSwitcher();
      });
    }

    if (this.dom.btnSceneSwitcherDelete) {
      this.dom.btnSceneSwitcherDelete.addEventListener("click", async () => {
        const name = String(this.dom.sceneSwitcherList?.value || "").trim();
        const deleted = await this.deleteProjectScene(name);
        if (deleted) {
          this.hideSceneSwitcher();
        }
      });
    }

    document.addEventListener("pointerdown", (event) => {
      if (!this.dom.sceneSwitcher || this.dom.sceneSwitcher.hidden) return;
      const target = event.target;
      const clickedSceneTab = this.dom.tabScene && this.dom.tabScene.contains(target);
      const clickedInsideSwitcher = this.dom.sceneSwitcher.contains(target);
      if (!clickedSceneTab && !clickedInsideSwitcher) {
        this.hideSceneSwitcher();
      }
    });
  }

  initPanelResizers() {
    if (!this.dom.appRoot || !this.dom.hierarchyPanel || !this.dom.inspectorPanel) return;

    const createResizer = (side, orientation = "vertical", onPointerDown = null) => {
      const handle = document.createElement("div");
      handle.className = `panel-resizer panel-resizer-${side}`;
      handle.dataset.side = side;
      handle.setAttribute("role", "separator");
      handle.setAttribute("aria-orientation", orientation);
      handle.addEventListener(
        "pointerdown",
        onPointerDown ?? ((event) => this.beginPanelResize(side, event))
      );
      this.dom.appRoot.appendChild(handle);
      return handle;
    };

    this.panelResizers.left = createResizer("left");
    this.panelResizers.right = createResizer("right");
    this.panelResizers.stack = createResizer(
      "stack",
      "horizontal",
      (event) => this.beginPanelStackResize(event)
    );

    this.applyStoredPanelWidths();
    this.applyStoredPanelHeights();
    this.updatePanelResizers();
  }

  isCompactLayout() {
    return window.matchMedia("(max-width: 980px)").matches;
  }

  getPanelLayoutMetrics() {
    if (!this.dom.appRoot || !this.dom.hierarchyPanel || !this.dom.inspectorPanel) return null;
    if (this.isCompactLayout()) return null;

    const appRect = this.dom.appRoot.getBoundingClientRect();
    const hierarchyRect = this.dom.hierarchyPanel.getBoundingClientRect();
    const inspectorRect = this.dom.inspectorPanel.getBoundingClientRect();
    const styles = getComputedStyle(this.dom.appRoot);

    const gap = Number.parseFloat(styles.columnGap || styles.gap || "8");
    const paddingLeft = Number.parseFloat(styles.paddingLeft || "0");
    const paddingRight = Number.parseFloat(styles.paddingRight || "0");
    const normalizedGap = Number.isFinite(gap) ? gap : 8;
    const normalizedPaddingLeft = Number.isFinite(paddingLeft) ? paddingLeft : 0;
    const normalizedPaddingRight = Number.isFinite(paddingRight) ? paddingRight : 0;

    const availableWidth = Math.max(
      0,
      appRect.width - normalizedPaddingLeft - normalizedPaddingRight - normalizedGap * 2
    );

    return {
      appRect,
      hierarchyRect,
      inspectorRect,
      gap: normalizedGap,
      availableWidth,
      leftWidth: hierarchyRect.width,
      rightWidth: inspectorRect.width,
    };
  }

  getPanelStackMetrics() {
    if (!this.dom.appRoot || !this.dom.hierarchyPanel || !this.dom.inspectorPanel) return null;
    if (this.isCompactLayout()) return null;

    const appRect = this.dom.appRoot.getBoundingClientRect();
    const hierarchyRect = this.dom.hierarchyPanel.getBoundingClientRect();
    const inspectorRect = this.dom.inspectorPanel.getBoundingClientRect();
    const styles = getComputedStyle(this.dom.appRoot);

    const gap = Number.parseFloat(styles.rowGap || styles.gap || "8");
    const normalizedGap = Number.isFinite(gap) ? gap : 8;
    const availableHeight = Math.max(0, hierarchyRect.height + inspectorRect.height + normalizedGap);

    return {
      appRect,
      hierarchyRect,
      inspectorRect,
      gap: normalizedGap,
      availableHeight,
      topHeight: hierarchyRect.height,
      bottomHeight: inspectorRect.height,
    };
  }

  setPanelColumnWidth(variable, value) {
    if (!this.dom.appRoot || !Number.isFinite(value)) return;
    this.dom.appRoot.style.setProperty(variable, `${Math.round(value)}px`);
  }

  setPanelRowHeight(variable, value) {
    if (!this.dom.appRoot || !Number.isFinite(value)) return;
    this.dom.appRoot.style.setProperty(variable, `${Math.round(value)}px`);
  }

  applyStoredPanelWidths() {
    const metrics = this.getPanelLayoutMetrics();
    if (!metrics) return;

    const minLeft = 180;
    const minRight = 280;
    const minCenter = 360;
    if (metrics.availableWidth <= minLeft + minRight + minCenter) return;

    const storedLeft = Number(localStorage.getItem(this.panelWidthStorageKeys.hierarchy));
    const storedRight = Number(localStorage.getItem(this.panelWidthStorageKeys.inspector));

    let left = Number.isFinite(storedLeft) ? storedLeft : metrics.leftWidth;
    let right = Number.isFinite(storedRight) ? storedRight : metrics.rightWidth;

    const maxLeft = Math.max(minLeft, metrics.availableWidth - right - minCenter);
    left = clamp(left, minLeft, maxLeft);

    const maxRight = Math.max(minRight, metrics.availableWidth - left - minCenter);
    right = clamp(right, minRight, maxRight);

    const finalMaxLeft = Math.max(minLeft, metrics.availableWidth - right - minCenter);
    left = clamp(left, minLeft, finalMaxLeft);

    this.setPanelColumnWidth("--hier-width", left);
    this.setPanelColumnWidth("--inspector-width", right);
  }

  applyStoredPanelHeights() {
    const metrics = this.getPanelStackMetrics();
    if (!metrics) return;

    const minTop = 140;
    const minBottom = 220;
    if (metrics.availableHeight <= minTop + minBottom) return;

    const storedTop = Number(localStorage.getItem(this.panelHeightStorageKey));
    const nextTop = clamp(
      Number.isFinite(storedTop) ? storedTop : metrics.topHeight,
      minTop,
      Math.max(minTop, metrics.availableHeight - minBottom)
    );

    this.setPanelRowHeight("--right-top-row-height", nextTop);
  }

  persistPanelWidths() {
    const metrics = this.getPanelLayoutMetrics();
    if (!metrics) return;
    localStorage.setItem(this.panelWidthStorageKeys.hierarchy, String(Math.round(metrics.leftWidth)));
    localStorage.setItem(this.panelWidthStorageKeys.inspector, String(Math.round(metrics.rightWidth)));
  }

  persistPanelHeights() {
    const metrics = this.getPanelStackMetrics();
    if (!metrics) return;
    localStorage.setItem(this.panelHeightStorageKey, String(Math.round(metrics.topHeight)));
  }

  normalizePanelWidths() {
    const metrics = this.getPanelLayoutMetrics();
    if (!metrics) return;

    const minLeft = 180;
    const minRight = 280;
    const minCenter = 360;
    if (metrics.availableWidth <= minLeft + minRight + minCenter) return;

    const centerWidth = metrics.availableWidth - metrics.leftWidth - metrics.rightWidth;
    if (
      centerWidth >= minCenter &&
      metrics.leftWidth >= minLeft &&
      metrics.rightWidth >= minRight
    ) {
      return;
    }

    let left = clamp(
      metrics.leftWidth,
      minLeft,
      Math.max(minLeft, metrics.availableWidth - metrics.rightWidth - minCenter)
    );
    let right = clamp(
      metrics.rightWidth,
      minRight,
      Math.max(minRight, metrics.availableWidth - left - minCenter)
    );

    left = clamp(left, minLeft, Math.max(minLeft, metrics.availableWidth - right - minCenter));
    this.setPanelColumnWidth("--hier-width", left);
    this.setPanelColumnWidth("--inspector-width", right);
  }

  normalizePanelHeights() {
    const metrics = this.getPanelStackMetrics();
    if (!metrics) return;

    const minTop = 140;
    const minBottom = 220;
    if (metrics.availableHeight <= minTop + minBottom) return;

    if (metrics.topHeight >= minTop && metrics.bottomHeight >= minBottom) {
      return;
    }

    const nextTop = clamp(
      metrics.topHeight,
      minTop,
      Math.max(minTop, metrics.availableHeight - minBottom)
    );
    this.setPanelRowHeight("--right-top-row-height", nextTop);
  }

  updatePanelResizers() {
    if (!this.panelResizers.left || !this.panelResizers.right || !this.panelResizers.stack) return;
    if (!this.dom.appRoot || !this.dom.hierarchyPanel || !this.dom.inspectorPanel) return;

    if (this.isCompactLayout()) {
      this.panelResizers.left.style.display = "none";
      this.panelResizers.right.style.display = "none";
      this.panelResizers.stack.style.display = "none";
      return;
    }

    const appRect = this.dom.appRoot.getBoundingClientRect();
    const hierarchyRect = this.dom.hierarchyPanel.getBoundingClientRect();
    const inspectorRect = this.dom.inspectorPanel.getBoundingClientRect();
    const styles = getComputedStyle(this.dom.appRoot);
    const gap = Number.parseFloat(styles.columnGap || styles.gap || "8");
    const paddingBottom = Number.parseFloat(styles.paddingBottom || "0");
    const normalizedGap = Number.isFinite(gap) ? gap : 8;
    const normalizedPaddingBottom = Number.isFinite(paddingBottom) ? paddingBottom : 0;

    const top = Math.max(0, hierarchyRect.top - appRect.top);
    const height = Math.max(48, this.dom.appRoot.clientHeight - top - normalizedPaddingBottom);

    const leftCenterX = hierarchyRect.right - appRect.left + normalizedGap / 2;
    const rightCenterX = inspectorRect.left - appRect.left - normalizedGap / 2;

    [this.panelResizers.left, this.panelResizers.right].forEach((handle) => {
      handle.style.display = "block";
      handle.style.top = `${top}px`;
      handle.style.height = `${height}px`;
    });

    this.panelResizers.left.style.left = `${leftCenterX}px`;
    this.panelResizers.right.style.left = `${rightCenterX}px`;

    const stackLeft = Math.max(hierarchyRect.left, inspectorRect.left) - appRect.left;
    const stackRight = Math.min(hierarchyRect.right, inspectorRect.right) - appRect.left;
    const stackWidth = Math.max(48, stackRight - stackLeft);
    const stackCenterY = hierarchyRect.bottom - appRect.top + normalizedGap / 2;

    this.panelResizers.stack.style.display = "block";
    this.panelResizers.stack.style.left = `${stackLeft}px`;
    this.panelResizers.stack.style.top = `${stackCenterY}px`;
    this.panelResizers.stack.style.width = `${stackWidth}px`;
  }

  beginPanelResize(side, event) {
    if (event.button !== 0) return;
    const metrics = this.getPanelLayoutMetrics();
    if (!metrics) return;

    const minLeft = 180;
    const minRight = 280;
    const minCenter = 360;
    if (metrics.availableWidth <= minLeft + minRight + minCenter) return;

    event.preventDefault();
    this.panelResizeState = {
      side,
      startX: event.clientX,
      startLeft: metrics.leftWidth,
      startRight: metrics.rightWidth,
      availableWidth: metrics.availableWidth,
      minLeft,
      minRight,
      minCenter,
    };

    document.body.classList.add("is-resizing-panels");
    this.panelResizers.left?.classList.toggle("active", side === "left");
    this.panelResizers.right?.classList.toggle("active", side === "right");

    window.addEventListener("pointermove", this.onPanelResizePointerMove);
    window.addEventListener("pointerup", this.onPanelResizePointerUp);
  }

  handlePanelResizePointerMove(event) {
    if (!this.panelResizeState) return;

    const state = this.panelResizeState;
    const dx = event.clientX - state.startX;

    if (state.side === "left") {
      const maxLeft = Math.max(state.minLeft, state.availableWidth - state.startRight - state.minCenter);
      const nextLeft = clamp(state.startLeft + dx, state.minLeft, maxLeft);
      this.setPanelColumnWidth("--hier-width", nextLeft);
    } else {
      const maxRight = Math.max(state.minRight, state.availableWidth - state.startLeft - state.minCenter);
      const nextRight = clamp(state.startRight - dx, state.minRight, maxRight);
      this.setPanelColumnWidth("--inspector-width", nextRight);
    }

    this.resize();
  }

  finishPanelResize() {
    if (!this.panelResizeState) return;

    this.panelResizeState = null;
    window.removeEventListener("pointermove", this.onPanelResizePointerMove);
    window.removeEventListener("pointerup", this.onPanelResizePointerUp);
    document.body.classList.remove("is-resizing-panels");
    this.panelResizers.left?.classList.remove("active");
    this.panelResizers.right?.classList.remove("active");

    this.persistPanelWidths();
    this.resize();
  }

  beginPanelStackResize(event) {
    if (event.button !== 0) return;
    const metrics = this.getPanelStackMetrics();
    if (!metrics) return;

    const minTop = 140;
    const minBottom = 220;
    if (metrics.availableHeight <= minTop + minBottom) return;

    event.preventDefault();
    this.panelStackResizeState = {
      startY: event.clientY,
      startTop: metrics.topHeight,
      availableHeight: metrics.availableHeight,
      minTop,
      minBottom,
    };

    document.body.classList.add("is-resizing-panels-vertical");
    this.panelResizers.stack?.classList.add("active");

    window.addEventListener("pointermove", this.onPanelStackResizePointerMove);
    window.addEventListener("pointerup", this.onPanelStackResizePointerUp);
  }

  handlePanelStackResizePointerMove(event) {
    if (!this.panelStackResizeState) return;

    const state = this.panelStackResizeState;
    const dy = event.clientY - state.startY;
    const maxTop = Math.max(state.minTop, state.availableHeight - state.minBottom);
    const nextTop = clamp(state.startTop + dy, state.minTop, maxTop);

    this.setPanelRowHeight("--right-top-row-height", nextTop);
    this.resize();
  }

  finishPanelStackResize() {
    if (!this.panelStackResizeState) return;

    this.panelStackResizeState = null;
    window.removeEventListener("pointermove", this.onPanelStackResizePointerMove);
    window.removeEventListener("pointerup", this.onPanelStackResizePointerUp);
    document.body.classList.remove("is-resizing-panels-vertical");
    this.panelResizers.stack?.classList.remove("active");

    this.persistPanelHeights();
    this.resize();
  }

  setTool(tool) {
    const terrain = this.getSelectedTerrain();
    const selected = this.selection.id ? this.sceneStore.getEntity(this.selection.id) : null;
    const isLight = selected?.type === "light";
    if (terrain && tool !== "translate") {
      this.toolbar.setTool("translate");
      return;
    }
    if (isLight && tool !== "translate") {
      this.toolbar.setTool("translate");
      return;
    }
    this.transformControls.setMode(tool);
  }

  applySnapFromToolbar(snap) {
    if (!snap) {
      this.transformControls.setTranslationSnap(null);
      this.transformControls.setRotationSnap(null);
      this.transformControls.setScaleSnap(null);
      return;
    }

    const moveSnap = snap.moveSnap ?? 0.5;
    const rotSnap = THREE.MathUtils.degToRad(snap.rotSnap ?? 15);
    const scaleSnap = snap.scaleSnap ?? 0.1;

    this.transformControls.setTranslationSnap(moveSnap);
    this.transformControls.setRotationSnap(rotSnap);
    this.transformControls.setScaleSnap(scaleSnap);
  }

  setCameraLookMode(enabled) {
    const next = !!enabled;
    if (this.isCameraLookMode === next) return;
    this.isCameraLookMode = next;

    if (next) {
      this.previousTransformVisible = this.transformControls.visible;
      this.transformControls.visible = false;
      this.transformControls.enabled = false;
      this.transformControls.detach();
      this.terrainController?.cancel();
      if (this.terrainBrushHelper) {
        this.terrainBrushHelper.visible = false;
      }
    } else {
      this.transformControls.enabled = true;
      this.transformControls.visible = this.previousTransformVisible;
      if (this.selection.id && !this.terrainTool.enabled && this.transformControls.visible) {
        const selected = this.sceneStore.getEntity(this.selection.id);
        if (selected) {
          this.transformControls.attach(selected.three);
        }
      }
    }

    this.updateCameraModeLabel();
  }

  updateCameraModeLabel() {
    if (this.dom.btnCameraLook) {
      this.dom.btnCameraLook.classList.toggle("active", this.isCameraLookMode);
      this.dom.btnCameraLook.textContent = this.isCameraLookMode ? "Navegando" : "Navegar";
    }
    if (this.dom.cameraLabel) {
      this.dom.cameraLabel.textContent = this.isCameraLookMode
        ? "Camera: Navegacao"
        : "Camera: Orbit";
    }
  }

  togglePlay() {
    this.isPlaying = !this.isPlaying;
    this.dom.btnPlay.textContent = this.isPlaying ? "Stop" : "Play";
    this.input.clear();
  }

  findEntityId(object) {
    let current = object;
    while (current) {
      if (current.userData?.entityId) return current.userData.entityId;
      current = current.parent;
    }
    return null;
  }

  selectEntity(id) {
    this.selection.id = id;
    const entity = id ? this.sceneStore.getEntity(id) : null;
    this.selectionLabel(entity);

    if (this.selection.helper) {
      this.scene.remove(this.selection.helper);
      this.selection.helper = null;
    }

    if (entity) {
      const canTransformSelection = !this.isCameraLookMode && !this.terrainTool.enabled;
      if (canTransformSelection) {
        this.transformControls.attach(entity.three);
      } else {
        this.transformControls.detach();
      }
      this.selection.helper = new THREE.BoxHelper(entity.three, 0xffb347);
      this.selection.helper.userData.ignoreRaycast = true;
      this.scene.add(this.selection.helper);
      if (entity.type === "terrain") {
        this.toolbar.setToolWithConstraint("translate", true);
        const layerCount = entity.terrain?.layers?.length || 1;
        if (this.terrainTool.paintLayerIndex >= layerCount) {
          this.terrainTool.paintLayerIndex = Math.max(0, layerCount - 1);
        }
      }
      if (entity.type !== "terrain" && this.terrainTool.enabled) {
        this.setTerrainToolEnabled(false);
      }
      if (entity.type !== "terrain" && this.terrainBrushHelper) {
        this.terrainBrushHelper.visible = false;
      }
    } else {
      this.transformControls.detach();
      if (this.terrainTool.enabled) {
        this.setTerrainToolEnabled(false);
      }
      if (this.terrainBrushHelper) {
        this.terrainBrushHelper.visible = false;
      }
    }

    this.refreshHierarchy();
    this.inspectorPanel.render(entity);
  }

  selectionLabel(entity) {
    this.dom.selectionLabel.textContent = entity
      ? `Selecionado: ${entity.name}`
      : "Nenhum objeto selecionado";
  }

  toggleWindowFullscreen() {
    if (!document.fullscreenElement) {
      this.enterWindowFullscreen();
    } else {
      this.exitWindowFullscreen();
    }
  }

  enterWindowFullscreen() {
    const target = document.documentElement;
    if (target.requestFullscreen) {
      target.requestFullscreen();
    } else if (target.webkitRequestFullscreen) {
      target.webkitRequestFullscreen();
    } else if (target.mozRequestFullScreen) {
      target.mozRequestFullScreen();
    } else if (target.msRequestFullscreen) {
      target.msRequestFullscreen();
    }
  }

  exitWindowFullscreen() {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }
  }

  focusSelection() {
    if (!this.selection.id) return;
    const entity = this.sceneStore.getEntity(this.selection.id);
    if (!entity) return;
    const target = new THREE.Vector3();
    entity.three.getWorldPosition(target);
    this.orbit.target.copy(target);
    this.orbit.update();
  }

  refreshHierarchy() {
    this.hierarchyPanel.render(this.selection.id);
    this.refreshGameCameraSelect();
  }

  refreshGameCameraSelect() {
    const select = this.dom.gameCameraSelect;
    select.innerHTML = "";

    const autoOption = document.createElement("option");
    autoOption.value = "";
    autoOption.textContent = "Auto (primeira camera)";
    select.appendChild(autoOption);

    const cameras = this.sceneStore.listEntities().filter((entity) => entity.type === "camera");
    cameras.forEach((entity) => {
      const option = document.createElement("option");
      option.value = entity.id;
      option.textContent = entity.name;
      select.appendChild(option);
    });

    if (this.gameCameraId && cameras.find((entity) => entity.id === this.gameCameraId)) {
      select.value = this.gameCameraId;
    } else {
      select.value = "";
    }

    this.updateGameCameraLabel();
  }

  updateGameCameraLabel() {
    const cam = this.getGameCamera();
    const hasCamera = !!cam;
    this.dom.gameEmpty.classList.toggle("visible", !hasCamera);
  }

  getGameCamera() {
    if (this.gameCameraId) {
      const entity = this.sceneStore.getEntity(this.gameCameraId);
      if (entity?.type === "camera" && entity.three.userData.camera) {
        return entity.three.userData.camera;
      }
    }

    const fallback = this.sceneStore.listEntities().find((entity) => entity.type === "camera");
    if (fallback && fallback.three.userData.camera) {
      if (!this.gameCameraId) {
        this.gameCameraId = fallback.id;
        if (this.dom.gameCameraSelect) {
          this.dom.gameCameraSelect.value = fallback.id;
        }
      }
      return fallback.three.userData.camera;
    }
    return null;
  }

  applyTransformFromInspector(entity) {
    const values = {};
    this.dom.inspectorContent.querySelectorAll("[data-transform]").forEach((input) => {
      values[input.dataset.transform] = safeNumber(input.value, 0);
    });

    entity.three.position.set(values["pos-x"], values["pos-y"], values["pos-z"]);
    if (entity.type !== "terrain") {
      entity.three.rotation.set(
        THREE.MathUtils.degToRad(values["rot-x"]),
        THREE.MathUtils.degToRad(values["rot-y"]),
        THREE.MathUtils.degToRad(values["rot-z"])
      );
    } else {
      entity.three.rotation.set(0, 0, 0);
    }
    if (entity.type !== "terrain" && entity.type !== "light") {
      entity.three.scale.set(values["scl-x"], values["scl-y"], values["scl-z"]);
    } else {
      entity.three.scale.set(1, 1, 1);
    }

    if (this.selection.helper) {
      this.selection.helper.update();
    }

    this.sceneStore.listEntities().forEach((entity) => {
      if (entity.type === "camera" && entity.three.userData.cameraHelper) {
        entity.three.userData.cameraHelper.update();
      }
    });

    if (entity.type === "light") {
      this.sceneStore.updateLightHelpers(entity);
    }
  }

  getSelectedTerrain() {
    if (!this.selection.id) return null;
    const entity = this.sceneStore.getEntity(this.selection.id);
    if (!entity || entity.type !== "terrain" || !entity.terrain?.mesh) return null;
    return entity;
  }

  openTreeGeneratorFromAssetStore() {
    this.setAssetsCollapsed(false);

    let terrain = this.getSelectedTerrain();
    if (!terrain) {
      terrain = this.sceneStore
        .listEntities()
        .find((entity) => entity.type === "terrain" && entity.terrain?.mesh) || null;
      if (terrain) {
        this.selectEntity(terrain.id);
      }
    }

    if (!terrain) {
      alert("Crie um terreno para usar o Gerador de Árvores.");
      return;
    }

    this.terrainTool.mode = "trees";
    this.setTerrainToolEnabled(true);
    this.inspectorPanel.render(terrain);
  }

  openSketchfabBrowser() {
    this.hideSceneSwitcher();
    this.setAssetsCollapsed(false);
    this.setViewportTabActive("assets");
    this.sketchfabBrowser?.open?.();
  }

  setTerrainToolEnabled(enabled) {
    this.terrainTool.enabled = enabled;
    if (enabled) {
      this.transformControls.detach();
      this.ensureTerrainBrushHelper();
    } else if (this.selection.id && !this.isCameraLookMode) {
      const entity = this.sceneStore.getEntity(this.selection.id);
      if (entity) this.transformControls.attach(entity.three);
    }
    if (!enabled && this.terrainBrushHelper) {
      this.terrainBrushHelper.visible = false;
    }
    if (!enabled && this.terrainController) {
      this.terrainController.cancel();
    }
    this.updateCameraModeLabel();
  }

  ensureTerrainBrushHelper() {
    if (this.terrainBrushHelper) return;
    const geometry = new THREE.RingGeometry(0.95, 1.05, 48);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.65,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 10;
    mesh.visible = false;
    mesh.userData.ignoreRaycast = true;
    this.terrainBrushHelper = mesh;
    this.scene.add(mesh);
  }

  updateTerrainBrushPreview(hit) {
    if (!this.terrainBrushHelper) return;
    if (!hit) {
      this.terrainBrushHelper.visible = false;
      return;
    }
    this.terrainBrushHelper.visible = true;
    this.terrainBrushHelper.position.copy(hit.point);
    const normal = hit.face?.normal ? hit.face.normal.clone() : new THREE.Vector3(0, 1, 0);
    normal.transformDirection(hit.object.matrixWorld);
    this.terrainBrushHelper.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    const scale = Math.max(0.1, this.terrainTool.brushSize);
    this.terrainBrushHelper.scale.set(scale, scale, scale);
  }

  handleTerrainPointerDown(event) {
    return this.terrainController.handlePointerDown(event);
  }

  handleTerrainPointerMove(event) {
    this.terrainController.handlePointerMove(event);
  }

  handleTerrainPointerUp(event) {
    this.terrainController.handlePointerUp(event);
  }

  getTerrainHit(event, terrain) {
    const rect = this.dom.sceneCanvas.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.camera);
    const intersects = raycaster.intersectObject(terrain.terrain.mesh, false);
    return intersects[0] || null;
  }

  applyTerrainEdit(worldPoint, terrain) {
    if (this.terrainTool.mode === "sculpt") {
      this.applyTerrainSculpt(worldPoint, terrain);
    } else if (this.terrainTool.mode === "paint") {
      this.applyTerrainPaint(worldPoint, terrain);
    } else if (this.terrainTool.mode === "trees") {
      this.applyTerrainTrees(worldPoint, terrain);
    }

    if (this.selection.helper) {
      this.selection.helper.update();
    }
  }

  applyTerrainSculpt(worldPoint, terrain) {
    sculptTerrain(terrain, worldPoint, this.terrainTool);
  }

  applyTerrainPaint(worldPoint, terrain) {
    paintTerrain(terrain, worldPoint, this.terrainTool);
  }

  applyTerrainTrees(worldPoint, terrain) {
    const mesh = terrain.terrain.mesh;
    const local = mesh.worldToLocal(worldPoint.clone());
    const radius = this.terrainTool.brushSize;
    const density = Math.max(1, Math.round(this.terrainTool.treeDensity));
    const scaleBase = Math.max(0.3, this.terrainTool.treeScale);
    const modelPath = String(this.terrainTool.treeModelPath || "").trim();
    const collidable = this.terrainTool.treeCollision !== false;
    const collisionRadius = getTreeCollisionRadius({ scale: scaleBase });
    const readTreeCoord = (tree, axis) => {
      if (!tree) return NaN;
      const legacyIndex = axis === "x" ? 0 : axis === "y" ? 1 : 2;
      const direct = Number(tree[axis]);
      if (Number.isFinite(direct)) return direct;
      const legacy = Number(tree.position?.[legacyIndex]);
      if (Number.isFinite(legacy)) return legacy;
      return NaN;
    };
    const readTreeModel = (tree) => String(tree?.modelPath || tree?.model || "").trim();

    terrain.terrain.trees = Array.isArray(terrain.terrain.trees) ? terrain.terrain.trees : [];

    if (this.terrainTool.treeOp === "erase") {
      const eraseOnlySelectedModel = modelPath !== "";
      terrain.terrain.trees = terrain.terrain.trees.filter((tree) => {
        if (eraseOnlySelectedModel && readTreeModel(tree) !== modelPath) {
          return true;
        }

        const treeX = readTreeCoord(tree, "x");
        const treeZ = readTreeCoord(tree, "z");
        if (!Number.isFinite(treeX) || !Number.isFinite(treeZ)) {
          // Keep invalid entries untouched to avoid accidental data loss.
          return true;
        }

        const dx = treeX - local.x;
        const dz = treeZ - local.z;
        const treeScale = Math.max(0.2, Number(tree.scale) || 1);
        const eraseRadius = radius + Math.max(0.65, treeScale * 0.9);
        return Math.hypot(dx, dz) > eraseRadius;
      });
      updateTerrainTrees(terrain, this.assetManager);
      return;
    }

    for (let i = 0; i < density; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * radius;
      const x = local.x + Math.cos(angle) * dist;
      const z = local.z + Math.sin(angle) * dist;
      const halfX = terrain.terrain.size / 2;
      const halfZ = (terrain.terrain.sizeZ ?? terrain.terrain.size) / 2;
      if (x < -halfX || x > halfX || z < -halfZ || z > halfZ) continue;
      const y = sampleTerrainHeight(terrain, x, z);
      terrain.terrain.trees.push({
        x,
        y,
        z,
        scale: scaleBase,
        rotation: Math.random() * Math.PI * 2,
        modelPath,
        collidable,
        collisionRadius,
      });
    }
    updateTerrainTrees(terrain, this.assetManager);
  }

  syncInspectorTransform() {
    if (!this.selection.id) return;
    const entity = this.sceneStore.getEntity(this.selection.id);
    if (!entity) return;
    if (entity.type === "light") {
      this.sceneStore.updateLightHelpers(entity);
    }
    this.inspectorPanel.render(entity);
  }

  async refreshAssets() {
    try {
      const assets = await this.assetManager.listAssets();
      this.renderAssetsList(assets);
    } catch (error) {
      this.dom.assetsList.innerHTML =
        '<p class="muted">Falha ao carregar Assets. Verifique se o PHP está rodando (api/list_assets.php).</p>';
    }
  }

  renderAssetsList(assets) {
    this.assetsCache = Array.isArray(assets) ? assets : [];
    if (this.inspectorPanel?.setAssets) {
      this.inspectorPanel.setAssets(this.assetsCache);
    }
    if (this.inspectorPanel?.setSelectedAsset) {
      this.inspectorPanel.setSelectedAsset(this.selectedAsset);
    }
    this.dom.assetsList.innerHTML = "";

    if (!this.assetsCache.length) {
      this.dom.assetsList.innerHTML = '<p class="muted">Nenhum asset importado ainda.</p>';
      return;
    }

    this.assetsCache.forEach((asset) => {
      const item = document.createElement("div");
      item.className = "asset-item";
      if (this.selectedAsset?.path === asset.path) {
        item.classList.add("selected");
      }

      const info = document.createElement("div");
      if (asset.type === "texture") {
        info.innerHTML = `
          <div class="asset-preview">
            <img src="${asset.path}" alt="${asset.name}" />
          </div>
          <div>
            <strong>${asset.name}</strong><br/><span class="muted">${asset.path}</span>
          </div>
        `;
      } else if (asset.type === "audio") {
        info.innerHTML = `
          <div>
            <strong>${asset.name}</strong><br/>
            <span class="muted">Audio</span><br/>
            <span class="muted">${asset.path}</span>
          </div>
        `;
      } else {
        info.innerHTML = `<strong>${asset.name}</strong><br/><span class="muted">${asset.path}</span>`;
      }

      const actions = document.createElement("div");
      actions.className = "asset-actions";
      if (asset.type === "model") {
        const addButton = document.createElement("button");
        addButton.textContent = "Adicionar";
        addButton.addEventListener("click", async () => {
          const entity = await this.sceneStore.createModelFromAsset(asset);
          this.refreshHierarchy();
          this.selectEntity(entity.id);
        });

        const useTreeButton = document.createElement("button");
        useTreeButton.textContent = "Gerador Árvores";
        useTreeButton.addEventListener("click", () => {
          this.terrainTool.treeModelPath = asset.path;
          this.openTreeGeneratorFromAssetStore();
        });

        const previewButton = document.createElement("button");
        previewButton.textContent = "Preview";
        previewButton.addEventListener("click", () => this.openPreview(asset));

        const deleteButton = document.createElement("button");
        deleteButton.textContent = "Excluir";
        deleteButton.className = "danger";
        deleteButton.addEventListener("click", () => this.deleteAsset(asset));

        actions.appendChild(addButton);
        actions.appendChild(useTreeButton);
        actions.appendChild(previewButton);
        actions.appendChild(deleteButton);
      } else if (asset.type === "texture") {
        const selectButton = document.createElement("button");
        selectButton.textContent = "Selecionar";
        selectButton.addEventListener("click", () => {
          this.selectedAsset = asset;
          this.renderAssetsList(this.assetsCache);
        });
        const deleteButton = document.createElement("button");
        deleteButton.textContent = "Excluir";
        deleteButton.className = "danger";
        deleteButton.addEventListener("click", () => this.deleteAsset(asset));
        actions.appendChild(selectButton);
        actions.appendChild(deleteButton);
      } else if (asset.type === "audio") {
        const previewButton = document.createElement("button");
        previewButton.textContent = this.assetPreviewAudioPath === asset.path ? "Parar" : "Tocar";
        previewButton.addEventListener("click", async () => {
          await this.previewAudioAsset(asset);
          this.renderAssetsList(this.assetsCache);
        });

        const deleteButton = document.createElement("button");
        deleteButton.textContent = "Excluir";
        deleteButton.className = "danger";
        deleteButton.addEventListener("click", () => this.deleteAsset(asset));

        actions.appendChild(previewButton);
        actions.appendChild(deleteButton);
      }
      item.appendChild(info);
      item.appendChild(actions);
      item.addEventListener("click", (event) => {
        if (event.target.tagName === "BUTTON") return;
        this.selectedAsset = asset;
        this.renderAssetsList(this.assetsCache);
      });
      this.dom.assetsList.appendChild(item);
    });
  }

  mergeAssetsFromPaths(paths = [], type = "texture") {
    if (!Array.isArray(paths) || !paths.length) return;
    const existing = new Map(this.assetsCache.map((asset) => [asset.path, asset]));
    paths.forEach((path) => {
      if (existing.has(path)) return;
      const filename = path.split("/").pop() || path;
      const parts = filename.split(".");
      const ext = parts.length > 1 ? parts.pop().toLowerCase() : "";
      const name = parts.join(".") || filename;
      existing.set(path, { name, path, type, ext });
    });
    this.renderAssetsList(Array.from(existing.values()));
  }

  invalidateImportedAssets(paths = []) {
    if (!Array.isArray(paths)) return;
    paths.forEach((path) => this.assetManager.invalidateAsset(path));
  }

  async deleteAsset(asset) {
    if (!asset?.path) return;
    const confirmDelete = window.confirm(`Excluir asset?\n\n${asset.path}`);
    if (!confirmDelete) return;

    try {
      if (asset.type === "audio" && this.assetPreviewAudioPath === asset.path) {
        this.stopAssetAudioPreview();
      }
      const linkedModels = this.sceneStore
        .listEntities()
        .filter((entity) => entity.type === "model" && entity.source?.path === asset.path);

      await this.assetManager.deleteAsset(asset.path);

      if (linkedModels.length) {
        linkedModels.forEach((entity) => this.sceneStore.removeEntity(entity.id));
        if (linkedModels.some((entity) => entity.id === this.selection.id)) {
          this.selectEntity(null);
        }
      }

      if (this.selectedAsset?.path === asset.path) {
        this.selectedAsset = null;
      }

      await this.refreshAssets();
      this.refreshHierarchy();
    } catch (error) {
      console.error(error);
      alert(error?.message || "Falha ao excluir asset.");
    }
  }

  populateSceneSelect(selectEl, scenes, emptyLabel = "(Sem cenas)") {
    if (!selectEl) return;
    selectEl.innerHTML = "";

    if (!Array.isArray(scenes) || !scenes.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = emptyLabel;
      selectEl.appendChild(option);
      selectEl.value = "";
      return;
    }

    scenes.forEach((scene) => {
      const option = document.createElement("option");
      option.value = scene;
      option.textContent = scene;
      selectEl.appendChild(option);
    });
  }

  setSceneSelectorsValue(name) {
    const sceneName = String(name || "").trim();
    const selectors = [this.dom.sceneList, this.dom.projectSceneList, this.dom.sceneSwitcherList];
    selectors.forEach((selectEl) => {
      if (!selectEl || !sceneName) return;
      const hasOption = Array.from(selectEl.options).some((option) => option.value === sceneName);
      if (hasOption) {
        selectEl.value = sceneName;
      }
    });
  }

  getPreferredSceneName() {
    const candidates = [
      this.dom.sceneName?.value,
      this.sceneStore.currentSceneName,
      this.dom.sceneList?.value,
      this.dom.projectSceneList?.value,
      this.dom.sceneSwitcherList?.value,
    ];
    for (const candidate of candidates) {
      const normalized = sanitizeName(candidate || "", "");
      if (normalized) return normalized;
    }
    return "";
  }

  getRememberedSceneName() {
    try {
      return sanitizeName(localStorage.getItem(this.lastSceneStorageKey) || "", "");
    } catch (error) {
      return "";
    }
  }

  rememberSceneName(name) {
    const normalized = sanitizeName(name || "", "");
    try {
      if (!normalized) {
        localStorage.removeItem(this.lastSceneStorageKey);
        return;
      }
      localStorage.setItem(this.lastSceneStorageKey, normalized);
    } catch (error) {
      // Ignore storage errors.
    }
  }

  async refreshSceneList() {
    try {
      const response = await fetch("api/list_scenes.php");
      if (!response.ok) throw new Error("Falha ao listar cenas");
      const data = await response.json();
      const scenes = Array.isArray(data.scenes) ? data.scenes : [];
      this.sceneNames = scenes;

      this.populateSceneSelect(this.dom.sceneList, scenes);
      this.populateSceneSelect(this.dom.projectSceneList, scenes);
      this.populateSceneSelect(this.dom.sceneSwitcherList, scenes);

      if (!scenes.length) {
        this.sceneNames = [];
        this.rememberSceneName("");

        if (!this.initialSceneLoaded) {
          this.createBaseScene();
          this.initialSceneLoaded = true;
        }
        return;
      }

      const remembered = this.getRememberedSceneName();
      const preferred = this.getPreferredSceneName();
      if (preferred && scenes.includes(preferred)) {
        this.setSceneSelectorsValue(preferred);
      }

      if (!this.initialSceneLoaded) {
        const startupCandidates = [remembered, preferred, "base_game", "example", scenes[0]];
        const startupScene = startupCandidates.find((candidate) => candidate && scenes.includes(candidate));

        if (!startupScene) {
          this.createBaseScene();
          this.initialSceneLoaded = true;
          return;
        }

        this.setSceneSelectorsValue(startupScene);
        const loaded = await this.loadScene(startupScene);
        if (!loaded) {
          this.createBaseScene();
        }
        this.initialSceneLoaded = true;
        return;
      }

      const current = sanitizeName(this.sceneStore.currentSceneName || "", "");
      if (current && scenes.includes(current)) {
        this.setSceneSelectorsValue(current);
      } else if (preferred && scenes.includes(preferred)) {
        this.setSceneSelectorsValue(preferred);
      } else {
        this.setSceneSelectorsValue(scenes[0]);
      }
    } catch (error) {
      this.dom.sceneList.innerHTML = "";
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "(Erro ao listar cenas)";
      this.dom.sceneList.appendChild(option);
      this.populateSceneSelect(this.dom.projectSceneList, [], "(Erro ao listar cenas)");
      this.populateSceneSelect(this.dom.sceneSwitcherList, [], "(Erro ao listar cenas)");
      this.sceneNames = [];

      if (!this.initialSceneLoaded) {
        this.createBaseScene();
        this.initialSceneLoaded = true;
      }
    }
  }

  createBaseScene() {
    this.sceneStore.clear();
    this.sceneStore.createTerrain("Terreno");
    this.createDefaultLights();

    const player = this.sceneStore.createPrimitive("cube", "Player");
    player.three.position.set(0, 0.5, 0);
    this.scriptSystem.addComponent(player, "PlayerMovement");

    const cameraEntity = this.sceneStore.createCamera("Camera Principal");
    cameraEntity.three.position.set(0, 2, 5);
    cameraEntity.three.rotation.set(THREE.MathUtils.degToRad(-10), 0, 0);
    this.gameCameraId = cameraEntity.id;

    this.sceneStore.currentSceneName = "base_game";
    this.dom.sceneName.value = "base_game";
    this.refreshHierarchy();
    this.selectEntity(null);
    this.refreshGameCameraSelect();
  }

  createFpsPlayer() {
    const player = this.sceneStore.createPrimitive("cube", "Player FPS");
    player.three.position.set(0, 0.5, 0);
    const component = this.scriptSystem.addComponent(player, "FPSController");

    if (component?.props?.cameraId) {
      this.gameCameraId = component.props.cameraId;
    }

    this.refreshHierarchy();
    this.refreshGameCameraSelect();
    this.selectEntity(player.id);
  }

  createRegionSpawner() {
    const entity = this.sceneStore.createSpawnVolume("Spawn Volume");
    entity.three.position.set(0, 1, 0);
    const component = {
      id: crypto.randomUUID(),
      type: "RegionSpawner",
      enabled: true,
      props: { ...RegionSpawner.defaults },
    };
    entity.components.push(component);
    this.scriptSystem.rebuildComponents(entity);
    this.refreshHierarchy();
    this.selectEntity(entity.id);
  }

  async newScene() {
    this.sceneStore.clear();
    this.sceneStore.createTerrain("Terreno");
    this.createDefaultLights();
    this.sceneStore.currentSceneName = "";
    this.dom.sceneName.value = "";
    this.selectionLabel(null);
    this.selectEntity(null);
    this.refreshHierarchy();
  }

  nextProjectSceneName() {
    const taken = new Set(this.sceneNames || []);
    if (!taken.has("nova_scene")) return "nova_scene";
    let index = 1;
    while (index < 10000) {
      const candidate = `scene_${String(index).padStart(2, "0")}`;
      if (!taken.has(candidate)) return candidate;
      index += 1;
    }
    return `scene_${Date.now()}`;
  }

  async createProjectScene() {
    await this.newScene();
    const name = this.nextProjectSceneName();
    this.sceneStore.currentSceneName = name;
    this.dom.sceneName.value = name;
    try {
      await this.saveScene();
      this.setSceneSelectorsValue(name);
    } catch (error) {
      console.error(error);
      alert(error?.message || "Falha ao criar a nova cena no projeto.");
    }
  }

  async openProjectScene() {
    const name = String(this.dom.projectSceneList?.value || "").trim();
    if (!name) {
      alert("Selecione uma cena no Projeto.");
      return;
    }
    const loaded = await this.loadScene(name);
    if (!loaded) {
      alert("Falha ao abrir a cena selecionada.");
    }
  }

  async deleteProjectScene(nameOverride = null) {
    const targetName = sanitizeName(
      nameOverride ||
      this.dom.projectSceneList?.value ||
      this.dom.sceneSwitcherList?.value ||
      this.dom.sceneList?.value ||
      this.sceneStore.currentSceneName ||
      "",
      ""
    );

    if (!targetName) {
      alert("Selecione uma cena para excluir.");
      return false;
    }

    const confirmed = window.confirm(`Excluir cena?\n\n${targetName}\n\nEssa ação não pode ser desfeita.`);
    if (!confirmed) return false;

    const currentSceneName = sanitizeName(
      this.sceneStore.currentSceneName || this.dom.sceneName?.value || this.dom.sceneList?.value || "",
      ""
    );
    const wasCurrentScene = currentSceneName === targetName;

    const response = await fetch("api/delete_scene.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: targetName }),
    });

    if (!response.ok) {
      let message = `Falha ao excluir cena (${response.status})`;
      try {
        const data = await response.json();
        if (data?.error) message = data.error;
      } catch (error) {
        // no-op
      }
      alert(message);
      return false;
    }

    await this.refreshSceneList();

    if (wasCurrentScene) {
      const fallbackName = this.sceneNames.includes("base_game") ? "base_game" : this.sceneNames[0] || "";
      if (fallbackName) {
        const loaded = await this.loadScene(fallbackName);
        if (!loaded) {
          await this.newScene();
        }
      } else {
        await this.newScene();
      }
      return true;
    }

    if (currentSceneName && this.sceneNames.includes(currentSceneName)) {
      this.setSceneSelectorsValue(currentSceneName);
    } else if (this.sceneNames.length) {
      this.setSceneSelectorsValue(this.sceneNames[0]);
    }
    return true;
  }

  async saveScene() {
    const name = sanitizeName(this.dom.sceneName.value || this.sceneStore.currentSceneName || "Cena");
    if (!name) return;
    this.sceneStore.currentSceneName = name;
    this.dom.sceneName.value = name;
    const payload = this.sceneStore.serialize();
    payload.gameCameraId = this.gameCameraId || null;

    const response = await fetch("api/save_scene.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, scene: payload }),
    });
    if (!response.ok) {
      let message = `Falha ao salvar cena (${response.status})`;
      try {
        const data = await response.json();
        if (data?.error) message = data.error;
      } catch (error) {
        // no-op
      }
      throw new Error(message);
    }

    await this.refreshSceneList();
    this.rememberSceneName(name);
  }

  async exportGame() {
    const button = this.dom.btnExportGame;
    const previousLabel = button?.textContent || "Exportar";
    if (button) {
      button.disabled = true;
      button.textContent = "Exportando...";
    }

    try {
      await this.saveScene();
      const sceneName = sanitizeName(this.dom.sceneName.value || this.sceneStore.currentSceneName || "");
      if (!sceneName) {
        throw new Error("Salve a cena antes de exportar.");
      }

      const response = await fetch("api/export_game.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene: sceneName }),
      });

      if (!response.ok) {
        let message = `Falha ao exportar jogo (${response.status})`;
        try {
          const data = await response.json();
          if (data?.error) message = data.error;
        } catch (error) {
          // no-op
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename=\"?([^\";]+)\"?/i);
      const filename = match?.[1] || `game_export_${sceneName}.zip`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      alert(`Export concluido: ${filename}`);
    } catch (error) {
      console.error(error);
      alert(error?.message || "Falha ao exportar jogo.");
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = previousLabel;
      }
    }
  }

  async loadScene(nameOverride = null) {
    const name =
      nameOverride || String(this.dom.sceneList?.value || "").trim() || String(this.dom.projectSceneList?.value || "");
    if (!name) return false;
    const url = `api/load_scene.php?name=${encodeURIComponent(name)}&t=${Date.now()}`;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return false;
    const data = await response.json();

    await this.sceneStore.loadFromData(data);
    this.sceneStore.currentSceneName = name;
    this.dom.sceneName.value = name;
    this.setSceneSelectorsValue(name);
    this.rememberSceneName(name);
    this.gameCameraId = data.gameCameraId || null;
    this.refreshHierarchy();
    this.selectEntity(null);
    this.refreshGameCameraSelect();
    return true;
  }

  setPreviewStatus(message = "", visible = false) {
    if (!this.dom.previewStatus) return;
    this.dom.previewStatus.textContent = message || "";
    this.dom.previewStatus.classList.toggle("visible", !!visible);
  }

  bindAudioUnlock() {
    this.audioUnlockTargets.forEach((target) => {
      target?.addEventListener?.("pointerdown", this.onUserGestureResumeAudio, { passive: true });
      target?.addEventListener?.("keydown", this.onUserGestureResumeAudio);
    });
  }

  unbindAudioUnlock() {
    this.audioUnlockTargets.forEach((target) => {
      target?.removeEventListener?.("pointerdown", this.onUserGestureResumeAudio);
      target?.removeEventListener?.("keydown", this.onUserGestureResumeAudio);
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

  stopAssetAudioPreview() {
    if (this.assetPreviewAudio) {
      this.assetPreviewAudio.pause();
      this.assetPreviewAudio.currentTime = 0;
    }
    this.assetPreviewAudio = null;
    this.assetPreviewAudioPath = "";
  }

  async previewAudioAsset(asset) {
    if (!asset?.path) return;
    if (this.assetPreviewAudioPath === asset.path) {
      this.stopAssetAudioPreview();
      return;
    }

    this.stopAssetAudioPreview();
    await this.resumeAudioContext();

    const previewAudio = new Audio(this.assetManager.resolveAssetUrl(asset.path));
    previewAudio.preload = "auto";
    previewAudio.volume = 0.9;
    previewAudio.addEventListener("ended", () => {
      if (this.assetPreviewAudio === previewAudio) {
        this.stopAssetAudioPreview();
      }
    });

    this.assetPreviewAudio = previewAudio;
    this.assetPreviewAudioPath = asset.path;

    try {
      await previewAudio.play();
    } catch (error) {
      this.stopAssetAudioPreview();
      alert("Falha ao reproduzir o audio do asset.");
    }
  }

  clearPreviewObject() {
    if (this.previewMixer) {
      this.previewMixer.stopAllAction();
      this.previewMixer = null;
    }
    if (this.previewObject?.parent) {
      this.previewObject.parent.remove(this.previewObject);
    }
    this.previewObject = null;
  }

  syncPreviewCanvasSize() {
    if (!this.previewRenderer || !this.previewCamera) return;
    const rect = this.dom.previewCanvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (width === this.previewCanvasSize.width && height === this.previewCanvasSize.height) {
      return;
    }
    this.previewCanvasSize.width = width;
    this.previewCanvasSize.height = height;
    this.previewRenderer.setSize(width, height, false);
    this.previewCamera.aspect = width / height;
    this.previewCamera.updateProjectionMatrix();
  }

  async openPreview(asset) {
    if (asset?.type === "audio") {
      await this.previewAudioAsset(asset);
      return;
    }
    this.dom.previewModal.classList.remove("hidden");
    this.dom.previewTitle.textContent = `Preview: ${asset.name}`;
    this.setPreviewStatus("Carregando preview...", true);

    try {
      if (!this.previewRenderer) {
        this.previewRenderer = new THREE.WebGLRenderer({
          canvas: this.dom.previewCanvas,
          antialias: true,
        });
        this.previewRenderer.setPixelRatio(window.devicePixelRatio || 1);
        this.previewRenderer.outputColorSpace = THREE.SRGBColorSpace;
        this.previewRenderer.shadowMap.enabled = true;
        this.previewRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.previewRenderer.setClearColor(0x181a1d, 1);
        this.previewScene = new THREE.Scene();
        this.previewScene.background = new THREE.Color(0x181a1d);
        this.previewCamera = new THREE.PerspectiveCamera(50, 1, 0.01, 200);
        this.previewCamera.position.set(2, 1.8, 3);
        this.previewControls = new OrbitControls(this.previewCamera, this.dom.previewCanvas);
        this.previewControls.enableDamping = true;
        this.previewControls.enablePan = false;
        this.previewControls.target.set(0, 0.7, 0);
        this.previewScene.add(new THREE.HemisphereLight(0xffffff, 0x45515d, 1.4));
        const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
        keyLight.position.set(4, 6, 3);
        keyLight.castShadow = true;
        this.previewScene.add(keyLight);
        const rimLight = new THREE.DirectionalLight(0xbfd8ff, 0.45);
        rimLight.position.set(-3, 4, -4);
        this.previewScene.add(rimLight);
      }

      this.clearPreviewObject();
      this.syncPreviewCanvasSize();

      const gltf = await this.assetManager.loadGLTF(asset.path);
      const sourceScene = gltf?.scene || gltf?.scenes?.[0];
      if (!sourceScene) {
        throw new Error("Modelo sem cena carregavel para preview.");
      }

      const cloned = cloneSkeleton(sourceScene);
      cloned.traverse((child) => {
        if (!child?.isMesh) return;
        child.castShadow = true;
        child.receiveShadow = true;
      });
      this.previewObject = cloned;
      this.previewScene.add(cloned);
      cloned.updateMatrixWorld(true);

      const box = new THREE.Box3().setFromObject(cloned);
      if (box.isEmpty()) {
        throw new Error("Modelo sem geometria visivel para preview.");
      }

      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);
      cloned.position.sub(center);
      cloned.updateMatrixWorld(true);

      const maxDim = Math.max(size.x, size.y, size.z, 0.75);
      const radius = Math.max(maxDim * 0.8, 0.75);
      const fitDistance = radius / Math.tan(THREE.MathUtils.degToRad(this.previewCamera.fov * 0.5));
      this.previewControls.target.set(0, Math.max(0.15, size.y * 0.15), 0);
      this.previewCamera.near = Math.max(0.01, fitDistance / 100);
      this.previewCamera.far = Math.max(50, fitDistance * 12);
      this.previewCamera.position.set(
        fitDistance * 0.9,
        Math.max(radius * 0.65, size.y * 0.4),
        fitDistance * 1.1
      );
      this.previewCamera.lookAt(this.previewControls.target);
      this.previewCamera.updateProjectionMatrix();
      this.previewControls.update();

      if (gltf.animations?.length) {
        this.previewMixer = new THREE.AnimationMixer(cloned);
        this.previewMixer.clipAction(gltf.animations[0]).play();
      }

      this.previewRenderer.render(this.previewScene, this.previewCamera);
      this.setPreviewStatus("", false);
    } catch (error) {
      this.clearPreviewObject();
      console.error("[EditorPreview] Falha ao abrir preview:", error);
      this.setPreviewStatus(error?.message || "Falha ao carregar preview do asset.", true);
    }
  }

  closePreview() {
    this.dom.previewModal.classList.add("hidden");
    this.setPreviewStatus("", false);
  }

  async openGamePreview() {
    const name = sanitizeName(this.dom.sceneName.value || this.sceneStore.currentSceneName || "");
    if (!name) {
      alert("Salve a cena antes de abrir o Game.");
      return;
    }
    try {
      await this.saveScene();
    } catch (error) {
      console.error(error);
      alert(error?.message || "Falha ao salvar cena antes do preview.");
      return;
    }

    const previewBootConfig = {
      source: "editor-preview",
      timestamp: Date.now(),
      scene: name,
      view: "game",
      visual: "editor",
      menu: "start",
      mainSceneName: "hunter",
      camPos: this.camera.position.toArray().map((value) => Number(value)),
      camTarget: this.orbit.target.toArray().map((value) => Number(value)),
    };

    try {
      window.__GAME_PREVIEW_BOOT_CONFIG__ = previewBootConfig;
      localStorage.setItem("gamePreviewBootConfig", JSON.stringify(previewBootConfig));
    } catch (error) {
      console.warn("Falha ao persistir boot config do preview:", error);
    }

    const previewUrl = new URL("game.php", window.location.href);
    window.open(previewUrl.toString(), "_blank");
  }

  closeGamePreview() {
    // modal não é mais usado
  }

  toggleAssetsPanel() {
    const isCollapsed = this.dom.assetsPanel.classList.contains("collapsed");
    this.setAssetsCollapsed(!isCollapsed);
  }

  setAssetsCollapsed(collapsed) {
    this.assetsCollapsed = collapsed;
    this.dom.assetsPanel.classList.toggle("collapsed", collapsed);
    document.getElementById("app").classList.toggle("assets-collapsed", collapsed);
    this.dom.btnToggleAssets.textContent = collapsed ? "Expandir" : "Minimizar";
    const assetsRestore = document.getElementById("btn-assets-restore");
    if (assetsRestore) {
      assetsRestore.style.display = collapsed ? "inline-flex" : "none";
    }
    if (this.dom.btnToggleProject) {
      this.dom.btnToggleProject.classList.toggle("active", !collapsed);
    }
    if (this.dom.menuAssets) {
      this.dom.menuAssets.classList.toggle("active", !collapsed);
    }
    localStorage.setItem("assetsCollapsed", String(collapsed));
    this.updateBottomPanels();
  }

  setConsoleCollapsed(collapsed) {
    this.consoleCollapsed = collapsed;
    const appRoot = document.getElementById("app");
    if (appRoot) {
      appRoot.classList.toggle("console-collapsed", collapsed);
    }
    if (this.dom.btnConsoleToggle) {
      this.dom.btnConsoleToggle.textContent = collapsed ? "Maximizar" : "Minimizar";
    }
    if (this.dom.btnToggleConsole) {
      this.dom.btnToggleConsole.classList.toggle("active", !collapsed);
    }
    localStorage.setItem("consoleCollapsed", String(collapsed));
    this.updateBottomPanels();
  }

  updateBottomPanels() {
    const appRoot = document.getElementById("app");
    if (!appRoot) return;
    const bottomOpen = !this.assetsCollapsed || !this.consoleCollapsed;
    appRoot.classList.toggle("bottom-open", bottomOpen);
    this.resize();
  }

  scheduleInitialDataRefresh() {
    const run = () => {
      if (this.isDisposed) return;
      this.refreshAssets();
      this.refreshSceneList();
    };

    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, { timeout: 600 });
    } else {
      setTimeout(run, 0);
    }
  }

  startAnimationLoop() {
    if (this.isDisposed || this.isLoopRunning) return;
    this.isLoopRunning = true;
    this.lastTime = performance.now();
    this.animate();
  }

  stopAnimationLoop() {
    this.isLoopRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  handleVisibilityChange() {
    if (document.hidden) {
      this.stopAnimationLoop();
      return;
    }
    this.lastTime = performance.now();
    this.startAnimationLoop();
    this.resize();
  }

  handlePageHide() {
    this.stopAnimationLoop();
  }

  handlePageShow() {
    if (this.isDisposed || document.hidden) return;
    this.lastTime = performance.now();
    this.startAnimationLoop();
    this.resize();
  }

  resumeFromNavigation() {
    this.handlePageShow();
  }

  destroy() {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.stopAssetAudioPreview();
    this.unbindAudioUnlock();
    this.stopAnimationLoop();
    window.removeEventListener("pointermove", this.onPanelResizePointerMove);
    window.removeEventListener("pointerup", this.onPanelResizePointerUp);
    window.removeEventListener("pointermove", this.onPanelStackResizePointerMove);
    window.removeEventListener("pointerup", this.onPanelStackResizePointerUp);
    document.body.classList.remove("is-resizing-panels");
    document.body.classList.remove("is-resizing-panels-vertical");
    window.removeEventListener("resize", this.onWindowResize);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    window.removeEventListener("pagehide", this.onPageHide);
    window.removeEventListener("pageshow", this.onPageShow);
  }

  animate() {
    if (this.isDisposed || !this.isLoopRunning) return;
    this.animationFrameId = requestAnimationFrame(() => this.animate());
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;
    if (!Number.isFinite(dt) || dt <= 0) return;

    if (this.selection.helper) {
      this.selection.helper.update();
    }

    if (this.isPlaying) {
      this.scriptSystem.update(dt);
    }

    this.animator.update(dt);
    if (now - this.lastRuntimeHelpersUpdate >= 120) {
      this.lastRuntimeHelpersUpdate = now;
      this.sceneStore.updateRuntimeHelpers();
    }

    if (
      this.previewRenderer &&
      this.previewScene &&
      this.previewCamera &&
      !this.dom.previewModal.classList.contains("hidden")
    ) {
      this.previewControls?.update();
      if (this.previewMixer) {
        this.previewMixer.update(dt);
      }
      this.syncPreviewCanvasSize();
      this.previewRenderer.render(this.previewScene, this.previewCamera);
    }

    this.renderGameView();

    this.viewport.update();
  }

  createDefaultLights() {
    const sun = this.sceneStore.createLight("directional", "Sun Light");
    sun.three.position.set(10, 16, 10);
    this.sceneStore.updateLight(sun, {
      target: [0, 0, 0],
      intensity: 1.2,
      castShadow: true,
      shadow: {
        mapSize: 2048,
        bias: -0.0005,
        near: 0.5,
        far: 180,
        left: -60,
        right: 60,
        top: 60,
        bottom: -60,
      },
    });

    this.sceneStore.createLight("hemisphere", "Sky Fill", null, {
      intensity: 0.45,
      skyColor: "#d9efff",
      groundColor: "#4a5158",
      enabled: true,
    });
  }

  resize() {
    this.viewport.resize();
    if (!this.panelResizeState) {
      this.normalizePanelWidths();
    }
    if (!this.panelStackResizeState) {
      this.normalizePanelHeights();
    }
    this.updatePanelResizers();
  }

  renderGameView() {
    // game preview agora abre em outra pagina
  }
}
