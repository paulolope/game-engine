export class GraphicsSettingsPanel {
  constructor(qualitySettings, options = {}) {
    this.qualitySettings = qualitySettings;
    this.onChanged = options.onChanged || (() => {});
    this.onDebugToggle = options.onDebugToggle || (() => {});

    this.panel = document.getElementById("graphics-panel");
    this.toggleBtn = document.getElementById("btn-graphics-panel");
    this.presetSelect = document.getElementById("gfx-preset");
    this.autoFallback = document.getElementById("gfx-auto-fallback");
    this.postEnabled = document.getElementById("gfx-post-enabled");
    this.postSSAO = document.getElementById("gfx-post-ssao");
    this.postBloom = document.getElementById("gfx-post-bloom");
    this.fogEnabled = document.getElementById("gfx-fog-enabled");
    this.debugEnabled = document.getElementById("gfx-debug-enabled");
    this.status = document.getElementById("gfx-status");
  }

  initialize() {
    this.populatePresetOptions();
    this.refreshFromState();

    this.toggleBtn?.addEventListener("click", () => {
      this.panel?.classList.toggle("collapsed");
    });

    this.presetSelect?.addEventListener("change", () => {
      this.qualitySettings.setPreset(this.presetSelect.value, "manual");
      this.refreshFromState();
      this.onChanged();
    });

    this.autoFallback?.addEventListener("change", () => {
      this.qualitySettings.setAutoFallback(this.autoFallback.checked);
      this.onChanged();
    });

    this.postEnabled?.addEventListener("change", () => {
      this.qualitySettings.setPostOption("enabled", this.postEnabled.checked);
      this.refreshFromState();
      this.onChanged();
    });

    this.postSSAO?.addEventListener("change", () => {
      this.qualitySettings.setPostOption("ssao", this.postSSAO.checked);
      this.onChanged();
    });

    this.postBloom?.addEventListener("change", () => {
      this.qualitySettings.setPostOption("bloom", this.postBloom.checked);
      this.onChanged();
    });

    this.fogEnabled?.addEventListener("change", () => {
      this.qualitySettings.setFogEnabled(this.fogEnabled.checked);
      this.onChanged();
    });

    this.debugEnabled?.addEventListener("change", () => {
      this.onDebugToggle(this.debugEnabled.checked);
    });
  }

  populatePresetOptions() {
    if (!this.presetSelect) return;
    this.presetSelect.innerHTML = "";
    this.qualitySettings.getPresetList().forEach((preset) => {
      const option = document.createElement("option");
      option.value = preset.id;
      option.textContent = preset.label;
      this.presetSelect.appendChild(option);
    });
  }

  refreshFromState() {
    const current = this.qualitySettings.getCurrent();
    if (this.presetSelect) this.presetSelect.value = current.id;
    if (this.autoFallback) this.autoFallback.checked = current.autoFallback !== false;
    if (this.postEnabled) this.postEnabled.checked = current.post?.enabled === true;
    if (this.postSSAO) {
      this.postSSAO.checked = current.post?.ssao === true;
      this.postSSAO.disabled = current.post?.enabled !== true;
    }
    if (this.postBloom) {
      this.postBloom.checked = current.post?.bloom === true;
      this.postBloom.disabled = current.post?.enabled !== true;
    }
    if (this.fogEnabled) this.fogEnabled.checked = current.fog !== false;
  }

  setStatus(message = "") {
    if (!this.status) return;
    this.status.textContent = message;
    if (!message) return;
    clearTimeout(this.statusTimer);
    this.statusTimer = setTimeout(() => {
      if (this.status) this.status.textContent = "";
    }, 3600);
  }
}
