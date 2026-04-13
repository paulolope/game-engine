import * as THREE from "three";

const sharedTreeWorldPos = new THREE.Vector3();
const sharedCurrentWorldPos = new THREE.Vector3();
const sharedNextWorldPos = new THREE.Vector3();
const sharedLocalPos = new THREE.Vector3();

export function isTreeCollidable(tree) {
  return tree?.collidable !== false;
}

export function getTreeCollisionRadius(tree) {
  const scale = Math.max(0.2, Number(tree?.scale) || 1);
  const collisionRadiusValue = Number(tree?.collisionRadius);
  if (Number.isFinite(collisionRadiusValue)) {
    return Math.max(0.2, collisionRadiusValue);
  }
  return Math.max(0.6, scale * 0.7);
}

export function normalizeTreeCollision(tree = {}) {
  return {
    ...tree,
    collidable: isTreeCollidable(tree),
    collisionRadius: getTreeCollisionRadius(tree),
  };
}

export function isWorldPositionBlockedByTrees(sceneStore, worldPosition, actorRadius = 0.42, targetEntityId = "") {
  const terrains = sceneStore.listEntities().filter((entity) => entity?.type === "terrain" && entity?.three);

  for (const terrain of terrains) {
    if (terrain.active === false || !Array.isArray(terrain.terrain?.trees) || !terrain.terrain.trees.length) continue;

    terrain.three.updateWorldMatrix(true, false);
    const worldMatrix = terrain.three.matrixWorld;

    for (const tree of terrain.terrain.trees) {
      if (!isTreeCollidable(tree)) continue;
      if (targetEntityId && tree?.entityId && tree.entityId === targetEntityId) continue;

      sharedTreeWorldPos.set(Number(tree.x) || 0, Number(tree.y) || 0, Number(tree.z) || 0).applyMatrix4(worldMatrix);
      const radius = getTreeCollisionRadius(tree);
      const dx = worldPosition.x - sharedTreeWorldPos.x;
      const dz = worldPosition.z - sharedTreeWorldPos.z;
      const minDistance = actorRadius + radius;
      if (dx * dx + dz * dz < minDistance * minDistance) {
        return true;
      }
    }
  }

  return false;
}

export function moveObjectWithTreeCollisions(
  sceneStore,
  object3D,
  delta,
  actorRadius = 0.42,
  scratch = {}
) {
  if (!sceneStore || !object3D || !delta) return false;

  const currentWorldPos = scratch.currentWorldPos || sharedCurrentWorldPos;
  const nextWorldPos = scratch.nextWorldPos || sharedNextWorldPos;
  const localPos = scratch.localPos || sharedLocalPos;

  object3D.getWorldPosition(currentWorldPos);

  let moved = false;
  if (Math.abs(delta.x) > 0.0001) {
    nextWorldPos.copy(currentWorldPos);
    nextWorldPos.x += delta.x;
    if (!isWorldPositionBlockedByTrees(sceneStore, nextWorldPos, actorRadius)) {
      currentWorldPos.x = nextWorldPos.x;
      moved = true;
    }
  }

  if (Math.abs(delta.z) > 0.0001) {
    nextWorldPos.copy(currentWorldPos);
    nextWorldPos.z += delta.z;
    if (!isWorldPositionBlockedByTrees(sceneStore, nextWorldPos, actorRadius)) {
      currentWorldPos.z = nextWorldPos.z;
      moved = true;
    }
  }

  if (!moved) return false;

  if (object3D.parent) {
    localPos.copy(currentWorldPos);
    object3D.parent.worldToLocal(localPos);
    object3D.position.copy(localPos);
  } else {
    object3D.position.copy(currentWorldPos);
  }

  return true;
}
