import * as THREE from "three";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { clamp } from "../utils/utils.js";
import { moveObjectWithTreeCollisions } from "../utils/treeCollisions.js";

const CENTER_SCREEN = new THREE.Vector2(0, 0);

export class FPSController {
  static type = "FPSController";
  static label = "FPS Controller";
  static defaults = {
    speed: 4,
    lookSpeed: 0.002,
    height: 1.6,
    enablePointerLock: true,
    cameraId: "",
    useCameraForward: true,

    weaponModelPath: "assets/models/fps_arms_remington_shotgun.glb",
    weaponScale: 1,
    weaponOffsetX: 0.26,
    weaponOffsetY: -0.24,
    weaponOffsetZ: -0.38,
    weaponRotX: 0,
    weaponRotY: 0,
    weaponRotZ: 0,

    fireRate: 0.35,
    range: 85,
    spread: 0,
    magazineSize: 6,
    reserveAmmo: 24,
    reloadTime: 1.6,
    hitRemoveTarget: true,
    autoReload: true,
  };

  static schema = [
    { key: "speed", label: "Velocidade", type: "number", step: 0.1 },
    { key: "lookSpeed", label: "Sensibilidade", type: "number", step: 0.0005 },
    { key: "height", label: "Altura Camera", type: "number", step: 0.1 },
    { key: "enablePointerLock", label: "Mouse Lock", type: "boolean" },
    { key: "cameraId", label: "Camera", type: "entity" },
    { key: "useCameraForward", label: "Camera Move", type: "boolean" },

    { key: "weaponModelPath", label: "Arma GLB", type: "text" },
    { key: "weaponScale", label: "Escala Arma", type: "number", step: 0.01 },
    { key: "weaponOffsetX", label: "Arma X", type: "number", step: 0.01 },
    { key: "weaponOffsetY", label: "Arma Y", type: "number", step: 0.01 },
    { key: "weaponOffsetZ", label: "Arma Z", type: "number", step: 0.01 },
    { key: "weaponRotX", label: "Arma Rot X", type: "number", step: 1 },
    { key: "weaponRotY", label: "Arma Rot Y", type: "number", step: 1 },
    { key: "weaponRotZ", label: "Arma Rot Z", type: "number", step: 1 },

    { key: "fireRate", label: "Cadencia", type: "number", step: 0.01 },
    { key: "range", label: "Alcance", type: "number", step: 0.5 },
    { key: "spread", label: "Spread", type: "number", step: 0.0005 },
    { key: "magazineSize", label: "Pente", type: "number", step: 1 },
    { key: "reserveAmmo", label: "Reserva", type: "number", step: 1 },
    { key: "reloadTime", label: "Reload (s)", type: "number", step: 0.1 },
    { key: "hitRemoveTarget", label: "Remover no Hit", type: "boolean" },
    { key: "autoReload", label: "Auto Reload", type: "boolean" },
  ];

  constructor(entity, props, context) {
    this.entity = entity;
    this.props = props;
    this.sceneStore = context.sceneStore;
    this.input = context.input;
    this.mode = context.mode || "editor";
    this.domElement = context.domElement || null;
    this.uiState = context.uiState || { isInventoryOpen: false };

    this.pitch = 0;
    this.yaw = 0;
    this.cameraEntity = null;
    this.camera = null;
    this.isLocked = false;
    this.weaponActive = true;

    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.move = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.tempDir = new THREE.Vector3();
    this.currentWorldPos = new THREE.Vector3();
    this.nextWorldPos = new THREE.Vector3();
    this.treeWorldPos = new THREE.Vector3();
    this.parentLocalPos = new THREE.Vector3();

    this.raycaster = new THREE.Raycaster();
    this.rayOrigin = new THREE.Vector3();
    this.rayDir = new THREE.Vector3();
    this.basisX = new THREE.Vector3();
    this.basisY = new THREE.Vector3();
    this.basisZ = new THREE.Vector3();
    this.fallbackAimPoint = new THREE.Vector3();
    this.fallbackTargetPos = new THREE.Vector3();
    this.fallbackClosestPoint = new THREE.Vector3();
    this.cameraQuat = new THREE.Quaternion();
    this.crosshairNdc = new THREE.Vector2(0, 0);

    this.weaponPivot = null;
    this.weaponModel = null;
    this.weaponFallback = null;
    this.weaponModelBaseScale = 1;
    this.loadingWeaponPath = "";

    this.recoil = 0;
    this.shootCooldown = 0;
    this.reloadTimer = 0;
    this.fireHeld = false;
    this.reloadHeld = false;

    this.ammoInMag = NaN;
    this.reserveAmmo = NaN;

    this.muzzleFlash = null;
    this.muzzleLight = null;
    this.muzzleTimer = 0;

    this.statusText = "";
    this.statusUntil = 0;

    this.hudRoot = null;
    this.crosshairEl = null;
    this.ammoCurrentEl = null;
    this.ammoReserveEl = null;
    this.statusEl = null;
    this.hitMarkerEl = null;
    this.hitTimerId = null;

    this.onMouseMove = (event) => {
      if (this.isUIBlocked()) return;
      if (this.props.enablePointerLock && !this.isLocked) return;
      const look = this.numberProp("lookSpeed", 0.002);
      this.yaw -= event.movementX * look;
      this.pitch = clamp(this.pitch - event.movementY * look, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
      if (this.cameraEntity) {
        this.cameraEntity.three.rotation.set(this.pitch, this.yaw, 0, "YXZ");
      }
    };

    this.onPointerLockChange = () => {
      this.isLocked = document.pointerLockElement === this.domElement;
      if (!this.isLocked && this.props.enablePointerLock) {
        this.setStatus("Clique para travar o mouse", 1200);
      }
      this.updateHud();
    };

    this.onCanvasClick = () => {
      if (this.isUIBlocked()) return;
      if (!this.props.enablePointerLock || !this.domElement) return;
      if (!this.isLocked) {
        this.domElement.requestPointerLock();
      }
    };

    this.onContextMenu = (event) => {
      if (this.mode === "game") {
        event.preventDefault();
      }
    };
  }

  start() {
    this.ensureCamera();
    this.migrateLegacyWeaponProps();
    this.initAmmo();
    this.setWeaponActive(true);

    if (this.mode === "game") {
      this.setPlayerBodyVisible(false);
      this.bindGameInput();
      this.setupHud();
      this.setupWeapon();
      if (this.props.enablePointerLock) {
        this.setStatus("Clique para travar o mouse", 1200);
      }
      this.updateHud();
    }
  }

  migrateLegacyWeaponProps() {
    const path = String(this.props.weaponModelPath || "").trim();
    const usingDefaultPath = !path || path === "assets/models/fps_arms_remington_shotgun.glb";
    if (!usingDefaultPath) return;

    const scale = this.numberProp("weaponScale", 1);
    const yaw = this.numberProp("weaponRotY", 0);

    if (Math.abs(yaw - 180) < 0.0001) {
      this.props.weaponRotY = 0;
    }
    if (Math.abs(scale - 0.45) < 0.0001) {
      this.props.weaponScale = 1;
      this.props.weaponOffsetX = 0.26;
      this.props.weaponOffsetY = -0.24;
      this.props.weaponOffsetZ = -0.38;
    }

    const spread = this.numberProp("spread", 0);
    if (Math.abs(spread - 0.002) < 0.0000001) {
      // Legacy spread was tuned for a wide arcade cone and pushes shots out of the crosshair.
      this.props.spread = 0;
    }
  }

  destroy() {
    this.unbindGameInput();
    this.setHudVisible(false);

    if (this.hitTimerId) {
      clearTimeout(this.hitTimerId);
      this.hitTimerId = null;
    }

    if (this.weaponPivot?.parent) {
      this.weaponPivot.parent.remove(this.weaponPivot);
    }

    if (this.muzzleFlash) {
      this.muzzleFlash.geometry?.dispose?.();
      this.muzzleFlash.material?.dispose?.();
      this.muzzleFlash = null;
    }

    if (this.weaponFallback) {
      this.weaponFallback.traverse((child) => {
        if (!child.isMesh) return;
        child.geometry?.dispose?.();
        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => mat?.dispose?.());
        } else {
          child.material?.dispose?.();
        }
      });
      this.weaponFallback = null;
    }
  }

  bindGameInput() {
    if (!this.domElement) return;

    this.domElement.addEventListener("contextmenu", this.onContextMenu);
    document.addEventListener("mousemove", this.onMouseMove);

    if (this.props.enablePointerLock) {
      this.domElement.addEventListener("click", this.onCanvasClick);
      document.addEventListener("pointerlockchange", this.onPointerLockChange);
      this.isLocked = document.pointerLockElement === this.domElement;
    } else {
      this.isLocked = true;
    }
  }

  unbindGameInput() {
    if (!this.domElement) return;

    this.domElement.removeEventListener("contextmenu", this.onContextMenu);
    this.domElement.removeEventListener("click", this.onCanvasClick);
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("pointerlockchange", this.onPointerLockChange);
  }

  ensureCamera() {
    if (this.props.cameraId) {
      this.cameraEntity = this.sceneStore.getEntity(this.props.cameraId);
    }

    if (!this.cameraEntity) {
      const cam = this.sceneStore.createCamera("FPS Camera");
      cam.three.position.set(0, this.numberProp("height", 1.6), 0);
      cam.three.rotation.order = "YXZ";
      this.sceneStore.setParent(cam.id, this.entity.id, { preserveWorld: false });
      this.props.cameraId = cam.id;
      this.cameraEntity = cam;
    }

    if (!this.cameraEntity) return;

    this.cameraEntity.three.position.set(0, this.numberProp("height", 1.6), 0);
    this.cameraEntity.three.rotation.order = "YXZ";
    this.pitch = this.cameraEntity.three.rotation.x;
    this.yaw = this.cameraEntity.three.rotation.y;
    this.camera = this.cameraEntity.three.userData.camera;
    if (this.camera) {
      this.camera.near = 0.02;
      this.camera.updateProjectionMatrix();
    }
  }

  setupWeapon() {
    if (!this.camera) return;

    if (!this.weaponPivot) {
      this.weaponPivot = new THREE.Group();
      this.weaponPivot.name = "FPS Weapon Pivot";
      this.weaponPivot.userData.keepVisibleInGame = true;
      this.camera.add(this.weaponPivot);
    }

    this.createFallbackWeapon();
    this.ensureMuzzleFlash();
    this.applyWeaponTransform();

    const path = String(this.props.weaponModelPath || "").trim();
    if (path) {
      this.loadWeaponModel(path);
    }
  }

  createFallbackWeapon() {
    if (!this.weaponPivot || this.weaponFallback) return;

    const group = new THREE.Group();

    const matBody = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.75, metalness: 0.2 });
    const matGrip = new THREE.MeshStandardMaterial({ color: 0x4b3b2b, roughness: 0.9, metalness: 0.05 });

    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.09, 0.72), matBody);
    barrel.position.set(0.02, -0.02, -0.34);

    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.19), matGrip);
    pump.position.set(0.02, -0.06, -0.16);

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.09, 0.22), matGrip);
    stock.position.set(-0.04, -0.02, 0.04);

    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.08), matBody);
    sight.position.set(0.02, 0.04, -0.52);

    [barrel, pump, stock, sight].forEach((mesh) => {
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      mesh.userData.keepVisibleInGame = true;
      group.add(mesh);
    });

    this.weaponFallback = group;
    this.weaponPivot.add(group);
  }

  ensureMuzzleFlash() {
    if (!this.weaponPivot || this.muzzleLight) return;
    const light = new THREE.PointLight(0xffc26a, 1.6, 2.2, 2);
    light.userData.keepVisibleInGame = true;
    light.position.set(0.18, -0.04, -0.62);
    light.visible = false;

    this.muzzleLight = light;
    this.weaponPivot.add(light);
  }

  async loadWeaponModel(path) {
    if (!path || !this.weaponPivot) return;
    if (path === this.loadingWeaponPath) return;
    this.loadingWeaponPath = path;

    try {
      const gltf = await this.sceneStore.assetManager.loadGLTF(path);
      const cloned = cloneSkeleton(gltf.scene);
      cloned.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = false;
        child.receiveShadow = false;
        child.frustumCulled = false;
        child.userData.keepVisibleInGame = true;
      });
      cloned.userData.keepVisibleInGame = true;

      // Normalize arbitrary imported scale/origin so first-person offsets are stable.
      const box = new THREE.Box3().setFromObject(cloned);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);

      const maxDim = Math.max(size.x, size.y, size.z, 0.001);
      this.weaponModelBaseScale = 1.05 / maxDim;
      const anchoredY = box.min.y + size.y * 0.35;
      cloned.position.set(-center.x, -anchoredY, -box.max.z);
      cloned.scale.setScalar(this.weaponModelBaseScale);

      if (this.weaponModel?.parent) {
        this.weaponModel.parent.remove(this.weaponModel);
      }
      this.weaponModel = cloned;
      this.weaponPivot.add(cloned);

      if (this.weaponFallback) {
        this.weaponFallback.visible = false;
      }
    } catch (error) {
      console.warn("[FPSController] Falha ao carregar arma:", error);
      if (this.weaponFallback) {
        this.weaponFallback.visible = true;
      }
      this.setStatus("Falha no modelo da arma (fallback ativo)", 1800);
    } finally {
      this.loadingWeaponPath = "";
    }
  }

  initAmmo() {
    const mag = this.getMagazineSize();
    if (!Number.isFinite(this.ammoInMag)) {
      this.ammoInMag = mag;
    }
    if (!Number.isFinite(this.reserveAmmo)) {
      this.reserveAmmo = Math.max(0, Math.round(this.numberProp("reserveAmmo", 24)));
    }

    this.ammoInMag = THREE.MathUtils.clamp(Math.round(this.ammoInMag), 0, mag);
    this.reserveAmmo = Math.max(0, Math.round(this.reserveAmmo));
  }

  update(dt) {
    this.updateTimers(dt);
    this.updateWeapon(dt);
    this.updateStatusTimeout();

    if (this.mode === "game") {
      this.handleCombatInput();
      this.updateHud();
    }

    this.handleMovement(dt);
  }

  updateTimers(dt) {
    this.shootCooldown = Math.max(0, this.shootCooldown - dt);

    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.reloadTimer = 0;
        this.finishReload();
      }
    }

    if (this.muzzleTimer > 0) {
      this.muzzleTimer = Math.max(0, this.muzzleTimer - dt);
      const active = this.muzzleTimer > 0;
      if (this.muzzleFlash) this.muzzleFlash.visible = active;
      if (this.muzzleLight) this.muzzleLight.visible = active;
    }
  }

  handleCombatInput() {
    if (this.isUIBlocked() || !this.weaponActive) {
      this.fireHeld = false;
      this.reloadHeld = false;
      return;
    }

    const reloadBlocked = this.uiState?.interactionConsumesReload === true;
    const reloadDown = !reloadBlocked && this.input.isDown("KeyR");
    if (reloadDown && !this.reloadHeld) {
      this.startReload();
    }
    this.reloadHeld = reloadDown;

    const fireBlocked = this.uiState?.interactionConsumesFire === true;
    const fireDown = !fireBlocked && (this.input.isDown("MouseLeft") || this.input.isDown("Space"));
    if (fireDown && !this.fireHeld) {
      this.tryShoot();
    }
    this.fireHeld = fireDown;
  }

  tryShoot() {
    if (!this.weaponActive) return;
    if (this.props.enablePointerLock && !this.isLocked) {
      this.setStatus("Trave o mouse para atirar", 900);
      return;
    }

    if (this.shootCooldown > 0 || this.reloadTimer > 0) return;

    if (this.ammoInMag <= 0) {
      this.setStatus("Sem munição", 700);
      if (this.props.autoReload) {
        this.startReload();
      }
      return;
    }

    this.ammoInMag -= 1;
    this.shootCooldown = Math.max(0.05, this.numberProp("fireRate", 0.35));
    this.recoil = Math.min(1, this.recoil + 0.1);
    this.muzzleTimer = 0.06;

    if (this.muzzleFlash) this.muzzleFlash.visible = true;
    if (this.muzzleLight) this.muzzleLight.visible = true;

    this.performShot();

    if (this.props.autoReload && this.ammoInMag <= 0 && this.reserveAmmo > 0) {
      this.startReload();
    }
  }

  performShot() {
    if (!this.camera) return;
    // Build the shot from the crosshair position over the canvas.
    this.raycaster.setFromCamera(this.getAimNdc(), this.camera);
    this.rayOrigin.copy(this.raycaster.ray.origin);
    this.rayDir.copy(this.raycaster.ray.direction);

    const spread = Math.max(0, this.numberProp("spread", 0));
    if (spread > 0) {
      this.camera.getWorldQuaternion(this.cameraQuat);
      this.basisX.set(1, 0, 0).applyQuaternion(this.cameraQuat).normalize();
      this.basisY.set(0, 1, 0).applyQuaternion(this.cameraQuat).normalize();
      const spreadX = (Math.random() * 2 - 1) * spread;
      const spreadY = (Math.random() * 2 - 1) * spread;
      this.rayDir.addScaledVector(this.basisX, spreadX);
      this.rayDir.addScaledVector(this.basisY, spreadY);
      this.rayDir.normalize();
    }

    this.raycaster.set(this.rayOrigin, this.rayDir);
    this.raycaster.far = Math.max(1, this.numberProp("range", 85));

    const hits = this.raycaster.intersectObjects(this.sceneStore.scene.children, true);
    let hitEntity = null;
    let terrainHit = null;
    let terrainHitDistance = Infinity;
    const seenEntityIds = new Set();

    for (const hit of hits) {
      const candidate = this.resolveHitEntity(hit);
      if (!candidate || seenEntityIds.has(candidate.id)) continue;
      seenEntityIds.add(candidate.id);
      if (candidate.type === "terrain") {
        if (!terrainHit || hit.distance < terrainHitDistance) {
          terrainHit = candidate;
          terrainHitDistance = hit.distance;
        }
        continue;
      }
      hitEntity = candidate;
      break;
    }

    if (!hitEntity) {
      hitEntity = this.findAnimalHitFallback(terrainHitDistance);
    }
    if (!hitEntity) {
      hitEntity = terrainHit;
    }
    if (!hitEntity) return;

    if (hitEntity.type === "terrain") return;
    if (this.applyDamageToHitEntity(hitEntity)) {
      this.flashHitMarker();
      return;
    }
    this.flashHitMarker();
    if (!this.props.hitRemoveTarget) return;
    this.sceneStore.removeEntity(hitEntity.id);
  }

  applyDamageToHitEntity(entity, amount = 1) {
    if (!entity || !Array.isArray(entity.components) || !this.sceneStore?.scriptSystem) {
      return false;
    }

    for (const component of entity.components) {
      if (component?.type !== "AnimalAI" || !component?.id) continue;
      const instance = this.sceneStore.scriptSystem.getComponentInstance(component.id);
      if (!instance || typeof instance.applyShotDamage !== "function") continue;
      return instance.applyShotDamage(amount) === true;
    }

    return false;
  }

  findAnimalHitFallback(blockingDistance = Infinity) {
    if (!this.sceneStore?.scriptSystem || !this.sceneStore?.listEntities) {
      return null;
    }

    const maxDistance = this.raycaster?.far || Math.max(1, this.numberProp("range", 85));
    let bestEntity = null;
    let bestProjection = Infinity;
    let bestDistanceSq = Infinity;

    for (const entity of this.sceneStore.listEntities()) {
      if (!entity || entity.active === false) continue;
      if (entity.id === this.entity.id) continue;
      if (entity.id === this.cameraEntity?.id) continue;
      if (!Array.isArray(entity.components)) continue;

      const component = entity.components.find((entry) => entry?.type === "AnimalAI" && entry?.enabled !== false);
      if (!component?.id) continue;

      const instance = this.sceneStore.scriptSystem.getComponentInstance(component.id);
      if (!instance || instance.enabled === false || instance.isDead === true) continue;

      entity.three.getWorldPosition(this.fallbackTargetPos);
      const radius = Math.max(0.4, Number(instance.collisionRadius) || 0.4);
      const torsoHeight = Math.max(0.55, radius * 1.6);
      const hitRadius = Math.max(0.6, radius * 1.9);

      this.fallbackAimPoint.copy(this.fallbackTargetPos);
      this.fallbackAimPoint.y += torsoHeight;

      this.tempDir.copy(this.fallbackAimPoint).sub(this.rayOrigin);
      const projection = this.tempDir.dot(this.rayDir);
      if (projection <= 0 || projection > maxDistance) continue;
      if (projection > blockingDistance + hitRadius * 0.5) continue;

      this.fallbackClosestPoint.copy(this.rayDir).multiplyScalar(projection).add(this.rayOrigin);
      const distanceSq = this.fallbackClosestPoint.distanceToSquared(this.fallbackAimPoint);
      if (distanceSq > hitRadius * hitRadius) continue;

      if (
        !bestEntity ||
        projection < bestProjection - 0.05 ||
        (Math.abs(projection - bestProjection) <= 0.05 && distanceSq < bestDistanceSq)
      ) {
        bestEntity = entity;
        bestProjection = projection;
        bestDistanceSq = distanceSq;
      }
    }

    return bestEntity;
  }

  resolveHitEntity(hit) {
    if (!hit?.object) return null;
    if (hit.object.userData?.ignoreRaycast) return null;

    let entityId = hit.object.userData?.entityId || null;
    if (!entityId) {
      let parent = hit.object.parent;
      while (parent && !entityId) {
        entityId = parent.userData?.entityId || null;
        parent = parent.parent;
      }
    }
    if (!entityId) return null;
    if (entityId === this.entity.id) return null;
    if (entityId === this.cameraEntity?.id) return null;

    const entity = this.sceneStore.getEntity(entityId);
    if (!entity || entity.active === false) return null;
    if (entity.type === "camera" || entity.type === "light") return null;

    return entity;
  }

  startReload() {
    if (this.reloadTimer > 0) return;
    if (this.reserveAmmo <= 0) return;

    const mag = this.getMagazineSize();
    if (this.ammoInMag >= mag) return;

    this.reloadTimer = Math.max(0.2, this.numberProp("reloadTime", 1.6));
    this.setStatus("Recarregando...", this.reloadTimer * 1000 + 120);
  }

  finishReload() {
    const mag = this.getMagazineSize();
    const needed = Math.max(0, mag - this.ammoInMag);
    if (needed <= 0 || this.reserveAmmo <= 0) return;

    const amount = Math.min(needed, this.reserveAmmo);
    this.ammoInMag += amount;
    this.reserveAmmo -= amount;
    this.setStatus("", 0);
  }

  updateWeapon(dt) {
    if (!this.weaponPivot) return;
    this.recoil = THREE.MathUtils.lerp(this.recoil, 0, Math.min(1, dt * 11));
    this.applyWeaponTransform();
  }

  applyWeaponTransform() {
    if (!this.weaponPivot) return;

    const scale = Math.max(0.01, this.numberProp("weaponScale", 1));
    const x = this.numberProp("weaponOffsetX", 0.26);
    const y = this.numberProp("weaponOffsetY", -0.24) + this.recoil * 0.03;
    const z = this.numberProp("weaponOffsetZ", -0.38) + this.recoil * 0.12;

    this.weaponPivot.position.set(x, y, z);
    this.weaponPivot.scale.setScalar(scale);
    this.weaponPivot.rotation.set(
      THREE.MathUtils.degToRad(this.numberProp("weaponRotX", 0)),
      THREE.MathUtils.degToRad(this.numberProp("weaponRotY", 0)),
      THREE.MathUtils.degToRad(this.numberProp("weaponRotZ", 0))
    );

    if (this.weaponModel) {
      this.weaponModel.scale.setScalar(this.weaponModelBaseScale || 1);
    }
  }

  handleMovement(dt) {
    if (this.isUIBlocked()) return;
    if (this.uiState?.playerMovementLocked === true) return;
    const speed = Math.max(0, this.numberProp("speed", 0));
    this.move.set(0, 0, 0);

    if (this.input.isDown("KeyW")) this.move.z += 1;
    if (this.input.isDown("KeyS")) this.move.z -= 1;
    if (this.input.isDown("KeyA")) this.move.x -= 1;
    if (this.input.isDown("KeyD")) this.move.x += 1;

    if (this.move.lengthSq() < 0.0001 || speed <= 0) return;

    if (this.props.useCameraForward && this.camera) {
      this.camera.getWorldDirection(this.forward);
      this.forward.y = 0;
      if (this.forward.lengthSq() < 0.0001) {
        this.forward.set(0, 0, -1);
      }
      this.forward.normalize();
    } else {
      this.forward.set(Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    }

    this.right.crossVectors(this.forward, this.up).normalize();

    this.tempDir.set(0, 0, 0);
    this.tempDir.addScaledVector(this.forward, this.move.z);
    this.tempDir.addScaledVector(this.right, this.move.x);
    if (this.tempDir.lengthSq() < 0.0001) return;

    this.tempDir.normalize().multiplyScalar(speed * dt);
    this.moveWithCollisions(this.tempDir);
  }

  moveWithCollisions(delta) {
    moveObjectWithTreeCollisions(this.sceneStore, this.entity.three, delta, 0.42, {
      currentWorldPos: this.currentWorldPos,
      nextWorldPos: this.nextWorldPos,
      localPos: this.parentLocalPos,
    });
  }

  setupHud() {
    this.hudRoot = document.getElementById("fps-hud");
    this.crosshairEl = document.getElementById("crosshair");
    this.ammoCurrentEl = document.getElementById("hud-ammo-current");
    this.ammoReserveEl = document.getElementById("hud-ammo-reserve");
    this.statusEl = document.getElementById("hud-status");
    this.hitMarkerEl = document.getElementById("hit-marker");

    this.setHudVisible(true);
  }

  setHudVisible(visible) {
    if (this.hudRoot) {
      this.hudRoot.classList.toggle("hidden", !visible);
    }
    if (this.crosshairEl) {
      this.crosshairEl.classList.toggle("hidden", !visible);
    }
  }

  updateHud() {
    if (!this.hudRoot) return;

    if (this.ammoCurrentEl) {
      this.ammoCurrentEl.textContent = this.weaponActive ? String(Math.max(0, this.ammoInMag)) : "-";
    }
    if (this.ammoReserveEl) {
      this.ammoReserveEl.textContent = this.weaponActive ? String(Math.max(0, this.reserveAmmo)) : "-";
    }

    if (this.statusEl) {
      if (this.reloadTimer > 0) {
        this.statusEl.textContent = "Recarregando...";
      } else {
        this.statusEl.textContent = this.statusText || "";
      }
    }
  }

  setStatus(text, durationMs = 0) {
    this.statusText = text || "";
    if (durationMs > 0) {
      this.statusUntil = performance.now() + durationMs;
    } else {
      this.statusUntil = 0;
    }
    this.updateHud();
  }

  updateStatusTimeout() {
    if (!this.statusUntil) return;
    if (performance.now() < this.statusUntil) return;
    this.statusUntil = 0;
    this.statusText = "";
  }

  flashHitMarker() {
    if (!this.hitMarkerEl) return;

    this.hitMarkerEl.classList.add("active");
    if (this.hitTimerId) {
      clearTimeout(this.hitTimerId);
    }
    this.hitTimerId = setTimeout(() => {
      this.hitMarkerEl?.classList.remove("active");
      this.hitTimerId = null;
    }, 120);
  }

  getAimNdc() {
    if (!this.domElement || !this.crosshairEl) {
      this.crosshairNdc.copy(CENTER_SCREEN);
      return this.crosshairNdc;
    }

    const canvasRect = this.domElement.getBoundingClientRect();
    const crossRect = this.crosshairEl.getBoundingClientRect();
    if (canvasRect.width <= 0 || canvasRect.height <= 0 || crossRect.width <= 0 || crossRect.height <= 0) {
      this.crosshairNdc.copy(CENTER_SCREEN);
      return this.crosshairNdc;
    }

    const crossX = crossRect.left + crossRect.width * 0.5;
    const crossY = crossRect.top + crossRect.height * 0.5;

    this.crosshairNdc.set(
      ((crossX - canvasRect.left) / canvasRect.width) * 2 - 1,
      -(((crossY - canvasRect.top) / canvasRect.height) * 2 - 1)
    );

    return this.crosshairNdc;
  }

  setPlayerBodyVisible(visible) {
    this.entity.three.traverse((child) => {
      if (child?.isMesh) {
        child.visible = visible;
      }
    });
  }

  isUIBlocked() {
    return this.mode === "game" && this.uiState?.isInventoryOpen === true;
  }

  setLookRotation(yaw = 0, pitch = 0) {
    this.yaw = Number.isFinite(yaw) ? yaw : 0;
    this.pitch = THREE.MathUtils.clamp(Number.isFinite(pitch) ? pitch : 0, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
    if (this.cameraEntity) {
      this.cameraEntity.three.rotation.set(this.pitch, this.yaw, 0, "YXZ");
    }
  }

  exportInventoryWeapon() {
    return {
      weaponModelPath: String(this.props.weaponModelPath || "").trim(),
      weaponScale: this.numberProp("weaponScale", 1),
      weaponOffsetX: this.numberProp("weaponOffsetX", 0.26),
      weaponOffsetY: this.numberProp("weaponOffsetY", -0.24),
      weaponOffsetZ: this.numberProp("weaponOffsetZ", -0.38),
      weaponRotX: this.numberProp("weaponRotX", 0),
      weaponRotY: this.numberProp("weaponRotY", 0),
      weaponRotZ: this.numberProp("weaponRotZ", 0),
      fireRate: this.numberProp("fireRate", 0.35),
      range: this.numberProp("range", 85),
      spread: this.numberProp("spread", 0),
      magazineSize: this.getMagazineSize(),
      reserveAmmo: Math.max(0, Math.round(this.reserveAmmo || 0)),
      reloadTime: this.numberProp("reloadTime", 1.6),
      hitRemoveTarget: this.props.hitRemoveTarget !== false,
      autoReload: this.props.autoReload !== false,
      ammoInMag: Math.max(0, Math.round(this.ammoInMag || 0)),
    };
  }

  applyInventoryWeapon(config = {}) {
    const previousPath = String(this.props.weaponModelPath || "").trim();
    const nextPath = String(config.weaponModelPath || previousPath).trim();
    const propKeys = [
      "weaponScale",
      "weaponOffsetX",
      "weaponOffsetY",
      "weaponOffsetZ",
      "weaponRotX",
      "weaponRotY",
      "weaponRotZ",
      "fireRate",
      "range",
      "spread",
      "magazineSize",
      "reloadTime",
      "hitRemoveTarget",
      "autoReload",
    ];

    this.props.weaponModelPath = nextPath;
    propKeys.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(config, key)) {
        this.props[key] = config[key];
      }
    });

    if (Object.prototype.hasOwnProperty.call(config, "reserveAmmo")) {
      this.reserveAmmo = Math.max(0, Math.round(Number(config.reserveAmmo) || 0));
      this.props.reserveAmmo = this.reserveAmmo;
    }
    if (Object.prototype.hasOwnProperty.call(config, "ammoInMag")) {
      this.ammoInMag = Math.max(0, Math.round(Number(config.ammoInMag) || 0));
    }

    this.initAmmo();
    this.applyWeaponTransform();
    this.setWeaponActive(true);

    if (this.mode === "game") {
      if (!this.weaponPivot) this.setupWeapon();
      if (nextPath && (nextPath !== previousPath || !this.weaponModel)) {
        this.loadWeaponModel(nextPath);
      }
    }

    this.updateHud();
  }

  setWeaponActive(active) {
    this.weaponActive = active !== false;
    if (this.weaponPivot) {
      this.weaponPivot.visible = this.weaponActive;
    }
    if (!this.weaponActive) {
      this.muzzleTimer = 0;
      if (this.muzzleFlash) this.muzzleFlash.visible = false;
      if (this.muzzleLight) this.muzzleLight.visible = false;
    }
    this.updateHud();
  }

  getMagazineSize() {
    return Math.max(1, Math.round(this.numberProp("magazineSize", 6)));
  }

  numberProp(key, fallback) {
    const value = Number(this.props[key]);
    return Number.isFinite(value) ? value : fallback;
  }
}
