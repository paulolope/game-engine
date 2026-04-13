import { normalizeTerrainData } from "../TerrainSystem.js?v=20260413a";

export class TerrainData {
  constructor(data = {}) {
    Object.assign(this, normalizeTerrainData(data));
  }

  toJSON() {
    return {
      size: this.size,
      sizeZ: this.sizeZ,
      segments: this.segments,
      textureScale: this.textureScale,
      maxHeight: this.maxHeight,
      heights: this.heights,
      splat: this.splat,
      layers: this.layers,
      trees: this.trees,
    };
  }
}
