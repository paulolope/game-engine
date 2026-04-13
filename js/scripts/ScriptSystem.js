export class ScriptSystem {
  constructor(registry, context) {
    this.registry = registry;
    this.context = context;
    this.instances = new Map();
  }

  buildComponentData(type) {
    const componentClass = this.registry.get(type);
    if (!componentClass) return null;
    const defaults = componentClass.defaults || {};
    return {
      id: crypto.randomUUID(),
      type,
      props: { ...defaults },
      enabled: true,
    };
  }

  addComponent(entity, type) {
    const data = this.buildComponentData(type);
    if (!data) return null;
    entity.components.push(data);
    const instance = this.createInstance(entity, data);
    this.instances.set(data.id, instance);
    return data;
  }

  removeComponent(entity, componentId) {
    const instance = this.instances.get(componentId);
    if (instance?.destroy) {
      instance.destroy();
    }
    entity.components = entity.components.filter((comp) => comp.id !== componentId);
    this.instances.delete(componentId);
  }

  rebuildComponents(entity) {
    entity.components.forEach((data) => {
      const existing = this.instances.get(data.id);
      if (existing?.destroy) {
        existing.destroy();
      }
      this.instances.delete(data.id);
    });
    entity.components.forEach((data) => {
      const instance = this.createInstance(entity, data);
      this.instances.set(data.id, instance);
    });
  }

  createInstance(entity, data) {
    const componentClass = this.registry.get(data.type);
    if (!componentClass) return null;
    const defaults = componentClass.defaults || {};
    data.props = { ...defaults, ...(data.props || {}) };
    const instance = new componentClass(entity, data.props, this.context);
    instance.enabled = data.enabled !== false;
    if (instance.start) {
      instance.start();
    }
    return instance;
  }

  update(dt) {
    this.instances.forEach((instance) => {
      if (!instance || instance.enabled === false) return;
      if (instance.update) {
        instance.update(dt);
      }
    });
  }

  updateProp(componentId, key, value) {
    const instance = this.instances.get(componentId);
    if (!instance) return;
    instance.props[key] = value;
  }

  toggleComponent(componentId, enabled) {
    const instance = this.instances.get(componentId);
    if (instance) {
      instance.enabled = enabled;
    }
  }

  getComponentInstance(componentId) {
    return this.instances.get(componentId);
  }
}
