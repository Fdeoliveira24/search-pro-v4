/**
 * Search Pro Control Panel - Content Tab Handler
 * Version 4.5 - Last Update on 10/10/2026
 * Handles everything specific to the Content tab: which kinds of elements are in the search, which elements without a title are
 * included, and the containers visitors can open from the search.
 *
 * One change travels one road: the field -> core.onFormChange (it saves the value and sends it to an open tour). This handler
 * only adds what a plain field cannot do: Include All / Include None, the list of containers (rows like the Tag Names of the
 * Appearance tab, saved as a list), the warning when nothing is searched, checks that explain a value that cannot be used, and
 * "Restore Defaults".
 *
 * Sections of the page (data-section-key, also the data-section of each "Restore Defaults" button):
 *   elementTypes  What Is Searched  includeContent.elements.include* (one switch per kind of element)
 *   unnamedItems  Unnamed Items     includeContent.unlabeledWithSubtitles / unlabeledWithTags / completelyBlank / includePlainObjects, minLabelLength
 *   containers    Containers        includeContent.elements.includeContainers, containerSearch.containers ({ name, phoneName, label })
 *
 * The older setting includeContent.elements.skipEmptyLabels is not a field any more: the core keeps it in step with the three
 * Unnamed Items switches (see core.syncSkipEmptyLabels) and reads a file that has it ON as "all three off".
 */

const CONTENT_MAX_CONTAINERS = 100;
const CONTENT_MAX_NAME_LENGTH = 80;

class ContentTabHandler {
  constructor() {
    this.core = null;
    this.tabId = "content";
    this.container = null;

    // The settings each "Restore Defaults" button puts back
    const elements = "includeContent.elements.";
    this.sectionPaths = {
      elementTypes: [
        "includePanoramas",
        "include360Videos",
        "includeFlatVideos",
        "includeAlbums",
        "includeMaps",
        "includeAudio",
        "includePDFs",
        "includeHotspots",
        "includePolygons",
        "includeVideos",
        "includeWebframes",
        "includeImages",
        "includeText",
        "includeProjectedImages",
        "includeElements",
        "include3DModels",
        "include3DHotspots",
        "include3DModelObjects",
      ].map((key) => `${elements}${key}`),
      unnamedItems: [
        "includeContent.unlabeledWithSubtitles",
        "includeContent.unlabeledWithTags",
        "includeContent.completelyBlank",
        "includeContent.includePlainObjects",
        `${elements}skipEmptyLabels`,
        `${elements}minLabelLength`,
      ],
      containers: [`${elements}includeContainers`, "includeContent.containerSearch"],
    };
  }

  setCore(core) {
    this.core = core;
  }

  // ------------------------------------------------------------------------------------------------ start

  init(container) {
    try {
      this.container = container;

      this.core.setupFormListeners(container);
      this.setupResetButtons(container);
      this.setupBulkButtons(container);
      this.setupContainerList(container);
      this.setupContainerPicker(container);

      // Everything that depends on another field follows every change and every fill
      container.addEventListener("change", () => this.syncControls(container));
      container.addEventListener("formpopulated", () => this.syncContainerList(container));

      this.populate(container);
      this.validateForm(container);
    } catch (error) {
      console.error("❌ Error initializing the Content tab:", error);
    }
  }

  /**
   * Fill the page from the saved settings (a file from an older version is brought up to date first)
   */
  populate(container = this.container) {
    try {
      this.core.normalizeContentSettings(this.core.config);
      this.core.populateForm(container);
      this.syncContainerList(container);
    } catch (error) {
      console.error("🚨 Error filling the Content tab:", error);
    }
  }

  // ------------------------------------------------------------------------------------------------ switches that depend on others

  syncControls(container = this.container) {
    if (!container) return;
    const kinds = [...container.querySelectorAll("#contentTypeTable .toggle-input")];
    const nothing = kinds.length > 0 && kinds.every((box) => !box.checked);
    const containersOn = !!container.querySelector("#includeContainers")?.checked;
    const warning = container.querySelector("#noKindsWarning");
    // Visitors find nothing when every kind is off and no container is searched
    if (warning) warning.hidden = !(nothing && !(containersOn && this.getContainers().length > 0));

    // The list of containers only matters while containers are searched
    const group = container.querySelector("#containerListGroup");
    if (group) {
      group.classList.toggle("disabled", !containersOn);
      group.querySelectorAll("input, button").forEach((field) => {
        // the boxes of the picker lock themselves (names already in the list)
        if (!field.closest("#containerPickerList")) field.disabled = !containersOn;
      });
    }
  }

  // ------------------------------------------------------------------------------------------------ Include All / Include None

  setupBulkButtons(container) {
    const set = (checked) => {
      container.querySelectorAll("#contentTypeTable .toggle-input").forEach((box) => {
        if (box.checked === checked) return;
        box.checked = checked;
        box.dispatchEvent(new Event("change", { bubbles: true }));
      });
      this.core.showToast?.(
        "success",
        checked ? "Every Kind Included" : "No Kind Included",
        checked
          ? "Visitors can find every kind of element in the table."
          : "No kind of element in the table is in the search now."
      );
    };
    container.querySelector("#includeAllKinds")?.addEventListener("click", () => set(true));
    container.querySelector("#includeNoKinds")?.addEventListener("click", () => set(false));
  }

  // ------------------------------------------------------------------------------------------------ containers

  /**
   * The saved containers: [{ name, phoneName, label }]. A row with no name at all is not a container
   */
  getContainers() {
    const rows = this.core.config?.includeContent?.containerSearch?.containers;
    return (Array.isArray(rows) ? rows : []).filter(
      (row) => row && (String(row.name || "").trim() || String(row.phoneName || "").trim())
    );
  }

  /**
   * "Container Names": one row for each container with three boxes: its name in the tour, its name in the phone version of the
   * tour (empty = the same) and what visitors see (empty = the name). The boxes are not settings themselves (data-ui-only);
   * they write the one saved setting named by the list (data-target). The change is sent to an open tour at once.
   */
  setupContainerList(container) {
    const list = container.querySelector("#containerList");
    if (!list) return;
    const rows = list.querySelector(".name-list-rows");
    const add = container.querySelector("#containerListAdd");

    rows.addEventListener("input", () => this.commitContainerList(list));
    rows.addEventListener("click", (event) => {
      const remove = event.target.closest(".name-list-remove");
      if (!remove) return;
      remove.closest(".name-list-row").remove();
      this.commitContainerList(list);
      this.updateContainerListEmpty(list);
    });
    if (add) {
      add.addEventListener("click", () => {
        const row = this.addContainerRow(list, {});
        this.updateContainerListEmpty(list);
        this.syncControls(container);
        if (row) row.querySelector('[data-role="name"]').focus();
      });
    }
  }

  addContainerRow(list, entry) {
    const rows = list.querySelector(".name-list-rows");
    if (!rows) return null;
    const row = document.createElement("div");
    row.className = "name-list-row";
    const make = (role, value, placeholder, label) => {
      const wrap = document.createElement("div");
      wrap.className = "form-group cell-group";
      const input = document.createElement("input");
      input.type = "text";
      input.className = "form-input";
      input.dataset.uiOnly = "true";
      input.dataset.role = role;
      input.maxLength = CONTENT_MAX_NAME_LENGTH;
      input.value = value;
      input.placeholder = placeholder;
      input.setAttribute("aria-label", label);
      wrap.appendChild(input);
      return wrap;
    };
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "name-list-remove";
    remove.setAttribute("aria-label", "Remove this container");
    remove.innerHTML = '<i class="fas fa-times" aria-hidden="true"></i>';
    row.append(
      make("name", String(entry.name || ""), "Floor Plan", "Container name in the tour"),
      make(
        "phoneName",
        String(entry.phoneName || ""),
        "Same as in the tour",
        "Container name on phones"
      ),
      make("label", String(entry.label || ""), "Same as in the tour", "Name shown to visitors"),
      remove
    );
    rows.appendChild(row);
    return row;
  }

  readContainerRows(list) {
    const value = (row, role) =>
      row.querySelector(`[data-role="${role}"]`).value.trim().slice(0, CONTENT_MAX_NAME_LENGTH);
    return [...list.querySelectorAll(".name-list-row")].map((row) => ({
      name: value(row, "name"),
      phoneName: value(row, "phoneName"),
      label: value(row, "label"),
    }));
  }

  /**
   * Returns the text that explains why the rows cannot be used, or ""
   */
  containerRowsProblem(rows) {
    const used = rows.filter((row) => row.name || row.phoneName);
    if (used.length > CONTENT_MAX_CONTAINERS) {
      return `Add at most ${CONTENT_MAX_CONTAINERS} containers.`;
    }
    const texts = used.flatMap((row) => [row.name, row.phoneName, row.label]);
    if (texts.some((text) => /[<>]/.test(text) || !this.core.isContentSafe(text))) {
      return "Names cannot contain angle brackets. Remove them from the list.";
    }
    const seen = new Set();
    for (const row of used) {
      for (const name of new Set([row.name, row.phoneName].filter(Boolean))) {
        if (seen.has(name))
          return `The container name "${name}" is in the list twice. Keep one row for it.`;
        seen.add(name);
      }
    }
    return "";
  }

  /**
   * Save the rows as a list in the settings and send them to an open tour. A row with neither name is not saved
   */
  commitContainerList(list) {
    try {
      const rows = this.readContainerRows(list);
      const group = list.closest(".form-group");
      const problem = this.containerRowsProblem(rows);
      if (problem) {
        list.classList.add("error");
        if (window.showValidationMessage && group) {
          window.showValidationMessage(list, "error", problem, 30000);
        }
        return false;
      }
      list.classList.remove("error");
      if (window.clearValidationMessage && list.id) window.clearValidationMessage(list.id);
      const saved = rows.filter((row) => row.name || row.phoneName);
      this.core.safeSetNestedProperty(this.core.config, list.dataset.target, saved);
      this.core.mirrorToPluginNames(list.dataset.target, saved);
      this.syncControls();
      this.core.applyLivePreview(list.dataset.target, saved);
      return true;
    } catch (error) {
      console.error("🚨 Error saving the containers:", error);
      return false;
    }
  }

  // ---- Pick the containers from the open tour -----------------------------------------------------------------

  setupContainerPicker(container) {
    const open = container.querySelector("#containerPickerOpen");
    const add = container.querySelector("#containerPickerAdd");
    const close = container.querySelector("#containerPickerClose");
    if (open) open.addEventListener("click", () => this.openContainerPicker(container));
    if (add) add.addEventListener("click", () => this.addPickedContainers(container));
    if (close) {
      close.addEventListener("click", () => {
        const picker = container.querySelector("#containerPicker");
        if (picker) picker.hidden = true;
      });
    }
  }

  /**
   * Ask the open tour for the names of its containers and show them with a box each (the ones already in the list are ticked
   * and locked). Several containers can share a name: the search opens the first one
   */
  async openContainerPicker(container) {
    const picker = container.querySelector("#containerPicker");
    const status = container.querySelector("#containerPickerStatus");
    const list = container.querySelector("#containerPickerList");
    const open = container.querySelector("#containerPickerOpen");
    if (!picker || !status || !list || !open) return;
    picker.hidden = false;
    list.replaceChildren();
    open.disabled = true;
    status.textContent = "Looking for the open tour...";
    try {
      const report = await this.core.askOpenTour(
        "searchProInventoryRequest",
        "searchProInventoryReport",
        {},
        () => {
          status.textContent = "The tour answered. Reading it...";
        }
      );
      if (!report) {
        status.textContent =
          "No open tour answered. Open your tour in another tab of this browser, wait until it has loaded, and try again.";
      } else if (!report.ready || !Array.isArray(report.containerList)) {
        status.textContent =
          "The tour is open, but it has not finished loading. Wait a moment and try again.";
      } else if (report.containerList.length === 0) {
        status.textContent = "The open tour has no containers with a name.";
      } else {
        const listed = new Set();
        this.getContainers().forEach((row) => {
          if (row.name) listed.add(String(row.name).trim());
          if (row.phoneName) listed.add(String(row.phoneName).trim());
        });
        report.containerList.forEach((entry) => {
          const label = document.createElement("label");
          label.className = "container-picker-item";
          const box = document.createElement("input");
          box.type = "checkbox";
          box.value = entry.name;
          const already = listed.has(entry.name);
          box.checked = already;
          box.disabled = already;
          const name = document.createElement("span");
          name.className = "container-picker-name";
          name.textContent = entry.name;
          const notes = [];
          if (already) notes.push("already in the list");
          if (entry.count > 1) notes.push(`${entry.count} containers have this name`);
          if (entry.visible === false) notes.push("hidden when the tour starts");
          const note = document.createElement("span");
          note.className = "field-hint";
          note.textContent = notes.join(", ");
          label.append(box, name, note);
          list.appendChild(label);
        });
        status.textContent = `${report.containerList.length} names found in the open tour. Tick the containers visitors should be able to open.`;
      }
    } catch (error) {
      status.textContent = `The tour could not be read: ${error.message}`;
    } finally {
      open.disabled = false;
    }
  }

  /**
   * Add the ticked containers as rows of the list (the list is saved and sent to the open tour like any other change)
   */
  addPickedContainers(container) {
    const list = container.querySelector("#containerList");
    const picker = container.querySelector("#containerPicker");
    if (!list || !picker) return;
    const names = [...picker.querySelectorAll('#containerPickerList input[type="checkbox"]')]
      .filter((box) => box.checked && !box.disabled)
      .map((box) => box.value);
    if (names.length === 0) return;
    names.forEach((name) => this.addContainerRow(list, { name }));
    this.updateContainerListEmpty(list);
    this.commitContainerList(list);
    picker.hidden = true;
    this.core.showToast?.(
      "success",
      names.length === 1 ? "Container Added" : "Containers Added",
      names.length === 1
        ? "1 container was added to the list"
        : `${names.length} containers were added to the list`
    );
  }

  updateContainerListEmpty(list) {
    const hasRows = list.querySelectorAll(".name-list-row").length > 0;
    const empty = list.querySelector(".name-list-empty");
    if (empty) empty.hidden = hasRows;
    const head = list.querySelector(".name-list-head");
    if (head) head.hidden = !hasRows;
  }

  /**
   * Show the saved containers in the rows (after Load, Restore Defaults ...). Rows are only rebuilt when they differ from the
   * saved list, so a row you are still typing is not lost
   */
  syncContainerList(container = this.container) {
    const list = container && container.querySelector("#containerList");
    if (!list) return;
    const saved = this.getContainers().map((row) => ({
      name: String(row.name || "").trim(),
      phoneName: String(row.phoneName || "").trim(),
      label: String(row.label || "").trim(),
    }));
    const shown = this.readContainerRows(list).filter((row) => row.name || row.phoneName);
    if (JSON.stringify(shown) !== JSON.stringify(saved)) {
      list.querySelector(".name-list-rows").textContent = "";
      saved.forEach((entry) => this.addContainerRow(list, entry));
    }
    this.updateContainerListEmpty(list);
    this.syncControls(container);
  }

  // ------------------------------------------------------------------------------------------------ checks

  /**
   * Called by the core for every field of this tab: returns the text that explains why a value cannot be used, or ""
   */
  getFieldProblem(name, value, input) {
    try {
      if (input && input.type === "number") {
        const number = value === "" || value === null ? NaN : Number(value);
        if (!Number.isFinite(number)) return "Enter a number.";
        const min = input.min !== "" ? Number(input.min) : null;
        const max = input.max !== "" ? Number(input.max) : null;
        if (min !== null && max !== null && (number < min || number > max)) {
          return `Enter a number from ${min} to ${max}.`;
        }
        if (!Number.isInteger(number)) return "Enter a whole number.";
      }
    } catch (error) {
      console.error("🚨 Error checking a Content field:", error);
    }
    return "";
  }

  validateForm(container = document) {
    try {
      let valid = true;
      container.querySelectorAll("input[type='number'][name]").forEach((input) => {
        const problem = this.getFieldProblem(
          input.name,
          input.value === "" ? "" : Number(input.value),
          input
        );
        if (problem) {
          valid = false;
          input.classList.add("error");
          if (window.showValidationMessage && input.id) {
            window.showValidationMessage(input, "error", problem, 30000);
          }
        }
      });
      const list = container.querySelector("#containerList");
      if (list && this.containerRowsProblem(this.readContainerRows(list))) valid = false;
      return valid;
    } catch (error) {
      console.error("🚨 Error validating the Content tab:", error);
      return false;
    }
  }

  /**
   * Called when the settings are read from the page (for example before a download): make sure the typed containers are in
   */
  updateConfigFromForm(container = this.container) {
    const list = container && container.querySelector("#containerList");
    if (list) this.commitContainerList(list);
  }

  // ------------------------------------------------------------------------------------------------ Restore Defaults

  setupResetButtons(container) {
    container.querySelectorAll(".reset-section-button[data-section]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        this.core.restoreWithUndo({
          button,
          restore: () => this.restoreSection(button.dataset.section),
          repopulate: () => {
            this.populate(this.container || document.getElementById("content-panel"));
          },
        });
      });
    });
  }

  /**
   * Put every setting of one section back to its default and send the result to an open tour
   */
  restoreSection(key) {
    try {
      const paths = this.sectionPaths[key];
      if (!paths) return false;
      const defaults = this.core.getDefaultConfig();
      paths.forEach((path) => {
        const value = this.core.getNestedProperty(defaults, path);
        if (value === undefined) return;
        const copy = value && typeof value === "object" ? JSON.parse(JSON.stringify(value)) : value;
        this.core.safeSetNestedProperty(this.core.config, path, copy);
        this.core.mirrorToPluginNames(path, copy);
      });
      const container = this.container || document.getElementById("content-panel");
      if (container) {
        container.querySelectorAll(`[data-section-key="${key}"] .error`).forEach((field) => {
          field.classList.remove("error");
          delete field.dataset.blocked;
          if (field.id && window.clearValidationMessage) window.clearValidationMessage(field.id);
        });
        this.populate(container);
      }
      this.core.applyLivePreview(paths[0], this.core.getNestedProperty(this.core.config, paths[0]));
      return true;
    } catch (error) {
      console.error("🚨 Error restoring a Content section:", error);
      return false;
    }
  }

  /**
   * "Reset All" of the Control Panel
   */
  resetToDefaults() {
    Object.keys(this.sectionPaths).forEach((key) => this.restoreSection(key));
  }

  // ------------------------------------------------------------------------------------------------ summary

  getConfigSummary() {
    const content = this.core.config.includeContent || {};
    return {
      tab: "Content",
      unnamedItems: {
        withSubtitle: content.unlabeledWithSubtitles,
        withTags: content.unlabeledWithTags,
        completelyBlank: content.completelyBlank,
        includePlainObjects: content.includePlainObjects,
        shortestName: content.elements?.minLabelLength,
      },
      kinds: content.elements || {},
      containers: content.containerSearch || {},
    };
  }

  cleanup() {
    // nothing is kept running
  }
}

// Export for module use
if (typeof module !== "undefined" && module.exports) {
  module.exports = ContentTabHandler;
} else {
  window.ContentTabHandler = ContentTabHandler;
}
