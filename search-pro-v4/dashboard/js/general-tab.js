/**
 * Search Pro Control Panel - General Tab Handler
 * Version 4.5 - Last Update on 11/01/2025 - Search Pro Configuration Loading - Google Sheets / CSV / Business JSON integration, runtime synchronization, Exact matches config, Silence Console Fix
 * Handles all functionality specific to the General settings tab
 * with improved integration for the 3DVista search plugin
 *
 * Sections of the page (data-section of each "Restore Defaults" button):
 *   opening    Opening and Closing   autoHide, closeOnOutsideClick, openOnStart, keyboard
 *   searchBar  Search Bar            searchBar.width, searchBar.zIndex, searchBar.placement
 *   phones     Phones                phoneDetection, mobileBreakpoint, searchBar.mobileOverrides, searchBar.mobilePlacement
 *   texts      Visitor Texts         searchBar.placeholder, texts
 * (How searching works - characters before a search, typing delay, result limit, tolerance, priorities - moved to the
 * Advanced tab as "Search Tuning" on 2026-10-10.)
 */

class GeneralTabHandler {
  constructor() {
    this.core = null;
    this.tabId = "general";
    this.formUpdateTimeout = null;
    this.container = null;
    this.syncing = false;

    // Settings paths restored by each "Restore Defaults" button
    this.sectionPaths = {
      opening: ["autoHide", "closeOnOutsideClick", "openOnStart", "keyboard"],
      searchBar: ["searchBar.width", "searchBar.zIndex", "searchBar.placement"],
      phones: [
        "phoneDetection",
        "mobileBreakpoint",
        "searchBar.mobileOverrides.breakpoint",
        "searchBar.mobileOverrides.enabled",
        "searchBar.mobileOverrides.width",
        "searchBar.mobileOverrides.maxWidth",
        "searchBar.mobilePlacement",
      ],
      texts: ["searchBar.placeholder", "texts"],
    };
  }

  /**
   * Set the core instance
   */
  setCore(core) {
    this.core = core;
  }

  /**
   * Initialize general tab functionality
   */
  init(container) {
    try {
      console.log("🚀 Initializing General tab handler");
      this.container = container;

      // Setup form listeners
      this.core.setupFormListeners(container);

      // Setup general tab specific features
      this.setupWidthValidation(container);
      this.setupRangeInputs(container);
      this.setupPlacementPicker(container);
      this.setupDependentControls(container);

      // Controls that are not plain fields follow every fill of the form (Load, Restore Defaults ...)
      container.addEventListener("formpopulated", () => this.syncFromConfig(container));

      // Populate form with current values
      this.core.populateForm(container);
      this.syncFromConfig(container);

      // Setup reset button handlers
      this.setupResetButtonHandlers(container);

      // Validate all fields
      this.validateForm(container);

      console.log("✅ General tab handler initialized");
    } catch (error) {
      console.error("❌ Error initializing General tab:", error);
    }
  }

  // ------------------------------------------------------------------------------------------------ placement

  /**
   * Is this a usable searchBar.placement object?
   */
  isPlacement(value) {
    return (
      !!value &&
      typeof value === "object" &&
      ["top", "middle", "bottom"].includes(value.vertical) &&
      ["left", "center", "right"].includes(value.horizontal)
    );
  }

  /**
   * Older settings (searchBar.position) -> the placement the Control Panel uses now
   */
  legacyPlacement(position) {
    const p = position && typeof position === "object" ? position : {};
    const has = (v) => v !== null && v !== undefined && v !== "";
    const num = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
    const bottomOnly = has(p.bottom) && !has(p.top);
    let horizontal = "right";
    if (p.left === "50%") horizontal = "center";
    else if (has(p.left) && !has(p.right)) horizontal = "left";
    return {
      vertical: bottomOnly ? "bottom" : "top",
      horizontal,
      offsetX: horizontal === "left" ? num(p.left, 70) : num(p.right, 70),
      offsetY: bottomOnly ? num(p.bottom, 70) : num(p.top, 70),
    };
  }

  /**
   * Older settings (searchBar.mobilePosition) -> the phone placement the Control Panel uses now
   */
  legacyMobilePlacement(position) {
    const p = position && typeof position === "object" ? position : {};
    const num = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
    const bottomOnly =
      p.bottom !== "auto" &&
      p.bottom !== null &&
      p.bottom !== undefined &&
      (p.top === null || p.top === undefined);
    return {
      vertical: bottomOnly ? "bottom" : "top",
      offsetY: bottomOnly ? num(p.bottom, 60) : num(p.top, 60),
      margin: num(p.left, 20),
    };
  }

  /**
   * The 3 x 3 picker: a click sets the two hidden fields, which save like any other field
   */
  setupPlacementPicker(container = document) {
    try {
      const cells = container.querySelectorAll(".placement-cell");
      const vertical = container.querySelector("#placementVertical");
      const horizontal = container.querySelector("#placementHorizontal");
      if (!cells.length || !vertical || !horizontal) return;

      cells.forEach((cell) => {
        cell.addEventListener("click", () => {
          vertical.value = cell.dataset.vertical;
          horizontal.value = cell.dataset.horizontal;
          vertical.dispatchEvent(new Event("change", { bubbles: true }));
          horizontal.dispatchEvent(new Event("change", { bubbles: true }));
          this.updatePicker(container);
          this.updateDependentStates(container);
        });
      });
    } catch (error) {
      console.error("🚨 Error setting up the placement picker:", error);
    }
  }

  /**
   * Show the chosen cell of the picker
   */
  updatePicker(container = document) {
    const vertical = container.querySelector("#placementVertical");
    const horizontal = container.querySelector("#placementHorizontal");
    if (!vertical || !horizontal) return;
    container.querySelectorAll(".placement-cell").forEach((cell) => {
      const on =
        cell.dataset.vertical === vertical.value && cell.dataset.horizontal === horizontal.value;
      cell.setAttribute("aria-checked", on ? "true" : "false");
    });

    // Say in words where the bar sits ("Top right", "Center of the screen")
    const caption = container.querySelector("#placementCaption");
    if (caption) {
      const word = (text) => text.charAt(0).toUpperCase() + text.slice(1);
      caption.textContent =
        vertical.value === "middle" && horizontal.value === "center"
          ? "Center of the screen"
          : `${word(vertical.value)} ${horizontal.value}`;
    }
  }

  /**
   * After every fill of the form: make sure the settings carry a placement (older ones are converted), show it in
   * the picker and update the controls that depend on others
   */
  syncFromConfig(container = this.container || document) {
    if (this.syncing) return;
    try {
      this.syncing = true;
      const config = this.core.config;
      const bar = config.searchBar || (config.searchBar = {});
      let converted = false;
      if (!this.isPlacement(bar.placement)) {
        bar.placement = this.legacyPlacement(bar.position);
        converted = true;
      }
      if (!bar.mobilePlacement || typeof bar.mobilePlacement !== "object") {
        bar.mobilePlacement = this.legacyMobilePlacement(bar.mobilePosition);
        converted = true;
      }
      if (converted) this.core.populateForm(container);
      this.updatePicker(container);
      this.updateDependentStates(container);
    } catch (error) {
      console.error("🚨 Error syncing the General tab with the settings:", error);
    } finally {
      this.syncing = false;
    }
  }

  // ------------------------------------------------------------------------------------------------ dependent controls

  /**
   * Fields that only matter when another field says so are dimmed and locked
   */
  setupDependentControls(container = document) {
    container.addEventListener("change", (event) => {
      const name = event.target && event.target.name;
      if (
        [
          "phoneDetection",
          "searchBar.mobileOverrides.enabled",
          "searchBar.placement.vertical",
          "searchBar.placement.horizontal",
        ].includes(name)
      ) {
        this.updateDependentStates(container);
      }
    });
  }

  setDisabled(field, disabled) {
    if (!field) return;
    field.disabled = disabled;
    const group = field.closest(".form-group");
    if (group) group.classList.toggle("disabled", disabled);
  }

  updateDependentStates(container = document) {
    try {
      const value = (name) => {
        const field = container.querySelector(`[name="${name}"]`);
        return field ? field.value : undefined;
      };
      const checked = (name) => {
        const field = container.querySelector(`[name="${name}"]`);
        return field ? field.checked : true;
      };

      // A bar that is centered has no distance from the side; a bar in the middle has none from the top or bottom
      this.setDisabled(
        container.querySelector('[name="searchBar.placement.offsetX"]'),
        value("searchBar.placement.horizontal") === "center"
      );
      this.setDisabled(
        container.querySelector('[name="searchBar.placement.offsetY"]'),
        value("searchBar.placement.vertical") === "middle"
      );

      // The breakpoint only counts when phones are told apart by screen width
      this.setDisabled(
        container.querySelector('[name="mobileBreakpoint"]'),
        value("phoneDetection") === "tour"
      );

      // The phone settings only count while the separate phone layout is on
      const phoneOn = checked("searchBar.mobileOverrides.enabled");
      container
        .querySelectorAll("#mobileLayoutGrid input, #mobileLayoutGrid select")
        .forEach((field) => {
          this.setDisabled(field, !phoneOn);
        });
    } catch (error) {
      console.error("🚨 Error updating dependent controls:", error);
    }
  }

  // ------------------------------------------------------------------------------------------------ width fields

  /**
   * Setup width validation for form inputs with improved percentage support
   */
  setupWidthValidation(container = document) {
    try {
      const widthInputs = container.querySelectorAll(".width-input");

      widthInputs.forEach((input) => {
        input.addEventListener("input", (e) => {
          const value = this.core.sanitizeInput(e.target.value);

          // Supports px, %, em, rem, vw
          const isValid = /^\d+(\.\d+)?(%|px|em|rem|vw)?$/.test(value);

          if (!isValid && value !== "") {
            e.target.classList.add("error");
            e.target.classList.remove("valid");

            if (window.showValidationMessage) {
              window.showValidationMessage(
                e.target,
                "error",
                "Enter a width such as 350px or 95%.",
                3000
              );
            }
          } else if (value !== "") {
            e.target.classList.remove("error");
            // Warnings about widths that may overflow; the value is only used once it is in range
            this.validateWidthOverflow(e.target, value);
            if (!this.getFieldProblem(e.target.name, value, e.target)) {
              this.handleWidthChange(e.target);
            }
          } else {
            e.target.classList.remove("error", "warning");
            if (window.clearValidationMessage) {
              window.clearValidationMessage(e.target.id);
            }
          }
        });

        // Handle blur event for final validation
        input.addEventListener("blur", (e) => {
          const value = this.core.sanitizeInput(e.target.value);

          // If no unit is specified, default to px
          if (/^\d+$/.test(value)) {
            e.target.value = `${value}px`;
            if (!this.getFieldProblem(e.target.name, e.target.value, e.target)) {
              this.handleWidthChange(e.target);
            }
          }
        });
      });

      console.log(`✅ Width validation set up for ${widthInputs.length} inputs`);
    } catch (error) {
      console.error("🚨 Error setting up width validation:", error);
    }
  }

  /**
   * Width validation with overflow warnings
   */
  validateWidthOverflow(input, value) {
    try {
      input.classList.remove("error", "warning");
      if (window.clearValidationMessage) {
        window.clearValidationMessage(input.id);
      }

      const match = value.match(/^(\d+(?:\.\d+)?)(px|%|em|rem|vw)?$/);
      if (!match) return;

      const numValue = parseFloat(match[1]);
      const unit = match[2] || "";
      const warn = (text) => {
        input.classList.add("warning");
        if (window.showValidationMessage)
          window.showValidationMessage(input, "warning", text, 4000);
      };

      if (unit === "%") {
        if (numValue === 100) {
          warn("100% width may overflow on small screens. Consider using 95% or a maximum width.");
        } else if (numValue > 95) {
          warn(`${numValue}% width may cause overflow. Consider using 95% or less.`);
        } else {
          input.classList.add("valid");
        }
      } else if (unit === "px") {
        if (numValue > 800) {
          warn(`${numValue}px may be too wide for small screens. Consider using a percentage.`);
        } else {
          input.classList.add("valid");
        }
      } else {
        input.classList.add("valid");
      }
    } catch (error) {
      console.error("Error validating width overflow:", error);
    }
  }

  /**
   * Handle width input changes with proper conversion
   */
  handleWidthChange(input) {
    try {
      const value = this.core.sanitizeInput(input.value);
      const fieldName = input.name || input.id;

      // A pixel value is stored as a number
      let processedValue = value;
      if (typeof value === "string" && value.endsWith("px")) {
        const numValue = parseInt(value.replace("px", ""), 10);
        if (!isNaN(numValue)) processedValue = numValue;
      }

      this.core.safeSetNestedProperty(this.core.config, fieldName, processedValue);

      // Apply live preview after a short delay
      clearTimeout(this.formUpdateTimeout);
      this.formUpdateTimeout = setTimeout(() => {
        this.applyLivePreview(fieldName, processedValue);
      }, 300);

      console.log(`📏 Width updated: ${fieldName} = ${processedValue}`);
    } catch (error) {
      console.error("🚨 Error handling width change:", error);
    }
  }

  /**
   * Setup range inputs with value display
   */
  setupRangeInputs(container = document) {
    try {
      const rangeInputs = container.querySelectorAll('input[type="range"]');

      rangeInputs.forEach((input) => {
        if (!input.parentNode.querySelector(".range-value")) {
          const valueDisplay = document.createElement("span");
          valueDisplay.className = "range-value";
          valueDisplay.textContent = input.value;
          input.parentNode.appendChild(valueDisplay);
        }
        input.addEventListener("input", () => {
          const valueDisplay = input.parentNode.querySelector(".range-value");
          if (valueDisplay) valueDisplay.textContent = input.value;
        });
      });

      console.log(`✅ Range inputs setup for ${rangeInputs.length} elements`);
    } catch (error) {
      console.error("🚨 Error setting up range inputs:", error);
    }
  }

  // ------------------------------------------------------------------------------------------------ validation

  /**
   * The text to show under a field whose value cannot be used, or "" when it is fine. The core calls this before a
   * value is saved: a value with a problem is not saved and not sent to the tour.
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
        if (min !== null && number < min) return `Enter a number of ${min} or more.`;
        if (max !== null && number > max) return `Enter a number of ${max} or less.`;
        return "";
      }

      if (name === "searchBar.width" || name === "searchBar.mobileOverrides.width") {
        const text = typeof value === "number" ? `${value}px` : String(value || "").trim();
        const match = text.match(/^(\d+(?:\.\d+)?)(px|%|em|rem|vw)?$/);
        if (!match) return "Enter a width such as 350px or 95%.";
        const amount = parseFloat(match[1]);
        const unit = match[2] || "px";
        const smallest = name === "searchBar.width" ? 200 : 150;
        if (unit === "px" && (amount < smallest || amount > 1200)) {
          return `Enter a width from ${smallest}px to 1200px, or use a percentage.`;
        }
        if (unit === "%" && (amount < 10 || amount > 100)) {
          return "Enter a percentage from 10% to 100%.";
        }
        return "";
      }

      if (name === "searchBar.placeholder" || /^texts\./.test(name)) {
        if (typeof value === "string" && value.length > 120) return "Keep it under 120 characters.";
      }
    } catch (error) {
      console.error("🚨 Error checking a General tab field:", error);
    }
    return "";
  }

  /**
   * Value of a field the way the settings keep it
   */
  readField(input) {
    if (input.type === "checkbox") return input.checked;
    if (input.type === "number" || input.type === "range") {
      return input.value === "" ? "" : Number(input.value);
    }
    return input.value;
  }

  /**
   * Validate entire form for General tab: every field with a problem is marked and explained
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
      console.log(`📋 General tab validation: ${valid ? "PASSED" : "FAILED"}`);
      return valid;
    } catch (error) {
      console.error("🚨 Error validating General tab form:", error);
      return false;
    }
  }

  // ------------------------------------------------------------------------------------------------ settings

  /**
   * Update config from form values specifically for General tab (Apply Settings, Download): a field with a problem
   * keeps the last good value
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
          // A pixel width is stored as a number
          if (
            (name === "searchBar.width" || name === "searchBar.mobileOverrides.width") &&
            typeof value === "string" &&
            /^\d+(\.\d+)?px$/.test(value.trim())
          ) {
            value = parseInt(value, 10);
          }
        }

        if (this.getFieldProblem(name, value === null ? "" : value, input)) return;

        this.core.safeSetNestedProperty(this.core.config, name, value);
        this.core.mirrorToPluginNames(name, value);
      });

      console.log("📝 General tab config updated from form");
    } catch (error) {
      console.error("🚨 Error updating config from General tab form:", error);
    }
  }

  /**
   * Handle tab-specific form changes
   */
  onFormChange(input) {
    try {
      this.core.onFormChange(input);
    } catch (error) {
      console.error("🚨 Error handling General tab form change:", error);
    }
  }

  /**
   * Apply live preview for General tab changes
   */
  applyLivePreview(fieldName, value) {
    try {
      const previewConfig = JSON.parse(JSON.stringify(this.core.config));
      this.core.safeSetNestedProperty(previewConfig, fieldName, value);

      this.core.safeLocalStorageSet("searchProLiveConfig", previewConfig);

      if (window.parent && window.parent !== window) {
        try {
          window.parent.postMessage(
            {
              type: "searchProConfigPreview",
              config: previewConfig,
              field: this.core.sanitizeInput(fieldName),
              value: typeof value === "string" ? this.core.sanitizeInput(value) : value,
            },
            "*"
          );
        } catch (postError) {
          console.warn("🚨 Error posting message to parent:", postError);
        }
      }

      console.log(`🔄 General tab live preview: ${fieldName} = ${value}`);
    } catch (error) {
      console.warn("🚨 General tab live preview failed:", error);
    }
  }

  /**
   * Put the settings of one section back to their defaults
   */
  resetSection(sectionKey) {
    try {
      const paths = this.sectionPaths[sectionKey];
      if (!paths) return false;
      const defaults = this.core.getDefaultConfig();

      paths.forEach((path) => {
        const value = this.core.getNestedProperty(defaults, path);
        if (value === undefined) return;
        const copy = value && typeof value === "object" ? JSON.parse(JSON.stringify(value)) : value;
        this.core.safeSetNestedProperty(this.core.config, path, copy);
        this.core.mirrorToPluginNames(path, copy);
      });

      const container = this.container || document.getElementById("general-panel");
      if (container) {
        container.querySelectorAll(".error, .warning").forEach((field) => {
          field.classList.remove("error", "warning");
          delete field.dataset.blocked;
          if (field.id && window.clearValidationMessage) window.clearValidationMessage(field.id);
        });
        this.core.populateForm(container);
      }

      // Send the restored settings to an open tour
      this.applyLivePreview(paths[0], this.core.getNestedProperty(this.core.config, paths[0]));
      return true;
    } catch (error) {
      console.error("🚨 Error restoring a General tab section:", error);
      return false;
    }
  }

  /**
   * Reset General tab to defaults
   */
  resetToDefaults() {
    try {
      console.log("🔄 Resetting General tab to defaults");
      Object.keys(this.sectionPaths).forEach((key) => this.resetSection(key));
      console.log("✅ General tab reset complete");
    } catch (error) {
      console.error("🚨 Error resetting General tab:", error);
    }
  }

  /**
   * Setup the "Restore Defaults" button of every section
   */
  setupResetButtonHandlers(container) {
    try {
      const resetButtons = container.querySelectorAll(".reset-section-button");
      resetButtons.forEach((button) => {
        button.addEventListener("click", (e) => {
          e.preventDefault();
          const section = button.dataset.section;
          const heading = button.closest(".config-section")?.querySelector(".section-title");
          const title = heading ? heading.textContent.replace(/\s+/g, " ").trim() : "This section";
          if (
            this.resetSection(section) &&
            this.core &&
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
      console.log(`🔄 Reset button handlers set up for ${resetButtons.length} buttons`);
    } catch (error) {
      console.error("🚨 Error setting up reset button handlers:", error);
    }
  }

  /**
   * Get General tab configuration summary
   */
  getConfigSummary() {
    try {
      const config = this.core.config;
      return {
        tab: "General",
        sections: {
          autoHide: config.autoHide,
          closeOnOutsideClick: config.closeOnOutsideClick,
          openOnStart: config.openOnStart,
          keyboard: config.keyboard,
          searchBar: config.searchBar,
          phones: {
            phoneDetection: config.phoneDetection,
            mobileBreakpoint: config.mobileBreakpoint,
          },
          texts: config.texts,
        },
      };
    } catch (error) {
      console.error("🚨 Error getting General tab config summary:", error);
      return null;
    }
  }

  /**
   * Cleanup resources when tab is unloaded
   */
  cleanup() {
    try {
      clearTimeout(this.formUpdateTimeout);
      console.log("🧹 General tab handler cleaned up");
    } catch (error) {
      console.error("🚨 Error cleaning up General tab:", error);
    }
  }
}

// Export for module use
if (typeof module !== "undefined" && module.exports) {
  module.exports = GeneralTabHandler;
} else {
  window.GeneralTabHandler = GeneralTabHandler;
}
