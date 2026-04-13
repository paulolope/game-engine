import * as THREE from "three";

const tmpPlayerPos = new THREE.Vector3();
const tmpStandPos = new THREE.Vector3();
const tmpStandBox = new THREE.Box3();
const tmpBoxSize = new THREE.Vector3();
const tmpBoxCenter = new THREE.Vector3();
const tmpForward = new THREE.Vector3();
const tmpLocalTarget = new THREE.Vector3();
const tmpHorizontalA = new THREE.Vector2();
const tmpHorizontalB = new THREE.Vector2();
const tmpQuaternion = new THREE.Quaternion();

const TREE_STAND_DEFAULT_PROMPT_RADIUS = 4.2;
const TREE_STAND_DEFAULT_REMOVE_RADIUS = 4.8;
const TREE_STAND_DEFAULT_PLATFORM_HEIGHT = 2.08;
const TREE_STAND_DEFAULT_MOUNT_OFFSET = 0.34;
const TREE_STAND_DEFAULT_EXIT_OFFSET = 1.05;

function getSourcePath(entity) {
  return String(entity?.source?.path || "").trim().toLowerCase();
}

function isTreeStandEntity(entity) {
  if (!entity || entity.type !== "model") return false;
  if (entity.gameplay?.kind === "tree-stand") return true;
  const sourcePath = getSourcePath(entity);
  return sourcePath.includes("tree_stand.glb") || sourcePath === "builtin://tree-stand";
}

function setWorldPosition(object, worldPosition) {
  if (!object) return;
  if (object.parent) {
    object.parent.worldToLocal(tmpLocalTarget.copy(worldPosition));
    object.position.copy(tmpLocalTarget);
    return;
  }
  object.position.copy(worldPosition);
}

function horizontalDistance(a, b) {
  tmpHorizontalA.set(a.x, a.z);
  tmpHorizontalB.set(b.x, b.z);
  return tmpHorizontalA.distanceTo(tmpHorizontalB);
}

function readVector3(value) {
  if (!Array.isArray(value) || value.length < 3) return null;
  return new THREE.Vector3(
    Number(value[0]) || 0,
    Number(value[1]) || 0,
    Number(value[2]) || 0
  );
}

function getControllerEyeHeight(controller) {
  const explicitHeight =
    Number(controller?.cameraEntity?.three?.position?.y) ||
    Number(controller?.props?.height) ||
    1.6;
  return THREE.MathUtils.clamp(explicitHeight, 1.1, 2.1);
}

export class TreeStandInteractionManager {
  constructor({
    sceneStore,
    input,
    uiState,
    inventoryManager,
    placementManager,
    getPlayerEntity,
    getPlayerController,
    statusTarget,
    promptElement,
    onRemoved,
  }) {
    this.sceneStore = sceneStore;
    this.input = input;
    this.uiState = uiState || { isInventoryOpen: false };
    this.inventoryManager = inventoryManager || null;
    this.placementManager = placementManager || null;
    this.getPlayerEntity = getPlayerEntity;
    this.getPlayerController = getPlayerController;
    this.statusTarget = statusTarget || null;
    this.promptElement = promptElement || null;
    this.onRemoved = onRemoved || null;

    this.enabled = false;
    this.activeStandId = "";
    this.mountedStandId = "";
    this.mountedStandExit = new THREE.Vector3();
    this.menuContext = null;
    this.actionBusy = false;
    this.interactHeld = false;
    this.primaryHeld = false;
    this.secondaryHeld = false;
  }

  setEnabled(enabled) {
    this.enabled = enabled !== false;
    if (!this.enabled) {
      this.activeStandId = "";
      this.mountedStandId = "";
      this.menuContext = null;
      this.actionBusy = false;
      this.uiState.interactionConsumesReload = false;
      this.uiState.interactionConsumesFire = false;
      this.uiState.playerMovementLocked = false;
      this.hidePrompt();
    }
  }

  hidePrompt() {
    this.promptElement?.classList.add("hidden");
    if (this.promptElement) {
      this.promptElement.textContent = "";
    }
  }

  showPrompt(text) {
    if (!this.promptElement) return;
    this.promptElement.textContent = text;
    this.promptElement.classList.toggle("hidden", !text);
  }

  closeMenu() {
    this.menuContext = null;
    this.uiState.interactionConsumesFire = false;
  }

  openMenu(actionContext) {
    if (!actionContext) return;
    if (actionContext.type === "place") {
      this.menuContext = {
        type: "place",
        terrainId: String(actionContext.placement?.terrainId || ""),
        treeIndex: Number(actionContext.placement?.treeIndex),
      };
      this.uiState.interactionConsumesFire = true;
      return;
    }

    this.menuContext = {
      type: actionContext.type,
      standId: actionContext.stand?.id || "",
    };
    this.uiState.interactionConsumesFire = true;
  }

  menuMatches(actionContext) {
    if (!this.menuContext || !actionContext) return false;

    if (this.menuContext.type === "place") {
      return (
        actionContext.type === "place" &&
        this.menuContext.terrainId === String(actionContext.placement?.terrainId || "") &&
        this.menuContext.treeIndex === Number(actionContext.placement?.treeIndex)
      );
    }

    return (
      (actionContext.type === "stand" || actionContext.type === "mounted-stand") &&
      this.menuContext.standId === String(actionContext.stand?.id || "")
    );
  }

  getPlayerContext() {
    const player = this.getPlayerEntity?.() || null;
    const controller = this.getPlayerController?.() || null;
    if (!player?.three || !controller) return null;
    player.three.getWorldPosition(tmpPlayerPos);
    return { player, controller, position: tmpPlayerPos.clone() };
  }

  getInteractionMetrics(entity, controller = null) {
    const storedInteractionOrigin = readVector3(entity.gameplay?.interactionOrigin);
    const storedMountPoint = readVector3(entity.gameplay?.mountPoint);
    const storedExitPoint = readVector3(entity.gameplay?.exitPoint);
    let storedLadderDirection = readVector3(entity.gameplay?.ladderDirection);
    if (storedLadderDirection?.lengthSq() > 0.0001) {
      storedLadderDirection.normalize();
    } else {
      storedLadderDirection = null;
    }

    const anchoredTreePosition = readVector3(entity.gameplay?.anchor?.treePosition);
    if (anchoredTreePosition) {
      const standPosition = storedInteractionOrigin || entity.three.getWorldPosition(tmpStandPos).clone();
      let ladderDirection = storedLadderDirection;
      if (!ladderDirection) {
        ladderDirection = standPosition.clone().sub(anchoredTreePosition);
        ladderDirection.y = 0;
        if (ladderDirection.lengthSq() < 0.0001) {
          ladderDirection.set(0, 0, 1);
        } else {
          ladderDirection.normalize();
        }
      }

      const promptRadius = Math.max(
        2.8,
        Number(entity.gameplay?.promptRadius) || TREE_STAND_DEFAULT_PROMPT_RADIUS
      );
      const removeRadius = Math.max(
        promptRadius + 0.2,
        Number(entity.gameplay?.removeRadius) || TREE_STAND_DEFAULT_REMOVE_RADIUS
      );
      const mountPoint =
        storedMountPoint ||
        standPosition.clone().addScaledVector(ladderDirection, TREE_STAND_DEFAULT_MOUNT_OFFSET);
      mountPoint.y = storedMountPoint?.y ?? anchoredTreePosition.y + TREE_STAND_DEFAULT_PLATFORM_HEIGHT;

      const exitPoint =
        storedExitPoint ||
        anchoredTreePosition
          .clone()
          .addScaledVector(
            ladderDirection,
            Math.max(
              TREE_STAND_DEFAULT_EXIT_OFFSET,
              (Number(entity.gameplay?.anchor?.treeRadius) || 0.5) + 0.8
            )
          );
      exitPoint.y = storedExitPoint?.y ?? anchoredTreePosition.y + 0.02;

      return {
        mountPoint,
        exitPoint,
        promptRadius,
        removeRadius,
        eyeHeight: getControllerEyeHeight(controller),
        forward: ladderDirection.clone(),
        standPosition,
      };
    }

    tmpStandBox.setFromObject(entity.three);
    if (tmpStandBox.isEmpty()) {
      entity.three.getWorldPosition(tmpStandPos);
      tmpStandBox.min.copy(tmpStandPos);
      tmpStandBox.max.copy(tmpStandPos);
    }
    tmpStandBox.getSize(tmpBoxSize);
    tmpStandBox.getCenter(tmpBoxCenter);

    tmpForward.set(0, 0, 1).applyQuaternion(entity.three.getWorldQuaternion(tmpQuaternion)).normalize();
    if (tmpForward.lengthSq() < 0.0001) {
      tmpForward.set(0, 0, 1);
    }

    const eyeHeight = getControllerEyeHeight(controller);
    const mountEyeHeightFactor = Number(entity.gameplay?.mountEyeHeightFactor);
    const mountBackOffsetFactor = Number(entity.gameplay?.mountBackOffsetFactor) || 0.16;
    const exitForwardFactor = Number(entity.gameplay?.exitForwardFactor) || 0.72;
    const desiredEyeY =
      tmpStandBox.min.y +
      Math.max(
        eyeHeight + 0.85,
        tmpBoxSize.y * (Number.isFinite(mountEyeHeightFactor) ? mountEyeHeightFactor : 0.92)
      );

    const mountPoint = tmpBoxCenter.clone();
    mountPoint.addScaledVector(tmpForward, -Math.max(0.12, tmpBoxSize.z * mountBackOffsetFactor));
    mountPoint.y = desiredEyeY - eyeHeight;

    const exitPoint = tmpBoxCenter.clone();
    exitPoint.addScaledVector(tmpForward, Math.max(0.65, tmpBoxSize.z * exitForwardFactor));
    exitPoint.y = tmpStandBox.min.y + 0.02;

    const promptRadius = Math.max(1.6, Number(entity.gameplay?.promptRadius) || Math.max(2.8, tmpBoxSize.x + 1.4));
    const removeRadius = Math.max(promptRadius + 0.2, Number(entity.gameplay?.removeRadius) || promptRadius + 0.6);

    return {
      mountPoint,
      exitPoint,
      promptRadius,
      removeRadius,
      eyeHeight,
      forward: tmpForward.clone(),
      standPosition: tmpBoxCenter.clone(),
    };
  }

  findNearestStand(playerPosition, controller = null) {
    let best = null;
    let bestDistance = Infinity;
    this.sceneStore.listEntities().forEach((entity) => {
      if (!isTreeStandEntity(entity) || entity.active === false || !entity.three) return;
      const metrics = this.getInteractionMetrics(entity, controller);
      const distance = horizontalDistance(playerPosition, metrics.standPosition);
      if (distance > metrics.promptRadius || distance >= bestDistance) return;
      best = entity;
      bestDistance = distance;
    });
    return best;
  }

  getPlacementActionContext() {
    const item = this.inventoryManager?.getEquippedItem?.() || null;
    if (!item?.placement || item.placement.requiresInteractMenu !== true) return null;

    const placement = this.placementManager?.getPlacementContext?.() || null;
    if (!placement || placement.occupiedStandId) return null;

    const requiredSurface = String(item.placement.surface || "").trim().toLowerCase();
    if (requiredSurface === "tree" && placement.mode !== "tree") return null;

    return {
      type: "place",
      item,
      placement,
    };
  }

  resolveActionContext(playerContext) {
    let activeStand = this.mountedStandId ? this.sceneStore.getEntity(this.mountedStandId) : null;
    if (this.mountedStandId && !activeStand) {
      this.mountedStandId = "";
      this.uiState.playerMovementLocked = false;
      activeStand = null;
    }

    if (!activeStand) {
      activeStand = this.findNearestStand(playerContext.position, playerContext.controller);
    }

    this.activeStandId = activeStand?.id || "";
    if (activeStand) {
      const metrics = this.getInteractionMetrics(activeStand, playerContext.controller);
      const distanceToStand = horizontalDistance(playerContext.position, metrics.standPosition);
      return {
        type: this.mountedStandId === activeStand.id ? "mounted-stand" : "stand",
        stand: activeStand,
        metrics,
        canRemove: this.mountedStandId === activeStand.id || distanceToStand <= metrics.removeRadius,
      };
    }

    return this.getPlacementActionContext();
  }

  buildHintPrompt(actionContext) {
    if (!actionContext) return "";
    if (actionContext.type === "place") {
      return "E abrir menu para colocar o tree stand";
    }
    return "E abrir menu do tree stand";
  }

  buildMenuPrompt(actionContext) {
    if (!actionContext) return "";
    if (actionContext.type === "place") {
      return "Mouse esquerdo colocar | Mouse direito cancelar | E fechar";
    }
    if (actionContext.type === "mounted-stand") {
      return "Mouse esquerdo descer | Mouse direito remover | E fechar";
    }
    return "Mouse esquerdo subir | Mouse direito remover | E fechar";
  }

  mountStand(entity, player, controller) {
    const metrics = this.getInteractionMetrics(entity, controller);
    setWorldPosition(player.three, metrics.mountPoint);
    player.three.updateMatrixWorld(true);

    const yaw = Math.atan2(metrics.forward.x, -metrics.forward.z);
    if (typeof controller.setLookRotation === "function") {
      controller.setLookRotation(yaw, 0);
    }

    this.mountedStandId = entity.id;
    this.mountedStandExit.copy(metrics.exitPoint);
    this.uiState.playerMovementLocked = true;
    this.statusTarget?.setStatus?.("No tree stand. Pressione E para abrir o menu.", 1200);
  }

  dismountStand(player) {
    if (!player?.three) return;
    setWorldPosition(player.three, this.mountedStandExit);
    player.three.updateMatrixWorld(true);
    this.mountedStandId = "";
    this.uiState.playerMovementLocked = false;
    this.statusTarget?.setStatus?.("Saiu do tree stand.", 900);
  }

  async removeStand(entity, player) {
    if (!entity) return;
    if (this.mountedStandId === entity.id) {
      this.dismountStand(player);
    }
    this.sceneStore.removeEntity(entity.id);
    this.activeStandId = "";
    this.statusTarget?.setStatus?.("Tree stand removido.", 900);
    await this.onRemoved?.(entity);
  }

  async handlePrimaryAction(actionContext, playerContext) {
    if (!actionContext || this.actionBusy) return;
    this.actionBusy = true;

    try {
      if (actionContext.type === "place") {
        await this.placementManager?.placeEquippedItem?.();
        this.closeMenu();
        return;
      }

      if (actionContext.type === "mounted-stand") {
        this.dismountStand(playerContext.player);
        this.closeMenu();
        return;
      }

      this.mountStand(actionContext.stand, playerContext.player, playerContext.controller);
      this.closeMenu();
    } finally {
      this.actionBusy = false;
    }
  }

  async handleSecondaryAction(actionContext, playerContext) {
    if (!actionContext || this.actionBusy) return;
    if (actionContext.type === "place") {
      this.closeMenu();
      return;
    }
    if (!actionContext.canRemove) {
      this.statusTarget?.setStatus?.("Chegue mais perto do tree stand para remover.", 1200);
      return;
    }

    this.actionBusy = true;
    try {
      await this.removeStand(actionContext.stand, playerContext.player);
      this.closeMenu();
    } finally {
      this.actionBusy = false;
    }
  }

  update() {
    if (!this.enabled || this.uiState.isInventoryOpen) {
      this.uiState.interactionConsumesReload = false;
      this.uiState.interactionConsumesFire = false;
      if (!this.mountedStandId) {
        this.uiState.playerMovementLocked = false;
      }
      this.menuContext = null;
      this.hidePrompt();
      this.interactHeld = false;
      this.primaryHeld = false;
      this.secondaryHeld = false;
      return;
    }

    const playerContext = this.getPlayerContext();
    if (!playerContext) {
      this.uiState.interactionConsumesReload = false;
      this.uiState.interactionConsumesFire = false;
      this.menuContext = null;
      this.hidePrompt();
      this.interactHeld = false;
      this.primaryHeld = false;
      this.secondaryHeld = false;
      return;
    }

    const actionContext = this.resolveActionContext(playerContext);
    const interactDown = this.input?.isDown?.("KeyE") === true;
    const primaryDown = this.input?.isDown?.("MouseLeft") === true;
    const secondaryDown = this.input?.isDown?.("MouseRight") === true;

    this.uiState.interactionConsumesReload = false;
    if (!this.mountedStandId) {
      this.uiState.playerMovementLocked = false;
    }

    if (!actionContext) {
      this.closeMenu();
      this.hidePrompt();
      this.interactHeld = interactDown;
      this.primaryHeld = primaryDown;
      this.secondaryHeld = secondaryDown;
      return;
    }

    if (this.menuContext && !this.menuMatches(actionContext)) {
      this.closeMenu();
    }

    if (interactDown && !this.interactHeld && !this.actionBusy) {
      if (this.menuContext) {
        this.closeMenu();
      } else {
        this.openMenu(actionContext);
      }
    }

    this.showPrompt(this.menuContext ? this.buildMenuPrompt(actionContext) : this.buildHintPrompt(actionContext));
    this.uiState.interactionConsumesFire = !!this.menuContext;

    if (this.menuContext && !this.actionBusy) {
      if (primaryDown && !this.primaryHeld) {
        void this.handlePrimaryAction(actionContext, playerContext);
      }
      if (secondaryDown && !this.secondaryHeld) {
        void this.handleSecondaryAction(actionContext, playerContext);
      }
    }

    this.interactHeld = interactDown;
    this.primaryHeld = primaryDown;
    this.secondaryHeld = secondaryDown;
  }
}
