import * as THREE from "three";
import { safeNumber } from "../../utils/utils.js";
import { getTreeCollisionRadius } from "../../utils/treeCollisions.js";
import * as TerrainSystem from "../../engine/TerrainSystem.js?v=20260413a";

export class InspectorPanel {
  constructor({
    container,
    sceneStore,
    scriptSystem,
    registry,
    animator,
    terrainTool,
    getGameCameraId,
    onSetGameCamera,
    onApplyTransform,
    onSetTerrainToolEnabled,
    onUploadTexture,
    onRefreshHierarchy,
  }) {
    this.container = container;
    this.sceneStore = sceneStore;
    this.scriptSystem = scriptSystem;
    this.registry = registry;
    this.animator = animator;
    this.terrainTool = terrainTool;
    this.getGameCameraId = getGameCameraId;
    this.onSetGameCamera = onSetGameCamera;
    this.onApplyTransform = onApplyTransform;
    this.onSetTerrainToolEnabled = onSetTerrainToolEnabled;
    this.onUploadTexture = onUploadTexture;
    this.onRefreshHierarchy = onRefreshHierarchy;
    this.assets = [];
    this.currentEntity = null;
    this.selectedTexture = null;
  }

  renderEmptyState() {
    this.container.innerHTML = `
      <div class="empty-state inspector-empty">
        <span class="empty-state-kicker">Inspector</span>
        <h3>Nada selecionado</h3>
        <p>Selecione um objeto na Hierarchy para editar transform, componentes, luzes, IA e propriedades do mapa.</p>
        <div class="empty-state-chip-row">
          <span class="empty-state-chip">W mover</span>
          <span class="empty-state-chip">E rotacionar</span>
          <span class="empty-state-chip">R escalar</span>
          <span class="empty-state-chip">F focar</span>
        </div>
      </div>
    `;
  }

  setAssets(assets) {
    this.assets = Array.isArray(assets) ? assets : [];
    if (this.currentEntity) {
      this.render(this.currentEntity);
    }
  }

  setSelectedAsset(asset) {
    if (asset && asset.type === "texture") {
      this.selectedTexture = asset;
    } else {
      this.selectedTexture = null;
    }
    if (this.currentEntity?.type === "terrain") {
      this.render(this.currentEntity);
    }
  }

  getMeshNodes(entity) {
    if (!entity?.three) return [];
    const meshes = [];
    entity.three.traverse((child) => {
      if (child?.isMesh) {
        meshes.push(child);
      }
    });
    return meshes;
  }

  getMeshShadowState(entity) {
    const meshes = this.getMeshNodes(entity);
    if (!meshes.length) {
      return { hasMeshes: false, castShadow: false, receiveShadow: false };
    }
    return {
      hasMeshes: true,
      castShadow: meshes.some((mesh) => !!mesh.castShadow),
      receiveShadow: meshes.some((mesh) => !!mesh.receiveShadow),
    };
  }

  render(entity) {
    this.currentEntity = entity;
    if (!entity) {
      this.renderEmptyState();
      return;
    }

    const transform = entity.three;
    const rotation = transform.rotation;
    const disableScale = entity.type === "terrain" || entity.type === "light" ? "disabled" : "";
    const disableRotation = entity.type === "terrain" || entity.type === "light" ? "disabled" : "";

    this.container.innerHTML = `
      <div class="section">
        <div class="field-row">
          <span>Nome</span>
          <input id="insp-name" type="text" value="${entity.name}" />
        </div>
        <div class="field-row">
          <span>Ativo</span>
          <input id="insp-active" type="checkbox" ${entity.active ? "checked" : ""} />
        </div>
      </div>

      <div class="section">
        <h3>Transform</h3>
        <div class="field-row">
          <span>Posição</span>
          <div class="vec3">
            <input data-transform="pos-x" type="number" step="0.1" value="${transform.position.x.toFixed(3)}" />
            <input data-transform="pos-y" type="number" step="0.1" value="${transform.position.y.toFixed(3)}" />
            <input data-transform="pos-z" type="number" step="0.1" value="${transform.position.z.toFixed(3)}" />
          </div>
        </div>
        <div class="field-row">
          <span>Rotação</span>
          <div class="vec3">
            <input data-transform="rot-x" type="number" step="1" value="${THREE.MathUtils.radToDeg(rotation.x).toFixed(1)}" ${disableRotation} />
            <input data-transform="rot-y" type="number" step="1" value="${THREE.MathUtils.radToDeg(rotation.y).toFixed(1)}" ${disableRotation} />
            <input data-transform="rot-z" type="number" step="1" value="${THREE.MathUtils.radToDeg(rotation.z).toFixed(1)}" ${disableRotation} />
          </div>
        </div>
        <div class="field-row">
          <span>Escala</span>
          <div class="vec3">
            <input data-transform="scl-x" type="number" step="0.1" value="${transform.scale.x.toFixed(3)}" ${disableScale} />
            <input data-transform="scl-y" type="number" step="0.1" value="${transform.scale.y.toFixed(3)}" ${disableScale} />
            <input data-transform="scl-z" type="number" step="0.1" value="${transform.scale.z.toFixed(3)}" ${disableScale} />
          </div>
        </div>
      </div>
    `;

    if (entity.type !== "light") {
      const meshShadowState = this.getMeshShadowState(entity);
      if (meshShadowState.hasMeshes) {
        this.container.insertAdjacentHTML("beforeend", this.renderMeshShadowSection(meshShadowState));
      }
    }

    if (entity.type === "model") {
      this.container.insertAdjacentHTML("beforeend", this.renderAnimationControls(entity));
    }

    if (entity.type === "camera") {
      const gameCameraId = this.getGameCameraId ? this.getGameCameraId() : null;
      const isGameCamera = entity.id === gameCameraId;
      this.container.insertAdjacentHTML(
        "beforeend",
        `
        <div class="section">
          <h3>Game Camera</h3>
          <div class="field-row">
            <span>Status</span>
            <span class="muted">${isGameCamera ? "Ativa" : "Inativa"}</span>
          </div>
          <button id="set-game-camera">Definir como Game Camera</button>
        </div>
      `
      );
    }

    if (entity.type === "light") {
      this.container.insertAdjacentHTML("beforeend", this.renderLightSection(entity));
    }

    if (entity.type === "terrain") {
      this.container.insertAdjacentHTML("beforeend", this.renderTerrainSection(entity));
    }

    if (entity.type === "spawn_volume") {
      this.container.insertAdjacentHTML("beforeend", this.renderSpawnVolumeSection());
    }

    this.container.insertAdjacentHTML("beforeend", this.renderComponentsSection(entity));
    this.bindInspectorEvents(entity);
  }

  renderMeshShadowSection(state) {
    return `
      <div class="section">
        <h3>Mesh Shadows</h3>
        <div class="field-row">
          <span>Cast Shadow</span>
          <input id="mesh-cast-shadow" type="checkbox" ${state.castShadow ? "checked" : ""} />
        </div>
        <div class="field-row">
          <span>Receive Shadow</span>
          <input id="mesh-receive-shadow" type="checkbox" ${state.receiveShadow ? "checked" : ""} />
        </div>
      </div>
    `;
  }

  renderSpawnVolumeSection() {
    return `
      <div class="section">
        <h3>Spawn Volume</h3>
        <p class="muted">Escala define a area da regiao. O componente Region Spawner escolhe o animal e gera os spawns no jogo.</p>
      </div>
    `;
  }

  renderTerrainSection(entity) {
    const terrain = entity.terrain || {};
    const size = terrain.size ?? 20;
    const sizeZ = terrain.sizeZ ?? size;
    const segments = terrain.segments ?? 64;
    const textureScale = terrain.textureScale ?? Math.max(1, Math.max(size, sizeZ) / 4);
    const maxHeight = terrain.maxHeight ?? 6;
    const layers = Array.isArray(terrain.layers) ? terrain.layers : [];
    const paintLayerIndex = Math.max(
      0,
      Math.min(layers.length - 1, this.terrainTool.paintLayerIndex ?? 0)
    );
    const activeTool =
      this.terrainTool.mode === "paint"
        ? "paint"
        : this.terrainTool.mode === "trees"
          ? "trees"
          : this.terrainTool.sculptOp;
    const brushValue = Number(this.terrainTool.brushSize ?? 1.8);
    const strengthValue = Number(this.terrainTool.strength ?? 0.35);
    const flattenLimit = Math.max(1, Number(terrain.maxHeight ?? maxHeight ?? 6));
    const flattenValue = Number(this.terrainTool.flattenHeight ?? 0);
    const falloffValue = Number(this.terrainTool.falloff ?? 0.5);
    const densityValue = Number(this.terrainTool.treeDensity ?? 4);
    const treeScaleValue = Number(this.terrainTool.treeScale ?? 1);
    const treeCollisionValue = this.terrainTool.treeCollision !== false;

    const textureAssets = this.assets.filter((asset) => asset.type === "texture");
    const modelAssets = this.assets.filter((asset) => asset.type === "model");
    const selectedTexturePath = this.selectedTexture?.path || "";
    const selectedTreeModelPath = String(this.terrainTool.treeModelPath || "").trim();
    const textureOptions = textureAssets
      .map((asset) => {
        const selected = asset.path === selectedTexturePath ? "selected" : "";
        return `<option value="${asset.path}" ${selected}>${asset.name}</option>`;
      })
      .join("");
    const treeModelOptions = [];
    treeModelOptions.push('<option value="">Procedural (padrão)</option>');
    if (selectedTreeModelPath && !modelAssets.some((asset) => asset.path === selectedTreeModelPath)) {
      treeModelOptions.push(
        `<option value="${selectedTreeModelPath}" selected>${selectedTreeModelPath}</option>`
      );
    }
    modelAssets.forEach((asset) => {
      const selected = asset.path === selectedTreeModelPath ? "selected" : "";
      treeModelOptions.push(`<option value="${asset.path}" ${selected}>${asset.name}</option>`);
    });

    const layerRows = layers
      .map((layer, index) => {
        const isActive = index === paintLayerIndex;
        const preview = layer.path
          ? `<div class="layer-swatch" style="background-image:url('${layer.path}')"></div>`
          : `<div class="layer-swatch builtin" data-kind="${layer.key || "base"}"></div>`;
        return `
          <div class="terrain-layer-row" data-layer-index="${index}">
            <label class="layer-select">
              <input type="radio" name="terrain-layer-active" ${isActive ? "checked" : ""} />
              ${preview}
              <span class="layer-name">${layer.name}</span>
            </label>
            <input class="layer-scale" type="number" step="0.1" value="${Number(layer.scale ?? textureScale).toFixed(2)}" />
            <button class="ghost" data-layer-remove>Remover</button>
          </div>
        `;
      })
      .join("");

    return `
      <div class="section">
        <h3>Terreno</h3>
        <div class="field-row">
          <span>Editar</span>
          <input id="terrain-edit" type="checkbox" ${this.terrainTool.enabled ? "checked" : ""} />
        </div>
        <div class="field-row">
          <span>Tamanho</span>
          <div class="vec2">
            <input id="terrain-size" type="number" step="1" value="${size}" />
            <input id="terrain-size-z" type="number" step="1" value="${sizeZ}" />
          </div>
        </div>
        <div class="field-row">
          <span>Resolução</span>
          <input id="terrain-segments" type="number" step="1" value="${segments}" />
        </div>
        <div class="field-row">
          <span>Altura Max</span>
          <input id="terrain-max-height" type="number" step="0.5" value="${maxHeight}" />
        </div>
        <div class="field-row">
          <span>Tiling Base</span>
          <input id="terrain-tex-scale" type="number" step="0.5" value="${textureScale.toFixed(2)}" />
        </div>
        <div class="field-row">
          <span></span>
          <button id="terrain-rebuild">Recriar Terreno</button>
        </div>
      </div>

      <div class="section">
        <h3>Terrain Tools</h3>
        <div class="terrain-toolset">
          <button class="terrain-tool-btn ${activeTool === "raise" ? "active" : ""}" data-terrain-tool="raise">Raise</button>
          <button class="terrain-tool-btn ${activeTool === "lower" ? "active" : ""}" data-terrain-tool="lower">Lower</button>
          <button class="terrain-tool-btn ${activeTool === "smooth" ? "active" : ""}" data-terrain-tool="smooth">Smooth</button>
          <button class="terrain-tool-btn ${activeTool === "flatten" ? "active" : ""}" data-terrain-tool="flatten">Flatten</button>
          <button class="terrain-tool-btn ${activeTool === "paint" ? "active" : ""}" data-terrain-tool="paint">Paint</button>
          <button class="terrain-tool-btn ${activeTool === "trees" ? "active" : ""}" data-terrain-tool="trees">Trees</button>
        </div>
        <div class="field-row">
          <span>Brush</span>
          <div class="slider-control">
            <input id="terrain-brush" type="range" min="0.2" max="12" step="0.1" value="${brushValue}" />
            <input id="terrain-brush-num" type="number" min="0.2" max="12" step="0.1" value="${brushValue.toFixed(1)}" />
          </div>
        </div>
        <div class="field-row" data-terrain-ui="sculpt" data-terrain-ui2="paint">
          <span>Força</span>
          <div class="slider-control">
            <input id="terrain-strength" type="range" min="0.01" max="2" step="0.01" value="${strengthValue}" />
            <input id="terrain-strength-num" type="number" min="0.01" max="2" step="0.01" value="${strengthValue.toFixed(2)}" />
          </div>
        </div>
        <div class="field-row" data-terrain-ui="sculpt" data-terrain-sculpt="flatten">
          <span>Altura</span>
          <div class="slider-control">
            <input id="terrain-flatten-height" type="range" min="${(-flattenLimit).toFixed(1)}" max="${flattenLimit.toFixed(1)}" step="0.1" value="${flattenValue}" />
            <input id="terrain-flatten-height-num" type="number" min="${(-flattenLimit).toFixed(1)}" max="${flattenLimit.toFixed(1)}" step="0.1" value="${flattenValue.toFixed(1)}" />
          </div>
        </div>
        <div class="field-row" data-terrain-ui="sculpt" data-terrain-ui2="paint">
          <span>Falloff</span>
          <div class="slider-control">
            <input id="terrain-falloff" type="range" min="0" max="1" step="0.01" value="${falloffValue}" />
            <input id="terrain-falloff-num" type="number" min="0" max="1" step="0.01" value="${falloffValue.toFixed(2)}" />
          </div>
        </div>
        <div class="field-row" data-terrain-ui="paint">
          <span>Layer</span>
          <select id="terrain-paint-layer">
            ${layers
              .map((layer, index) => {
                const selected = index === paintLayerIndex ? "selected" : "";
                return `<option value="${index}" ${selected}>${layer.name}</option>`;
              })
              .join("")}
          </select>
        </div>
        <div class="field-row" data-terrain-ui="trees">
          <span>Operação</span>
          <select id="terrain-tree-op">
            <option value="add" ${this.terrainTool.treeOp === "add" ? "selected" : ""}>Adicionar</option>
            <option value="erase" ${this.terrainTool.treeOp === "erase" ? "selected" : ""}>Apagar</option>
          </select>
        </div>
        <div class="field-row" data-terrain-ui="trees">
          <span>Modelo</span>
          <select id="terrain-tree-model">
            ${treeModelOptions.join("")}
          </select>
        </div>
        <div class="field-row" data-terrain-ui="trees">
          <span>Colisão</span>
          <input id="terrain-tree-collision" type="checkbox" ${treeCollisionValue ? "checked" : ""} />
        </div>
        <div class="field-row" data-terrain-ui="trees">
          <span>Densidade</span>
          <div class="slider-control">
            <input id="terrain-density" type="range" min="1" max="20" step="1" value="${densityValue}" />
            <input id="terrain-density-num" type="number" min="1" max="20" step="1" value="${Math.round(densityValue)}" />
          </div>
        </div>
        <div class="field-row" data-terrain-ui="trees">
          <span>Escala</span>
          <div class="slider-control">
            <input id="terrain-tree-scale" type="range" min="0.2" max="4" step="0.1" value="${treeScaleValue}" />
            <input id="terrain-tree-scale-num" type="number" min="0.2" max="4" step="0.1" value="${treeScaleValue.toFixed(1)}" />
          </div>
        </div>
        <p class="muted">Arraste no terreno para editar.</p>
      </div>

      <div class="section">
        <h3>Texturas</h3>
        <div class="terrain-layer-list">
          ${layerRows || '<p class="muted">Nenhuma textura adicionada.</p>'}
        </div>
        <div class="field-row">
          <span>Upload</span>
          <div class="upload-inline">
            <button id="terrain-texture-upload-btn" type="button" class="file-btn">Importar Textura</button>
            <input id="terrain-texture-upload" class="file-input" type="file" accept="image/*,.png,.jpg,.jpeg" />
          </div>
        </div>
        <div class="field-row">
          <span>Adicionar</span>
          <div>
            <select id="terrain-layer-select">
              <option value="">Selecionar textura...</option>
              ${textureOptions}
            </select>
            <button id="terrain-layer-add">Adicionar</button>
          </div>
        </div>
      </div>
    `;
  }

  renderLightSection(entity) {
    const data = this.sceneStore.serializeLight(entity) || entity.light?.data || {};
    const kind = data.kind || entity.light?.kind || "point";
    const kindLabelMap = {
      directional: "Directional Light",
      point: "Point Light",
      spot: "Spot Light",
      ambient: "Ambient Light",
      hemisphere: "Hemisphere Light",
    };
    const hasColor = ["directional", "point", "spot", "ambient"].includes(kind);
    const hasDistance = kind === "point" || kind === "spot";
    const hasSpot = kind === "spot";
    const hasTarget = kind === "directional" || kind === "spot";
    const hasShadow = kind === "directional" || kind === "point" || kind === "spot";
    const target = Array.isArray(data.target) ? data.target : [0, 0, 0];
    const shadow = data.shadow || {};

    return `
      <div class="section">
        <h3>Luz</h3>
        <div class="field-row">
          <span>Tipo</span>
          <span class="muted">${kindLabelMap[kind] || kind}</span>
        </div>
        <div class="field-row">
          <span>Enabled</span>
          <input id="light-enabled" type="checkbox" ${data.enabled !== false ? "checked" : ""} />
        </div>
        ${
          hasColor
            ? `
          <div class="field-row">
            <span>Cor</span>
            <input id="light-color" type="color" value="${data.color || "#ffffff"}" />
          </div>
        `
            : ""
        }
        ${
          kind === "hemisphere"
            ? `
          <div class="field-row">
            <span>Sky</span>
            <input id="light-sky-color" type="color" value="${data.skyColor || "#ffffff"}" />
          </div>
          <div class="field-row">
            <span>Ground</span>
            <input id="light-ground-color" type="color" value="${data.groundColor || "#555555"}" />
          </div>
        `
            : ""
        }
        <div class="field-row">
          <span>Intensidade</span>
          <input id="light-intensity" type="number" step="0.05" value="${Number(data.intensity ?? 1).toFixed(2)}" />
        </div>
        ${
          hasDistance
            ? `
          <div class="field-row">
            <span>Distance</span>
            <input id="light-distance" type="number" step="0.5" value="${Number(data.distance ?? 0).toFixed(2)}" />
          </div>
          <div class="field-row">
            <span>Decay</span>
            <input id="light-decay" type="number" step="0.1" value="${Number(data.decay ?? 2).toFixed(2)}" />
          </div>
        `
            : ""
        }
        ${
          hasSpot
            ? `
          <div class="field-row">
            <span>Ângulo (rad)</span>
            <input id="light-angle" type="number" step="0.01" value="${Number(data.angle ?? Math.PI / 6).toFixed(3)}" />
          </div>
          <div class="field-row">
            <span>Penumbra</span>
            <input id="light-penumbra" type="number" step="0.01" value="${Number(data.penumbra ?? 0.25).toFixed(2)}" />
          </div>
        `
            : ""
        }
        ${
          hasTarget
            ? `
          <div class="field-row">
            <span>Target XYZ</span>
            <div class="vec3">
              <input id="light-target-x" type="number" step="0.1" value="${Number(target[0] ?? 0).toFixed(2)}" />
              <input id="light-target-y" type="number" step="0.1" value="${Number(target[1] ?? 0).toFixed(2)}" />
              <input id="light-target-z" type="number" step="0.1" value="${Number(target[2] ?? 0).toFixed(2)}" />
            </div>
          </div>
        `
            : ""
        }
      </div>
      ${
        hasShadow
          ? `
      <div class="section">
        <h3>Shadow</h3>
        <div class="field-row">
          <span>castShadow</span>
          <input id="light-cast-shadow" type="checkbox" ${data.castShadow ? "checked" : ""} />
        </div>
        <div class="field-row">
          <span>Bias</span>
          <input id="light-shadow-bias" type="number" step="0.0001" value="${Number(shadow.bias ?? -0.0005).toFixed(5)}" />
        </div>
        <div class="field-row">
          <span>Map Size</span>
          <input id="light-shadow-map-size" type="number" step="256" value="${Math.round(Number(shadow.mapSize ?? 1024))}" />
        </div>
        <div class="field-row">
          <span>Near/Far</span>
          <div class="vec2">
            <input id="light-shadow-near" type="number" step="0.1" value="${Number(shadow.near ?? 0.5).toFixed(2)}" />
            <input id="light-shadow-far" type="number" step="1" value="${Number(shadow.far ?? 120).toFixed(2)}" />
          </div>
        </div>
        ${
          kind === "directional"
            ? `
          <div class="field-row">
            <span>Bounds X</span>
            <div class="vec2">
              <input id="light-shadow-left" type="number" step="1" value="${Number(shadow.left ?? -30).toFixed(2)}" />
              <input id="light-shadow-right" type="number" step="1" value="${Number(shadow.right ?? 30).toFixed(2)}" />
            </div>
          </div>
          <div class="field-row">
            <span>Bounds Y</span>
            <div class="vec2">
              <input id="light-shadow-bottom" type="number" step="1" value="${Number(shadow.bottom ?? -30).toFixed(2)}" />
              <input id="light-shadow-top" type="number" step="1" value="${Number(shadow.top ?? 30).toFixed(2)}" />
            </div>
          </div>
        `
            : ""
        }
      </div>
      `
          : ""
      }
    `;
  }

  bindTerrainInspector(entity) {
    const editToggle = document.getElementById("terrain-edit");
    const sizeInput = document.getElementById("terrain-size");
    const sizeZInput = document.getElementById("terrain-size-z");
    const segmentsInput = document.getElementById("terrain-segments");
    const texScaleInput = document.getElementById("terrain-tex-scale");
    const maxHeightInput = document.getElementById("terrain-max-height");
    const rebuildButton = document.getElementById("terrain-rebuild");
    const paintSelect = document.getElementById("terrain-paint-layer");
    const treeSelect = document.getElementById("terrain-tree-op");
    const treeModelSelect = document.getElementById("terrain-tree-model");
    const treeCollisionToggle = document.getElementById("terrain-tree-collision");
    const brushRange = document.getElementById("terrain-brush");
    const brushInput = document.getElementById("terrain-brush-num");
    const strengthRange = document.getElementById("terrain-strength");
    const strengthInput = document.getElementById("terrain-strength-num");
    const falloffRange = document.getElementById("terrain-falloff");
    const falloffInput = document.getElementById("terrain-falloff-num");
    const flattenRange = document.getElementById("terrain-flatten-height");
    const flattenInput = document.getElementById("terrain-flatten-height-num");
    const densityRange = document.getElementById("terrain-density");
    const densityInput = document.getElementById("terrain-density-num");
    const treeScaleRange = document.getElementById("terrain-tree-scale");
    const treeScaleInput = document.getElementById("terrain-tree-scale-num");
    const toolButtons = Array.from(this.container.querySelectorAll("[data-terrain-tool]"));
    const layerSelect = document.getElementById("terrain-layer-select");
    const layerAdd = document.getElementById("terrain-layer-add");
    const textureUpload = document.getElementById("terrain-texture-upload");
    const textureUploadBtn = document.getElementById("terrain-texture-upload-btn");

    if (editToggle) {
      editToggle.addEventListener("change", () => {
        if (this.onSetTerrainToolEnabled) {
          this.onSetTerrainToolEnabled(editToggle.checked);
        } else {
          this.terrainTool.enabled = editToggle.checked;
        }
        this.updateTerrainModeUI();
      });
    }

    const syncToolButtons = () => {
      toolButtons.forEach((button) => {
        const tool = button.dataset.terrainTool;
        const active =
          this.terrainTool.mode === "paint"
            ? tool === "paint"
            : this.terrainTool.mode === "trees"
              ? tool === "trees"
              : tool === this.terrainTool.sculptOp;
        button.classList.toggle("active", active);
      });
    };

    toolButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const tool = button.dataset.terrainTool;
        if (tool === "paint") {
          this.terrainTool.mode = "paint";
        } else if (tool === "trees") {
          this.terrainTool.mode = "trees";
        } else {
          this.terrainTool.mode = "sculpt";
          this.terrainTool.sculptOp = tool;
        }
        syncToolButtons();
        this.updateTerrainModeUI();
      });
    });

    if (paintSelect) {
      paintSelect.addEventListener("change", () => {
        const index = Number(paintSelect.value);
        if (Number.isFinite(index)) {
          this.terrainTool.paintLayerIndex = index;
          this.terrainTool.mode = "paint";
        }
        syncToolButtons();
        this.updateTerrainModeUI();
      });
    }

    if (treeSelect) {
      treeSelect.addEventListener("change", () => {
        this.terrainTool.treeOp = treeSelect.value;
        this.terrainTool.mode = "trees";
        this.updateTerrainModeUI();
      });
    }

    if (treeModelSelect) {
      treeModelSelect.addEventListener("change", () => {
        this.terrainTool.treeModelPath = String(treeModelSelect.value || "").trim();
        this.terrainTool.mode = "trees";
        this.updateTerrainModeUI();
      });
    }

    const updateSelectedTrees = (updater) => {
      if (!Array.isArray(entity.terrain?.trees) || !entity.terrain.trees.length) return;

      const selectedModelPath = String(this.terrainTool.treeModelPath || "").trim();
      const matchesSelectedModel = (tree) => {
        const treePath = String(tree?.modelPath || tree?.model || "").trim();
        if (selectedModelPath) return treePath === selectedModelPath;
        return treePath === "";
      };

      let changed = false;
      entity.terrain.trees = entity.terrain.trees.map((tree) => {
        if (!matchesSelectedModel(tree)) return tree;
        const nextTree = updater(tree);
        if (nextTree !== tree) changed = true;
        return nextTree;
      });

      if (changed) {
        TerrainSystem.updateTerrainTrees?.(entity, this.sceneStore?.assetManager || null);
      }
    };

    if (treeCollisionToggle) {
      treeCollisionToggle.addEventListener("change", () => {
        this.terrainTool.treeCollision = treeCollisionToggle.checked;
        this.terrainTool.mode = "trees";
        updateSelectedTrees((tree) => {
          const scale = Math.max(0.2, Number(tree.scale) || 1);
          const nextRadius = getTreeCollisionRadius({ scale });
          const nextCollidable = treeCollisionToggle.checked;
          if (tree.collidable === nextCollidable && Math.abs((Number(tree.collisionRadius) || 0) - nextRadius) < 0.0001) {
            return tree;
          }
          return {
            ...tree,
            collidable: nextCollidable,
            collisionRadius: nextRadius,
          };
        });
        this.updateTerrainModeUI();
      });
    }

    const bindSliderPair = ({
      rangeEl,
      numberEl,
      min,
      max,
      step,
      fallback,
      applyValue,
      integer = false,
    }) => {
      if (!rangeEl || !numberEl) return;

      const decimals = (() => {
        const text = String(step);
        if (!text.includes(".")) return 0;
        return text.split(".")[1].length;
      })();

      const clampValue = (value) => {
        const parsed = safeNumber(value, fallback);
        const bounded = Math.min(max, Math.max(min, parsed));
        return integer ? Math.round(bounded) : bounded;
      };

      const formatValue = (value) => {
        if (integer) return String(Math.round(value));
        if (decimals <= 0) return String(Math.round(value));
        return Number(value).toFixed(decimals);
      };

      const syncFrom = (value) => {
        const next = clampValue(value);
        const text = formatValue(next);
        rangeEl.value = text;
        numberEl.value = text;
        applyValue(next);
      };

      const onRangeInput = () => syncFrom(rangeEl.value);
      const onNumberInput = () => syncFrom(numberEl.value);

      rangeEl.addEventListener("input", onRangeInput);
      rangeEl.addEventListener("change", onRangeInput);
      numberEl.addEventListener("input", onNumberInput);
      numberEl.addEventListener("change", onNumberInput);

      syncFrom(numberEl.value || rangeEl.value || fallback);
    };

    bindSliderPair({
      rangeEl: brushRange,
      numberEl: brushInput,
      min: 0.2,
      max: 12,
      step: 0.1,
      fallback: 1.8,
      applyValue: (value) => {
        this.terrainTool.brushSize = value;
      },
    });

    bindSliderPair({
      rangeEl: strengthRange,
      numberEl: strengthInput,
      min: 0.01,
      max: 2,
      step: 0.01,
      fallback: 0.35,
      applyValue: (value) => {
        this.terrainTool.strength = value;
      },
    });

    bindSliderPair({
      rangeEl: falloffRange,
      numberEl: falloffInput,
      min: 0,
      max: 1,
      step: 0.01,
      fallback: 0.5,
      applyValue: (value) => {
        this.terrainTool.falloff = value;
      },
    });

    bindSliderPair({
      rangeEl: flattenRange,
      numberEl: flattenInput,
      min: -Math.max(1, entity.terrain.maxHeight ?? 6),
      max: Math.max(1, entity.terrain.maxHeight ?? 6),
      step: 0.1,
      fallback: 0,
      applyValue: (value) => {
        this.terrainTool.flattenHeight = value;
      },
    });

    bindSliderPair({
      rangeEl: densityRange,
      numberEl: densityInput,
      min: 1,
      max: 20,
      step: 1,
      fallback: 4,
      integer: true,
      applyValue: (value) => {
        this.terrainTool.treeDensity = value;
      },
    });

    bindSliderPair({
      rangeEl: treeScaleRange,
      numberEl: treeScaleInput,
      min: 0.2,
      max: 4,
      step: 0.1,
      fallback: 1,
      applyValue: (value) => {
        this.terrainTool.treeScale = value;
        updateSelectedTrees((tree) => {
        const nextRadius = getTreeCollisionRadius({ scale: value });
          const scaleChanged = Math.abs((Number(tree.scale) || 0) - value) >= 0.0001;
          const radiusChanged = Math.abs((Number(tree.collisionRadius) || 0) - nextRadius) >= 0.0001;
          if (!scaleChanged && !radiusChanged) return tree;
          return {
            ...tree,
            scale: value,
            collisionRadius: nextRadius,
          };
        });
      },
    });

    if (texScaleInput) {
      texScaleInput.addEventListener("change", () => {
        const value = Math.max(0.5, safeNumber(texScaleInput.value, 4));
        entity.terrain.textureScale = value;
        if (entity.terrain.layers?.length) {
          entity.terrain.layers = entity.terrain.layers.map((layer) => ({ ...layer, scale: value }));
          TerrainSystem.updateTerrainLayers?.(entity.terrain.mesh, entity.terrain.layers, value);
        } else {
          TerrainSystem.updateTerrainTextureScale?.(entity.terrain.mesh, value);
        }
      });
    }

    if (maxHeightInput) {
      maxHeightInput.addEventListener("change", () => {
        entity.terrain.maxHeight = Math.max(0.5, safeNumber(maxHeightInput.value, 6));
        maxHeightInput.value = entity.terrain.maxHeight.toFixed(2);
        if (flattenRange && flattenInput) {
          const limit = Math.max(1, entity.terrain.maxHeight);
          flattenRange.min = String(-limit);
          flattenRange.max = String(limit);
          flattenInput.min = String(-limit);
          flattenInput.max = String(limit);
        }
      });
    }

    if (rebuildButton) {
      rebuildButton.addEventListener("click", () => {
        const size = TerrainSystem.safeSize(safeNumber(sizeInput?.value, entity.terrain.size));
        const sizeZ = TerrainSystem.safeSize(
          safeNumber(sizeZInput?.value, entity.terrain.sizeZ ?? entity.terrain.size)
        );
        const segments = TerrainSystem.safeSegments(safeNumber(segmentsInput?.value, entity.terrain.segments));
        const maxHeight = Math.max(0.5, safeNumber(maxHeightInput?.value, entity.terrain.maxHeight ?? 6));
        const texScale = Math.max(
          0.5,
          safeNumber(texScaleInput?.value, Math.max(1, Math.max(size, sizeZ) / 4))
        );
        entity.terrain.textureScale = texScale;
        this.sceneStore.rebuildTerrain(entity, {
          size,
          sizeZ,
          segments,
          textureScale: texScale,
          maxHeight,
          layers: entity.terrain.layers,
        });
        if (sizeInput) sizeInput.value = size;
        if (sizeZInput) sizeZInput.value = sizeZ;
        if (segmentsInput) segmentsInput.value = segments;
        if (maxHeightInput) maxHeightInput.value = maxHeight;
        if (texScaleInput) texScaleInput.value = texScale.toFixed(2);
        this.render(entity);
      });
    }

    if (sizeInput || sizeZInput || segmentsInput) {
      const onSizeChange = () => {
        const size = TerrainSystem.safeSize(safeNumber(sizeInput?.value, entity.terrain.size));
        const sizeZ = TerrainSystem.safeSize(
          safeNumber(sizeZInput?.value, entity.terrain.sizeZ ?? entity.terrain.size)
        );
        if (sizeInput) sizeInput.value = size;
        if (sizeZInput) sizeZInput.value = sizeZ;
        if (texScaleInput) {
          texScaleInput.value = Math.max(1, Math.max(size, sizeZ) / 4).toFixed(2);
        }
      };
      if (sizeInput) sizeInput.addEventListener("change", onSizeChange);
      if (sizeZInput) sizeZInput.addEventListener("change", onSizeChange);
      if (segmentsInput) segmentsInput.addEventListener("change", () => {
        const segments = TerrainSystem.safeSegments(safeNumber(segmentsInput.value, entity.terrain.segments));
        segmentsInput.value = segments;
      });
    }

    this.container.querySelectorAll(".terrain-layer-row").forEach((row) => {
      const index = Number(row.dataset.layerIndex);
      const radio = row.querySelector('input[type="radio"]');
      const scaleInput = row.querySelector(".layer-scale");
      const removeBtn = row.querySelector("[data-layer-remove]");

      if (radio) {
        radio.addEventListener("change", () => {
          if (radio.checked) {
            this.terrainTool.paintLayerIndex = index;
            this.terrainTool.mode = "paint";
            if (paintSelect) {
              paintSelect.value = String(index);
            }
            syncToolButtons();
            this.updateTerrainModeUI();
          }
        });
      }

      if (scaleInput) {
        scaleInput.addEventListener("change", () => {
          const value = Math.max(0.1, safeNumber(scaleInput.value, entity.terrain.textureScale ?? 4));
          if (entity.terrain.layers?.[index]) {
            entity.terrain.layers[index].scale = value;
            TerrainSystem.updateTerrainLayers?.(entity.terrain.mesh, entity.terrain.layers, entity.terrain.textureScale);
          }
        });
      }

      if (removeBtn) {
        removeBtn.addEventListener("click", () => {
          if (!entity.terrain.layers || entity.terrain.layers.length <= 1) return;
          entity.terrain.layers.splice(index, 1);
          if (this.terrainTool.paintLayerIndex >= entity.terrain.layers.length) {
            this.terrainTool.paintLayerIndex = entity.terrain.layers.length - 1;
          }
          TerrainSystem.updateTerrainLayers?.(entity.terrain.mesh, entity.terrain.layers, entity.terrain.textureScale);
          this.render(entity);
        });
      }
    });

    if (layerAdd) {
      layerAdd.addEventListener("click", () => {
        if (!layerSelect?.value) return;
        if (!entity.terrain.layers) {
          entity.terrain.layers = [];
        }
        if (entity.terrain.layers.length >= 4) {
          alert("Maximo de 4 texturas por terreno.");
          return;
        }

        const assetPath = layerSelect.value;
        const asset = this.assets.find((item) => item.path === assetPath);
        entity.terrain.layers.push({
          id: crypto.randomUUID(),
          name: asset?.name || `Layer ${entity.terrain.layers.length + 1}`,
          kind: "texture",
          path: assetPath,
          scale: entity.terrain.textureScale ?? 4,
        });
        this.terrainTool.paintLayerIndex = entity.terrain.layers.length - 1;
        this.terrainTool.mode = "paint";
        TerrainSystem.updateTerrainLayers?.(entity.terrain.mesh, entity.terrain.layers, entity.terrain.textureScale);
        TerrainSystem.fillTerrainLayer?.(entity.terrain.mesh, this.terrainTool.paintLayerIndex);
        this.render(entity);
      });
    }

    if (textureUploadBtn && textureUpload) {
      textureUploadBtn.addEventListener("click", () => {
        textureUpload.click();
      });
    }

    if (textureUpload) {
      textureUpload.addEventListener("change", async (event) => {
        if (!event.target.files?.length) return;
        if (this.onUploadTexture) {
          await this.onUploadTexture(event.target.files);
        }
        event.target.value = "";
      });
    }

    syncToolButtons();
    this.updateTerrainModeUI();
  }

  bindLightInspector(entity) {
    const data = this.sceneStore.serializeLight(entity) || entity.light?.data || {};
    const kind = data.kind || entity.light?.kind || "point";
    const enabledInput = document.getElementById("light-enabled");
    const colorInput = document.getElementById("light-color");
    const skyColorInput = document.getElementById("light-sky-color");
    const groundColorInput = document.getElementById("light-ground-color");
    const intensityInput = document.getElementById("light-intensity");
    const distanceInput = document.getElementById("light-distance");
    const decayInput = document.getElementById("light-decay");
    const angleInput = document.getElementById("light-angle");
    const penumbraInput = document.getElementById("light-penumbra");
    const targetXInput = document.getElementById("light-target-x");
    const targetYInput = document.getElementById("light-target-y");
    const targetZInput = document.getElementById("light-target-z");
    const castShadowInput = document.getElementById("light-cast-shadow");
    const shadowBiasInput = document.getElementById("light-shadow-bias");
    const shadowMapSizeInput = document.getElementById("light-shadow-map-size");
    const shadowNearInput = document.getElementById("light-shadow-near");
    const shadowFarInput = document.getElementById("light-shadow-far");
    const shadowLeftInput = document.getElementById("light-shadow-left");
    const shadowRightInput = document.getElementById("light-shadow-right");
    const shadowTopInput = document.getElementById("light-shadow-top");
    const shadowBottomInput = document.getElementById("light-shadow-bottom");

    const apply = () => {
      const patch = {
        enabled: enabledInput ? enabledInput.checked : data.enabled !== false,
        intensity: safeNumber(intensityInput?.value, data.intensity ?? 1),
      };

      if (colorInput) {
        patch.color = colorInput.value;
      }
      if (skyColorInput) {
        patch.skyColor = skyColorInput.value;
      }
      if (groundColorInput) {
        patch.groundColor = groundColorInput.value;
      }
      if (distanceInput) {
        patch.distance = Math.max(0, safeNumber(distanceInput.value, data.distance ?? 0));
      }
      if (decayInput) {
        patch.decay = Math.max(0, safeNumber(decayInput.value, data.decay ?? 2));
      }
      if (angleInput) {
        patch.angle = Math.max(0.05, safeNumber(angleInput.value, data.angle ?? Math.PI / 6));
      }
      if (penumbraInput) {
        patch.penumbra = Math.max(0, Math.min(1, safeNumber(penumbraInput.value, data.penumbra ?? 0.25)));
      }
      if (targetXInput && targetYInput && targetZInput) {
        patch.target = [
          safeNumber(targetXInput.value, data.target?.[0] ?? 0),
          safeNumber(targetYInput.value, data.target?.[1] ?? 0),
          safeNumber(targetZInput.value, data.target?.[2] ?? 0),
        ];
      }

      if (kind === "directional" || kind === "point" || kind === "spot") {
        patch.castShadow = castShadowInput ? castShadowInput.checked : data.castShadow;
        patch.shadow = {
          bias: safeNumber(shadowBiasInput?.value, data.shadow?.bias ?? -0.0005),
          mapSize: Math.max(256, Math.round(safeNumber(shadowMapSizeInput?.value, data.shadow?.mapSize ?? 1024))),
          near: Math.max(0.01, safeNumber(shadowNearInput?.value, data.shadow?.near ?? 0.5)),
          far: Math.max(1, safeNumber(shadowFarInput?.value, data.shadow?.far ?? 120)),
          left: safeNumber(shadowLeftInput?.value, data.shadow?.left ?? -30),
          right: safeNumber(shadowRightInput?.value, data.shadow?.right ?? 30),
          top: safeNumber(shadowTopInput?.value, data.shadow?.top ?? 30),
          bottom: safeNumber(shadowBottomInput?.value, data.shadow?.bottom ?? -30),
        };
      }

      this.sceneStore.updateLight(entity, patch);
    };

    [
      enabledInput,
      colorInput,
      skyColorInput,
      groundColorInput,
      intensityInput,
      distanceInput,
      decayInput,
      angleInput,
      penumbraInput,
      targetXInput,
      targetYInput,
      targetZInput,
      castShadowInput,
      shadowBiasInput,
      shadowMapSizeInput,
      shadowNearInput,
      shadowFarInput,
      shadowLeftInput,
      shadowRightInput,
      shadowTopInput,
      shadowBottomInput,
    ]
      .filter(Boolean)
      .forEach((input) => {
        input.addEventListener("change", apply);
      });
  }

  updateTerrainModeUI() {
    const rows = Array.from(this.container.querySelectorAll("[data-terrain-ui]"));
    rows.forEach((row) => {
      const mode = row.dataset.terrainUi;
      row.hidden = mode !== this.terrainTool.mode;
    });

    const rowsMulti = Array.from(this.container.querySelectorAll("[data-terrain-ui2]"));
    rowsMulti.forEach((row) => {
      const modes = [row.dataset.terrainUi2, row.dataset.terrainUi];
      row.hidden = !modes.includes(this.terrainTool.mode);
    });

    const sculptRows = Array.from(this.container.querySelectorAll("[data-terrain-sculpt]"));
    sculptRows.forEach((row) => {
      const op = row.dataset.terrainSculpt;
      row.hidden = !(this.terrainTool.mode === "sculpt" && this.terrainTool.sculptOp === op);
    });
  }

  renderAnimationControls(entity) {
    const clips = this.animator.getClips(entity).map((clip) => clip.name);
    const options = clips
      .map((clip) => {
        const selected = entity.animation?.clip === clip ? "selected" : "";
        return `<option value="${clip}" ${selected}>${clip}</option>`;
      })
      .join("");

    return `
      <div class="section">
        <h3>Animação</h3>
        <div class="field-row">
          <span>Clip</span>
          <select id="anim-clip">${options}</select>
        </div>
        <div class="field-row">
          <span>Velocidade</span>
          <input id="anim-speed" type="number" step="0.1" value="${entity.animation?.speed ?? 1}" />
        </div>
        <div class="field-row">
          <span>Loop</span>
          <input id="anim-loop" type="checkbox" ${entity.animation?.loop ? "checked" : ""} />
        </div>
        <div class="field-row">
          <span>Controle</span>
          <div>
            <button id="anim-play">Play</button>
            <button id="anim-stop">Stop</button>
          </div>
        </div>
      </div>
    `;
  }

  renderComponentsSection(entity) {
    const available = this.registry.listTypes();
    const options = available.map((type) => `<option value="${type}">${type}</option>`).join("");

    const cards = entity.components
      .map((component) => {
        const componentClass = this.registry.get(component.type);
        const schema = componentClass?.schema || [];
        const fieldsMarkup = schema
          .map((field) => this.renderComponentField(entity, component, field))
          .join("");

        return `
          <div class="component-card" data-component-id="${component.id}">
            <div class="component-header">
              <strong>${component.type}</strong>
              <div>
                <label class="toggle">
                  <input type="checkbox" data-component-enabled ${component.enabled !== false ? "checked" : ""} />
                  <span>Ativo</span>
                </label>
                <button data-component-remove>Remover</button>
              </div>
            </div>
            ${fieldsMarkup}
          </div>
        `;
      })
      .join("");

    return `
      <div class="section">
        <h3>Components</h3>
        <div class="field-row">
          <span>Novo</span>
          <div>
            <select id="component-select">${options}</select>
            <button id="component-add">Adicionar</button>
          </div>
        </div>
        ${cards || '<p class="muted">Nenhum componente.</p>'}
      </div>
    `;
  }

  renderComponentField(entity, component, field) {
    const value = component.props[field.key];
    const data = `data-component-field="${field.key}"`;

    if (field.type === "boolean") {
      return `
        <div class="field-row">
          <span>${field.label}</span>
          <input ${data} type="checkbox" ${value ? "checked" : ""} />
        </div>
      `;
    }

    if (field.type === "entity") {
      const entities = this.sceneStore.listEntities();
      const options = entities
        .map((entity) => {
          const selected = value === entity.id ? "selected" : "";
          return `<option value="${entity.id}" ${selected}>${entity.name}</option>`;
        })
        .join("");

      return `
        <div class="field-row">
          <span>${field.label}</span>
          <select ${data}>
            <option value="">(Nenhum)</option>
            ${options}
          </select>
        </div>
      `;
    }

    if (field.type === "animation") {
      const clips = this.animator.getClips(entity).map((clip) => clip.name);
      const options = clips
        .map((clip) => {
          const selected = value === clip ? "selected" : "";
          return `<option value="${clip}" ${selected}>${clip}</option>`;
        })
        .join("");

      return `
        <div class="field-row">
          <span>${field.label}</span>
          <select ${data}>
            <option value="">(Auto)</option>
            ${options}
          </select>
        </div>
      `;
    }

    if (field.type === "select") {
      const options = Array.isArray(field.options)
        ? field.options
            .map((option) => {
              const normalized =
                option && typeof option === "object"
                  ? {
                      value: option.value ?? "",
                      label: option.label ?? option.value ?? "",
                    }
                  : {
                      value: option ?? "",
                      label: option ?? "",
                    };
              const selected = String(value ?? "") === String(normalized.value) ? "selected" : "";
              return `<option value="${normalized.value}" ${selected}>${normalized.label}</option>`;
            })
            .join("")
        : "";

      return `
        <div class="field-row">
          <span>${field.label}</span>
          <select ${data}>
            ${options}
          </select>
        </div>
      `;
    }

    if (field.type === "asset") {
      const assetType = String(field.assetType || "").trim();
      const emptyLabel = field.emptyLabel || "(Nenhum)";
      const options = this.assets
        .filter((asset) => !assetType || asset.type === assetType)
        .map((asset) => {
          const selected = String(value ?? "") === String(asset.path) ? "selected" : "";
          return `<option value="${asset.path}" ${selected}>${asset.name}</option>`;
        })
        .join("");

      return `
        <div class="field-row">
          <span>${field.label}</span>
          <select ${data}>
            <option value="">${emptyLabel}</option>
            ${options}
          </select>
        </div>
      `;
    }

    return `
      <div class="field-row">
        <span>${field.label}</span>
        <input ${data} type="${field.type === "number" ? "number" : "text"}" step="${field.step || 0.1}" value="${value ?? ""}" />
      </div>
    `;
  }

  bindInspectorEvents(entity) {
    const nameInput = document.getElementById("insp-name");
    const activeInput = document.getElementById("insp-active");

    nameInput.addEventListener("input", (event) => {
      this.sceneStore.renameEntity(entity.id, event.target.value);
      if (this.onRefreshHierarchy) this.onRefreshHierarchy();
    });

    activeInput.addEventListener("change", (event) => {
      this.sceneStore.setActive(entity.id, event.target.checked);
      if (this.onRefreshHierarchy) this.onRefreshHierarchy();
    });

    this.container.querySelectorAll("[data-transform]").forEach((input) => {
      input.addEventListener("change", () => {
        if (this.onApplyTransform) {
          this.onApplyTransform(entity);
        }
      });
    });

    if (entity.type === "terrain") {
      this.bindTerrainInspector(entity);
    }

    if (entity.type === "light") {
      this.bindLightInspector(entity);
    }

    this.bindMeshShadowInspector(entity);

    const animClip = document.getElementById("anim-clip");
    if (animClip) {
      const animSpeed = document.getElementById("anim-speed");
      const animLoop = document.getElementById("anim-loop");
      const animPlay = document.getElementById("anim-play");
      const animStop = document.getElementById("anim-stop");

      animPlay.addEventListener("click", () => {
        const clip = animClip.value;
        const speed = safeNumber(animSpeed.value, 1);
        const loop = animLoop.checked;
        this.animator.play(entity, clip, loop, speed);
      });

      animStop.addEventListener("click", () => {
        this.animator.stop(entity);
      });

      animSpeed.addEventListener("change", () => {
        if (!entity.animation) return;
        entity.animation.speed = safeNumber(animSpeed.value, 1);
        if (entity.animation.playing) {
          this.animator.play(entity, entity.animation.clip, entity.animation.loop, entity.animation.speed);
        }
      });

      animLoop.addEventListener("change", () => {
        if (!entity.animation) return;
        entity.animation.loop = animLoop.checked;
        if (entity.animation.playing) {
          this.animator.play(entity, entity.animation.clip, entity.animation.loop, entity.animation.speed);
        }
      });

      animClip.addEventListener("change", () => {
        if (!entity.animation) return;
        entity.animation.clip = animClip.value;
      });
    }

    const addButton = document.getElementById("component-add");
    const componentSelect = document.getElementById("component-select");
    if (addButton && componentSelect) {
      addButton.addEventListener("click", () => {
        const type = componentSelect.value;
        if (!type) return;
        this.scriptSystem.addComponent(entity, type);
        this.render(entity);
      });
    }

    this.container.querySelectorAll("[data-component-id]").forEach((card) => {
      const componentId = card.dataset.componentId;
      const removeButton = card.querySelector("[data-component-remove]");
      const enabledToggle = card.querySelector("[data-component-enabled]");

      if (removeButton) {
        removeButton.addEventListener("click", () => {
          this.scriptSystem.removeComponent(entity, componentId);
          this.render(entity);
        });
      }

      if (enabledToggle) {
        enabledToggle.addEventListener("change", (event) => {
          const comp = entity.components.find((c) => c.id === componentId);
          if (comp) comp.enabled = event.target.checked;
          this.scriptSystem.toggleComponent(componentId, event.target.checked);
        });
      }

      card.querySelectorAll("[data-component-field]").forEach((fieldInput) => {
        fieldInput.addEventListener("change", (event) => {
          const key = fieldInput.dataset.componentField;
          let value = event.target.value;

          if (event.target.type === "checkbox") {
            value = event.target.checked;
          } else if (event.target.type === "number") {
            value = safeNumber(value, 0);
          }

          const comp = entity.components.find((c) => c.id === componentId);
          if (comp) comp.props[key] = value;
          this.scriptSystem.updateProp(componentId, key, value);

          if (key === "clip" && comp?.type === "PlayAnimation") {
            this.animator.play(entity, value || entity.animation?.clip, comp.props.loop, comp.props.speed);
          }
        });
      });
    });

    const setGameCamera = document.getElementById("set-game-camera");
    if (setGameCamera) {
      setGameCamera.addEventListener("click", () => {
        if (this.onSetGameCamera) this.onSetGameCamera(entity.id);
        this.render(entity);
      });
    }
  }

  bindMeshShadowInspector(entity) {
    const castInput = document.getElementById("mesh-cast-shadow");
    const receiveInput = document.getElementById("mesh-receive-shadow");
    if (!castInput && !receiveInput) return;

    const apply = () => {
      const meshes = this.getMeshNodes(entity);
      if (!meshes.length) return;
      const castShadow = castInput ? castInput.checked : false;
      const receiveShadow = receiveInput ? receiveInput.checked : false;
      meshes.forEach((mesh) => {
        mesh.castShadow = castShadow;
        mesh.receiveShadow = receiveShadow;
      });
    };

    if (castInput) castInput.addEventListener("change", apply);
    if (receiveInput) receiveInput.addEventListener("change", apply);
  }
}

