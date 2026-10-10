/**
 * Search Pro Control Panel - Appearance Tab Handler
 * Version 4.5 - Last Update on 11/01/2025 - Search Pro Configuration Loading - Google Sheets / CSV / Business JSON integration, runtime synchronization, Exact matches config, Silence Console Fix
 * Handles all functionality specific to the Appearance tab: colors, corners, text, tags, highlight and focus.
 *
 * One change travels one road: the field -> core.onFormChange (saves it and sends it to an open tour). This handler
 * only adds what a plain field cannot do: hex boxes next to the color pickers, the font lists, checks that explain a
 * value that cannot be used, the note about tags, and "Restore Defaults" for every section.
 *
 * Sections of the page (data-section-key, also the data-section of each "Restore Defaults" button), in the order a
 * visitor meets them: searchField, searchResults, groupHeader, tagsHighlight. Inside a section, a .subsection groups the fields;
 * a subsection marked data-requires="showTags" only has an effect while Display > Show Tags in Results is on.
 */

class AppearanceTabHandler {
  constructor() {
    this.core = null;
    this.tabId = "appearance";
    this.container = null;
    this.tagListener = null;
    this.sectionKeys = ["searchField", "searchResults", "groupHeader", "tagsHighlight"];
    // Settings the page no longer shows but the plugin still reads (older saved files): "Restore Defaults" resets them too
    this.hiddenPaths = {
      tagsHighlight: ["appearance.tags.rename"],
      searchField: [
        "appearance.searchField.typography.focus.fontSize",
        "appearance.searchField.typography.focus.fontWeight",
        "appearance.searchField.typography.focus.letterSpacing",
      ],
    };
    // The font the plugin uses when nothing is chosen (the first entry of every font list)
    this.defaultFont = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";
  }

  /**
   * Set the core instance
   */
  setCore(core) {
    this.core = core;
  }

  /**
   * Initialize appearance tab functionality
   */
  init(container) {
    try {
      this.container = container;

      this.core.setupFormListeners(container);
      this.setupColorFields(container);
      this.setupRangeFields(container);
      this.setupBoxFields(container);
      this.setupNameList(container);
      this.setupDependents(container);
      this.setupResetButtons(container);
      this.setupTagsNote(container);

      // Controls that are not plain fields follow every fill of the form (Load, Restore Defaults ...)
      container.addEventListener("formpopulated", () => this.syncControls(container));

      this.core.populateForm(container);
      this.syncControls(container);
      this.loadTourFonts(container);
      this.validateForm(container);
    } catch (error) {
      console.error("❌ Error initializing Appearance tab:", error);
    }
  }

  // ------------------------------------------------------------------------------------------------ colors

  /**
   * A color picker and its hex box show the same color; either one saves it
   */
  setupColorFields(container) {
    container.querySelectorAll(".color-input").forEach((picker) => {
      const hex = picker.parentNode.querySelector(".color-hex-input");
      if (!hex) return;
      const fullHex = (text) => {
        const t = String(text || "").trim();
        if (/^#[0-9a-f]{6}$/i.test(t)) return t.toLowerCase();
        if (/^#[0-9a-f]{3}$/i.test(t))
          return ("#" + t[1] + t[1] + t[2] + t[2] + t[3] + t[3]).toLowerCase();
        return "";
      };

      picker.addEventListener("input", () => {
        hex.value = picker.value;
        hex.classList.remove("error");
        if (window.clearValidationMessage) window.clearValidationMessage(hex.id);
        this.core.onFormChange(picker);
      });

      hex.addEventListener("input", () => {
        const color = fullHex(hex.value);
        if (color) {
          hex.classList.remove("error");
          if (window.clearValidationMessage) window.clearValidationMessage(hex.id);
          picker.value = color;
          this.core.onFormChange(picker);
        } else {
          hex.classList.add("error");
        }
      });

      hex.addEventListener("blur", () => {
        const color = fullHex(hex.value);
        if (color) {
          hex.value = color;
        } else if (hex.value.trim() === "") {
          hex.value = picker.value;
          hex.classList.remove("error");
        } else if (window.showValidationMessage) {
          window.showValidationMessage(
            hex,
            "error",
            "Enter a color such as #1a73e8 or #fff.",
            8000
          );
        }
      });
    });
  }

  /**
   * The hex box of every color shows the color of its picker (the core fills the picker only)
   */
  syncHexBoxes(container) {
    container.querySelectorAll(".color-input").forEach((picker) => {
      const hex = picker.parentNode.querySelector(".color-hex-input");
      if (hex) {
        hex.value = picker.value;
        hex.classList.remove("error");
      }
    });
  }

  // ------------------------------------------------------------------------------------------------ sliders

  setupRangeFields(container) {
    container.querySelectorAll('input[type="range"]').forEach((input) => {
      input.addEventListener("input", () => {
        const display = input.parentNode.querySelector(".range-value");
        if (display) display.textContent = input.value;
      });
    });
  }

  // ------------------------------------------------------------------------------------------------ four sides of a box

  /**
   * "Space Inside": four number fields (top, right, bottom, left) next to each other. They are not settings themselves
   * (data-ui-only); they write the one saved setting, kept in the hidden field named by the box (data-target), as
   * "3px 10px 3px 10px". The same setting accepts the short CSS forms ("3px 10px") when it is read back.
   */
  setupBoxFields(container) {
    container.querySelectorAll(".box-values").forEach((box) => {
      const target = container.querySelector(`#${box.dataset.target}`);
      if (!target) return;
      const inputs = ["top", "right", "bottom", "left"].map((side) =>
        box.querySelector(`[data-side="${side}"]`)
      );
      inputs.forEach((input) => {
        input.addEventListener("input", () => {
          const values = inputs.map((field) => {
            const number = Number(field.value);
            return Number.isFinite(number) ? Math.min(40, Math.max(0, Math.round(number))) : 0;
          });
          target.value = values.map((value) => `${value}px`).join(" ");
          target.dispatchEvent(new Event("input", { bubbles: true }));
          target.dispatchEvent(new Event("change", { bubbles: true }));
        });
      });
    });
  }

  /**
   * Show the saved setting in the four fields: one value for all sides, "up-down left-right", "top left-right bottom"
   * or all four, as in CSS
   */
  syncBoxFields(container) {
    container.querySelectorAll(".box-values").forEach((box) => {
      const target = container.querySelector(`#${box.dataset.target}`);
      if (!target) return;
      const parts = String(target.value || "")
        .trim()
        .split(/\s+/)
        .map((part) => parseFloat(part))
        .filter((number) => Number.isFinite(number));
      if (!parts.length) return;
      const [a, b = a, c = a, d = b] = parts;
      const sides = parts.length === 1 ? [a, a, a, a] : parts.length === 2 ? [a, b, a, b] : parts.length === 3 ? [a, b, c, b] : [a, b, c, d];
      ["top", "right", "bottom", "left"].forEach((side, index) => {
        const field = box.querySelector(`[data-side="${side}"]`);
        if (field) field.value = sides[index];
      });
    });
  }

  // ------------------------------------------------------------------------------------------------ a list of names

  /**
   * "Tag Names": rows of "tag in the tour" and "shown to visitors as". The rows are not settings themselves (data-ui-only);
   * they write the one saved setting named by the list (data-target): [{ from, to }]. A row without a tag is not saved; an
   * empty second box means "hide this tag". The change is sent to an open tour at once.
   */
  setupNameList(container) {
    container.querySelectorAll(".name-list").forEach((list) => {
      const rows = list.querySelector(".name-list-rows");
      const add = container.querySelector(`#${list.id}Add`);
      if (!rows) return;

      rows.addEventListener("input", () => this.commitNameList(list));
      rows.addEventListener("click", (event) => {
        const remove = event.target.closest(".name-list-remove");
        if (!remove) return;
        remove.closest(".name-list-row").remove();
        this.commitNameList(list);
        this.updateNameListEmpty(list);
      });
      if (add) {
        add.addEventListener("click", () => {
          const row = this.addNameRow(list, "", "");
          this.updateNameListEmpty(list);
          if (row) row.querySelector('[data-role="from"]').focus();
        });
      }
    });
  }

  addNameRow(list, from, to) {
    const rows = list.querySelector(".name-list-rows");
    if (!rows) return null;
    const row = document.createElement("div");
    row.className = "name-list-row";
    const make = (role, value, placeholder, label) => {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "form-input";
      input.dataset.uiOnly = "true";
      input.dataset.role = role;
      input.maxLength = 60;
      input.value = value;
      input.placeholder = placeholder;
      input.setAttribute("aria-label", label);
      return input;
    };
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "name-list-remove";
    remove.setAttribute("aria-label", "Remove this tag name");
    remove.innerHTML = '<i class="fas fa-times" aria-hidden="true"></i>';
    row.append(
      make("from", from, "MYCOOLTAG_01", "Tag in the tour"),
      make("to", to, "Kitchen (empty hides the tag)", "Shown to visitors as"),
      remove
    );
    rows.appendChild(row);
    return row;
  }

  readNameRows(list) {
    return [...list.querySelectorAll(".name-list-row")].map((row) => ({
      from: row.querySelector('[data-role="from"]').value.trim().slice(0, 60),
      to: row.querySelector('[data-role="to"]').value.trim().slice(0, 60),
    }));
  }

  commitNameList(list) {
    const entries = this.readNameRows(list)
      .filter((entry) => entry.from)
      .slice(0, 50);
    this.core.safeSetNestedProperty(this.core.config, list.dataset.target, entries);
    this.core.applyLivePreview(list.dataset.target, entries);
  }

  updateNameListEmpty(list) {
    const hasRows = list.querySelectorAll(".name-list-row").length > 0;
    const empty = list.querySelector(".name-list-empty");
    if (empty) empty.hidden = hasRows;
    const head = list.querySelector(".name-list-head");
    if (head) head.hidden = !hasRows;
  }

  /**
   * Show the saved names in the rows (after Load, Restore Defaults ...). Rows are only rebuilt when they differ from the saved
   * list, so a row you are still typing is not lost
   */
  syncNameList(container) {
    container.querySelectorAll(".name-list").forEach((list) => {
      const saved = this.core.getNestedProperty(this.core.config, list.dataset.target);
      const entries = (Array.isArray(saved) ? saved : []).map((entry) => ({
        from: String((entry && entry.from) ?? ""),
        to: String((entry && entry.to) ?? ""),
      }));
      const shown = this.readNameRows(list).filter((entry) => entry.from);
      if (JSON.stringify(shown) !== JSON.stringify(entries)) {
        list.querySelector(".name-list-rows").textContent = "";
        entries.forEach((entry) => this.addNameRow(list, entry.from, entry.to));
      }
      this.updateNameListEmpty(list);
    });
  }

  // ------------------------------------------------------------------------------------------------ settings that depend on another

  /**
   * Custom Icon only matters when Icon is "Custom"; "Show +N for Hidden Tags" only when 2 or more tags may show
   */
  setupDependents(container) {
    const update = () => this.syncDependents(container);
    container.addEventListener("change", update);
    container.addEventListener("input", update);
  }

  syncDependents(container) {
    const style = container.querySelector('[name="appearance.noResults.iconStyle"]');
    const icon = container.querySelector('[name="appearance.noResults.icon"]');
    if (style && icon) {
      const custom = style.value === "custom";
      icon.disabled = !custom;
      icon.closest(".form-group")?.classList.toggle("disabled", !custom);
    }
    const most = container.querySelector('[name="appearance.tags.maxCount"]');
    const more = container.querySelector('[name="appearance.tags.showMore"]');
    if (most && more) {
      const useful = Number(most.value) >= 2;
      more.closest(".form-group")?.classList.toggle("inactive", !useful || !this.tagsAreOn());
    }
  }

  // ------------------------------------------------------------------------------------------------ fonts

  /**
   * Every font list always shows what is saved: the default font, a font of the tour, or a custom one typed earlier
   */
  syncFonts(container) {
    container.querySelectorAll("select[data-font-select]").forEach((select) => {
      const wanted = this.core.getNestedProperty(this.core.config, select.name);
      select.querySelectorAll("option[data-custom-font]").forEach((option) => option.remove());
      if (!wanted || wanted === "inherit" || wanted === this.defaultFont) {
        select.value = this.defaultFont;
        return;
      }
      if (![...select.options].some((option) => option.value === wanted)) {
        const option = document.createElement("option");
        option.value = wanted;
        option.textContent = `Custom: ${String(wanted).split(",")[0].replace(/['"]/g, "").trim()}`;
        option.dataset.customFont = "true";
        select.appendChild(option);
      }
      select.value = wanted;
    });
  }

  /**
   * "Fonts of This Tour": the families the tour loads in its own fonts.css (the tour folder is two levels above this
   * page). Nothing is added when the file cannot be read (for example when the page is opened from a disk)
   */
  async loadTourFonts(container) {
    try {
      const response = await fetch(new URL("../../fonts.css", window.location.href).href, {
        cache: "no-store",
      });
      if (!response.ok) return;
      const css = await response.text();
      const names = [
        ...new Set(
          [
            ...css.matchAll(/@font-face\s*\{[^}]*?font-family\s*:\s*["']?([^;"'}]+)["']?\s*;/gi),
          ].map((m) => m[1].trim())
        ),
      ].filter((name) => name && name.length < 60 && /^[\w\s.-]+$/.test(name));
      if (!names.length) return;

      container.querySelectorAll("select[data-font-select]").forEach((select) => {
        select.querySelector("optgroup[data-tour-fonts]")?.remove();
        const group = document.createElement("optgroup");
        group.label = "Fonts of This Tour";
        group.dataset.tourFonts = "true";
        names.forEach((name) => {
          const option = document.createElement("option");
          option.value = `'${name}', sans-serif`;
          option.textContent = name;
          group.appendChild(option);
        });
        select.insertBefore(group, select.options[1] || null);
      });
      this.syncFonts(container);
    } catch (error) {
      // no list of tour fonts: the other fonts still work
    }
  }

  // ------------------------------------------------------------------------------------------------ tags

  /**
   * The tag settings only show when "Show Tags in Results" (Display tab) is on: say so while it is off
   */
  setupTagsNote(container) {
    this.tagListener = (event) => {
      if (event.target && event.target.name === "display.showTagsInResults")
        this.updateTagsNote(container);
    };
    document.addEventListener("change", this.tagListener);
  }

  tagsAreOn() {
    const config = this.core.config || {};
    const shown =
      config.display && config.display.showTagsInResults !== undefined
        ? config.display.showTagsInResults
        : config.showTagsInResults;
    return shown !== false;
  }

  updateTagsNote(container = this.container) {
    if (!container) return;
    const on = this.tagsAreOn();
    const note = container.querySelector("#tagsOffNote");
    if (note) note.hidden = on;
    container.querySelectorAll('[data-requires="showTags"] .form-group').forEach((group) => {
      group.classList.toggle("inactive", !on);
    });
    this.syncDependents(container);
  }

  // ------------------------------------------------------------------------------------------------ after a fill

  syncControls(container = this.container || document) {
    try {
      this.syncHexBoxes(container);
      this.syncBoxFields(container);
      this.syncNameList(container);
      this.syncDependents(container);
      this.syncFonts(container);
      this.updateTagsNote(container);
      container.querySelectorAll('input[type="range"]').forEach((input) => {
        const display = input.parentNode.querySelector(".range-value");
        if (display) display.textContent = input.value;
      });
    } catch (error) {
      console.error("🚨 Error syncing the Appearance tab:", error);
    }
  }

  // ------------------------------------------------------------------------------------------------ validation

  /**
   * The text to show under a field whose value cannot be used, or "" when it is fine (the core calls this before a value
   * is saved: a value with a problem is not saved and not sent to the tour)
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
        return "";
      }
      if (name === "appearance.tags.padding") {
        const text = String(value || "").trim();
        if (!/^\d+(\.\d+)?(px|em|rem)?( \d+(\.\d+)?(px|em|rem)?){0,3}$/.test(text)) {
          return "Enter one to four sizes such as 3px 10px.";
        }
      }
    } catch (error) {
      console.error("🚨 Error checking an Appearance field:", error);
    }
    return "";
  }

  readField(input) {
    if (input.type === "checkbox") return input.checked;
    if (input.type === "number" || input.type === "range") {
      return input.value === "" ? "" : Number(input.value);
    }
    return input.value;
  }

  /**
   * Validate the whole tab: every field with a problem is marked and explained
   */
  validateForm(container = document) {
    try {
      let valid = true;
      container.querySelectorAll("[name]").forEach((input) => {
        if (input.type === "hidden" || input.type === "checkbox") return;
        const problem = this.getFieldProblem(input.name, this.readField(input), input);
        if (problem) {
          valid = false;
          input.classList.add("error");
          if (window.showValidationMessage && input.id) {
            window.showValidationMessage(input, "error", problem, 30000);
          }
        }
      });
      container.querySelectorAll(".color-hex-input.error").forEach(() => (valid = false));
      return valid;
    } catch (error) {
      console.error("🚨 Error validating the Appearance tab:", error);
      return false;
    }
  }

  // ------------------------------------------------------------------------------------------------ settings

  /**
   * Update config from the form (Apply Settings, Download): a field with a problem keeps its last good value
   */
  updateConfigFromForm(container = document) {
    try {
      container.querySelectorAll("[name]").forEach((input) => {
        const name = input.getAttribute("name");
        if (!name) return;

        let value;
        if (input.type === "checkbox") {
          value = input.checked;
        } else if (input.type === "number" || input.type === "range") {
          value = input.value === "" ? null : parseFloat(input.value);
        } else {
          value = input.value;
        }

        if (this.getFieldProblem(name, value === null ? "" : value, input)) return;
        if (
          input.type === "number" &&
          input.dataset.unit !== undefined &&
          typeof value === "number"
        ) {
          value = `${value}${input.dataset.unit}`;
        }

        this.core.safeSetNestedProperty(this.core.config, name, value);
        this.core.mirrorToPluginNames(name, value);
      });
    } catch (error) {
      console.error("🚨 Error updating config from the Appearance tab:", error);
    }
  }

  /**
   * Put every setting of one section back to its default (colors, corners, text, everything the section shows)
   */
  resetSection(key) {
    try {
      const container = this.container || document.getElementById("appearance-panel");
      const section = container && container.querySelector(`[data-section-key="${key}"]`);
      if (!section) return false;
      const defaults = this.core.getDefaultConfig();
      const names = [
        ...[...section.querySelectorAll("[name]")].map((field) => field.name),
        ...(this.hiddenPaths[key] || []),
      ];

      names.forEach((name) => {
        const value = this.core.getNestedProperty(defaults, name);
        if (value === undefined) return;
        const copy = value && typeof value === "object" ? JSON.parse(JSON.stringify(value)) : value;
        this.core.safeSetNestedProperty(this.core.config, name, copy);
        this.core.mirrorToPluginNames(name, copy);
      });

      section.querySelectorAll(".error").forEach((field) => {
        field.classList.remove("error");
        delete field.dataset.blocked;
        if (field.id && window.clearValidationMessage) window.clearValidationMessage(field.id);
      });
      this.core.populateForm(container);

      // Send the restored settings to an open tour
      if (names.length) {
        this.core.applyLivePreview(
          names[0],
          this.core.getNestedProperty(this.core.config, names[0])
        );
      }
      return true;
    } catch (error) {
      console.error("🚨 Error restoring an Appearance section:", error);
      return false;
    }
  }

  /**
   * Reset Appearance tab to defaults
   */
  resetToDefaults() {
    this.sectionKeys.forEach((key) => this.resetSection(key));
  }

  /**
   * The "Restore Defaults" button of every section
   */
  setupResetButtons(container) {
    container.querySelectorAll(".reset-section-button[data-section]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        const heading = button.closest(".config-section")?.querySelector(".section-title");
        const title = heading ? heading.textContent.replace(/\s+/g, " ").trim() : "This section";
        if (
          this.resetSection(button.dataset.section) &&
          typeof this.core.showToast === "function"
        ) {
          this.core.showToast(
            "success",
            `${title} Restored`,
            `${title} is back to its default settings`
          );
        }
      });
    });
  }

  /**
   * Get Appearance tab configuration summary
   */
  getConfigSummary() {
    try {
      const appearance = this.core.config.appearance || {};
      return {
        tab: "Appearance",
        colors: appearance.colors,
        searchField: appearance.searchField,
        searchResults: appearance.searchResults,
        tags: appearance.tags,
      };
    } catch (error) {
      console.error("🚨 Error getting Appearance config summary:", error);
      return null;
    }
  }

  /**
   * Cleanup resources when tab is unloaded
   */
  cleanup() {
    if (this.tagListener) {
      document.removeEventListener("change", this.tagListener);
      this.tagListener = null;
    }
  }
}

// Export for module use
if (typeof module !== "undefined" && module.exports) {
  module.exports = AppearanceTabHandler;
} else {
  window.AppearanceTabHandler = AppearanceTabHandler;
}
