import * as THREE from "three";

export class AnimatorSystem {
  constructor() {
    this.mixers = new Map();
  }

  register(entity, gltfScene, animations = []) {
    if (!animations || animations.length === 0) return null;
    const mixer = new THREE.AnimationMixer(gltfScene);
    const actions = {};
    animations.forEach((clip) => {
      actions[clip.name] = mixer.clipAction(clip);
    });

    const data = { mixer, actions, clips: animations };
    this.mixers.set(entity.id, data);
    return data;
  }

  unregister(entity) {
    this.mixers.delete(entity.id);
  }

  play(entity, clipName, loop = true, speed = 1) {
    const anim = this.mixers.get(entity.id);
    if (!anim) return;
    const action = anim.actions[clipName] || anim.actions[anim.clips[0]?.name];
    if (!action) return;
    Object.values(anim.actions).forEach((other) => other.stop());
    action.reset();
    action.enabled = true;
    action.setEffectiveTimeScale(speed ?? 1);
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = !loop;
    action.play();

    entity.animation = {
      clip: action.getClip().name,
      loop: loop ?? true,
      speed: speed ?? 1,
      playing: true,
    };
  }

  stop(entity) {
    const anim = this.mixers.get(entity.id);
    if (!anim) return;
    Object.values(anim.actions).forEach((action) => action.stop());
    if (entity.animation) {
      entity.animation.playing = false;
    }
  }

  update(dt) {
    this.mixers.forEach((anim) => {
      anim.mixer.update(dt);
    });
  }

  getClips(entity) {
    const anim = this.mixers.get(entity.id);
    return anim ? anim.clips : [];
  }
}
