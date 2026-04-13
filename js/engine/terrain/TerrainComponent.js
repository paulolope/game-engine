export class TerrainComponent {
  constructor({ mesh, data }) {
    this.mesh = mesh;
    this.treesMesh = null;
    this.applyData(data);
  }

  applyData(data) {
    this.size = data.size;
    this.sizeZ = data.sizeZ;
    this.segments = data.segments;
    this.textureScale = data.textureScale;
    this.maxHeight = data.maxHeight ?? 6;
    this.layers = data.layers ? data.layers.map((layer) => ({ ...layer })) : [];
    this.trees = data.trees ? data.trees.map((tree) => ({ ...tree })) : [];
  }
}
