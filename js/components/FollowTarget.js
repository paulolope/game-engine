import * as THREE from "three";

export class FollowTarget {
  static type = "FollowTarget";
  static label = "Follow Target";
  static defaults = {
    targetId: "",
    speed: 2,
    offsetX: 0,
    offsetY: 0,
    offsetZ: 0,
  };

  static schema = [
    { key: "targetId", label: "Target", type: "entity" },
    { key: "speed", label: "Velocidade", type: "number", step: 0.1 },
    { key: "offsetX", label: "Offset X", type: "number", step: 0.1 },
    { key: "offsetY", label: "Offset Y", type: "number", step: 0.1 },
    { key: "offsetZ", label: "Offset Z", type: "number", step: 0.1 },
  ];

  constructor(entity, props, context) {
    this.entity = entity;
    this.props = props;
    this.sceneStore = context.sceneStore;
    this.tempTarget = new THREE.Vector3();
    this.tempCurrent = new THREE.Vector3();
    this.tempDesired = new THREE.Vector3();
    this.offset = new THREE.Vector3();
  }

  update(dt) {
    if (!this.props.targetId) return;
    const targetEntity = this.sceneStore.getEntity(this.props.targetId);
    if (!targetEntity) return;

    targetEntity.three.getWorldPosition(this.tempTarget);
    this.offset.set(this.props.offsetX || 0, this.props.offsetY || 0, this.props.offsetZ || 0);
    this.tempTarget.add(this.offset);

    this.entity.three.getWorldPosition(this.tempCurrent);
    const direction = this.tempTarget.clone().sub(this.tempCurrent);
    const distance = direction.length();
    if (distance < 0.001) return;

    const step = Math.min(distance, (this.props.speed || 0) * dt);
    direction.normalize().multiplyScalar(step);
    const desiredWorld = this.tempCurrent.add(direction);

    this.tempDesired.copy(desiredWorld);
    if (this.entity.three.parent) {
      this.entity.three.parent.worldToLocal(this.tempDesired);
    }
    this.entity.three.position.copy(this.tempDesired);
  }
}
