export class DebugPanelManager {
  constructor() {
    this.root = document.getElementById("debug-panel");
    this.fpsValue = document.getElementById("dbg-fps");
    this.callsValue = document.getElementById("dbg-calls");
    this.trianglesValue = document.getElementById("dbg-triangles");
    this.objectsValue = document.getElementById("dbg-objects");
    this.texturesValue = document.getElementById("dbg-textures");
    this.presetValue = document.getElementById("dbg-preset");
    this.rendererValue = document.getElementById("dbg-renderer");
  }

  setVisible(visible) {
    if (!this.root) return;
    this.root.classList.toggle("hidden", !visible);
  }

  update({ fps = 0, stats = null, visibleObjects = 0, textureMemoryMB = 0, preset = "", rendererType = "" } = {}) {
    if (!this.root) return;
    if (this.fpsValue) this.fpsValue.textContent = `${Math.round(fps)}`;
    if (this.callsValue) this.callsValue.textContent = `${stats?.calls ?? 0}`;
    if (this.trianglesValue) this.trianglesValue.textContent = `${(stats?.triangles ?? 0).toLocaleString("pt-BR")}`;
    if (this.objectsValue) this.objectsValue.textContent = `${visibleObjects}`;
    if (this.texturesValue) this.texturesValue.textContent = `${textureMemoryMB.toFixed(1)} MB`;
    if (this.presetValue) this.presetValue.textContent = preset || "-";
    if (this.rendererValue) this.rendererValue.textContent = rendererType || "-";
  }
}
