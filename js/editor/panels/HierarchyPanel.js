export class HierarchyPanel {
  constructor({ listEl, parentSelect, sceneStore, onSelect }) {
    this.listEl = listEl;
    this.parentSelect = parentSelect;
    this.sceneStore = sceneStore;
    this.onSelect = onSelect;
  }

  render(selectionId = null) {
    this.listEl.innerHTML = "";
    const roots = this.sceneStore.getChildren(null);
    roots.forEach((entity) => this.renderItem(entity, 0, selectionId));
    this.refreshParentSelect(selectionId);
  }

  renderItem(entity, depth, selectionId) {
    const item = document.createElement("div");
    item.className = "hierarchy-item";
    if (entity.id === selectionId) item.classList.add("selected");
    if (!entity.active) item.classList.add("inactive");
    item.style.paddingLeft = `${8 + depth * 12}px`;

    const icon = document.createElement("span");
    icon.className = "hierarchy-icon";
    icon.dataset.type = entity.type;
    if (entity.type === "light" && entity.light?.kind) {
      icon.dataset.kind = entity.light.kind;
    }
    icon.textContent = this.getIconLabel(entity);
    const name = document.createElement("span");
    name.textContent = entity.name;

    item.appendChild(icon);
    item.appendChild(name);
    item.addEventListener("click", () => {
      if (this.onSelect) this.onSelect(entity.id);
    });

    this.listEl.appendChild(item);

    const children = this.sceneStore.getChildren(entity.id);
    children.forEach((child) => this.renderItem(child, depth + 1, selectionId));
  }

  getIconLabel(entity) {
    switch (entity.type) {
      case "light":
        switch (entity.light?.kind) {
          case "directional":
            return "D";
          case "spot":
            return "S";
          case "ambient":
            return "A";
          case "hemisphere":
            return "H";
          case "point":
          default:
            return "P";
        }
      case "camera":
        return "C";
      case "terrain":
        return "T";
      case "spawn_volume":
        return "R";
      case "model":
        return "M";
      case "empty":
        return "E";
      case "cube":
        return "C";
      case "sphere":
        return "S";
      case "plane":
        return "P";
      default:
        return "O";
    }
  }

  refreshParentSelect(selectionId) {
    this.parentSelect.innerHTML = "";
    const none = document.createElement("option");
    none.value = "none";
    none.textContent = "(Sem parent)";
    this.parentSelect.appendChild(none);

    this.sceneStore.listEntities().forEach((entity) => {
      if (entity.id === selectionId) return;
      const option = document.createElement("option");
      option.value = entity.id;
      option.textContent = entity.name;
      this.parentSelect.appendChild(option);
    });

    if (selectionId) {
      const selected = this.sceneStore.getEntity(selectionId);
      if (selected?.parentId) {
        this.parentSelect.value = selected.parentId;
      }
    }
  }
}
