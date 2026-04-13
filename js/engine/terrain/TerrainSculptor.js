import * as THREE from "three";
import { brushFalloff } from "./TerrainBrush.js";
import { sampleTerrainHeight, updateTerrainTrees } from "../TerrainSystem.js?v=20260413a";

export function sculptTerrain(entity, worldPoint, tool) {
  if (!entity?.terrain?.mesh) return;
  const mesh = entity.terrain.mesh;
  const geometry = mesh.geometry;
  const pos = geometry.attributes.position;
  const radius = Math.max(0.1, tool.brushSize || 1);
  const strength = Math.max(0, tool.strength || 0.1);
  const falloff = tool.falloff ?? 0.5;
  const local = mesh.worldToLocal(worldPoint.clone());
  const maxHeight = entity.terrain.maxHeight ?? 6;

  let avgHeight = 0;
  let avgCount = 0;
  if (tool.sculptOp === "smooth") {
    for (let i = 0; i < pos.count; i += 1) {
      const dx = pos.getX(i) - local.x;
      const dz = pos.getZ(i) - local.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist <= radius) {
        avgHeight += pos.getY(i);
        avgCount += 1;
      }
    }
    avgHeight = avgCount ? avgHeight / avgCount : 0;
  }

  const targetHeight = tool.sculptOp === "flatten" ? tool.flattenHeight ?? 0 : 0;

  for (let i = 0; i < pos.count; i += 1) {
    const dx = pos.getX(i) - local.x;
    const dz = pos.getZ(i) - local.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > radius) continue;
    const falloffWeight = brushFalloff(dist, radius, falloff);
    if (falloffWeight <= 0) continue;
    const current = pos.getY(i);

    if (tool.sculptOp === "raise") {
      pos.setY(i, THREE.MathUtils.clamp(current + strength * falloffWeight, -maxHeight, maxHeight));
    } else if (tool.sculptOp === "lower") {
      pos.setY(i, THREE.MathUtils.clamp(current - strength * falloffWeight, -maxHeight, maxHeight));
    } else if (tool.sculptOp === "smooth") {
      const next = THREE.MathUtils.lerp(current, avgHeight, strength * falloffWeight);
      pos.setY(i, THREE.MathUtils.clamp(next, -maxHeight, maxHeight));
    } else if (tool.sculptOp === "flatten") {
      const next = THREE.MathUtils.lerp(current, targetHeight, strength * falloffWeight);
      pos.setY(i, THREE.MathUtils.clamp(next, -maxHeight, maxHeight));
    }
  }

  pos.needsUpdate = true;
  geometry.computeVertexNormals();

  if (entity.terrain.trees?.length) {
    entity.terrain.trees.forEach((tree) => {
      tree.y = sampleTerrainHeight(entity, tree.x, tree.z);
    });
    updateTerrainTrees(entity);
  }
}
