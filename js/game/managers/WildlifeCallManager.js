import * as THREE from "three";

const tmpOrigin = new THREE.Vector3();

function sanitizeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export class WildlifeCallManager {
  constructor({ sceneStore, scriptSystem, inventoryManager, domElement, uiState, getOrigin, statusTarget }) {
    this.sceneStore = sceneStore;
    this.scriptSystem = scriptSystem;
    this.inventoryManager = inventoryManager;
    this.domElement = domElement;
    this.uiState = uiState || { isInventoryOpen: false };
    this.getOrigin = typeof getOrigin === "function" ? getOrigin : null;
    this.statusTarget = statusTarget || null;

    this.enabled = false;
    this.cooldowns = new Map();

    this.onPointerDown = (event) => {
      if (!this.enabled || this.uiState.isInventoryOpen) return;
      if (this.uiState.interactionConsumesFire === true) return;
      if (event.button !== 0) return;
      const item = this.inventoryManager?.getEquippedItem?.();
      if (!item?.use || item.use.type !== "animalCall") return;
      event.preventDefault();
      this.triggerAnimalCall(item);
    };
  }

  initialize() {
    this.domElement?.addEventListener("pointerdown", this.onPointerDown);
  }

  setEnabled(enabled) {
    this.enabled = enabled !== false;
  }

  getEmitterOrigin() {
    if (this.getOrigin) {
      const origin = this.getOrigin();
      if (origin?.isVector3) {
        return tmpOrigin.copy(origin);
      }
      if (Array.isArray(origin) && origin.length >= 3) {
        return tmpOrigin.set(
          sanitizeNumber(origin[0], 0),
          sanitizeNumber(origin[1], 0),
          sanitizeNumber(origin[2], 0)
        );
      }
    }
    return tmpOrigin.set(0, 0, 0);
  }

  getRemainingCooldownSeconds(itemId) {
    const endsAt = Number(this.cooldowns.get(itemId) || 0);
    if (!endsAt) return 0;
    return Math.max(0, (endsAt - performance.now()) / 1000);
  }

  triggerAnimalCall(item) {
    const itemId = String(item?.id || "").trim();
    const use = item?.use || null;
    if (!itemId || !use) return false;

    const remaining = this.getRemainingCooldownSeconds(itemId);
    if (remaining > 0.05) {
      this.statusTarget?.setStatus?.(`${item.label} pronto em ${remaining.toFixed(1)}s`, 950);
      return false;
    }

    const origin = this.getEmitterOrigin();
    const callData = {
      sourceItemId: itemId,
      profile: String(use.profile || "").trim().toLowerCase(),
      targetAssetPath: String(use.targetAssetPath || "").trim(),
      origin: origin.clone(),
      radius: Math.max(1, sanitizeNumber(use.radius, 28)),
      duration: Math.max(0.5, sanitizeNumber(use.duration, 7)),
      approachDistance: Math.max(0.5, sanitizeNumber(use.approachDistance, 2.2)),
    };

    let affected = 0;
    const entities = this.sceneStore?.listEntities?.() || [];
    entities.forEach((entity) => {
      const component = entity?.components?.find?.((entry) => entry.type === "AnimalAI" && entry.enabled !== false);
      if (!component) return;
      const instance = this.scriptSystem?.getComponentInstance?.(component.id);
      if (instance?.receiveWildlifeCall?.(callData)) {
        affected += 1;
      }
    });

    const cooldown = Math.max(0, sanitizeNumber(use.cooldown, 6));
    if (cooldown > 0) {
      this.cooldowns.set(itemId, performance.now() + cooldown * 1000);
    }

    if (affected > 0) {
      this.statusTarget?.setStatus?.(`${item.label} ativo. ${affected} stag(s) responderam.`, 1400);
      return true;
    }

    this.statusTarget?.setStatus?.(`${item.label} ativo, mas nenhum stag respondeu.`, 1500);
    return false;
  }
}
