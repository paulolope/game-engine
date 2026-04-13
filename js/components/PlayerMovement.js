import * as THREE from "three";
import { moveObjectWithTreeCollisions } from "../utils/treeCollisions.js";

export class PlayerMovement {
  static type = "PlayerMovement";
  static label = "Player Movement";
  static defaults = {
    speed: 2.5,
    allowVertical: false,
  };

  static schema = [
    { key: "speed", label: "Velocidade", type: "number", step: 0.1 },
    { key: "allowVertical", label: "Mover Y", type: "boolean" },
  ];

  constructor(entity, props, context) {
    this.entity = entity;
    this.props = props;
    this.input = context.input;
    this.sceneStore = context.sceneStore;
    this.uiState = context.uiState || { isInventoryOpen: false };
    this.temp = new THREE.Vector3();
    this.currentWorldPos = new THREE.Vector3();
    this.nextWorldPos = new THREE.Vector3();
    this.parentLocalPos = new THREE.Vector3();
  }

  update(dt) {
    if (this.uiState?.isInventoryOpen) return;
    const speed = this.props.speed || 0;
    this.temp.set(0, 0, 0);

    if (this.input.isDown("KeyW") || this.input.isDown("ArrowUp")) this.temp.z -= 1;
    if (this.input.isDown("KeyS") || this.input.isDown("ArrowDown")) this.temp.z += 1;
    if (this.input.isDown("KeyA") || this.input.isDown("ArrowLeft")) this.temp.x -= 1;
    if (this.input.isDown("KeyD") || this.input.isDown("ArrowRight")) this.temp.x += 1;

    if (this.props.allowVertical) {
      if (this.input.isDown("Space")) this.temp.y += 1;
      if (this.input.isDown("ShiftLeft") || this.input.isDown("ShiftRight")) this.temp.y -= 1;
    }

    if (this.temp.lengthSq() < 0.0001) return;

    this.temp.normalize().multiplyScalar(speed * dt);
    moveObjectWithTreeCollisions(this.sceneStore, this.entity.three, this.temp, 0.42, {
      currentWorldPos: this.currentWorldPos,
      nextWorldPos: this.nextWorldPos,
      localPos: this.parentLocalPos,
    });

    if (this.props.allowVertical && Math.abs(this.temp.y) > 0.0001) {
      this.entity.three.position.y += this.temp.y;
    }
  }
}
