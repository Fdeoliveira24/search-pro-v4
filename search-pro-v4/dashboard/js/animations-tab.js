/**
 * Search Pro Control Panel - Animations Tab Handler
 * Version 4.5 - Last Update on 10/11/2026 - Animations moved out of Advanced into a tab of their own: an effect, a time and a distance for every part of the search, ready-made styles and a preview
 * Handles everything specific to the Animations tab: the ready-made styles (they fill in the numbers, which stay editable), the easing lists
 * (a curve that is in no list is kept and shown), the exact curve box, checks that explain a value that cannot be used, Restore Defaults for
 * each section, the dimming of the page while Enable Animations is off, and the Preview. The Preview plays the effects with the same rules as the
 * plugin (_motionPlay in search-v4.js): one decision for off / reduced / full, 0 means 0, only opacity and transform move.
 */

// The settings a ready-made style fills in ("animations." is left out of the names). Enable Animations and the reduced motion settings
// are never part of a style. Balanced is the default set of the Control Panel and of the plugin.
const ANIM_STYLE_KEYS = [
  "easing",
  "searchBar.openEffect",
  "searchBar.openDuration",
  "searchBar.closeEffect",
  "searchBar.closeDuration",
  "searchBar.distance",
  "searchBar.scale",
  "searchBar.easing",
  "searchBar.focusDuration",
  "searchBar.focusGrow",
  "searchBar.clearDuration",
  "results.itemEffect",
  "results.fadeInDuration",
  "results.slideDistance",
  "results.staggerDelay",
  "results.staggerLimit",
  "results.replay",
  "results.groupEffect",
  "results.groupDuration",
  "results.groupDistance",
  "results.scale",
  "results.easing",
  "results.panelEffect",
  "results.panelDuration",
  "results.panelDistance",
  "results.noResultsEffect",
  "results.noResultsDuration",
  "results.noResultsDistance",
  "results.hoverLift",
  "results.hoverDuration",
  "results.pressScale",
  "results.iconHoverDuration",
];

const ANIM_SNAPPY = "cubic-bezier(0.4, 0, 0.2, 1)";
const ANIM_OVERSHOOT = "cubic-bezier(0.34, 1.56, 0.64, 1)";

// What each style changes compared to Balanced
const ANIM_STYLE_CHANGES = {
  subtle: {
    easing: ANIM_SNAPPY,
    "searchBar.openEffect": "fade",
    "searchBar.closeEffect": "fade",
    "searchBar.openDuration": 200,
    "searchBar.closeDuration": 150,
    "searchBar.distance": 10,
    "searchBar.scale": 98,
    "searchBar.focusDuration": 150,
    "searchBar.clearDuration": 150,
    "results.itemEffect": "fade",
    "results.fadeInDuration": 150,
    "results.slideDistance": 6,
    "results.staggerDelay": 25,
    "results.staggerLimit": 8,
    "results.groupEffect": "fade",
    "results.groupDuration": 150,
    "results.groupDistance": 6,
    "results.scale": 98,
    "results.panelDuration": 150,
    "results.panelDistance": 6,
    "results.noResultsDuration": 150,
    "results.noResultsDistance": 6,
    "results.hoverLift": 1,
    "results.hoverDuration": 150,
    "results.iconHoverDuration": 150,
  },
  lively: {
    easing: ANIM_OVERSHOOT,
    "searchBar.openDuration": 400,
    "searchBar.closeDuration": 250,
    "searchBar.distance": 28,
    "searchBar.scale": 90,
    "searchBar.focusDuration": 250,
    "searchBar.focusGrow": 102,
    "results.fadeInDuration": 300,
    "results.slideDistance": 16,
    "results.staggerDelay": 60,
    "results.groupDuration": 300,
    "results.groupDistance": 16,
    "results.scale": 92,
    "results.panelEffect": "from-above",
    "results.panelDuration": 250,
    "results.noResultsEffect": "zoom",
    "results.noResultsDuration": 300,
    "results.hoverLift": 3,
    "results.pressScale": 97,
    "results.iconHoverDuration": 250,
  },
  minimal: {
    easing: ANIM_SNAPPY,
    "searchBar.openEffect": "fade",
    "searchBar.closeEffect": "fade",
    "searchBar.openDuration": 150,
    "searchBar.closeDuration": 100,
    "searchBar.distance": 0,
    "searchBar.scale": 100,
    "searchBar.focusDuration": 100,
    "searchBar.clearDuration": 100,
    "results.itemEffect": "fade",
    "results.fadeInDuration": 120,
    "results.slideDistance": 0,
    "results.staggerDelay": 0,
    "results.replay": "list-opens",
    "results.groupEffect": "none",
    "results.groupDuration": 0,
    "results.groupDistance": 0,
    "results.scale": 100,
    "results.panelDuration": 120,
    "results.panelDistance": 0,
    "results.noResultsDuration": 120,
    "results.noResultsDistance": 0,
    "results.hoverLift": 0,
    "results.hoverDuration": 100,
    "results.iconHoverDuration": 100,
  },
};

// The people and places of the preview (the colors there are only for the preview)
const ANIM_PREVIEW_GROUPS = [
  { title: "Panorama", icon: "fa-image", items: ["Main Lobby", "Pool Terrace", "Rooftop View"] },
  { title: "Hotspot", icon: "fa-dot-circle", items: ["Opening Hours", "Pool Video"] },
];

class AnimationsTabHandler {
  constructor() {
    this.core = null;
    this.tabId = "animations";
    this.container = null;
    this.previewTimer = null;
    this.previewToken = 0;
    this.running = [];
    this.showEmpty = false;

    // The settings each "Restore Defaults" button puts back
    this.sectionPaths = {
      motion: [
        "animations.enabled",
        "animations.easing",
        "animations.reducedMotion.respectPreference",
        "animations.reducedMotion.fallbackDuration",
      ],
      searchBar: [
        "animations.searchBar.openEffect",
        "animations.searchBar.openDuration",
        "animations.searchBar.closeEffect",
        "animations.searchBar.closeDuration",
        "animations.searchBar.distance",
        "animations.searchBar.scale",
        "animations.searchBar.easing",
      ],
      searchField: [
        "animations.searchBar.focusDuration",
        "animations.searchBar.focusGrow",
        "animations.searchBar.clearDuration",
      ],
      results: [
        "animations.results.itemEffect",
        "animations.results.fadeInDuration",
        "animations.results.slideDistance",
        "animations.results.staggerDelay",
        "animations.results.staggerLimit",
        "animations.results.replay",
        "animations.results.groupEffect",
        "animations.results.groupDuration",
        "animations.results.groupDistance",
        "animations.results.scale",
        "animations.results.easing",
      ],
      listBox: [
        "animations.results.panelEffect",
        "animations.results.panelDuration",
        "animations.results.panelDistance",
        "animations.results.noResultsEffect",
        "animations.results.noResultsDuration",
        "animations.results.noResultsDistance",
      ],
      hover: [
        "animations.results.hoverLift",
        "animations.results.hoverDuration",
        "animations.results.pressScale",
        "animations.results.iconHoverDuration",
      ],
    };
  }

  setCore(core) {
    this.core = core;
  }

  init(container) {
    try {
      this.container = container;
      this.core.normalizeAnimationSettings?.(this.core.config);

      this.core.setupFormListeners(container);
      this.core.populateForm(container);

      this.setupEasingSelects(container);
      this.setupStyleSelect(container);
      this.setupResetButtons(container);
      this.setupPreview(container);

      // Any change on the page keeps the style, the easing lists, the dimming and the preview in step (the core has already
      // saved the field itself: its own listener sits on the field and runs first)
      container.addEventListener("change", (event) => this.onPageChange(event, container));
      container.addEventListener("formpopulated", () => this.syncPage(container));

      // Settings can be replaced from outside (restore, load a file): show the new state
      if (!this.replacedListener) {
        this.replacedListener = () => {
          const panel = document.getElementById("animations-panel");
          if (!panel) return;
          this.core.normalizeAnimationSettings?.(this.core.config);
          this.core.populateForm(panel);
          this.schedulePreview(150);
        };
        this.tabListener = (event) => {
          if (event.detail && event.detail.tabId === "animations") this.schedulePreview(250);
        };
        document.addEventListener("controlPanelConfigReplaced", this.replacedListener);
        document.addEventListener("tabChanged", this.tabListener);
      }

      this.syncPage(container);
      this.validateForm(container);
      this.schedulePreview(400);
    } catch (error) {
      console.error("❌ Error initializing the Animations tab:", error);
    }
  }

  // ---- Values ----------------------------------------------------------------------------------------------------

  get(path) {
    return this.core.getNestedProperty(this.core.config, path);
  }

  setValue(path, value) {
    this.core.safeSetNestedProperty(this.core.config, path, value);
  }

  // ---- Checks ----------------------------------------------------------------------------------------------------

  /**
   * Called by the core for every field of this tab: returns the text that explains why a value cannot be used, or ""
   */
  getFieldProblem(name, value, input) {
    try {
      if (input && input.type === "number" && String(name).startsWith("animations.")) {
        const number = value === "" || value === null ? NaN : Number(value);
        if (!Number.isFinite(number)) return "Enter a number.";
        const min = input.min !== "" ? Number(input.min) : null;
        const max = input.max !== "" ? Number(input.max) : null;
        if (min !== null && max !== null && (number < min || number > max)) {
          return `Enter a number from ${min} to ${max}.`;
        }
      }
    } catch (error) {
      console.error("🚨 Error checking an Animations field:", error);
    }
    return "";
  }

  validateForm(container = document) {
    let valid = true;
    container.querySelectorAll("[name]").forEach((input) => {
      if (input.type === "checkbox") return;
      const problem = this.getFieldProblem(input.name, input.value, input);
      if (problem) {
        valid = false;
        input.classList.add("error");
        if (window.showValidationMessage && input.id) {
          window.showValidationMessage(input, "error", problem, 30000);
        }
      } else if (input.classList.contains("error")) {
        input.classList.remove("error");
        delete input.dataset.blocked;
        if (window.clearValidationMessage && input.id) window.clearValidationMessage(input.id);
      }
    });
    return valid;
  }

  // ---- Easing lists --------------------------------------------------------------------------------------------------

  /**
   * An easing that is in no list (an older setting, a hand-written curve) is kept: it is added to the list and chosen,
   * never replaced. The exact curve box shows the curve of the Easing list in words a browser reads.
   */
  setupEasingSelects(container) {
    const custom = container.querySelector("#animationsEasingCustom");
    if (!custom || custom.dataset.bound) return;
    custom.dataset.bound = "1";
    custom.addEventListener("change", () => {
      const text = custom.value.trim();
      if (!text) {
        this.syncEasingSelects(container);
        return;
      }
      if (!this.curveWorks(text)) {
        custom.classList.add("error");
        window.showValidationMessage?.(
          custom,
          "error",
          "Enter a curve such as cubic-bezier(0.22, 1, 0.36, 1) or ease-out.",
          30000
        );
        return;
      }
      custom.classList.remove("error");
      window.clearValidationMessage?.(custom.id);
      this.setValue("animations.easing", text);
      this.core.applyLivePreview("animations.easing", text);
      this.syncEasingSelects(container);
      this.syncStyleSelect(container);
      this.schedulePreview(300);
    });
  }

  curveWorks(text) {
    try {
      return CSS.supports("animation-timing-function", text);
    } catch (error) {
      return /^[a-z-]+(\([\d\s.,%-]*\))?$/.test(text);
    }
  }

  syncEasingSelects(container) {
    container.querySelectorAll("[data-easing-select] select").forEach((select) => {
      const value = select.name ? this.get(select.name) : undefined;
      select.querySelectorAll("option[data-kept]").forEach((option) => option.remove());
      const text = value === undefined || value === null ? "" : String(value);
      if (!Array.from(select.options).some((option) => option.value === text)) {
        const option = document.createElement("option");
        option.value = text;
        option.dataset.kept = "true";
        option.textContent = `Custom: ${text.length > 36 ? `${text.slice(0, 33)}...` : text}`;
        select.appendChild(option);
      }
      select.value = text;
    });
    const custom = container.querySelector("#animationsEasingCustom");
    if (custom) {
      const current = this.get("animations.easing");
      custom.value = current === undefined || current === null ? "" : String(current);
      custom.classList.remove("error");
      window.clearValidationMessage?.(custom.id);
    }
  }

  // ---- Ready-made styles ---------------------------------------------------------------------------------------------

  styleValues(name) {
    const base = this.core.getDefaultConfig().animations;
    const values = {};
    ANIM_STYLE_KEYS.forEach((key) => {
      values[key] = this.core.getNestedProperty(base, key);
    });
    return Object.assign(values, ANIM_STYLE_CHANGES[name] || {});
  }

  /** Which ready-made style the settings on the page match: balanced, subtle, lively, minimal or custom */
  matchStyle() {
    const names = ["balanced", "subtle", "lively", "minimal"];
    for (const name of names) {
      const values = this.styleValues(name);
      const same = ANIM_STYLE_KEYS.every((key) => {
        const current = this.get(`animations.${key}`);
        return (
          String(current === undefined || current === null ? "" : current) === String(values[key])
        );
      });
      if (same) return name;
    }
    return "custom";
  }

  syncStyleSelect(container) {
    const select = container.querySelector("#animationPreset");
    if (select) select.value = this.matchStyle();
  }

  setupStyleSelect(container) {
    const select = container.querySelector("#animationPreset");
    if (!select) return;
    select.addEventListener("change", () => {
      if (select.value === "custom") return;
      this.applyStyle(select.value, container);
    });
  }

  applyStyle(name, container = this.container) {
    const values = this.styleValues(name);
    ANIM_STYLE_KEYS.forEach((key) => this.setValue(`animations.${key}`, values[key]));
    this.core.populateForm(container);
    this.core.applyLivePreview("animations.easing", this.get("animations.easing"));
    this.syncPage(container);
    this.validateForm(container);
    this.schedulePreview(150);
  }

  // ---- Page state ------------------------------------------------------------------------------------------------------

  onPageChange(event, container) {
    const target = event.target;
    if (!target || target.dataset.uiOnly || target.closest(".anim-preview-column")) return;
    this.syncPage(container);
    this.schedulePreview(350);
  }

  /** Everything that follows the saved values: the easing lists, the style, the dimming of the page */
  syncPage(container) {
    this.syncEasingSelects(container);
    this.syncStyleSelect(container);
    const enabled = this.get("animations.enabled") === true;
    const notice = container.querySelector("#animOffNotice");
    if (notice) notice.hidden = enabled;
    container.querySelectorAll(".anim-main .form-group").forEach((group) => {
      const isMaster = Boolean(group.querySelector('[name="animations.enabled"]'));
      group.classList.toggle("inactive", !enabled && !isMaster);
    });
  }

  // ---- Restore Defaults ----------------------------------------------------------------------------------------------------

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

  restoreSection(key) {
    try {
      const paths = this.sectionPaths[key];
      if (!paths) return false;
      const defaults = this.core.getDefaultConfig();
      paths.forEach((path) => {
        const value = this.core.getNestedProperty(defaults, path);
        if (value !== undefined) this.setValue(path, value);
      });
      const container = this.container || document.getElementById("animations-panel");
      if (container) {
        container.querySelectorAll(`[data-section-key="${key}"] .error`).forEach((field) => {
          field.classList.remove("error");
          delete field.dataset.blocked;
          if (field.id && window.clearValidationMessage) window.clearValidationMessage(field.id);
        });
        this.core.populateForm(container);
        this.syncPage(container);
      }
      this.core.applyLivePreview(paths[0], this.get(paths[0]));
      this.schedulePreview(150);
      return true;
    } catch (error) {
      console.error("🚨 Error restoring an Animations section:", error);
      return false;
    }
  }

  // ---- Motion rules (the same as _motionSpec / _motionPlay in search-v4.js) ---------------------------------------------------

  settings() {
    return this.core.config.animations || {};
  }

  /** "off", "reduced" (the device asks for less motion and Respect Reduced Motion is on) or "full" */
  motionState() {
    const settings = this.settings();
    if (settings.enabled !== true) return "off";
    let asked = false;
    try {
      asked = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (error) {
      asked = false;
    }
    return asked && settings.reducedMotion?.respectPreference !== false ? "reduced" : "full";
  }

  number(value, fallback, min, max) {
    if (value === undefined || value === null || value === "") return fallback;
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
  }

  effectOf(value, fallback) {
    return [
      "none",
      "fade",
      "from-above",
      "from-below",
      "from-left",
      "from-right",
      "zoom",
      "zoom-from-above",
      "zoom-from-below",
    ].includes(value)
      ? value
      : fallback;
  }

  easingOf(value) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) return "";
    if (this.curveWorks(text)) return text;
    return /^linear\(/.test(text) ? ANIM_OVERSHOOT : "";
  }

  spec(name) {
    const settings = this.settings();
    const base = this.core.getDefaultConfig().animations;
    const bar = settings.searchBar || {};
    const results = settings.results || {};
    const easing = this.easingOf(settings.easing) || base.easing;
    if (name === "barOpen" || name === "barClose") {
      const opening = name === "barOpen";
      return {
        effect: this.effectOf(
          opening ? bar.openEffect : bar.closeEffect,
          base.searchBar.openEffect
        ),
        duration: this.number(
          opening ? bar.openDuration : bar.closeDuration,
          opening ? base.searchBar.openDuration : base.searchBar.closeDuration,
          0,
          5000
        ),
        distance: this.number(bar.distance, base.searchBar.distance, 0, 300),
        scale: this.number(bar.scale, base.searchBar.scale, 50, 100) / 100,
        easing: this.easingOf(bar.easing) || easing,
      };
    }
    const fade = this.number(results.fadeInDuration, base.results.fadeInDuration, 0, 5000);
    const slide = this.number(results.slideDistance, base.results.slideDistance, 0, 300);
    const own = {
      group: {
        effect: this.effectOf(results.groupEffect, base.results.groupEffect),
        duration: this.number(results.groupDuration, fade, 0, 5000),
        distance: this.number(results.groupDistance, slide, 0, 300),
      },
      item: {
        effect: this.effectOf(results.itemEffect, base.results.itemEffect),
        duration: fade,
        distance: slide,
      },
      panel: {
        effect: this.effectOf(results.panelEffect, base.results.panelEffect),
        duration: this.number(results.panelDuration, fade, 0, 5000),
        distance: this.number(results.panelDistance, base.results.panelDistance, 0, 300),
      },
      noResults: {
        effect: this.effectOf(results.noResultsEffect, base.results.noResultsEffect),
        duration: this.number(results.noResultsDuration, fade, 0, 5000),
        distance: this.number(results.noResultsDistance, base.results.noResultsDistance, 0, 300),
      },
    }[name];
    return {
      ...own,
      scale: this.number(results.scale, base.results.scale, 50, 100) / 100,
      easing: this.easingOf(results.easing) || easing,
    };
  }

  hiddenFrame(effect, distance, scale) {
    const parts = [];
    if (effect === "from-above") parts.push(`translateY(${-distance}px)`);
    else if (effect === "from-below") parts.push(`translateY(${distance}px)`);
    else if (effect === "from-left") parts.push(`translateX(${-distance}px)`);
    else if (effect === "from-right") parts.push(`translateX(${distance}px)`);
    else if (effect === "zoom") parts.push(`scale(${scale})`);
    else if (effect === "zoom-from-above") parts.push(`scale(${scale}) translateY(${-distance}px)`);
    else if (effect === "zoom-from-below") parts.push(`scale(${scale}) translateY(${distance}px)`);
    return { opacity: 0, transform: parts.length ? parts.join(" ") : "none" };
  }

  /** Plays one entrance (or exit) on a preview element; returns { animation, total } like the plugin */
  play(el, name, options = {}) {
    const nothing = { animation: null, total: 0 };
    const mode = this.motionState();
    if (mode === "off" || !el || typeof el.animate !== "function") return nothing;
    const spec = this.spec(name);
    let effect = spec.effect;
    let duration = spec.duration;
    let delay = Number(options.delay) || 0;
    if (mode === "reduced") {
      effect = effect === "none" ? "none" : "fade";
      duration = this.number(this.settings().reducedMotion?.fallbackDuration, 100, 0, 1000);
      delay = 0;
    }
    if (effect === "none" || duration + delay <= 0) return nothing;
    let animation;
    try {
      animation = el.animate(
        [{ offset: options.exit ? 1 : 0, ...this.hiddenFrame(effect, spec.distance, spec.scale) }],
        { duration, delay, easing: spec.easing, fill: options.exit ? "forwards" : "backwards" }
      );
    } catch (error) {
      console.warn("Preview animation not started:", error);
      return nothing;
    }
    this.running.push(animation);
    return { animation, total: duration + delay };
  }

  // ---- Preview -----------------------------------------------------------------------------------------------------------------

  setupPreview(container) {
    this.el = {
      stage: container.querySelector("#animStage"),
      bar: container.querySelector("#animMockBar"),
      input: container.querySelector("#animMockInput"),
      clear: container.querySelector("#animMockClear"),
      panel: container.querySelector("#animMockPanel"),
      list: container.querySelector("#animMockList"),
      empty: container.querySelector("#animMockEmpty"),
      note: container.querySelector("#animPreviewNote"),
      play: container.querySelector("#animPreviewPlay"),
      emptyButton: container.querySelector("#animPreviewEmpty"),
    };
    if (!this.el.stage || !this.el.list) return;
    this.buildMock();
    this.el.play?.addEventListener("click", () => this.playPreview());
    this.el.emptyButton?.addEventListener("click", () => {
      this.showEmpty = !this.showEmpty;
      this.el.emptyButton.setAttribute("aria-pressed", String(this.showEmpty));
      this.playPreview();
    });
    // The clear button of the preview works like the real one: it shows while there is text
    const syncClear = () => this.el.clear.classList.toggle("visible", this.el.input.value !== "");
    this.el.input.addEventListener("input", syncClear);
    this.el.clear.addEventListener("click", () => {
      this.el.input.value = "";
      syncClear();
      this.el.input.focus();
    });
    syncClear();
  }

  buildMock() {
    const list = this.el.list;
    list.replaceChildren();
    ANIM_PREVIEW_GROUPS.forEach((group) => {
      const box = document.createElement("div");
      box.className = "anim-mock-group";
      const header = document.createElement("div");
      header.className = "anim-mock-group-header";
      const title = document.createElement("span");
      title.textContent = group.title;
      const count = document.createElement("span");
      count.className = "anim-mock-count";
      count.textContent = `${group.items.length} results`;
      header.append(title, count);
      box.appendChild(header);
      group.items.forEach((text) => {
        const item = document.createElement("div");
        item.className = "anim-mock-item";
        const icon = document.createElement("span");
        icon.className = "anim-mock-icon";
        const glyph = document.createElement("i");
        glyph.className = `fas ${group.icon}`;
        glyph.setAttribute("aria-hidden", "true");
        icon.appendChild(glyph);
        const label = document.createElement("span");
        label.textContent = text;
        item.append(icon, label);
        box.appendChild(item);
      });
      list.appendChild(box);
    });
  }

  schedulePreview(delay = 300) {
    clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => this.playPreview(), delay);
  }

  /** The variables of the small effects (hover, press, focus, clear button, icon) on the preview stage; as _applyAnimationFlagAndVars */
  applyStageVariables(mode) {
    const settings = this.settings();
    const base = this.core.getDefaultConfig().animations;
    const bar = settings.searchBar || {};
    const results = settings.results || {};
    const stage = this.el.stage;
    const fallback = this.number(settings.reducedMotion?.fallbackDuration, 100, 0, 1000);
    const set = (name, value) => stage.style.setProperty(name, value);
    const small = (value, fallbackMs) =>
      `${mode === "off" ? 0 : mode === "reduced" ? fallback : this.number(value, fallbackMs, 0, 5000)}ms`;
    set("--sp-ease", this.easingOf(settings.easing) || base.easing);
    set("--sp-hover-duration", small(results.hoverDuration, base.results.hoverDuration));
    set("--sp-icon-duration", small(results.iconHoverDuration, base.results.iconHoverDuration));
    set("--sp-focus-duration", small(bar.focusDuration, base.searchBar.focusDuration));
    set("--sp-clear-duration", small(bar.clearDuration, base.searchBar.clearDuration));
    if (mode === "full") {
      set(
        "--sp-hover-shift",
        `${-this.number(results.hoverLift, base.results.hoverLift, 0, 10)}px`
      );
      set(
        "--sp-press-scale",
        String(this.number(results.pressScale, base.results.pressScale, 90, 100) / 100)
      );
      set(
        "--sp-focus-grow",
        String(this.number(bar.focusGrow, base.searchBar.focusGrow, 100, 110) / 100)
      );
    } else {
      ["--sp-hover-shift", "--sp-press-scale", "--sp-focus-grow"].forEach((name) =>
        stage.style.removeProperty(name)
      );
    }
  }

  wait(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  finished(animation) {
    return animation ? animation.finished.catch(() => {}) : Promise.resolve();
  }

  stopPreview() {
    this.running.forEach((animation) => {
      try {
        animation.cancel();
      } catch (error) {
        console.warn("Could not stop a preview animation:", error);
      }
    });
    this.running = [];
  }

  /** Closes the preview bar, opens it again, then lets the results (or the nothing found message) come in */
  async playPreview() {
    if (!this.el || !this.el.stage || !document.body.contains(this.el.stage)) return;
    const token = ++this.previewToken;
    this.stopPreview();
    const mode = this.motionState();
    this.applyStageVariables(mode);
    const { bar, panel, list, empty, note } = this.el;
    const alive = () => token === this.previewToken;

    // Show the end state first: this is what the search looks like at rest
    bar.style.visibility = "visible";
    panel.style.visibility = "visible";
    list.hidden = this.showEmpty;
    empty.hidden = !this.showEmpty;
    if (note) {
      const limit = this.number(this.settings().results?.staggerLimit, 12, 1, 100);
      note.textContent =
        mode === "off"
          ? "Animations are off, so the search appears at once. Turn on Enable Animations to see the movement."
          : mode === "reduced"
            ? "Your device asks for less motion, so the preview shows the short fade that visitors with this setting see."
            : `The first ${limit} results move one after the other; the rest appear at once.`;
    }
    if (mode === "off") return;

    // 1 The bar leaves
    const closing = this.play(bar, "barClose", { exit: true });
    await this.finished(closing.animation);
    if (!alive()) return;
    bar.style.visibility = "hidden";
    panel.style.visibility = "hidden";
    this.stopPreview();
    await this.wait(200);
    if (!alive()) return;

    // 2 The bar opens
    bar.style.visibility = "visible";
    const opening = this.play(bar, "barOpen");
    await this.wait(opening.total + 120);
    if (!alive()) return;

    // 3 The results (or the message) come in
    panel.style.visibility = "visible";
    this.play(panel, "panel");
    if (this.showEmpty) {
      this.play(empty, "noResults");
      return;
    }
    list.querySelectorAll(".anim-mock-group").forEach((group) => this.play(group, "group"));
    const items = list.querySelectorAll(".anim-mock-item");
    const limit = this.number(this.settings().results?.staggerLimit, 12, 1, 100);
    const stagger = this.number(this.settings().results?.staggerDelay, 50, 0, 500);
    for (let index = 0; index < items.length && index < limit; index++) {
      this.play(items[index], "item", { delay: Math.min(index * stagger, 800) });
    }
  }

  /** The "Reset" button of the top bar puts every setting back; this page follows */
  resetToDefaults() {
    try {
      const defaults = this.core.getDefaultConfig();
      this.core.config.animations = JSON.parse(JSON.stringify(defaults.animations));
      const container = document.getElementById("animations-panel");
      if (container && container.dataset.loaded === "true") {
        this.core.populateForm(container);
        this.syncPage(container);
        this.schedulePreview(200);
      }
    } catch (error) {
      console.error("🚨 Error resetting the Animations tab:", error);
    }
  }

  // ---- Interface the core expects ------------------------------------------------------------------------------------------------

  getConfigSummary() {
    return { tab: "Animations", sections: { animations: this.core.config.animations || {} } };
  }

  cleanup() {
    clearTimeout(this.previewTimer);
    this.stopPreview();
    if (this.replacedListener)
      document.removeEventListener("controlPanelConfigReplaced", this.replacedListener);
    if (this.tabListener) document.removeEventListener("tabChanged", this.tabListener);
    this.replacedListener = this.tabListener = null;
  }

  updateConfigFromForm(container) {
    try {
      container.querySelectorAll("[name]").forEach((input) => {
        const name = input.getAttribute("name");
        if (!name || input.dataset.blocked) return;
        let value;
        if (input.type === "checkbox") value = input.checked;
        else if (input.type === "number") value = input.value === "" ? null : Number(input.value);
        else value = String(input.value).trim();
        if (value === null) return;
        this.core.safeSetNestedProperty(this.core.config, name, value);
      });
    } catch (error) {
      console.error("🚨 Error updating config from the Animations tab form:", error);
    }
  }
}

// Export for module use
if (typeof module !== "undefined" && module.exports) {
  module.exports = AnimationsTabHandler;
} else {
  window.AnimationsTabHandler = AnimationsTabHandler;
}
