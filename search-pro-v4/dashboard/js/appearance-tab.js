/**
 * Search Pro Control Panel - Appearance Tab Handler
 * Version 4.5 - Last Update on 11/01/2025 - Search Pro Configuration Loading - Google Sheets / CSV / Business JSON integration, runtime synchronization, Exact matches config, Silence Console Fix
 * Handles all functionality specific to the Appearance tab: colors, corners, text, tags, highlight and focus.
 *
 * One change travels one road: the field -> core.onFormChange (saves it and sends it to an open tour). This handler
 * only adds what a plain field cannot do: hex boxes next to the color pickers, the font lists, checks that explain a
 * value that cannot be used, the note about tags, and "Restore Defaults" for every section.
 *
 * Sections of the page (data-section-key, also the data-section of each "Restore Defaults" button):
 *   searchField, searchResults, highlight, tags, typography, placeholder, groupHeader, focus
 */

class AppearanceTabHandler {
  constructor() {
    this.core = null;
    this.tabId = "appearance";
    this.container = null;
    this.tagListener = null;
    this.sectionKeys = [
      "searchField",
      "searchResults",
      "highlight",
      "tags",
      "typography",
      "placeholder",
      "groupHeader",
      "focus",
    ];
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

  updateTagsNote(container = this.container) {
    if (!container) return;
    const config = this.core.config || {};
    const shown =
      config.display && config.display.showTagsInResults !== undefined
        ? config.display.showTagsInResults
        : config.showTagsInResults;
    const on = shown !== false;
    const note = container.querySelector("#tagsOffNote");
    if (note) note.hidden = on;
    container.querySelectorAll('[data-section-key="tags"] .form-group').forEach((group) => {
      group.classList.toggle("inactive", !on);
    });
  }

  // ------------------------------------------------------------------------------------------------ after a fill

  syncControls(container = this.container || document) {
    try {
      this.syncHexBoxes(container);
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
      const names = [...section.querySelectorAll("[name]")].map((field) => field.name);

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
    container.querySelectorAll(".reset-section-button").forEach((button) => {
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
