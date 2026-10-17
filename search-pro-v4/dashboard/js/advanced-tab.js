/**
 * Search Pro Control Panel - Advanced Tab Handler
 * Version 4.6 - Last Update on 10/12/2026 - Advanced rebuilt to DESIGN.md: one shared way to check, restore and collect the fields
 * (the fields themselves are saved and sent to an open tour by core.onFormChange, like on every other tab)
 *
 * Sections of the page (data-section-key, also the data-section of each "Restore Defaults" button):
 *   scan          What the Search Sees in Your Tour   read-only: asks the open tour what it holds (no setting, no Restore Defaults)
 *   searchTuning  Search Tuning                       when searching starts, how many results, how closely they must match, priorities
 *   connection    Control Panel Connection            controlPanel.allowedOrigins
 */

class AdvancedTabHandler {
  constructor() {
    this.core = null;
    this.tabId = "advanced";
    this.container = null;

    // The settings each "Restore Defaults" button puts back
    this.sectionPaths = {
      searchTuning: [
        "minSearchChars",
        "searchSettings.typingDelay",
        "searchSettings.resultLimit",
        "searchSettings.highlightMatches",
        "searchSettings.behavior.threshold",
        "searchSettings.behavior.minMatchCharLength",
        "searchSettings.behavior.useExtendedSearch",
        "searchSettings.caseSensitive",
        "searchSettings.fieldWeights",
      ],
      connection: ["controlPanel.allowedOrigins"],
    };
  }

  setCore(core) {
    this.core = core;
  }

  init(container) {
    try {
      this.container = container;
      this.core.setupFormListeners(container);
      this.core.setupRangeFields(container);
      this.setupResetButtons(container);
      this.setupScan(container);
      this.core.populateForm(container);
      this.validateForm(container);
    } catch (error) {
      console.error("❌ Error initializing the Advanced tab:", error);
    }
  }

  // ------------------------------------------------------------------------------------------------ checks

  /**
   * A value that cannot be used is explained under its field and is neither saved nor sent to the tour until it is corrected
   * (core.onFormChange asks): a number must lie between the min and max of its field, the Control Panel addresses must be full
   * web addresses
   */
  getFieldProblem(name, value, input) {
    try {
      if (name === "controlPanel.allowedOrigins") {
        const entries = String(value ?? "")
          .split(/[\s,]+/)
          .filter(Boolean);
        return entries.every((entry) => /^https?:\/\/[^\s/?#]+\/?$/i.test(entry))
          ? ""
          : "Enter full web addresses such as https://panel.example.com, separated by commas.";
      }
      if (input && input.type === "number") {
        const number = value === "" || value === null ? NaN : Number(value);
        if (!Number.isFinite(number)) return "Enter a number.";
        const min = input.min !== "" ? Number(input.min) : null;
        const max = input.max !== "" ? Number(input.max) : null;
        if (min !== null && max !== null && (number < min || number > max)) {
          return `Enter a number from ${min} to ${max}.`;
        }
      }
    } catch (error) {
      console.error("🚨 Error checking an Advanced field:", error);
    }
    return "";
  }

  /**
   * Check every field of the page; a field with a problem is marked and explained
   */
  validateForm(container = document) {
    try {
      let valid = true;
      container.querySelectorAll("input[name], select[name]").forEach((input) => {
        if (input.type === "checkbox" || input.type === "range") return;
        const value =
          input.type === "number" && input.value !== "" ? Number(input.value) : input.value;
        const problem = this.core.getFieldProblem(input, input.name, value);
        if (problem) {
          valid = false;
          input.classList.add("error");
          input.dataset.blocked = "1";
          if (window.showValidationMessage && input.id) {
            window.showValidationMessage(input, "error", problem, 30000);
          }
        }
      });
      return valid;
    } catch (error) {
      console.error("🚨 Error validating the Advanced tab:", error);
      return false;
    }
  }

  getValidationStatus() {
    const container = this.container || document.getElementById("advanced-panel");
    return container ? this.validateForm(container) : true;
  }

  // ---- What the Search Sees in Your Tour ----------------------------------------------------------------------

  setupScan(container) {
    const button = container.querySelector("#scanButton");
    if (button) button.addEventListener("click", () => this.runScan(container));
  }

  /**
   * Ask the tour that is open in this browser what it holds and what the search reads of it, and show the answer
   */
  async runScan(container) {
    const button = container.querySelector("#scanButton");
    const status = container.querySelector("#scanStatus");
    const wrap = container.querySelector("#scanResult");
    if (!button || !status || !wrap) return;
    button.disabled = true;
    status.textContent = "Scanning...";
    try {
      const report = await this.askTour(() => {
        status.textContent = "The tour answered. Reading it...";
      });
      if (!report) {
        wrap.hidden = true;
        status.textContent =
          "No open tour answered. Open your tour in another tab of this browser, wait until it has loaded, and scan again.";
      } else if (!report.ready) {
        wrap.hidden = true;
        status.textContent =
          "The tour is open, but it has not finished loading. Wait a moment and scan again.";
      } else {
        this.renderScan(container, report);
        status.textContent = `The search of the open tour holds ${report.indexCount} results.`;
      }
    } catch (error) {
      status.textContent = `The scan could not be completed: ${error.message}`;
    } finally {
      button.disabled = false;
    }
  }

  /**
   * Ask the tour that is open in this browser what it holds (see core.askOpenTour); null when none answers
   */
  askTour(onAck) {
    return this.core.askOpenTour(
      "searchProInventoryRequest",
      "searchProInventoryReport",
      {},
      onAck
    );
  }

  /**
   * One row for each kind: how many the tour holds, how many have a name, how many are in the search, and what that means
   */
  renderScan(container, report) {
    const body = container.querySelector("#scanTable tbody");
    const wrap = container.querySelector("#scanResult");
    if (!body || !wrap) return;
    const groups = [
      [
        "Read by the search when switched on",
        [
          "panoramas",
          "video360",
          "flatvideo",
          "albums",
          "maps",
          "models",
          "overlays",
          "objects3d",
          "audio",
          "pdfs",
        ],
      ],
      [
        "Other things your tour holds",
        ["containers", "photos", "maphotspots", "texts", "buttons", "menu", "windows"],
      ],
    ];
    const meaning = (kind) => {
      const note = kind.note ? ` ${kind.note}` : "";
      if (kind.status === "searched") {
        // everything of this kind is left out for a reason named in the note (no playlist, a window without a size)
        return kind.inSearch === 0 && kind.note ? kind.note : `In the search.${note}`;
      }
      if (kind.status === "off") {
        return kind.id === "containers"
          ? "Switched off in Content > Containers."
          : "Switched off in Content > What Is Searched.";
      }
      if (kind.status === "fewer") return note.trim();
      if (kind.status === "typed") {
        return "Only the containers typed in Content > Containers are searched.";
      }
      if (kind.status === "later") return "Not searchable yet.";
      return "None in this tour.";
    };
    const cell = (tag, text, className) => {
      const element = document.createElement(tag);
      element.textContent = text;
      if (className) element.className = className;
      return element;
    };
    body.replaceChildren();
    groups.forEach(([title, ids]) => {
      const heading = document.createElement("tr");
      const th = cell("th", title, "scan-group");
      th.colSpan = 5;
      th.scope = "colgroup";
      heading.appendChild(th);
      body.appendChild(heading);
      ids.forEach((id) => {
        const kind = report.kinds.find((entry) => entry.id === id);
        if (!kind) return;
        const row = document.createElement("tr");
        if (kind.status === "none") row.classList.add("is-off");
        const name = cell("th", kind.title, "type-name");
        name.scope = "row";
        row.append(
          name,
          cell("td", String(kind.found), "scan-num"),
          cell("td", String(kind.named), "scan-num"),
          cell("td", String(kind.inSearch), "scan-num"),
          cell("td", meaning(kind), "type-sentence")
        );
        body.appendChild(row);
      });
    });
    wrap.hidden = false;
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
            this.core.populateForm(this.container || document.getElementById("advanced-panel"));
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
      const container = this.container || document.getElementById("advanced-panel");
      container.querySelectorAll(`[data-section-key="${key}"] .error`).forEach((field) => {
        field.classList.remove("error");
        delete field.dataset.blocked;
        if (field.id && window.clearValidationMessage) window.clearValidationMessage(field.id);
      });
      this.core.populateForm(container);
      this.core.applyLivePreview(paths[0], this.core.getNestedProperty(this.core.config, paths[0]));
      return true;
    } catch (error) {
      console.error("🚨 Error restoring an Advanced section:", error);
      return false;
    }
  }

  /**
   * "Reset" of the Control Panel
   */
  resetToDefaults() {
    Object.keys(this.sectionPaths).forEach((key) => this.restoreSection(key));
  }

  // ------------------------------------------------------------------------------------------------ Apply, summary, cleanup

  /**
   * The fields are collected by the Control Panel itself (control-panel-v4.js: a field with a refused value keeps its last good
   * value). What is left is the older name of Start Searching After, which the plugin also reads.
   */
  updateConfigFromForm() {
    this.core.mirrorToPluginNames("minSearchChars", this.core.config.minSearchChars);
  }

  getConfigSummary() {
    return {
      tab: "Advanced",
      sections: {
        searchSettings: this.core.config.searchSettings,
        minSearchChars: this.core.config.minSearchChars,
        controlPanel: this.core.config.controlPanel,
      },
    };
  }

  cleanup() {}
}

// Export for module use
if (typeof module !== "undefined" && module.exports) {
  module.exports = AdvancedTabHandler;
} else {
  window.AdvancedTabHandler = AdvancedTabHandler;
}
