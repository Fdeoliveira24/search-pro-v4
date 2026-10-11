/**
 * Search Pro Control Panel - Content Tab Handler
 * Version 4.5 - Last Update on 10/10/2026
 * Handles everything specific to the Content tab: which kinds of elements are in the search, which elements without a title are
 * included, and the containers visitors can open from the search.
 *
 * One change travels one road: the field -> core.onFormChange (it saves the value and sends it to an open tour). This handler
 * only adds what a plain field cannot do: Include All / Include None, the list of container names (one per line, saved as a
 * list), the warning when nothing is searched, checks that explain a value that cannot be used, and "Restore Defaults".
 *
 * Sections of the page (data-section-key, also the data-section of each "Restore Defaults" button):
 *   elementTypes  What Is Searched  includeContent.elements.include* (one switch per kind of element)
 *   unnamedItems  Unnamed Items     includeContent.unlabeledWithSubtitles / unlabeledWithTags / completelyBlank, minLabelLength
 *   containers    Containers        includeContent.elements.includeContainers, containerSearch.containerNames, texts.containerHint
 *
 * The older setting includeContent.elements.skipEmptyLabels is not a field any more: the core keeps it in step with the three
 * Unnamed Items switches (see core.syncSkipEmptyLabels) and reads a file that has it ON as "all three off".
 */

const CONTENT_MAX_CONTAINER_NAMES = 50;
const CONTENT_MAX_NAME_LENGTH = 80;

class ContentTabHandler {
  constructor() {
    this.core = null;
    this.tabId = "content";
    this.container = null;
    this.namesTimer = null;

    // The settings each "Restore Defaults" button puts back
    const elements = "includeContent.elements.";
    this.sectionPaths = {
      elementTypes: [
        "includePanoramas",
        "include360Videos",
        "includeFlatVideos",
        "includeAlbums",
        "includeMaps",
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
        `${elements}skipEmptyLabels`,
        `${elements}minLabelLength`,
      ],
      containers: [
        `${elements}includeContainers`,
        "includeContent.containerSearch",
        "texts.containerHint",
      ],
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
      this.setupContainerNames(container);

      // Everything that depends on another field follows every change and every fill
      container.addEventListener("change", () => this.syncControls(container));
      container.addEventListener("formpopulated", () => this.fillContainerNames(container));

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
      this.fillContainerNames(container);
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
    const names = this.getContainerNames();
    const warning = container.querySelector("#noKindsWarning");
    // Visitors find nothing when every kind is off and no container is searched
    if (warning) warning.hidden = !(nothing && !(containersOn && names.length > 0));

    // The names and the line under a container only matter while containers are searched
    ["containerNamesList", "containerHint"].forEach((id) => {
      const field = container.querySelector(`#${id}`);
      if (!field) return;
      field.disabled = !containersOn;
      field.closest(".form-group")?.classList.toggle("disabled", !containersOn);
    });
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

  // ------------------------------------------------------------------------------------------------ container names

  getContainerNames() {
    const names = this.core.config?.includeContent?.containerSearch?.containerNames;
    return Array.isArray(names) ? names.filter((n) => typeof n === "string" && n.trim()) : [];
  }

  /**
   * One name per line: trimmed, empty lines and repeated names dropped
   */
  parseContainerNames(text) {
    const seen = new Set();
    const names = [];
    String(text || "")
      .split(/\r?\n/)
      .forEach((line) => {
        const name = line.trim();
        if (name && !seen.has(name)) {
          seen.add(name);
          names.push(name);
        }
      });
    return names;
  }

  /**
   * Returns the text that explains why the names cannot be used, or ""
   */
  containerNamesProblem(names) {
    if (names.length > CONTENT_MAX_CONTAINER_NAMES) {
      return `Enter at most ${CONTENT_MAX_CONTAINER_NAMES} names, one per line.`;
    }
    if (names.some((name) => name.length > CONTENT_MAX_NAME_LENGTH)) {
      return `A name can have at most ${CONTENT_MAX_NAME_LENGTH} characters. Shorten the long line.`;
    }
    if (names.some((name) => /[<>]/.test(name) || !this.core.isContentSafe(name))) {
      return "Names cannot contain angle brackets. Remove them from the list.";
    }
    return "";
  }

  fillContainerNames(container = this.container) {
    const box = container && container.querySelector("#containerNamesList");
    if (!box) return;
    box.value = this.getContainerNames().join("\n");
    this.showNamesCount(container);
    this.syncControls(container);
  }

  showNamesCount(container = this.container) {
    const count = container && container.querySelector("#containerNamesCount");
    if (!count) return;
    const n = this.getContainerNames().length;
    count.textContent = n === 0 ? "No names yet." : n === 1 ? "1 name." : `${n} names.`;
  }

  setupContainerNames(container) {
    const box = container.querySelector("#containerNamesList");
    if (!box) return;
    box.addEventListener("input", () => {
      clearTimeout(this.namesTimer);
      this.namesTimer = setTimeout(() => this.saveContainerNames(box), 500);
    });
    box.addEventListener("change", () => {
      clearTimeout(this.namesTimer);
      this.saveContainerNames(box);
    });
  }

  /**
   * Save the names as a list in the settings and send them to an open tour
   */
  saveContainerNames(box) {
    try {
      const names = this.parseContainerNames(box.value);
      const problem = this.containerNamesProblem(names);
      if (problem) {
        box.classList.add("error");
        if (window.showValidationMessage)
          window.showValidationMessage(box, "error", problem, 30000);
        return false;
      }
      box.classList.remove("error");
      if (window.clearValidationMessage) window.clearValidationMessage(box.id);
      this.core.safeSetNestedProperty(
        this.core.config,
        "includeContent.containerSearch.containerNames",
        names
      );
      this.showNamesCount();
      this.syncControls();
      this.core.applyLivePreview("includeContent.containerSearch.containerNames", names);
      return true;
    } catch (error) {
      console.error("🚨 Error saving the container names:", error);
      return false;
    }
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
      const box = container.querySelector("#containerNamesList");
      if (box && this.containerNamesProblem(this.parseContainerNames(box.value))) valid = false;
      return valid;
    } catch (error) {
      console.error("🚨 Error validating the Content tab:", error);
      return false;
    }
  }

  /**
   * Called when the settings are read from the page (for example before a download): make sure the typed names are in
   */
  updateConfigFromForm(container = this.container) {
    const box = container && container.querySelector("#containerNamesList");
    if (box) this.saveContainerNames(box);
  }

  // ------------------------------------------------------------------------------------------------ Restore Defaults

  setupResetButtons(container) {
    container.querySelectorAll(".reset-section-button[data-section]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        const heading = button.closest(".config-section")?.querySelector(".section-title");
        const title = heading ? heading.textContent.replace(/\s+/g, " ").trim() : "This section";
        if (this.restoreSection(button.dataset.section)) {
          this.core.showToast?.(
            "success",
            `${title} Restored`,
            `${title} is back to its default settings`
          );
        }
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
        shortestName: content.elements?.minLabelLength,
      },
      kinds: content.elements || {},
      containers: content.containerSearch || {},
    };
  }

  cleanup() {
    clearTimeout(this.namesTimer);
  }
}

// Export for module use
if (typeof module !== "undefined" && module.exports) {
  module.exports = ContentTabHandler;
} else {
  window.ContentTabHandler = ContentTabHandler;
}
