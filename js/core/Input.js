export class Input {
  constructor() {
    this.keys = new Set();
    this.mouseButtons = new Set();
    this.enabled = true;

    window.addEventListener("keydown", (event) => {
      if (!this.enabled) return;
      this.keys.add(event.code);
    });

    window.addEventListener("keyup", (event) => {
      if (!this.enabled) return;
      this.keys.delete(event.code);
    });

    window.addEventListener("pointerdown", (event) => {
      if (!this.enabled) return;
      const code = this.mapMouseButton(event.button);
      if (code) this.mouseButtons.add(code);
    });

    window.addEventListener("pointerup", (event) => {
      if (!this.enabled) return;
      const code = this.mapMouseButton(event.button);
      if (code) this.mouseButtons.delete(code);
    });

    window.addEventListener("blur", () => this.clear());
  }

  isDown(code) {
    return this.keys.has(code) || this.mouseButtons.has(code);
  }

  clear() {
    this.keys.clear();
    this.mouseButtons.clear();
  }

  mapMouseButton(button) {
    if (button === 0) return "MouseLeft";
    if (button === 1) return "MouseMiddle";
    if (button === 2) return "MouseRight";
    return "";
  }
}
