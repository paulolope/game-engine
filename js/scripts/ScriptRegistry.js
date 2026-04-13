export class ScriptRegistry {
  constructor() {
    this.registry = new Map();
  }

  register(componentClass) {
    if (!componentClass || !componentClass.type) {
      throw new Error("Component class must have a static type.");
    }
    this.registry.set(componentClass.type, componentClass);
  }

  get(type) {
    return this.registry.get(type);
  }

  listTypes() {
    return Array.from(this.registry.keys()).sort();
  }
}
