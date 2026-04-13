export class TerrainToolController {
  constructor({
    toolState,
    orbit,
    canvas,
    getSelectedTerrain,
    getTerrainHit,
    applyEdit,
    updateBrushPreview,
    getFlattenHeight,
    isEditBlocked,
  }) {
    this.toolState = toolState;
    this.orbit = orbit;
    this.canvas = canvas;
    this.getSelectedTerrain = getSelectedTerrain;
    this.getTerrainHit = getTerrainHit;
    this.applyEdit = applyEdit;
    this.updateBrushPreview = updateBrushPreview;
    this.getFlattenHeight = getFlattenHeight;
    this.isEditBlocked = isEditBlocked;
    this.isEditing = false;
    this.pointerId = null;
  }

  handlePointerDown(event) {
    if (this.isEditBlocked?.()) return false;
    if (!this.toolState.enabled) return false;
    if (event.button !== 0) return false;
    const terrain = this.getSelectedTerrain();
    if (!terrain) return false;

    const hit = this.getTerrainHit(event, terrain);
    if (!hit) return false;
    this.updateBrushPreview?.(hit);

    this.isEditing = true;
    this.pointerId = event.pointerId;
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch (error) {
      // Ignore capture failures.
    }
    if (this.orbit) this.orbit.enabled = false;

    if (this.toolState.mode === "sculpt" && this.toolState.sculptOp === "flatten") {
      this.toolState.flattenHeight = this.getFlattenHeight
        ? this.getFlattenHeight(hit.point, terrain)
        : this.toolState.flattenHeight;
    } else {
      this.toolState.flattenHeight = null;
    }

    this.applyEdit?.(hit.point, terrain);
    return true;
  }

  handlePointerMove(event) {
    if (this.isEditBlocked?.()) {
      this.updateBrushPreview?.(null);
      return;
    }
    const terrain = this.getSelectedTerrain();
    if (!terrain) return;
    const hit = this.getTerrainHit(event, terrain);
    if (!hit) {
      this.updateBrushPreview?.(null);
      return;
    }

    if (this.toolState.enabled) {
      this.updateBrushPreview?.(hit);
    }

    if (!this.isEditing) return;
    if (event.pointerId !== this.pointerId) return;
    this.applyEdit?.(hit.point, terrain);
  }

  handlePointerUp(event) {
    if (!this.isEditing) return;
    if (event.pointerId !== this.pointerId) return;
    this.isEditing = false;
    this.pointerId = null;
    if (this.orbit) this.orbit.enabled = true;
    this.toolState.flattenHeight = null;
  }

  cancel() {
    this.isEditing = false;
    this.pointerId = null;
    if (this.orbit) this.orbit.enabled = true;
    this.toolState.flattenHeight = null;
  }
}
