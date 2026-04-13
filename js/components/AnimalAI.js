import * as THREE from "three";
import { moveObjectWithTreeCollisions } from "../utils/treeCollisions.js";

export class AnimalAI {
  static type = "AnimalAI";
  static label = "Animal AI";
  static defaults = {
    targetId: "",
    detectionRadius: 8,
    safeDistance: 12,
    alertDuration: 1.2,
    wanderRadius: 6,
    wanderInterval: 3,
    grazeChance: 0.4,
    grazeDuration: 2.5,
    patrolGroupId: "",
    patrolWait: 1.2,
    herdLeaderId: "",
    herdRadius: 6,
    herdStrength: 1,
    moveSpeed: 1.5,
    runSpeed: 3.5,
    turnSpeed: 6,
    avoidDistance: 1.2,
    avoidStrength: 1.5,
    fleeFacingOffset: 180,
    idleClip: "Idle",
    walkClip: "Walk",
    runClip: "Run",
    grazeClip: "",
    alertClip: "",
    useAnimation: true,
    autoDetectClips: true,
    respondToCalls: true,
    callProfile: "",
    callResponseRadius: 26,
    callApproachDistance: 2.4,
    callInvestigateDuration: 8,
    maxHealth: 1,
    deathClip: "",
    despawnOnDeath: true,
    deathDespawnDelay: 0,
    vocalizationAsset: "",
    vocalizationRadius: 18,
    vocalizationVolume: 1,
    vocalizationMinDistance: 4,
    vocalizationMaxDistance: 24,
    vocalizationRolloff: 1.2,
    vocalizationIntervalMin: 6,
    vocalizationIntervalMax: 14,
    vocalizationChance: 1,
  };

  static schema = [
    { key: "targetId", label: "Player", type: "entity" },
    { key: "detectionRadius", label: "Detect", type: "number", step: 0.1 },
    { key: "safeDistance", label: "Safe", type: "number", step: 0.1 },
    { key: "alertDuration", label: "Alerta", type: "number", step: 0.1 },
    { key: "wanderRadius", label: "Wander", type: "number", step: 0.1 },
    { key: "wanderInterval", label: "Intervalo", type: "number", step: 0.1 },
    { key: "grazeChance", label: "Pastar", type: "number", step: 0.05 },
    { key: "grazeDuration", label: "Tempo Pasto", type: "number", step: 0.1 },
    { key: "patrolGroupId", label: "Patrulha", type: "entity" },
    { key: "patrolWait", label: "Pausa", type: "number", step: 0.1 },
    { key: "herdLeaderId", label: "Lider", type: "entity" },
    { key: "herdRadius", label: "Raio Grupo", type: "number", step: 0.1 },
    { key: "herdStrength", label: "Forca Grupo", type: "number", step: 0.1 },
    { key: "moveSpeed", label: "Velocidade", type: "number", step: 0.1 },
    { key: "runSpeed", label: "Fuga", type: "number", step: 0.1 },
    { key: "turnSpeed", label: "Virar", type: "number", step: 0.5 },
    { key: "avoidDistance", label: "Avoid Dist", type: "number", step: 0.1 },
    { key: "avoidStrength", label: "Avoid Forca", type: "number", step: 0.1 },
    { key: "fleeFacingOffset", label: "Offset Fuga", type: "number", step: 1 },
    { key: "idleClip", label: "Anim Idle", type: "animation" },
    { key: "walkClip", label: "Anim Walk", type: "animation" },
    { key: "runClip", label: "Anim Run", type: "animation" },
    { key: "grazeClip", label: "Anim Pastar", type: "animation" },
    { key: "alertClip", label: "Anim Alerta", type: "animation" },
    { key: "useAnimation", label: "Usar Anim", type: "boolean" },
    { key: "autoDetectClips", label: "Auto Detect", type: "boolean" },
    { key: "respondToCalls", label: "Responder Call", type: "boolean" },
    {
      key: "callProfile",
      label: "Perfil Call",
      type: "select",
      options: [
        { value: "", label: "(Auto pelo modelo)" },
        { value: "stag", label: "stag" },
      ],
    },
    { key: "callResponseRadius", label: "Raio Call", type: "number", step: 0.1 },
    { key: "callApproachDistance", label: "Aproximar Ate", type: "number", step: 0.1 },
    { key: "callInvestigateDuration", label: "Tempo Call", type: "number", step: 0.1 },
    { key: "maxHealth", label: "Vida", type: "number", step: 1 },
    { key: "deathClip", label: "Anim Morte", type: "animation" },
    { key: "despawnOnDeath", label: "Sumir ao Morrer", type: "boolean" },
    { key: "deathDespawnDelay", label: "Tempo Sumir", type: "number", step: 0.1 },
    {
      key: "vocalizationAsset",
      label: "Audio Vocal",
      type: "asset",
      assetType: "audio",
      emptyLabel: "(Sem audio)",
    },
    { key: "vocalizationRadius", label: "Raio Audio", type: "number", step: 0.1 },
    { key: "vocalizationVolume", label: "Volume Audio", type: "number", step: 0.05 },
    { key: "vocalizationMinDistance", label: "Audio Perto", type: "number", step: 0.1 },
    { key: "vocalizationMaxDistance", label: "Audio Longe", type: "number", step: 0.1 },
    { key: "vocalizationRolloff", label: "Audio Queda", type: "number", step: 0.1 },
    { key: "vocalizationIntervalMin", label: "Audio Min", type: "number", step: 0.1 },
    { key: "vocalizationIntervalMax", label: "Audio Max", type: "number", step: 0.1 },
    { key: "vocalizationChance", label: "Chance Audio", type: "number", step: 0.05 },
  ];

  constructor(entity, props, context) {
    this.entity = entity;
    this.props = props;
    this.sceneStore = context.sceneStore;
    this.animator = context.animator;
    this.assetManager = context.assetManager || context.sceneStore?.assetManager || null;
    this.getAudioListener = typeof context.getAudioListener === "function"
      ? context.getAudioListener
      : () => context.audioListener || null;

    this.state = "idle";
    this.timer = 0;
    this.alertTimer = 0;
    this.wanderTarget = new THREE.Vector3();

    this.tempTarget = new THREE.Vector3();
    this.tempDir = new THREE.Vector3();
    this.tempMatrix = new THREE.Matrix4();
    this.targetQuat = new THREE.Quaternion();
    this.yawQuat = new THREE.Quaternion();
    this.upAxis = new THREE.Vector3(0, 1, 0);
    this.avoidDir = new THREE.Vector3();
    this.moveDelta = new THREE.Vector3();
    this.currentWorldPos = new THREE.Vector3();
    this.nextWorldPos = new THREE.Vector3();
    this.parentLocalPos = new THREE.Vector3();

    this.patrolIndex = 0;
    this.patrolPoints = [];

    this.raycaster = new THREE.Raycaster();
    this.rayOrigin = new THREE.Vector3();

    this.activeClip = "";
    this.collisionRadius = 0.4;
    this.inferredCallProfile = "";
    this.callTarget = new THREE.Vector3();
    this.callTimer = 0;
    this.callApproachDistance = 2.4;
    this.maxHealth = 1;
    this.health = 1;
    this.isDead = false;
    this.deathTimer = 0;
    this.hearingPosition = new THREE.Vector3();
    this.audioAnchor = null;
    this.vocalizationSound = null;
    this.vocalizationAssetPath = "";
    this.vocalizationBuffer = null;
    this.vocalizationLoadPromise = null;
    this.vocalizationTimer = 0;
    this.vocalizationLoadToken = 0;
  }

  start() {
    if (["terrain", "light", "camera"].includes(this.entity?.type)) {
      this.enabled = false;
      return;
    }
    this.disableConflictingComponents();
    if (this.props.autoDetectClips) {
      this.detectClips();
    }
    this.normalizeSelectedClips();
    this.maxHealth = Math.max(1, Math.round(Number(this.props.maxHealth) || 1));
    const persistedHealth = Number(this.entity?.gameplay?.animalAi?.health);
    const persistedDead = this.entity?.gameplay?.animalAi?.dead === true;
    this.health = Number.isFinite(persistedHealth)
      ? THREE.MathUtils.clamp(Math.round(persistedHealth), 0, this.maxHealth)
      : this.maxHealth;
    this.isDead = persistedDead || this.health <= 0;
    this.deathTimer = 0;
    this.inferredCallProfile = this.inferCallProfile();
    this.collisionRadius = this.computeCollisionRadius();
    this.syncAudioAnchor();
    this.resetVocalizationTimer(true);
    this.syncGameplayState();
    if (this.isDead) {
      this.enterDeathState({ silent: true });
      return;
    }
    this.pickWanderTarget(true);
    this.setAnim(this.props.idleClip);
  }

  disableConflictingComponents() {
    const components = Array.isArray(this.entity?.components) ? this.entity.components : [];
    const scriptSystem = this.sceneStore?.scriptSystem;
    components.forEach((component) => {
      if (!component || component.type !== "AutoRotate") return;
      component.enabled = false;
      if (!component.id || !scriptSystem?.getComponentInstance) return;
      const instance = scriptSystem.getComponentInstance(component.id);
      if (instance) {
        instance.enabled = false;
      }
    });
  }

  computeCollisionRadius() {
    const box = new THREE.Box3().setFromObject(this.entity?.three);
    if (box.isEmpty()) return 0.4;
    const size = new THREE.Vector3();
    box.getSize(size);
    const horizontal = Math.max(size.x, size.z, 0.001);
    return THREE.MathUtils.clamp(horizontal * 0.28, 0.24, 0.9);
  }

  moveWithTreeCollision(direction, distance) {
    if (!direction || distance <= 0) return false;
    this.moveDelta.copy(direction).multiplyScalar(distance);
    return moveObjectWithTreeCollisions(this.sceneStore, this.entity.three, this.moveDelta, this.collisionRadius, {
      currentWorldPos: this.currentWorldPos,
      nextWorldPos: this.nextWorldPos,
      localPos: this.parentLocalPos,
    });
  }

  update(dt) {
    if (this.isDead) {
      this.stopVocalizationPlayback();
      if (this.deathTimer > 0) {
        this.deathTimer = Math.max(0, this.deathTimer - dt);
        if (this.deathTimer === 0) {
          this.sceneStore.removeEntity(this.entity.id);
        }
      }
      return;
    }

    this.updateVocalization(dt);

    if (this.callTimer > 0) {
      this.callTimer = Math.max(0, this.callTimer - dt);
      if (this.callTimer === 0 && this.state === "investigate") {
        this.state = "wander";
        this.pickWanderTarget(true);
      }
    }

    const target = this.props.targetId ? this.sceneStore.getEntity(this.props.targetId) : null;
    const pos = this.entity.three.position;

    let distanceToTarget = Infinity;
    if (target) {
      target.three.getWorldPosition(this.tempTarget);
      this.tempDir.copy(pos).sub(this.tempTarget);
      this.tempDir.y = 0;
      distanceToTarget = this.tempDir.length();
    }

    if (target && distanceToTarget < (this.props.detectionRadius || 0)) {
      if (this.state !== "flee" && this.state !== "alert") {
        this.state = "alert";
        this.alertTimer = this.props.alertDuration || 0.8;
        this.setAnim(this.props.alertClip || this.props.idleClip);
      }
    } else if (this.state === "flee" && target && distanceToTarget > (this.props.safeDistance || 0)) {
      this.state = "wander";
      this.timer = 0;
      this.pickWanderTarget(true);
    }

    if (this.state === "alert" && target) {
      this.alertTimer -= dt;
      this.lookAtTarget(target, dt);
      if (this.alertTimer <= 0) {
        this.state = "flee";
      }
      return;
    }

    if (this.state === "flee" && target) {
      this.fleeFrom(target, dt);
      return;
    }

    if (this.followWildlifeCall(dt)) {
      return;
    }

    if (this.followLeader(dt)) {
      return;
    }

    if (this.state === "idle" || this.state === "graze") {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = "wander";
        this.pickWanderTarget(true);
      }
      return;
    }

    if (this.state === "patrol") {
      if (this.patrol(dt)) return;
    }

    this.wander(dt);
  }

  detectClips() {
    const clips = this.entity.animations || [];
    if (!clips.length) return;

    this.props.idleClip = this.selectDetectedClip(
      {
        include: ["idle", "rest", "stand", "calm"],
        prefer: ["idle_pose", "rest_pose", "idle_rest", "calm"],
        avoid: ["death", "dead", "attack", "hit", "injured", "run", "sprint", "walk", "trot", "jump", "eat", "graz", "alert", "bark"],
        preferStatic: true,
      },
      this.props.idleClip
    );
    this.props.walkClip = this.selectDetectedClip(
      {
        include: ["walk", "trot"],
        prefer: ["walk_fwd", "trot_fwd", "walk"],
        avoid: ["attack", "death", "dead", "hit", "injured", "jump", "idle", "eat", "graz", "alert", "bark", "run", "sprint"],
        preferShortLoops: true,
      },
      this.props.walkClip
    );
    this.props.runClip = this.selectDetectedClip(
      {
        include: ["run", "sprint", "gallop"],
        prefer: ["sprint_fwd", "run_fwd", "gallop", "sprint", "run"],
        avoid: ["attack", "death", "dead", "hit", "injured", "jump", "idle", "eat", "graz", "alert", "bark", "walk", "trot"],
        preferShortLoops: true,
      },
      this.props.runClip
    );
    this.props.grazeClip = this.selectDetectedClip(
      {
        include: ["graze", "graz", "eat", "feed", "past", "forage"],
        prefer: ["grazing", "eat"],
        avoid: ["death", "dead", "attack", "hit", "injured", "jump", "run", "sprint", "walk", "trot", "alert", "bark"],
        allowTransitions: true,
      },
      this.props.grazeClip
    );
    this.props.alertClip = this.selectDetectedClip(
      {
        include: ["alert", "look", "fear", "scare", "bark"],
        prefer: ["alert", "look", "bark"],
        avoid: ["death", "dead", "attack", "hit", "injured", "jump", "eat", "graz", "walk", "run", "sprint", "trot"],
        allowTransitions: true,
      },
      this.props.alertClip
    );
    this.props.deathClip = this.selectDetectedClip(
      {
        include: ["death", "die", "dead", "fall"],
        prefer: ["death", "dead_reaction", "dead"],
        avoid: ["attack", "hit", "injured", "walk", "run", "sprint", "trot", "idle", "eat", "graz", "alert", "bark"],
      },
      this.props.deathClip
    );
  }

  normalizeSelectedClips() {
    const clipFields = ["idleClip", "walkClip", "runClip", "grazeClip", "alertClip", "deathClip"];
    clipFields.forEach((field) => {
      const resolved = this.resolveClipName(this.props[field], { warnIfMissing: false });
      if (resolved) {
        this.props[field] = resolved;
        return;
      }
      if (field === "grazeClip" || field === "alertClip" || field === "deathClip") {
        this.props[field] = "";
      }
    });

    const conflictFields = ["idleClip", "walkClip", "runClip", "grazeClip", "alertClip"];
    conflictFields.forEach((field) => {
      if (this.props[field] && this.props[field] === this.props.deathClip) {
        this.props[field] = "";
      }
    });

    if (!this.props.idleClip) {
      this.props.idleClip = this.props.walkClip || this.props.runClip || "";
    }
    if (!this.props.walkClip) {
      this.props.walkClip = this.props.runClip || this.props.idleClip || "";
    }
    if (!this.props.runClip) {
      this.props.runClip = this.props.walkClip || this.props.idleClip || "";
    }
  }

  getClipSearchText(name) {
    return String(name || "")
      .split("|")
      .pop()
      .trim()
      .toLowerCase();
  }

  scoreClipCandidate(name, config = {}) {
    const searchText = this.getClipSearchText(name);
    if (!searchText) return Number.NEGATIVE_INFINITY;

    let matched = false;
    let score = 0;

    for (const token of config.include || []) {
      if (!token || !searchText.includes(token)) continue;
      matched = true;
      score += 12;
    }

    if (!matched) return Number.NEGATIVE_INFINITY;

    for (const token of config.prefer || []) {
      if (token && searchText.includes(token)) {
        score += 4;
      }
    }

    for (const token of config.avoid || []) {
      if (token && searchText.includes(token)) {
        score -= 6;
      }
    }

    if (searchText.includes("_to_") || searchText.includes(" to ")) {
      score -= config.allowTransitions ? 1 : 4;
    }

    if (searchText.includes(" static")) {
      score += config.preferStatic ? 2 : -1;
    }

    if (config.preferShortLoops) {
      if (searchText.endsWith("_01")) {
        score += 1;
      }
      if (searchText.includes("bank_")) {
        score -= 1;
      }
    }

    return score;
  }

  selectDetectedClip(config, current = "") {
    const clips = Array.isArray(this.entity?.animations) ? this.entity.animations : [];
    if (!clips.length) return current || "";

    let bestClip = "";
    let bestScore = Number.NEGATIVE_INFINITY;

    const currentResolved = this.resolveClipName(current, { warnIfMissing: false });
    if (currentResolved) {
      const currentScore = this.scoreClipCandidate(currentResolved, config);
      if (currentScore > 0) {
        bestClip = currentResolved;
        bestScore = currentScore + 6;
      }
    }

    clips.forEach((clip) => {
      const score = this.scoreClipCandidate(clip, config);
      if (score <= bestScore) return;
      bestClip = clip;
      bestScore = score;
    });

    return bestScore > 0 ? bestClip : "";
  }

  syncGameplayState() {
    this.entity.gameplay = {
      ...(this.entity.gameplay || {}),
      animalAi: {
        maxHealth: this.maxHealth,
        health: this.health,
        dead: this.isDead,
      },
    };
  }

  enterDeathState(options = {}) {
    this.isDead = true;
    this.state = "dead";
    this.timer = 0;
    this.alertTimer = 0;
    this.callTimer = 0;
    this.health = 0;
    this.syncGameplayState();
    this.stopVocalizationPlayback();

    const deathClip = this.resolveClipName(this.props.deathClip, { warnIfMissing: false });
    if (!options.silent && deathClip && this.animator && this.entity.animation) {
      this.animator.play(this.entity, deathClip, false, 1);
      this.activeClip = deathClip;
    } else if (this.animator) {
      this.animator.stop(this.entity);
      this.activeClip = "";
    }

    if (this.props.despawnOnDeath === true) {
      const delay = Math.max(0, Number(this.props.deathDespawnDelay) || 0);
      if (delay <= 0) {
        this.sceneStore.removeEntity(this.entity.id);
        return;
      }
      this.deathTimer = delay;
      return;
    }

    this.deathTimer = 0;
  }

  applyShotDamage(amount = 1) {
    if (this.enabled === false) return false;
    if (this.isDead) return true;

    const damage = Math.max(0, Number(amount) || 0);
    if (damage <= 0) return true;

    this.health = THREE.MathUtils.clamp(this.health - damage, 0, this.maxHealth);
    this.syncGameplayState();

    if (this.health <= 0) {
      this.enterDeathState();
      return true;
    }

    this.state = "flee";
    this.alertTimer = 0;
    this.callTimer = 0;
    this.setAnim(this.props.alertClip || this.props.runClip || this.props.idleClip);
    return true;
  }

  destroy() {
    this.disposeVocalizationAudio();
  }

  resolveClipName(name, options = {}) {
    const { warnIfMissing = true } = options;
    const raw = typeof name === "string" ? name.trim() : "";
    if (!raw) return "";

    const clips = Array.isArray(this.entity?.animations) ? this.entity.animations : [];
    if (!clips.length) return raw;

    const exact = clips.find((clip) => clip.toLowerCase() === raw.toLowerCase());
    if (exact) return exact;

    if (warnIfMissing) {
      console.warn(`[AnimalAI] Clip nao encontrado: "${raw}"`, clips);
    }
    return "";
  }

  lookAtTarget(target, dt) {
    target.three.getWorldPosition(this.tempTarget);
    this.tempDir.copy(this.tempTarget).sub(this.entity.three.position);
    this.tempDir.y = 0;
    if (this.tempDir.lengthSq() < 0.0001) return;
    this.tempDir.normalize();
    this.rotateTowards(this.tempDir, dt);
  }

  fleeFrom(target, dt) {
    const pos = this.entity.three.position;
    target.three.getWorldPosition(this.tempTarget);
    this.tempDir.copy(pos).sub(this.tempTarget);
    this.tempDir.y = 0;

    if (this.tempDir.lengthSq() < 0.0001) {
      this.tempDir.set(1, 0, 0);
    }

    this.tempDir.normalize();
    this.applyAvoidance(this.tempDir);
    const speed = this.props.runSpeed || this.props.moveSpeed || 0;
    this.moveWithTreeCollision(this.tempDir, speed * dt);

    const fleeOffset = Number.isFinite(Number(this.props.fleeFacingOffset))
      ? Number(this.props.fleeFacingOffset)
      : 180;
    this.rotateTowards(this.tempDir, dt, fleeOffset);
    this.setAnim(this.props.runClip);
  }

  wander(dt) {
    this.updatePatrolPoints();
    if (this.patrolPoints.length > 0) {
      this.state = "patrol";
      this.patrol(dt);
      return;
    }

    const pos = this.entity.three.position;
    const distance = pos.distanceTo(this.wanderTarget);

    if (distance < 0.2) {
      this.enterIdleOrGraze();
      return;
    }

    this.tempDir.copy(this.wanderTarget).sub(pos);
    this.tempDir.y = 0;

    if (this.tempDir.lengthSq() < 0.0001) {
      this.pickWanderTarget(true);
      return;
    }

    this.tempDir.normalize();
    this.applyAvoidance(this.tempDir);
    const speed = this.props.moveSpeed || 0;
    const moved = this.moveWithTreeCollision(this.tempDir, speed * dt);
    if (!moved) {
      this.pickWanderTarget(true);
      return;
    }
    this.rotateTowards(this.tempDir, dt);
    this.setAnim(this.props.walkClip);
  }

  enterIdleOrGraze() {
    const chance = this.props.grazeChance || 0;
    if (Math.random() < chance && this.props.grazeDuration > 0) {
      this.state = "graze";
      this.timer = this.props.grazeDuration || 2;
      this.setAnim(this.props.grazeClip || this.props.idleClip);
      return;
    }

    this.state = "idle";
    this.timer = 0.5 + Math.random() * 1.2;
    this.setAnim(this.props.idleClip);
  }

  patrol(dt) {
    if (!this.patrolPoints.length) return false;

    const pos = this.entity.three.position;
    const target = this.patrolPoints[this.patrolIndex % this.patrolPoints.length];
    const distance = pos.distanceTo(target);

    if (distance < 0.25) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.patrolIndex = (this.patrolIndex + 1) % this.patrolPoints.length;
        this.timer = this.props.patrolWait || 1;
      }
      this.setAnim(this.props.idleClip);
      return true;
    }

    this.tempDir.copy(target).sub(pos);
    this.tempDir.y = 0;
    if (this.tempDir.lengthSq() < 0.0001) return true;

    this.tempDir.normalize();
    this.applyAvoidance(this.tempDir);
    const speed = this.props.moveSpeed || 0;
    this.moveWithTreeCollision(this.tempDir, speed * dt);
    this.rotateTowards(this.tempDir, dt);
    this.setAnim(this.props.walkClip);
    return true;
  }

  updatePatrolPoints() {
    if (!this.props.patrolGroupId) {
      this.patrolPoints = [];
      return;
    }

    const group = this.sceneStore.getEntity(this.props.patrolGroupId);
    if (!group) {
      this.patrolPoints = [];
      return;
    }

    const children = this.sceneStore.getChildren(group.id);
    this.patrolPoints = children.map((child) => child.three.getWorldPosition(new THREE.Vector3()));
  }

  followLeader(dt) {
    if (!this.props.herdLeaderId) return false;
    const leader = this.sceneStore.getEntity(this.props.herdLeaderId);
    if (!leader) return false;

    const pos = this.entity.three.position;
    leader.three.getWorldPosition(this.tempTarget);
    this.tempDir.copy(this.tempTarget).sub(pos);
    this.tempDir.y = 0;

    const distance = this.tempDir.length();
    if (distance <= (this.props.herdRadius || 0)) return false;

    this.tempDir.normalize();
    this.applyAvoidance(this.tempDir);
    const speed = this.props.moveSpeed || 0;
    this.moveWithTreeCollision(this.tempDir, speed * dt * (this.props.herdStrength || 1));
    this.rotateTowards(this.tempDir, dt);
    this.setAnim(this.props.walkClip);
    return true;
  }

  pickWanderTarget(force = false) {
    const radius = this.props.wanderRadius || 0;
    if (radius <= 0) return;

    if (!force) {
      this.timer -= 1;
      if (this.timer > 0) return;
    }

    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * radius;
    const offset = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)).multiplyScalar(distance);

    this.wanderTarget.copy(this.entity.three.position).add(offset);
    this.timer = this.props.wanderInterval || 3;
  }

  inferCallProfile() {
    const explicit = String(this.props.callProfile || "").trim().toLowerCase();
    if (explicit) return explicit;
    const path = String(this.entity?.source?.path || "").trim().toLowerCase();
    if (!path) return "";
    if (path.endsWith("/stag.glb") || path.endsWith("\\stag.glb") || path.includes("stag.glb")) {
      return "stag";
    }
    return "";
  }

  getCallProfile() {
    const explicit = String(this.props.callProfile || "").trim().toLowerCase();
    if (explicit) return explicit;
    return this.inferredCallProfile || "";
  }

  matchesCallAsset(callData) {
    const requestedPath = String(callData?.targetAssetPath || "").trim().toLowerCase();
    if (!requestedPath) return true;
    const entityPath = String(this.entity?.source?.path || "").trim().toLowerCase();
    if (!entityPath) return false;
    if (entityPath === requestedPath) return true;
    const requestedFile = requestedPath.split(/[\\/]/).pop();
    return requestedFile ? entityPath.endsWith(requestedFile) : false;
  }

  receiveWildlifeCall(callData = {}) {
    if (this.enabled === false || this.isDead || this.props.respondToCalls === false) return false;

    const profile = this.getCallProfile();
    const requestedProfile = String(callData.profile || "").trim().toLowerCase();
    if (requestedProfile && requestedProfile !== profile) return false;
    if (!profile) return false;
    if (!this.matchesCallAsset(callData)) return false;

    const radiusFromCall = Math.max(0, Number(callData.radius) || 0);
    const radiusFromAnimal = Math.max(0, Number(this.props.callResponseRadius) || 0);
    const responseRadius =
      radiusFromCall > 0 && radiusFromAnimal > 0
        ? Math.min(radiusFromCall, radiusFromAnimal)
        : Math.max(radiusFromCall, radiusFromAnimal);

    const origin = callData.origin?.isVector3 ? callData.origin : null;
    if (!origin) return false;

    this.tempDir.copy(origin).sub(this.entity.three.position);
    this.tempDir.y = 0;
    const distanceToCall = this.tempDir.length();
    if (responseRadius > 0 && distanceToCall > responseRadius) {
      return false;
    }

    const duration = Math.max(0.5, Number(callData.duration) || Number(this.props.callInvestigateDuration) || 6);
    const approach = Math.max(
      0.5,
      Number(this.props.callApproachDistance) || Number(callData.approachDistance) || 2
    );
    const spread = Math.min(1.25, Math.max(0.3, approach * 0.55));
    const angle = Math.random() * Math.PI * 2;

    this.callTarget.copy(origin);
    this.callTarget.x += Math.cos(angle) * spread;
    this.callTarget.z += Math.sin(angle) * spread;
    this.callTarget.y = this.entity.three.position.y;
    this.callTimer = duration;
    this.callApproachDistance = approach;
    this.state = "investigate";
    this.timer = 0;
    return true;
  }

  followWildlifeCall(dt) {
    if (this.callTimer <= 0) return false;

    const pos = this.entity.three.position;
    this.tempDir.copy(this.callTarget).sub(pos);
    this.tempDir.y = 0;
    const distance = this.tempDir.length();

    if (distance <= this.callApproachDistance) {
      this.state = "investigate";
      this.setAnim(this.props.alertClip || this.props.idleClip);
      return true;
    }

    if (this.tempDir.lengthSq() < 0.0001) {
      return true;
    }

    this.tempDir.normalize();
    this.applyAvoidance(this.tempDir);
    const speed = Math.max(this.props.moveSpeed || 0, (this.props.runSpeed || 0) * 0.58);
    const moved = this.moveWithTreeCollision(this.tempDir, speed * dt);
    if (!moved) {
      this.setAnim(this.props.idleClip);
      return true;
    }
    this.rotateTowards(this.tempDir, dt);
    this.setAnim(this.props.walkClip || this.props.alertClip || this.props.idleClip);
    return true;
  }

  applyAvoidance(direction) {
    const avoidDistance = this.props.avoidDistance || 0;
    if (avoidDistance <= 0) return;

    this.rayOrigin.copy(this.entity.three.position);
    this.rayOrigin.y += 0.6;
    this.raycaster.set(this.rayOrigin, direction);
    this.raycaster.far = avoidDistance;

    const hits = this.raycaster.intersectObjects(this.sceneStore.scene.children, true);
    const hit = hits.find((item) => {
      const object = item.object;
      if (object.userData?.ignoreRaycast) return false;
      const entityId = object.userData?.entityId;
      return entityId && entityId !== this.entity.id;
    });

    if (!hit) return;

    this.avoidDir.set(direction.z, 0, -direction.x).normalize();
    direction.addScaledVector(this.avoidDir, this.props.avoidStrength || 1).normalize();
  }

  rotateTowards(direction, dt, yawOffsetDeg = 0) {
    const pos = this.entity.three.position;
    this.tempMatrix.lookAt(pos, pos.clone().add(direction), this.upAxis);
    this.targetQuat.setFromRotationMatrix(this.tempMatrix);
    if (yawOffsetDeg) {
      const yaw = THREE.MathUtils.degToRad(Number(yawOffsetDeg) || 0);
      if (yaw !== 0) {
        this.yawQuat.setFromAxisAngle(this.upAxis, yaw);
        this.targetQuat.multiply(this.yawQuat);
      }
    }

    const turn = this.props.turnSpeed || 0;
    this.entity.three.quaternion.slerp(this.targetQuat, Math.min(1, turn * dt));
  }

  ensureAudioAnchor() {
    if (this.audioAnchor?.parent === this.entity.three) {
      return this.audioAnchor;
    }

    if (!this.audioAnchor) {
      this.audioAnchor = new THREE.Object3D();
      this.audioAnchor.name = `${this.entity?.name || "animal"}_audio`;
    }

    this.entity.three.add(this.audioAnchor);
    return this.audioAnchor;
  }

  syncAudioAnchor() {
    const anchor = this.ensureAudioAnchor();
    if (!anchor) return;
    anchor.position.set(0, Math.max(0.2, this.collisionRadius * 1.35), 0);
  }

  getListenerPosition() {
    const listener = this.getAudioListener?.();
    if (!listener?.getWorldPosition) return null;
    return listener.getWorldPosition(this.hearingPosition);
  }

  getDistanceToListener() {
    const listenerPos = this.getListenerPosition();
    if (!listenerPos) return Infinity;
    return this.entity.three.getWorldPosition(this.tempTarget).distanceTo(listenerPos);
  }

  resetVocalizationTimer(randomize = false) {
    const min = Math.max(0.5, Number(this.props.vocalizationIntervalMin) || 6);
    const max = Math.max(min, Number(this.props.vocalizationIntervalMax) || min);
    if (!randomize) {
      this.vocalizationTimer = min;
      return;
    }
    this.vocalizationTimer = min + Math.random() * Math.max(0, max - min);
  }

  applyVocalizationSettings() {
    if (!this.vocalizationSound) return;
    const minDistance = Math.max(0.25, Number(this.props.vocalizationMinDistance) || 4);
    const maxDistance = Math.max(minDistance + 0.1, Number(this.props.vocalizationMaxDistance) || 24);
    const rolloff = Math.max(0.1, Number(this.props.vocalizationRolloff) || 1.2);
    const volume = Math.max(0, Number(this.props.vocalizationVolume) || 0);
    this.vocalizationSound.setRefDistance(minDistance);
    this.vocalizationSound.setMaxDistance(maxDistance);
    this.vocalizationSound.setRolloffFactor(rolloff);
    this.vocalizationSound.setDistanceModel("inverse");
    this.vocalizationSound.setVolume(volume);
    this.vocalizationSound.setLoop(false);
  }

  stopVocalizationPlayback() {
    if (this.vocalizationSound?.isPlaying) {
      this.vocalizationSound.stop();
    }
  }

  disposeVocalizationAudio() {
    this.stopVocalizationPlayback();
    if (this.vocalizationSound?.parent) {
      this.vocalizationSound.parent.remove(this.vocalizationSound);
    }
    if (this.vocalizationSound) {
      this.vocalizationSound.disconnect();
    }
    this.vocalizationSound = null;
    this.vocalizationBuffer = null;
    this.vocalizationAssetPath = "";
    this.vocalizationLoadPromise = null;
    this.vocalizationLoadToken += 1;
  }

  syncVocalizationAudio() {
    const assetPath = String(this.props.vocalizationAsset || "").trim();
    const listener = this.getAudioListener?.();
    if (!assetPath || !listener || !this.assetManager?.loadAudioBuffer) {
      if (!assetPath) {
        this.disposeVocalizationAudio();
      }
      return;
    }

    this.syncAudioAnchor();

    if (this.vocalizationAssetPath === assetPath && this.vocalizationSound?.listener === listener) {
      this.applyVocalizationSettings();
      return;
    }

    if (this.vocalizationLoadPromise) return;

    this.disposeVocalizationAudio();
    const anchor = this.ensureAudioAnchor();
    if (!anchor) return;

    const sound = new THREE.PositionalAudio(listener);
    anchor.add(sound);
    this.vocalizationSound = sound;
    this.vocalizationAssetPath = assetPath;
    this.applyVocalizationSettings();

    const token = ++this.vocalizationLoadToken;
    this.vocalizationLoadPromise = this.assetManager
      .loadAudioBuffer(assetPath)
      .then((buffer) => {
        if (token !== this.vocalizationLoadToken || this.vocalizationSound !== sound) return;
        this.vocalizationBuffer = buffer;
        this.vocalizationSound.setBuffer(buffer);
      })
      .catch((error) => {
        if (token !== this.vocalizationLoadToken) return;
        console.warn("[AnimalAI] Falha ao carregar audio vocal:", assetPath, error);
        this.disposeVocalizationAudio();
      })
      .finally(() => {
        if (token === this.vocalizationLoadToken) {
          this.vocalizationLoadPromise = null;
        }
      });
  }

  playVocalization() {
    if (!this.vocalizationSound || !this.vocalizationBuffer) return;
    try {
      if (this.vocalizationSound.isPlaying) {
        this.vocalizationSound.stop();
      }
      this.vocalizationSound.play();
    } catch (error) {
      // WebAudio can still be locked until the first user gesture.
    }
  }

  updateVocalization(dt) {
    this.syncVocalizationAudio();
    this.applyVocalizationSettings();
    if (!this.vocalizationSound || !this.vocalizationBuffer) return;

    const triggerRadius = Math.max(0.5, Number(this.props.vocalizationRadius) || 18);
    const distanceToListener = this.getDistanceToListener();
    if (!Number.isFinite(distanceToListener) || distanceToListener > triggerRadius) {
      return;
    }

    if (this.vocalizationSound.isPlaying) return;

    this.vocalizationTimer -= dt;
    if (this.vocalizationTimer > 0) return;

    const chance = THREE.MathUtils.clamp(Number(this.props.vocalizationChance) || 0, 0, 1);
    this.resetVocalizationTimer(true);
    if (chance <= 0 || Math.random() > chance) return;

    this.playVocalization();
  }

  setAnim(clipName) {
    if (this.isDead) return;
    if (!this.props.useAnimation) return;
    if (!clipName) return;
    let resolved = this.resolveClipName(clipName, { warnIfMissing: true });
    if (!resolved && clipName !== this.props.idleClip) {
      resolved = this.resolveClipName(this.props.idleClip, { warnIfMissing: false });
    }
    if (!resolved) return;
    if (this.activeClip === resolved) return;
    if (!this.animator || !this.entity.animation) return;

    this.animator.play(this.entity, resolved, true, 1);
    this.activeClip = resolved;
  }
}
