import * as THREE from "three";

export class AutoRotate {
  static type = "AutoRotate";
  static label = "Auto Rotate";
  static defaults = {
    speed: 1,
    axisX: 0,
    axisY: 1,
    axisZ: 0,
  };

  static schema = [
    { key: "speed", label: "Velocidade", type: "number", step: 0.1 },
    { key: "axisX", label: "Eixo X", type: "number", step: 0.1 },
    { key: "axisY", label: "Eixo Y", type: "number", step: 0.1 },
    { key: "axisZ", label: "Eixo Z", type: "number", step: 0.1 },
  ];

  constructor(entity, props) {
    this.entity = entity;
    this.props = props;
    this.axis = new THREE.Vector3(0, 1, 0);
  }

  update(dt) {
    this.axis.set(this.props.axisX || 0, this.props.axisY || 0, this.props.axisZ || 0);
    if (this.axis.lengthSq() < 0.0001) return;
    this.axis.normalize();
    this.entity.three.rotateOnAxis(this.axis, (this.props.speed || 0) * dt);
  }
}
