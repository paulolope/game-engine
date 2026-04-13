import * as TerrainSystem from "../TerrainSystem.js?v=20260413a";

export class TerrainRenderer {
  static create(data) {
    return TerrainSystem.buildTerrainGroup(data);
  }

  static rebuild(mesh, data) {
    return TerrainSystem.rebuildTerrainMesh(mesh, data);
  }

  static updateLayers(mesh, layers, scale) {
    if (TerrainSystem.updateTerrainLayers) {
      TerrainSystem.updateTerrainLayers(mesh, layers, scale);
    } else {
      TerrainSystem.updateTerrainTextureScale?.(mesh, scale);
    }
  }
}
