import * as THREE from "three";

const tmpPlayerPosition = new THREE.Vector3();
const tmpWorldCenter = new THREE.Vector3();
const tmpViewDirection = new THREE.Vector3();
const tmpObjectPosition = new THREE.Vector3();
const tmpTreeWorldPosition = new THREE.Vector3();

export class MiniMapManager {
  constructor(sceneStore) {
    this.sceneStore = sceneStore;

    this.root = document.getElementById("minimap-panel");
    this.titleValue = document.getElementById("minimap-title");
    this.canvas = document.getElementById("minimap-canvas");
    this.playerMarker = document.getElementById("minimap-player");
    this.ctx = this.canvas?.getContext?.("2d", { alpha: false, desynchronized: true }) || null;

    this.visible = true;
    this.bounds = null;
    this.size = { width: 0, height: 0 };
    this.scenePoints = [];
    this.treePoints = [];
    this.needsRedraw = true;
    this.lastRenderAt = 0;
    this.renderIntervalMs = 220;
  }

  setVisible(visible) {
    this.visible = visible !== false;
    if (!this.root) return;
    this.root.classList.toggle("hidden", !this.visible);
    if (this.visible) {
      this.needsRedraw = true;
    }
  }

  setScene(sceneName = "", config = {}) {
    if (this.titleValue) {
      this.titleValue.textContent = String(config.minimapLabel || sceneName || "Mapa");
    }

    this.computeBounds();
    this.buildStaticLayers();
    this.resetMarker();
    this.needsRedraw = true;
    this.renderScene();
  }

  computeBounds() {
    const terrains = this.sceneStore
      .listEntities()
      .filter((entity) => entity?.type === "terrain" && entity?.terrain && entity?.three);
    if (!terrains.length) {
      this.bounds = null;
      return;
    }

    const terrain = terrains.reduce((best, current) => {
      const bestArea = (Number(best?.terrain?.size) || 0) * (Number(best?.terrain?.sizeZ || best?.terrain?.size) || 0);
      const currentArea =
        (Number(current?.terrain?.size) || 0) * (Number(current?.terrain?.sizeZ || current?.terrain?.size) || 0);
      return currentArea > bestArea ? current : best;
    }, terrains[0]);

    const sizeX = Number(terrain?.terrain?.size) || 200;
    const sizeZ = Number(terrain?.terrain?.sizeZ || terrain?.terrain?.size) || sizeX;
    const worldCenter = terrain.three.getWorldPosition(tmpWorldCenter);

    this.bounds = {
      centerX: worldCenter.x,
      centerZ: worldCenter.z,
      minX: worldCenter.x - sizeX * 0.5,
      maxX: worldCenter.x + sizeX * 0.5,
      minZ: worldCenter.z - sizeZ * 0.5,
      maxZ: worldCenter.z + sizeZ * 0.5,
      sizeX,
      sizeZ,
    };
  }

  buildStaticLayers() {
    this.scenePoints = [];
    this.treePoints = [];
    if (!this.bounds) return;

    const entities = this.sceneStore.listEntities();
    entities.forEach((entity) => {
      if (!entity?.three) return;
      if (entity.type === "camera" || entity.type === "light") return;

      if (entity.type === "terrain" && Array.isArray(entity.terrain?.trees) && entity.terrain.trees.length) {
        const maxSamples = 260;
        const step = Math.max(1, Math.ceil(entity.terrain.trees.length / maxSamples));
        for (let index = 0; index < entity.terrain.trees.length; index += step) {
          const tree = entity.terrain.trees[index];
          tmpTreeWorldPosition.set(Number(tree.x) || 0, Number(tree.y) || 0, Number(tree.z) || 0);
          entity.three.localToWorld(tmpTreeWorldPosition);
          const projected = this.projectWorldPoint(tmpTreeWorldPosition.x, tmpTreeWorldPosition.z);
          if (projected) {
            this.treePoints.push(projected);
          }
        }
        return;
      }

      entity.three.getWorldPosition(tmpObjectPosition);
      const projected = this.projectWorldPoint(tmpObjectPosition.x, tmpObjectPosition.z);
      if (!projected) return;

      let color = "#d7dde7";
      let radius = 2.4;
      if (entity.type === "model") {
        color = "#d7d3c7";
        radius = 2.2;
      } else if (entity.type === "primitive") {
        color = "#9bc7ff";
        radius = 2.6;
      }
      this.scenePoints.push({ ...projected, color, radius });
    });
  }

  resizeCanvas() {
    if (!this.canvas) return false;
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(2, Math.round(rect.width));
    const height = Math.max(2, Math.round(rect.height));
    if (width === this.size.width && height === this.size.height) return false;

    this.size.width = width;
    this.size.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.needsRedraw = true;
    return true;
  }

  update(playerEntity, cameraEntity = null) {
    if (!this.visible || !this.ctx || !this.bounds) return;

    this.updateMarker(playerEntity, cameraEntity);

    const resized = this.resizeCanvas();
    const now = performance.now();
    if (!this.needsRedraw && !resized) return;
    if (now - this.lastRenderAt < this.renderIntervalMs) return;

    this.lastRenderAt = now;
    this.renderScene();
  }

  updateMarker(playerEntity, cameraEntity = null) {
    if (!this.playerMarker || !this.bounds || !playerEntity?.three) return;
    playerEntity.three.getWorldPosition(tmpPlayerPosition);

    const projected = this.projectWorldPoint(tmpPlayerPosition.x, tmpPlayerPosition.z);
    if (!projected) return;

    this.playerMarker.style.left = `${(projected.u * 100).toFixed(2)}%`;
    this.playerMarker.style.top = `${(projected.v * 100).toFixed(2)}%`;
    this.playerMarker.classList.toggle("off-map", projected.offMap === true);

    let headingDeg = 0;
    if (cameraEntity?.isCamera) {
      cameraEntity.getWorldDirection(tmpViewDirection);
      headingDeg = THREE.MathUtils.radToDeg(Math.atan2(tmpViewDirection.x, tmpViewDirection.z));
    } else {
      headingDeg = THREE.MathUtils.radToDeg(playerEntity.three.rotation.y || 0);
    }
    this.playerMarker.style.transform = `translate(-50%, -50%) rotate(${headingDeg.toFixed(2)}deg)`;
  }

  projectWorldPoint(x, z) {
    if (!this.bounds) return null;
    const spanX = Math.max(0.0001, this.bounds.maxX - this.bounds.minX);
    const spanZ = Math.max(0.0001, this.bounds.maxZ - this.bounds.minZ);
    const normalizedX = (x - this.bounds.minX) / spanX;
    const normalizedZ = (z - this.bounds.minZ) / spanZ;
    const u = Math.max(0, Math.min(1, normalizedX));
    const v = Math.max(0, Math.min(1, 1 - normalizedZ));
    return {
      x: u,
      y: v,
      u,
      v,
      offMap: normalizedX < 0 || normalizedX > 1 || normalizedZ < 0 || normalizedZ > 1,
    };
  }

  renderScene() {
    if (!this.ctx || !this.bounds) return;
    this.resizeCanvas();

    const ctx = this.ctx;
    const width = this.size.width;
    const height = this.size.height;

    ctx.clearRect(0, 0, width, height);

    const background = ctx.createLinearGradient(0, 0, 0, height);
    background.addColorStop(0, "#1b2620");
    background.addColorStop(1, "#121915");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(183, 209, 176, 0.08)";
    ctx.lineWidth = 1;
    for (let index = 1; index < 4; index += 1) {
      const x = (width / 4) * index;
      const y = (height / 4) * index;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(78, 112, 76, 0.92)";
    ctx.fillRect(6, 6, width - 12, height - 12);

    ctx.fillStyle = "rgba(49, 88, 58, 0.8)";
    this.treePoints.forEach((point) => {
      ctx.beginPath();
      ctx.arc(point.x * width, point.y * height, 1.4, 0, Math.PI * 2);
      ctx.fill();
    });

    this.scenePoints.forEach((point) => {
      ctx.fillStyle = point.color;
      ctx.beginPath();
      ctx.arc(point.x * width, point.y * height, point.radius, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.strokeStyle = "rgba(221, 232, 247, 0.16)";
    ctx.lineWidth = 1;
    ctx.strokeRect(5.5, 5.5, width - 11, height - 11);

    this.needsRedraw = false;
  }

  resetMarker() {
    if (!this.playerMarker) return;
    this.playerMarker.style.left = "50%";
    this.playerMarker.style.top = "50%";
    this.playerMarker.style.transform = "translate(-50%, -50%) rotate(0deg)";
    this.playerMarker.classList.remove("off-map");
  }
}
