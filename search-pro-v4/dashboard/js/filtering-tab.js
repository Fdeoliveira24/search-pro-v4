/**
 * Search Pro Control Panel - Filtering Tab Handler
 * Version 4.5 - Last Update on 10/10/2026
 * Handles everything specific to the Filtering tab: which results are left out of the search by their name, their tags or their
 * number in the tour's list.
 *
 * The three modes (Off / Show Only These / Hide These) and the way names are compared are plain fields: the field ->
 * core.onFormChange (it saves the value and sends it to an open tour). The lists are not fields (data-ui-only, no name): this
 * handler turns the lines of each box into a LIST, checks it, saves it and sends it to the open tour at once. (Fields with a
 * name would send the box's text, which a tour does not understand as a list.)
 *
 * Sections of the page (data-section-key, also the data-section of each "Restore Defaults" button):
 *   names    Names                  filter.mode, filter.allowedValues / blacklistedValues, filter.valueMatchMode
 *   tags     Tags                   filter.tagFiltering
 *   numbers  Panoramas by Number    filter.mediaIndexes (the settings keep numbers counted from 0, the page counts from 1)
 *
 * Element Type Filtering and Element Label Filtering are not on the page any more (Content > What Is Searched and Names do the
 * same): core.normalizeFilterSettings translates them when a file is read. The plugin still understands both.
 */

const FILTER_MAX_ITEMS = 200;
const FILTER_MAX_LENGTH = 120;

class FilteringTabHandler {
  constructor() {
    this.core = null;
    this.tabId = "filtering";
    this.container = null;
    this.timers = {};

    // The settings each "Restore Defaults" button puts back
    this.sectionPaths = {
      names: [
        "filter.mode",
        "filter.allowedValues",
        "filter.blacklistedValues",
        "filter.valueMatchMode",
        "filter.elementLabels",
      ],
      tags: ["filter.tagFiltering"],
      numbers: ["filter.mediaIndexes"],
    };

    // What each section is made of: its mode field, the box for each mode, its notice and its words
    this.sections = {
      names: {
        title: "Names",
        modeId: "filterMode",
        boxes: { whitelist: "allowedValues", blacklist: "blacklistedValues" },
        compare: { whitelist: "whitelistMatchMode", blacklist: "blacklistMatchMode" },
        notice: "namesNotice",
        noun: "name",
      },
      tags: {
        title: "Tags",
        modeId: "tagFilteringMode",
        boxes: { whitelist: "allowedTags", blacklist: "blacklistedTags" },
        notice: "tagsNotice",
        noun: "tag",
      },
      numbers: {
        title: "Panoramas by Number",
        modeId: "mediaIndexMode",
        boxes: { whitelist: "allowedMediaIndexes", blacklist: "blacklistedMediaIndexes" },
        notice: "numbersNotice",
        noun: "number",
      },
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
      this.setupLists(container);
      this.setupResetButtons(container);

      // Everything that depends on another field follows every change and every fill
      container.addEventListener("change", (event) => {
        if (event.target.matches("select")) this.onSelectChanged(event.target);
      });
      container.addEventListener("formpopulated", () => {
        this.fillLists(container);
        this.sync(container);
      });

      this.populate(container);
    } catch (error) {
      console.error("❌ Error initializing the Filtering tab:", error);
    }
  }

  /**
   * Fill the page from the saved settings (a file from an older version is brought up to date first)
   */
  populate(container = this.container) {
    try {
      this.core.normalizeFilterSettings(this.core.config);
      this.core.populateForm(container);
      this.fillLists(container);
      this.sync(container);
    } catch (error) {
      console.error("🚨 Error filling the Filtering tab:", error);
    }
  }

  // ------------------------------------------------------------------------------------------------ the lists

  listBoxes(container = this.container) {
    return container ? [...container.querySelectorAll("textarea[data-target]")] : [];
  }

  /**
   * Show the saved lists in the boxes, one value per line (numbers are counted from 1 on the page)
   */
  fillLists(container = this.container) {
    this.listBoxes(container).forEach((box) => {
      const saved = this.core.getNestedProperty(this.core.config, box.dataset.target);
      const items = Array.isArray(saved) ? saved : [];
      const shown =
        box.dataset.kind === "numbers"
          ? items.map((item) => String(Number(item) + 1))
          : items.map((item) => String(item));
      box.value = shown.join("\n");
    });
  }

  setupLists(container) {
    this.listBoxes(container).forEach((box) => {
      box.addEventListener("input", () => {
        clearTimeout(this.timers[box.id]);
        this.sync(container);
        this.timers[box.id] = setTimeout(() => this.commit(box), 500);
      });
      box.addEventListener("change", () => {
        clearTimeout(this.timers[box.id]);
        this.commit(box);
      });
    });
  }

  /**
   * The values of a box: one per line (tags and numbers may also be separated by commas), trimmed, empty and repeated ones dropped
   */
  parse(box) {
    const separators = box.dataset.kind === "values" ? /\r?\n/ : /[\r\n,;]+/;
    const seen = new Set();
    const items = [];
    String(box.value || "")
      .split(box.dataset.kind === "numbers" ? /[\s,;]+/ : separators)
      .forEach((raw) => {
        const item = raw.trim();
        const key = item.toLowerCase();
        if (item && !seen.has(key)) {
          seen.add(key);
          items.push(item);
        }
      });
    return items;
  }

  /**
   * Returns the text that explains why a box cannot be used, or ""
   */
  problem(box, items) {
    const kind = box.dataset.kind;
    const noun = kind === "values" ? "name" : kind === "tags" ? "tag" : "number";
    if (items.length > FILTER_MAX_ITEMS) {
      return `Add at most ${FILTER_MAX_ITEMS} ${noun}s.`;
    }
    if (items.some((item) => item.length > FILTER_MAX_LENGTH)) {
      return `A ${noun} can have at most ${FILTER_MAX_LENGTH} characters. Shorten the long line.`;
    }
    if (items.some((item) => !this.core.isContentSafe(item))) {
      return "This text is not allowed. Remove it from the list.";
    }
    if (kind === "numbers" && items.some((item) => !/^\d+$/.test(item) || Number(item) < 1)) {
      return "Enter whole numbers from 1, one per line.";
    }
    if (kind === "values" && this.compareMode(box) === "regex") {
      for (const item of items) {
        try {
          new RegExp(item, "i");
        } catch (error) {
          const shown = item.length > 40 ? `${item.slice(0, 40)}...` : item;
          return `"${shown}" is not a valid pattern. Check its brackets and parentheses.`;
        }
      }
    }
    return "";
  }

  /**
   * How names are compared for the mode this box belongs to ("" for boxes that are not names)
   */
  compareMode(box) {
    const names = this.sections.names;
    const mode = Object.keys(names.boxes).find((key) => names.boxes[key] === box.id);
    const select =
      mode && this.container && this.container.querySelector(`#${names.compare[mode]}`);
    return select ? select.value : "";
  }

  /**
   * Save the box as a list in the settings and send it to an open tour. A list that cannot be used is explained and not saved
   */
  commit(box, live = true) {
    try {
      const items = this.parse(box);
      const problem = this.problem(box, items);
      if (problem) {
        box.classList.add("error");
        if (window.showValidationMessage)
          window.showValidationMessage(box, "error", problem, 30000);
        return false;
      }
      box.classList.remove("error");
      if (window.clearValidationMessage) window.clearValidationMessage(box.id);
      const stored =
        box.dataset.kind === "numbers"
          ? [...new Set(items.map((item) => String(Number(item) - 1)))]
          : items;
      this.core.safeSetNestedProperty(this.core.config, box.dataset.target, stored);
      this.sync();
      if (live) this.core.applyLivePreview(box.dataset.target, stored);
      return true;
    } catch (error) {
      console.error("🚨 Error saving a Filtering list:", error);
      return false;
    }
  }

  // ------------------------------------------------------------------------------------------------ what depends on what

  onSelectChanged(select) {
    this.sync();
    // a name list is checked again when the way names are compared changes (a pattern must be valid)
    const names = this.sections.names;
    Object.keys(names.compare).forEach((mode) => {
      if (names.compare[mode] === select.id) {
        const box = this.container.querySelector(`#${names.boxes[mode]}`);
        if (box) this.commit(box);
      }
    });
  }

  modeOf(section, container = this.container) {
    const select = container && container.querySelector(`#${section.modeId}`);
    return select ? select.value : "none";
  }

  /**
   * Show only what belongs to the chosen mode, count the values, explain a list that is empty and say which filters are on
   */
  sync(container = this.container) {
    if (!container) return;

    container.querySelectorAll("[data-shown-when]").forEach((element) => {
      const [id, value] = element.dataset.shownWhen.split("=");
      const select = container.querySelector(`#${id}`);
      element.hidden = !select || select.value !== value;
    });

    this.listBoxes(container).forEach((box) => {
      const count = container.querySelector(`#${box.id}-count`);
      if (!count) return;
      const n = this.parse(box).length;
      const noun =
        box.dataset.kind === "values" ? "value" : box.dataset.kind === "tags" ? "tag" : "number";
      count.textContent = n === 0 ? `No ${noun}s yet.` : n === 1 ? `1 ${noun}.` : `${n} ${noun}s.`;
    });

    const filter = (this.core.config && this.core.config.filter) || {};
    const labels = filter.elementLabels || {};
    const olderLabelsOn =
      (labels.mode === "whitelist" && (labels.allowedValues || []).length > 0) ||
      (labels.mode === "blacklist" && (labels.blacklistedValues || []).length > 0);

    Object.entries(this.sections).forEach(([key, section]) => {
      const mode = this.modeOf(section, container);
      const messages = [];
      if (mode !== "none") {
        const box = container.querySelector(`#${section.boxes[mode]}`);
        if (box && this.parse(box).length === 0) {
          messages.push(
            `The list is empty, so this filter does nothing yet. Add at least one ${section.noun}.`
          );
        }
      }
      if (key === "names" && olderLabelsOn) {
        messages.push(
          "This file also has a Label Text filter from an older version. It is still applied; Restore Defaults of this section removes it."
        );
      }
      const notice = container.querySelector(`#${section.notice}`);
      if (notice) {
        notice.hidden = messages.length === 0;
        const text = notice.querySelector("span");
        if (text) text.textContent = messages.join(" ");
      }
    });

    this.showSummary(container, filter, olderLabelsOn);
  }

  /**
   * "Filters on: Names (hide), Tags (show only)": what is saved and does something
   */
  showSummary(container, filter, olderLabelsOn) {
    const target = container.querySelector("#filterSummaryText");
    if (!target) return;
    const words = { whitelist: "show only", blacklist: "hide" };
    const on = [];
    const check = (title, mode, allowed, blacklisted) => {
      const list = mode === "whitelist" ? allowed : mode === "blacklist" ? blacklisted : [];
      if (words[mode] && Array.isArray(list) && list.length > 0)
        on.push(`${title} (${words[mode]})`);
    };
    check("Names", filter.mode, filter.allowedValues, filter.blacklistedValues);
    const tags = filter.tagFiltering || {};
    check("Tags", tags.mode, tags.allowedTags, tags.blacklistedTags);
    const numbers = filter.mediaIndexes || {};
    check("Panorama numbers", numbers.mode, numbers.allowed, numbers.blacklisted);
    if (olderLabelsOn) on.push("Label text (older)");
    target.textContent =
      "A result must pass every filter that is on, and every kind switched on in Content. " +
      (on.length > 0
        ? `Filters on: ${on.join(", ")}.`
        : "No filter is on, so nothing is left out here.");
  }

  // ------------------------------------------------------------------------------------------------ checks

  validateForm(container = this.container) {
    try {
      let valid = true;
      this.listBoxes(container).forEach((box) => {
        if (this.problem(box, this.parse(box))) valid = false;
      });
      return valid;
    } catch (error) {
      console.error("🚨 Error validating the Filtering tab:", error);
      return false;
    }
  }

  /**
   * Called when the settings are read from the page (for example before a download): make sure the typed lists are in
   */
  updateConfigFromForm(container = this.container) {
    this.listBoxes(container).forEach((box) => this.commit(box, false));
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
            this.populate(this.container || document.getElementById("filtering-panel"));
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
      });
      const container = this.container || document.getElementById("filtering-panel");
      if (container) {
        container.querySelectorAll(`[data-section-key="${key}"] .error`).forEach((field) => {
          field.classList.remove("error");
          if (field.id && window.clearValidationMessage) window.clearValidationMessage(field.id);
        });
        this.populate(container);
      }
      this.core.applyLivePreview(paths[0], this.core.getNestedProperty(this.core.config, paths[0]));
      return true;
    } catch (error) {
      console.error("🚨 Error restoring a Filtering section:", error);
      return false;
    }
  }

  /**
   * "Reset All" of the Control Panel
   */
  resetToDefaults() {
    Object.keys(this.sectionPaths).forEach((key) => this.restoreSection(key));
    if (this.core && this.core.config && this.core.config.filter) {
      this.core.config.filter.elementTypes = {
        mode: "none",
        allowedTypes: [],
        blacklistedTypes: [],
      };
    }
  }

  // ------------------------------------------------------------------------------------------------ summary

  getConfigSummary() {
    return { tab: "Filtering", filter: (this.core.config && this.core.config.filter) || {} };
  }

  cleanup() {
    Object.values(this.timers).forEach((timer) => clearTimeout(timer));
  }
}

// Export for use in the control panel system
if (typeof module !== "undefined" && module.exports) {
  module.exports = FilteringTabHandler;
} else if (typeof window !== "undefined") {
  window.FilteringTabHandler = FilteringTabHandler;
}
