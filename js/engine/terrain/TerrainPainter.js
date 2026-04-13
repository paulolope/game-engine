import { brushFalloff } from "./TerrainBrush.js";

export function paintTerrain(entity, worldPoint, tool) {
  if (!entity?.terrain?.mesh) return;
  const mesh = entity.terrain.mesh;
  const geometry = mesh.geometry;
  const attr = geometry.attributes.color;
  if (!attr) return;

  const layerIndex = Math.max(0, Math.min(3, tool.paintLayerIndex ?? 0));
  const radius = Math.max(0.1, tool.brushSize || 1);
  const strength = Math.max(0, tool.strength || 0.1);
  const falloff = tool.falloff ?? 0.5;

  const local = mesh.worldToLocal(worldPoint.clone());
  const weights = [0, 0, 0, 0];

  for (let i = 0; i < attr.count; i += 1) {
    const dx = geometry.attributes.position.getX(i) - local.x;
    const dz = geometry.attributes.position.getZ(i) - local.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > radius) continue;
    const falloffWeight = brushFalloff(dist, radius, falloff);
    if (falloffWeight <= 0) continue;

    const r = attr.getX(i);
    const g = attr.getY(i);
    const b = attr.getZ(i);
    weights[1] = r;
    weights[2] = g;
    weights[3] = b;
    weights[0] = Math.max(0, 1 - (r + g + b));

    const target = Math.min(1, weights[layerIndex] + strength * falloffWeight);
    weights[layerIndex] = target;

    let sumOthers = weights.reduce((sum, value, index) => sum + (index === layerIndex ? 0 : value), 0);
    const remaining = Math.max(0, 1 - target);
    if (sumOthers > 0) {
      const scale = remaining / sumOthers;
      for (let j = 0; j < weights.length; j += 1) {
        if (j === layerIndex) continue;
        weights[j] *= scale;
      }
    } else {
      for (let j = 0; j < weights.length; j += 1) {
        if (j === layerIndex) continue;
        weights[j] = 0;
      }
    }

    attr.setXYZ(i, weights[1], weights[2], weights[3]);
  }

  attr.needsUpdate = true;
}
