export class PlayAnimation {
  static type = "PlayAnimation";
  static label = "Play Animation";
  static defaults = {
    clip: "",
    loop: true,
    speed: 1,
    playOnStart: true,
  };

  static schema = [
    { key: "clip", label: "Clip", type: "animation" },
    { key: "loop", label: "Loop", type: "boolean" },
    { key: "speed", label: "Velocidade", type: "number", step: 0.1 },
    { key: "playOnStart", label: "Auto Play", type: "boolean" },
  ];

  constructor(entity, props, context) {
    this.entity = entity;
    this.props = props;
    this.animator = context.animator;
  }

  start() {
    if (!this.animator || !this.entity.animation) return;
    if (!this.props.playOnStart) return;
    const clip = this.props.clip || this.entity.animation.clip;
    this.animator.play(this.entity, clip, this.props.loop, this.props.speed);
  }
}
