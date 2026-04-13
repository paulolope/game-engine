import { extractTerrainData, normalizeTerrainData } from "../TerrainSystem.js?v=20260413a";

export function serializeTerrain(entity) {
  return extractTerrainData(entity);
}

export function normalizeTerrainPayload(data) {
  return normalizeTerrainData(data);
}
