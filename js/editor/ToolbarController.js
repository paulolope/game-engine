import { safeNumber } from "../utils/utils.js";

export class ToolbarController {
  constructor({ toolButtons, snapToggle, snapMove, snapRot, snapScale, onToolChange, onSnapChange }) {
    this.toolButtons = toolButtons;
    this.snapToggle = snapToggle;
    this.snapMove = snapMove;
    this.snapRot = snapRot;
    this.snapScale = snapScale;
    this.onToolChange = onToolChange;
    this.onSnapChange = onSnapChange;

    this.activeTool = "translate";
  }

  bind() {
    this.toolButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const tool = button.dataset.tool;
        this.setTool(tool);
      });
    });

    this.snapToggle.addEventListener("change", () => this.applySnap());
    this.snapMove.addEventListener("change", () => this.applySnap());
    this.snapRot.addEventListener("change", () => this.applySnap());
    this.snapScale.addEventListener("change", () => this.applySnap());
  }

  setTool(tool) {
    this.activeTool = tool;
    this.toolButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tool === tool);
    });
    if (this.onToolChange) this.onToolChange(tool);
  }

  setToolWithConstraint(tool, allowTool) {
    const next = allowTool ? tool : "translate";
    this.setTool(next);
  }

  applySnap() {
    if (!this.onSnapChange) return;
    if (!this.snapToggle.checked) {
      this.onSnapChange(null);
      return;
    }

    const moveSnap = safeNumber(this.snapMove.value, 0.5);
    const rotSnap = safeNumber(this.snapRot.value, 15);
    const scaleSnap = safeNumber(this.snapScale.value, 0.1);
    this.onSnapChange({ moveSnap, rotSnap, scaleSnap });
  }
}
