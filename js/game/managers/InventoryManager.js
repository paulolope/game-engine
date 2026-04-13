const HOTBAR_SIZE = 9;
const TREE_STAND_ITEM = {
  id: "tree_stand",
  type: "utility",
  category: "Suporte",
  label: "Tree Stand",
  hotbarLabel: "Tree Stand",
  description: "Plataforma de caca que so pode ser colocada em arvores. Mire no tronco, pressione E e use o mouse para colocar ou gerenciar.",
  source: "Sketchfab",
  sourceUrl: "https://sketchfab.com/3d-models/camouflage-hunting-tree-stand-2526f708b97f4be9a9a4871cbd7069f4",
  license: "CC BY",
  meta: "835.1k tris",
  placement: {
    assetPath: "assets/models/tree_stand.glb",
    surface: "tree",
    requiresInteractMenu: true,
    slotHint: 3,
  },
};
const STAG_CALL_ITEM = {
  id: "item-stag-call",
  type: "utility",
  category: "Chamariz",
  label: "Chamariz de Stag",
  hotbarLabel: "Stag Call",
  description: "Chamariz para atrair animais configurados como stag. Clique esquerdo para usar durante o jogo.",
  meta: "Alvo: assets/models/stag.glb",
  use: {
    type: "animalCall",
    profile: "stag",
    targetAssetPath: "assets/models/stag.glb",
    radius: 32,
    duration: 9,
    approachDistance: 2.4,
    cooldown: 8,
  },
};

function getDigitIndexFromCode(code = "") {
  const match = /^Digit([1-9])$/.exec(String(code).trim());
  if (!match) return -1;
  return Number(match[1]) - 1;
}

function isEditableTarget(target) {
  if (!target) return false;
  const tagName = String(target.tagName || "").toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable === true;
}

function deriveWeaponLabel(path = "") {
  const raw = String(path || "")
    .split("/")
    .pop()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();

  if (!raw) return "Arma Principal";
  return raw
    .replace(/\bfps\b/gi, "")
    .replace(/\barms\b/gi, "")
    .replace(/\bglb\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Arma Principal";
}

export class InventoryManager {
  constructor({ sceneStore, scriptSystem, input, uiState }) {
    this.sceneStore = sceneStore;
    this.scriptSystem = scriptSystem;
    this.input = input;
    this.uiState = uiState || { isInventoryOpen: false };

    this.items = [];
    this.hotbar = Array(HOTBAR_SIZE).fill("");
    this.selectedSlot = 0;
    this.selectedItemId = "";
    this.equippedItemId = "";
    this.sceneName = "";
    this.enabled = false;

    this.hotbarRoot = document.getElementById("inventory-hotbar");
    this.panel = document.getElementById("inventory-panel");
    this.itemsRoot = document.getElementById("inventory-items");
    this.detailRoot = document.getElementById("inventory-detail-card");
    this.closeButton = document.getElementById("inventory-close");
    this.helpLabel = document.getElementById("inventory-help");

    this.onKeyDown = (event) => {
      if (!this.enabled || isEditableTarget(event.target)) return;

      if (event.code === "KeyI") {
        event.preventDefault();
        this.toggleInventory();
        return;
      }

      if (event.code === "Escape" && this.uiState.isInventoryOpen) {
        event.preventDefault();
        this.toggleInventory(false);
        return;
      }

      const slotIndex = getDigitIndexFromCode(event.code);
      if (slotIndex < 0) return;
      event.preventDefault();

      if (this.uiState.isInventoryOpen && this.selectedItemId) {
        this.assignItemToSlot(this.selectedItemId, slotIndex);
      }
      this.selectSlot(slotIndex);
    };
  }

  initialize() {
    window.addEventListener("keydown", this.onKeyDown);
    this.closeButton?.addEventListener("click", () => this.toggleInventory(false));

    this.hotbarRoot?.addEventListener("click", (event) => {
      const slotButton = event.target?.closest?.("[data-slot-index]");
      if (!slotButton) return;
      const slotIndex = Number(slotButton.dataset.slotIndex);
      if (!Number.isInteger(slotIndex)) return;
      if (this.uiState.isInventoryOpen && this.selectedItemId) {
        this.assignItemToSlot(this.selectedItemId, slotIndex);
      }
      this.selectSlot(slotIndex);
    });

    this.hotbarRoot?.addEventListener("contextmenu", (event) => {
      if (!this.uiState.isInventoryOpen) return;
      const slotButton = event.target?.closest?.("[data-slot-index]");
      if (!slotButton) return;
      event.preventDefault();
      const slotIndex = Number(slotButton.dataset.slotIndex);
      if (!Number.isInteger(slotIndex)) return;
      this.clearSlot(slotIndex);
    });

    this.itemsRoot?.addEventListener("click", (event) => {
      const assignButton = event.target?.closest?.("[data-assign-item]");
      if (assignButton) {
        const itemId = String(assignButton.dataset.assignItem || "").trim();
        if (itemId) {
          this.selectedItemId = itemId;
          this.assignItemToSlot(itemId, this.selectedSlot);
          this.selectSlot(this.selectedSlot);
        }
        return;
      }

      const itemButton = event.target?.closest?.("[data-item-id]");
      if (!itemButton) return;
      const itemId = String(itemButton.dataset.itemId || "").trim();
      if (!itemId) return;
      this.selectedItemId = itemId;
      this.render();
    });

    this.render();
  }

  setEnabled(enabled) {
    this.enabled = enabled !== false;
    if (!this.enabled) {
      this.toggleInventory(false, { skipGuard: true });
      this.applyVisibilityState();
      return;
    }
    this.applyVisibilityState();
    this.renderHotbar();
  }

  setScene(name = "") {
    this.sceneName = String(name || "").trim();
    this.syncFromScene();
  }

  syncFromScene() {
    const controller = this.getFPSControllerInstance();
    if (!controller) {
      this.render();
      return;
    }

    this.upsertItem(this.buildWeaponItem(controller));
    this.upsertItem({ ...TREE_STAND_ITEM });
    this.upsertItem({ ...STAG_CALL_ITEM });
    this.ensureDefaultHotbar();

    if (!this.selectedItemId || !this.getItem(this.selectedItemId)) {
      this.selectedItemId = this.hotbar[this.selectedSlot] || this.items[0]?.id || "";
    }

    this.equippedItemId = this.hotbar[this.selectedSlot] || "";
    this.equipSelectedSlot({ silent: true });
    this.render();
  }

  updateHelpLabel() {
    if (!this.helpLabel) return;
    const base = "Pressione I para abrir ou fechar. Clique num item e depois num slot 1-9 para colocar na barra. Clique direito num slot para remover.";
    const selected = this.selectedItemId ? ` Slot ativo: ${this.selectedSlot + 1}.` : "";
    this.helpLabel.textContent = `${base}${selected}`;
  }

  toggleInventory(force, options = {}) {
    if (!this.enabled && !options.skipGuard) return;
    const nextOpen = typeof force === "boolean" ? force : !this.uiState.isInventoryOpen;
    this.uiState.isInventoryOpen = nextOpen;

    if (nextOpen) {
      this.syncCurrentWeaponState();
      if (document.pointerLockElement) {
        document.exitPointerLock?.();
      }
      this.input?.clear?.();
    }

    this.panel?.classList.toggle("hidden", !nextOpen);
    this.panel?.setAttribute("aria-hidden", nextOpen ? "false" : "true");
    this.render();
  }

  getFPSControllerInstance() {
    const entity = this.sceneStore
      ?.listEntities?.()
      ?.find?.((candidate) => candidate?.components?.some?.((component) => component.type === "FPSController"));
    if (!entity) return null;
    const component = entity.components.find((entry) => entry.type === "FPSController");
    if (!component) return null;
    return this.scriptSystem?.getComponentInstance?.(component.id) || null;
  }

  getItem(itemId) {
    return this.items.find((item) => item.id === itemId) || null;
  }

  upsertItem(item) {
    if (!item?.id) return;
    const index = this.items.findIndex((entry) => entry.id === item.id);
    if (index >= 0) {
      this.items[index] = {
        ...this.items[index],
        ...item,
      };
      return;
    }
    this.items.push(item);
  }

  buildWeaponItem(controller) {
    const snapshot = controller.exportInventoryWeapon();
    const weaponPath = snapshot.weaponModelPath || controller.props.weaponModelPath || "";
    const label = deriveWeaponLabel(weaponPath);
    return {
      id: "weapon-primary",
      type: "weapon",
      category: "Arma",
      label,
      hotbarLabel: label.replace(/\s+/g, " ").slice(0, 14),
      description: "Arma principal do jogador. Pode ser atribuida para qualquer atalho numerico.",
      meta: `${snapshot.magazineSize || 0} tiros / alcance ${snapshot.range || 0}`,
      weapon: snapshot,
    };
  }

  ensureDefaultHotbar() {
    if (!this.hotbar.some(Boolean)) {
      this.hotbar[0] = "weapon-primary";
      this.hotbar[1] = STAG_CALL_ITEM.id;
      this.hotbar[2] = TREE_STAND_ITEM.id;
    }

    if (!this.hotbar[this.selectedSlot]) {
      const firstFilled = this.hotbar.findIndex(Boolean);
      this.selectedSlot = firstFilled >= 0 ? firstFilled : 0;
    }
  }

  syncCurrentWeaponState() {
    const controller = this.getFPSControllerInstance();
    if (!controller || !this.equippedItemId) return;
    const item = this.getItem(this.equippedItemId);
    if (!item || item.type !== "weapon") return;
    item.weapon = controller.exportInventoryWeapon();
  }

  assignItemToSlot(itemId, slotIndex) {
    if (!this.getItem(itemId)) return;
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= HOTBAR_SIZE) return;

    this.hotbar = this.hotbar.map((entry, index) => (index === slotIndex ? entry : entry === itemId ? "" : entry));
    this.hotbar[slotIndex] = itemId;
    this.selectedItemId = itemId;
    this.render();
  }

  clearSlot(slotIndex) {
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= HOTBAR_SIZE) return;
    const removedItemId = this.hotbar[slotIndex];
    this.hotbar[slotIndex] = "";
    if (this.selectedSlot === slotIndex) {
      this.equippedItemId = "";
      this.equipSelectedSlot({ silent: true });
    }
    if (this.selectedItemId === removedItemId) {
      this.selectedItemId = "";
    }
    this.render();
  }

  selectSlot(slotIndex) {
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= HOTBAR_SIZE) return;
    this.syncCurrentWeaponState();
    this.selectedSlot = slotIndex;
    if (!this.selectedItemId && this.hotbar[slotIndex]) {
      this.selectedItemId = this.hotbar[slotIndex];
    }
    this.equipSelectedSlot();
    this.render();
  }

  equipSelectedSlot(options = {}) {
    const controller = this.getFPSControllerInstance();
    if (!controller) return;

    const itemId = this.hotbar[this.selectedSlot] || "";
    const item = this.getItem(itemId);
    this.equippedItemId = itemId;

    if (!item) {
      controller.setWeaponActive(false);
      if (!options.silent) controller.setStatus("Slot vazio", 850);
      return;
    }

    if (item.type === "weapon" && item.weapon) {
      controller.applyInventoryWeapon(item.weapon);
      controller.setWeaponActive(true);
      if (!options.silent) controller.setStatus(`${item.label} equipada`, 1100);
      return;
    }

    controller.setWeaponActive(false);
    if (!options.silent) {
      const message = item.placement
        ? item.placement.surface === "tree"
          ? `${item.label} selecionado. Mire numa arvore e pressione E.`
          : `${item.label} selecionado. Clique para colocar.`
        : item.use?.type === "animalCall"
          ? `${item.label} selecionado. Clique esquerdo para usar.`
          : `${item.label} selecionado`;
      controller.setStatus(message, 1400);
    }
  }

  createHotbarSlot(slotIndex) {
    const item = this.getItem(this.hotbar[slotIndex]);
    const slot = document.createElement("button");
    slot.type = "button";
    slot.className = "inventory-hotbar-slot";
    if (slotIndex === this.selectedSlot) slot.classList.add("is-selected");
    if (!item) slot.classList.add("is-empty");
    slot.dataset.slotIndex = String(slotIndex);

    const number = document.createElement("span");
    number.className = "inventory-slot-number";
    number.textContent = String(slotIndex + 1);
    slot.appendChild(number);

    const name = document.createElement("span");
    name.className = "inventory-slot-name";
    name.textContent = item?.hotbarLabel || "Vazio";
    slot.appendChild(name);

    const type = document.createElement("span");
    type.className = "inventory-slot-type";
    type.textContent = item?.category || "Slot";
    slot.appendChild(type);

    return slot;
  }

  renderHotbar() {
    if (!this.hotbarRoot) return;
    this.hotbarRoot.innerHTML = "";
    const inner = document.createElement("div");
    inner.className = "inventory-hotbar-track";
    for (let i = 0; i < HOTBAR_SIZE; i += 1) {
      inner.appendChild(this.createHotbarSlot(i));
    }
    this.hotbarRoot.appendChild(inner);
  }

  applyVisibilityState() {
    const showHud = this.enabled && this.uiState.isInventoryOpen === true;
    this.hotbarRoot?.classList.toggle("hidden", !showHud);
  }

  renderItems() {
    if (!this.itemsRoot) return;
    this.itemsRoot.innerHTML = "";

    this.items.forEach((item) => {
      const assignedSlots = this.hotbar
        .map((entry, index) => (entry === item.id ? index + 1 : 0))
        .filter(Boolean);

      const card = document.createElement("article");
      card.className = "inventory-item-card";
      if (item.id === this.selectedItemId) card.classList.add("is-selected");
      if (assignedSlots.length) card.classList.add("is-assigned");
      card.dataset.itemId = item.id;

      const badge = document.createElement("span");
      badge.className = "inventory-item-badge";
      badge.textContent = item.category || "Item";
      card.appendChild(badge);

      const title = document.createElement("h4");
      title.className = "inventory-item-title";
      title.textContent = item.label;
      card.appendChild(title);

      const desc = document.createElement("p");
      desc.className = "inventory-item-desc";
      desc.textContent = item.description || "Sem descricao.";
      card.appendChild(desc);

      const meta = document.createElement("div");
      meta.className = "inventory-item-meta";
      meta.textContent = assignedSlots.length ? `Slots: ${assignedSlots.join(", ")}` : "Fora da barra";
      card.appendChild(meta);

      if (item.meta || item.license) {
        const foot = document.createElement("div");
        foot.className = "inventory-item-foot";
        foot.textContent = [item.meta, item.license].filter(Boolean).join(" | ");
        card.appendChild(foot);
      }

      const action = document.createElement("button");
      action.type = "button";
      action.className = "inventory-item-action";
      action.dataset.assignItem = item.id;
      action.textContent = `Colocar no slot ${this.selectedSlot + 1}`;
      card.appendChild(action);

      this.itemsRoot.appendChild(card);
    });
  }

  renderDetail() {
    if (!this.detailRoot) return;
    this.detailRoot.innerHTML = "";

    const item = this.getItem(this.selectedItemId) || this.getItem(this.hotbar[this.selectedSlot]);
    if (!item) {
      const empty = document.createElement("div");
      empty.className = "inventory-detail-empty";
      empty.textContent = "Selecione um item para ver os detalhes e atribuir para a barra.";
      this.detailRoot.appendChild(empty);
      return;
    }

    const title = document.createElement("h4");
    title.className = "inventory-detail-title";
    title.textContent = item.label;
    this.detailRoot.appendChild(title);

    const kind = document.createElement("div");
    kind.className = "inventory-detail-kind";
    kind.textContent = `${item.category || "Item"}${item.type === "weapon" ? " equipada quando slot ativo" : " utilitario"}`;
    this.detailRoot.appendChild(kind);

    const desc = document.createElement("p");
    desc.className = "inventory-detail-desc";
    desc.textContent = item.description || "";
    this.detailRoot.appendChild(desc);

    const slot = document.createElement("div");
    slot.className = "inventory-detail-slot";
    slot.textContent = `Slot ativo: ${this.selectedSlot + 1}`;
    this.detailRoot.appendChild(slot);

    if (item.use?.type === "animalCall") {
      const usage = document.createElement("div");
      usage.className = "inventory-detail-slot";
      usage.textContent = `Uso: clique esquerdo para ativar. Cooldown ${Number(item.use.cooldown || 0)}s.`;
      this.detailRoot.appendChild(usage);
    }

    if (item.placement) {
      const usage = document.createElement("div");
      usage.className = "inventory-detail-slot";
      usage.textContent =
        item.placement.surface === "tree"
          ? "Uso: mire numa arvore, pressione E e clique esquerdo para colocar. Perto do suporte, E abre subir/remover."
          : "Uso: clique esquerdo para colocar no mundo.";
      this.detailRoot.appendChild(usage);
    }

    if (item.type === "weapon" && item.weapon) {
      const stats = document.createElement("dl");
      stats.className = "inventory-detail-stats";
      const entries = [
        ["Modelo", deriveWeaponLabel(item.weapon.weaponModelPath || "")],
        ["Pente", String(item.weapon.magazineSize || 0)],
        ["Reserva", String(item.weapon.reserveAmmo || 0)],
        ["Alcance", String(item.weapon.range || 0)],
      ];
      entries.forEach(([label, value]) => {
        const dt = document.createElement("dt");
        dt.textContent = label;
        const dd = document.createElement("dd");
        dd.textContent = value;
        stats.appendChild(dt);
        stats.appendChild(dd);
      });
      this.detailRoot.appendChild(stats);
    }

    if (item.sourceUrl) {
      const source = document.createElement("a");
      source.className = "inventory-detail-link";
      source.href = item.sourceUrl;
      source.target = "_blank";
      source.rel = "noreferrer noopener";
      source.textContent = `${item.source || "Fonte"} (${item.license || "link"})`;
      this.detailRoot.appendChild(source);
    }
  }

  render() {
    this.applyVisibilityState();
    this.renderHotbar();
    this.updateHelpLabel();
    if (!this.panel || this.panel.classList.contains("hidden")) return;
    this.renderItems();
    this.renderDetail();
  }

  getEquippedItem() {
    return this.getItem(this.equippedItemId);
  }
}
