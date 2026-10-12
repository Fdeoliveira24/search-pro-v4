/**
 * Search Pro Control Panel - Display Tab Handler
 * Version 4.5 - Last Update on 10/10/2026
 * Handles everything specific to the Display tab: what a result shows, pictures, icons, the Element Types table with its shared
 * icon picker, and the names for unnamed items.
 *
 * One change travels one road: the field -> core.onFormChange (it saves the value and sends it to an open tour). This handler
 * only adds what a plain field cannot do: the switches that hide the settings they control, the table columns that follow those
 * switches, the icon picker, checks that explain a value that cannot be used, and "Restore Defaults" for every section.
 *
 * Sections of the page (data-section-key, also the data-section of each "Restore Defaults" button):
 *   resultsShow   What Results Show   display.* (parts of a result, row spacing, description lines)
 *   order         Order of Results    display.typeOrder (the order of the groups; a list with Move Up / Move Down, no named field)
 *   pictures      Pictures            thumbnailSettings.* (master switch enableThumbnails)
 *   icons         Icons               display.showIconsInResults (master switch) and thumbnailSettings.iconSettings.*
 *   elementTypes  Element Types       one table: names, picture, size, placeholder file, icon, custom icon of each element type
 *   unnamedItems  Unnamed Items       useAsLabel.*
 */

// The icon fonts of the picker (the tour loads the same libraries, see "Icon libraries" in search-v4.js) and how their classes start
const FONT_ICON_SETS = {
  fontawesome: { label: "Font Awesome", test: /^(fa-|fas |far |fab |fal |fad |fa )/ },
  bootstrap: { label: "Bootstrap Icons", test: /^bi( |-)/ },
  ionicons: { label: "Ionicons", test: /^ion-(ios|md|logo)-/ },
};

// The kinds of result in the plugin's default order: the type the plugin uses, the name used in the Control Panel (as in Content),
// and the Content switch that decides whether the kind is searched at all
const RESULT_KINDS = [
  ["Panorama", "Panorama", "includePanoramas"],
  ["Video360", "360 Video", "include360Videos"],
  ["FlatVideo", "Flat Video", "includeFlatVideos"],
  ["Hotspot", "Hotspot", "includeHotspots"],
  ["Polygon", "Polygon", "includePolygons"],
  ["Video", "Video", "includeVideos"],
  ["Webframe", "Webframe", "includeWebframes"],
  ["Image", "Image", "includeImages"],
  ["Text", "Text", "includeText"],
  ["ProjectedImage", "Projected Image", "includeProjectedImages"],
  ["3DModel", "3D Model", "include3DModels"],
  ["3DHotspot", "3D Hotspot", "include3DHotspots"],
  ["Element", "Other Elements", "includeElements"],
  ["Container", "Container", "includeContainers"],
  ["Audio", "Audio", "includeAudio"],
  ["Album", "Photo Album", "includeAlbums"],
  ["Map", "Map", "includeMaps"],
  ["3DModelObject", "3D Model Object", "include3DModelObjects"],
];

class DisplayTabHandler {
  constructor() {
    this.core = null;
    this.tabId = "display";
    this.container = null;
    this.picker = { type: null, label: "", mode: "fontawesome", button: null, lists: {} };

    // The settings each "Restore Defaults" button puts back
    const icon = "thumbnailSettings.iconSettings.";
    this.sectionPaths = {
      resultsShow: [
        "display.showGroupHeaders",
        "display.showGroupCount",
        "display.showTagsInResults",
        "display.showSubtitlesInResults",
        "display.onlySubtitles",
        "display.showParentInfo",
        "display.rowSpacing",
        "display.descriptionLines",
      ],
      order: ["display.typeOrder"],
      pictures: [
        "thumbnailSettings.enableThumbnails",
        "thumbnailSettings.useTourPictures",
        "thumbnailSettings.useParentPictures",
        "thumbnailSettings.thumbnailSize",
        "thumbnailSettings.borderRadius",
        "thumbnailSettings.borderWidth",
        "thumbnailSettings.borderColor",
        "thumbnailSettings.shape",
        "thumbnailSettings.fit",
        "thumbnailSettings.position",
        "thumbnailSettings.alignment",
        "thumbnailSettings.typeBadge",
        "thumbnailSettings.badge",
        "thumbnailSettings.mobile",
        "thumbnailSettings.placeholder",
        "thumbnailSettings.hoverZoom",
      ],
      icons: [
        "display.showIconsInResults",
        `${icon}enableCustomIcons`,
        `${icon}iconSize`,
        `${icon}iconColor`,
        `${icon}iconOpacity`,
        `${icon}iconAlignment`,
        `${icon}iconMargin`,
        `${icon}iconBorderRadius`,
        `${icon}enableIconHover`,
        `${icon}iconHoverScale`,
        `${icon}iconHoverOpacity`,
      ],
      elementTypes: [
        "thumbnailSettings.sizeByType",
        "thumbnailSettings.showFor",
        "thumbnailSettings.defaultImages",
        `${icon}showIconFor`,
        `${icon}customIcons`,
        "displayLabels",
      ],
      unnamedItems: ["useAsLabel"],
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
      this.core.setupColorFields(container);
      this.core.setupRangeFields(container);
      this.setupSizeWarnings(container);
      this.setupResetButtons(container);
      this.setupIconPicker(container);
      this.setupOrderList(container);

      // The switches that hide settings, and everything that depends on another field, follow every change and every fill
      container.addEventListener("change", () => this.syncControls(container));
      container.addEventListener("formpopulated", () => this.syncControls(container));
      container.addEventListener("change", (event) => this.onCustomIconsChanged(event));

      this.populate(container);
      this.validateForm(container);
    } catch (error) {
      console.error("❌ Error initializing the Display tab:", error);
    }
  }

  /**
   * Fill the page from the saved settings. Settings that an older file does not have yet get their defaults; the switches and
   * file fields that carry the older field names are filled from the plugin's names.
   */
  populate(container = this.container) {
    try {
      const core = this.core;
      const config = core.config;
      const defaults = core.getDefaultConfig();

      const settings = config.thumbnailSettings || (config.thumbnailSettings = {});
      const pictureDefaults = defaults.thumbnailSettings || {};
      ["badge", "mobile", "placeholder", "sizeByType", "hoverZoom", "showFor"].forEach((key) => {
        settings[key] = { ...(pictureDefaults[key] || {}), ...(settings[key] || {}) };
      });
      [
        "typeBadge",
        "useTourPictures",
        "useParentPictures",
        "shape",
        "fit",
        "position",
        "alignment",
      ].forEach((key) => {
        if (settings[key] === undefined) settings[key] = pictureDefaults[key];
      });
      if (settings.typeBadge === true) settings.typeBadge = "all";
      if (settings.typeBadge === false) settings.typeBadge = "none";

      const iconDefaults = pictureDefaults.iconSettings || {};
      const icons = settings.iconSettings || {};
      settings.iconSettings = {
        ...iconDefaults,
        ...icons,
        showIconFor: { ...(iconDefaults.showIconFor || {}), ...(icons.showIconFor || {}) },
        customIcons: { ...(iconDefaults.customIcons || {}), ...(icons.customIcons || {}) },
      };

      config.display = { ...(defaults.display || {}), ...(config.display || {}) };
      config.useAsLabel = { ...(defaults.useAsLabel || {}), ...(config.useAsLabel || {}) };
      config.displayLabels = { ...(defaults.displayLabels || {}), ...(config.displayLabels || {}) };

      core.mirrorFromPluginNames();
      core.populateForm(container);
      this.renderOrder(container);

      // populateForm leaves a field alone when there is no value: those two kinds go back to their own default
      container.querySelectorAll('[name^="thumbnailSettings.sizeByType."]').forEach((field) => {
        const value = core.getNestedProperty(config, field.name);
        field.value = value ? String(value) : "";
      });
      container.querySelectorAll('[name^="thumbnails.defaults."]').forEach((field) => {
        const value = core.getNestedProperty(config, field.name);
        field.value = value ? core.stripAssetPrefix(String(value)) : field.defaultValue;
      });

      this.syncControls(container);
    } catch (error) {
      console.error("🚨 Error filling the Display tab:", error);
    }
  }

  // ------------------------------------------------------------------------------------------------ what depends on what

  /**
   * Hide what a switch controls, put the table columns in step with their switches and dim a setting that has no effect now
   */
  syncControls(container = this.container) {
    if (!container) return;
    try {
      this.core.syncHexBoxes(container);
      container.querySelectorAll('input[type="range"]').forEach((range) => {
        const display = range.parentNode.querySelector(".range-value");
        if (display) display.textContent = range.value;
      });

      // Blocks that only show while their switch is on
      container.querySelectorAll("[data-needs]").forEach((block) => {
        const master = container.querySelector(`#${block.dataset.needs}`);
        block.hidden = !(master && master.checked);
      });

      const on = (id) => {
        const field = container.querySelector(`#${id}`);
        return !!(field && field.checked);
      };
      const pictures = on("enableThumbnails");
      const icons = on("showIconsInResults");
      const custom = icons && on("enableCustomIcons");

      // The table keeps every column; a column whose switch is off is greyed and locked (its values stay saved)
      const table = container.querySelector("#typeTable");
      if (table) {
        table.dataset.pictures = pictures ? "on" : "off";
        table.dataset.icons = icons ? "on" : "off";
        table.dataset.customIcons = custom ? "on" : "off";
        const active = { pictures, icons, custom };
        table.querySelectorAll("[data-col-group]").forEach((cell) => {
          const open = !!active[cell.dataset.colGroup];
          cell.classList.toggle("is-off", !open);
          cell.querySelectorAll("input, select, button").forEach((control) => {
            control.disabled = !open;
            if (control.classList.contains("icon-pick-button")) {
              control.title = open
                ? ""
                : "Turn on Show Icons in Results and Use Custom Icons in Icons first";
            }
          });
        });
        const setBand = (name, state, text) => {
          const band = table.querySelector(`[data-band-state="${name}"]`);
          if (!band) return;
          band.dataset.state = state;
          band.textContent = text;
        };
        setBand("pictures", pictures ? "on" : "off", pictures ? "On" : "Off");
        setBand(
          "icons",
          !icons ? "off" : custom ? "on" : "partial",
          !icons ? "Off" : custom ? "On" : "On, custom icons off"
        );
      }

      // The look of the icon on a picture matters only when an icon is shown on the picture
      const badge = container.querySelector("#thumbTypeBadge");
      container.querySelectorAll("[data-badge-group] .form-group").forEach((group, index) => {
        if (index > 0) group.classList.toggle("inactive", !badge || badge.value === "none");
      });

      // Add the Element Type needs the name of the panorama
      const withType = container.querySelector("[data-requires-parent]");
      if (withType) {
        withType.closest(".form-group").classList.toggle("inactive", !on("useParentLabel"));
      }

      // With the subtitle used as the name, the subtitle line under the name is not drawn at all
      const onlySubtitles = container.querySelector("#onlySubtitles");
      const subtitleLine = container.querySelector("#showSubtitlesInResults");
      if (onlySubtitles && subtitleLine) {
        subtitleLine.closest(".form-group").classList.toggle("inactive", onlySubtitles.checked);
      }

      this.syncIconButtons(container);
    } catch (error) {
      console.error("🚨 Error putting the Display controls in step:", error);
    }
  }

  /**
   * Turning custom icons off closes the icon picker (its buttons are locked then)
   */
  onCustomIconsChanged(event) {
    const target = event.target;
    if (
      !target ||
      (target.id !== "enableCustomIcons" && target.id !== "showIconsInResults") ||
      target.checked
    )
      return;
    if (!this.picker.button) return;
    this.closeIconPicker();
  }

  /**
   * A large corner radius or a thick border is allowed but worth a word
   */
  setupSizeWarnings(container) {
    const limits = [
      ["thumbnailBorderRadius", 35, "A large corner radius can look odd on small pictures."],
      ["thumbnailBorderWidth", 5, "A thick border can hide part of a small picture."],
    ];
    limits.forEach(([id, limit, message]) => {
      const field = container.querySelector(`#${id}`);
      if (!field) return;
      field.addEventListener("input", () => {
        if (Number(field.value) > limit && window.showValidationMessage) {
          window.showValidationMessage(field, "warning", message, 3000);
        }
      });
    });
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
        return "";
      }
      if (name && name.startsWith("thumbnails.defaults.")) {
        const text = String(value || "").trim();
        if (
          text &&
          !/^(https?:)?\/\//i.test(text) &&
          !/\.(jpe?g|png|gif|webp|svg|avif)$/i.test(text)
        ) {
          return "Enter a file name such as my-picture.jpg (.jpg, .jpeg, .png, .gif, .webp or .svg).";
        }
      }
    } catch (error) {
      console.error("🚨 Error checking a Display field:", error);
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

  validateForm(container = document) {
    try {
      let valid = true;
      container.querySelectorAll("[name]").forEach((input) => {
        if (input.type === "checkbox" || input.type === "hidden") return;
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
      console.error("🚨 Error validating the Display tab:", error);
      return false;
    }
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
      if (key === "elementTypes") {
        // the fields of the table carry the older names: rebuild them from the restored plugin settings
        this.core.config.displayElements = { showFor: {} };
        this.core.config.thumbnails = { ...(this.core.config.thumbnails || {}), defaults: {} };
        this.closeIconPicker();
      }
      const container = this.container || document.getElementById("display-panel");
      container.querySelectorAll(`[data-section-key="${key}"] .error`).forEach((field) => {
        field.classList.remove("error");
        delete field.dataset.blocked;
        if (field.id && window.clearValidationMessage) window.clearValidationMessage(field.id);
      });
      this.populate(container);
      this.core.applyLivePreview(paths[0], this.core.getNestedProperty(this.core.config, paths[0]));
      return true;
    } catch (error) {
      console.error("🚨 Error restoring a Display section:", error);
      return false;
    }
  }

  /**
   * "Reset All" of the Control Panel
   */
  resetToDefaults() {
    Object.keys(this.sectionPaths).forEach((key) => this.restoreSection(key));
  }

  // ------------------------------------------------------------------------------------------------ order of results

  /**
   * The order of the groups as saved, completed with the kinds it leaves out (in their default place) and without names that are
   * no kind: the same reading the plugin does
   */
  currentOrder() {
    const known = RESULT_KINDS.map((kind) => kind[0]);
    const saved = Array.isArray(this.core.config.display?.typeOrder)
      ? this.core.config.display.typeOrder
      : [];
    const order = [];
    saved.forEach((type) => {
      if (known.includes(type) && !order.includes(type)) order.push(type);
    });
    known.forEach((type) => {
      if (!order.includes(type)) order.push(type);
    });
    return order;
  }

  /**
   * Draw the list: position, the name visitors see for the kind (Element Types), a note when Content switches the kind off, and
   * Move Up / Move Down
   */
  renderOrder(container = this.container) {
    try {
      const list = container && container.querySelector("#resultOrderList");
      if (!list) return;
      const config = this.core.config;
      const order = this.currentOrder();
      const kinds = Object.fromEntries(RESULT_KINDS.map((kind) => [kind[0], kind]));
      list.textContent = "";
      order.forEach((type, index) => {
        const [, kindName, switchKey] = kinds[type];
        const shown = (config.displayLabels && config.displayLabels[type]) || kindName;
        const off = config.includeContent?.elements?.[switchKey] === false;

        const item = document.createElement("li");
        item.className = `order-item${off ? " is-off" : ""}`;

        const position = document.createElement("span");
        position.className = "order-position";
        position.textContent = String(index + 1);

        const name = document.createElement("span");
        name.className = "order-name";
        name.textContent = shown;
        if (shown !== kindName) {
          const note = document.createElement("span");
          note.className = "order-note";
          note.textContent = `(${kindName})`;
          name.appendChild(note);
        }
        if (off) {
          const note = document.createElement("span");
          note.className = "order-note";
          note.textContent = "Switched off in Content";
          name.appendChild(note);
        }

        const buttons = document.createElement("span");
        buttons.className = "order-buttons";
        [
          ["up", "Up", "fa-arrow-up", index === 0],
          ["down", "Down", "fa-arrow-down", index === order.length - 1],
        ].forEach(([direction, word, icon, disabled]) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "order-move";
          button.dataset.kind = type;
          button.dataset.move = direction;
          button.disabled = disabled;
          button.title = `Move ${word}`;
          button.setAttribute("aria-label", `Move ${shown} ${word}`);
          const glyph = document.createElement("i");
          glyph.className = `fas ${icon}`;
          glyph.setAttribute("aria-hidden", "true");
          button.appendChild(glyph);
          buttons.appendChild(button);
        });

        item.append(position, name, buttons);
        list.appendChild(item);
      });
    } catch (error) {
      console.error("🚨 Error drawing the order of results:", error);
    }
  }

  setupOrderList(container) {
    const list = container.querySelector("#resultOrderList");
    if (!list) return;
    list.addEventListener("click", (event) => {
      const button = event.target.closest(".order-move");
      if (!button || button.disabled) return;
      this.moveKind(button.dataset.kind, button.dataset.move === "up" ? -1 : 1);
    });
    // The names come from Element Types (this tab) and the notes from Content (another tab): follow both
    container.addEventListener("change", (event) => {
      if (event.target.name && event.target.name.startsWith("displayLabels.")) this.renderOrder();
    });
    this.onContentChange = (event) => {
      const name = event.target && event.target.name;
      if (name && name.startsWith("includeContent.elements.")) this.renderOrder();
    };
    document.addEventListener("change", this.onContentChange);
  }

  /**
   * Move one kind one place up or down, save it, send it to an open tour and say so for screen readers
   */
  moveKind(type, step) {
    const order = this.currentOrder();
    const from = order.indexOf(type);
    const to = from + step;
    if (from < 0 || to < 0 || to >= order.length) return;
    order.splice(to, 0, order.splice(from, 1)[0]);
    this.core.safeSetNestedProperty(this.core.config, "display.typeOrder", order);
    this.core.applyLivePreview("display.typeOrder", order);
    this.renderOrder();

    const container = this.container;
    const list = container.querySelector("#resultOrderList");
    const wanted = list.querySelector(
      `.order-move[data-kind="${type}"][data-move="${step < 0 ? "up" : "down"}"]`
    );
    const other = list.querySelector(
      `.order-move[data-kind="${type}"][data-move="${step < 0 ? "down" : "up"}"]`
    );
    (wanted && !wanted.disabled ? wanted : other)?.focus();
    const status = container.querySelector("#resultOrderStatus");
    if (status) {
      const shown =
        (this.core.config.displayLabels && this.core.config.displayLabels[type]) || type;
      status.textContent = `${shown} is now number ${to + 1} of ${order.length}`;
    }
  }

  // ------------------------------------------------------------------------------------------------ the icon picker

  panel() {
    return this.container && this.container.querySelector("#iconPickerPanel");
  }

  setupIconPicker(container) {
    const panel = container.querySelector("#iconPickerPanel");
    if (!panel) return;

    container.querySelectorAll(".icon-pick-button").forEach((button) => {
      button.addEventListener("click", () => this.openIconPicker(button));
    });
    panel.querySelectorAll(".icon-picker-tab").forEach((tab) => {
      tab.addEventListener("click", () => this.setPickerMode(tab.dataset.mode));
    });
    const render = () => this.renderPickerResults();
    panel.querySelector("#iconPickerSearch").addEventListener("input", render);
    panel.querySelector("#iconPickerGroup").addEventListener("change", render);
    panel.querySelector("#iconPickerNewest").addEventListener("change", render);
    panel.querySelector("#iconPickerGrid").addEventListener("click", (event) => {
      const option = event.target.closest(".icon-picker-option");
      if (option) this.chooseIcon(option.dataset.icon);
    });
    panel.querySelector("#iconPickerClose").addEventListener("click", () => this.closeIconPicker());
    panel.querySelector("#iconPickerDone").addEventListener("click", () => this.closeIconPicker());
    panel
      .querySelector("#iconPickerDefault")
      .addEventListener("click", () => this.resetToStandardIcon());
    panel
      .querySelector("#iconPickerImageRemove")
      .addEventListener("click", () => this.resetToStandardIcon());

    const image = panel.querySelector("#iconPickerImage");
    image.addEventListener("input", () => this.previewPickerImage());
    panel.querySelector("#iconPickerImageClear").addEventListener("click", () => {
      this.clearPickerImage();
      image.focus();
    });
    panel.querySelector("#iconPickerImageApply").addEventListener("click", () => {
      const url = image.value.trim();
      if (url) this.chooseIcon(url);
    });
    panel.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.closeIconPicker();
    });
  }

  /**
   * Which kind a saved icon is: an icon font ("fontawesome", "bootstrap", "ionicons"), "image", "emoji", or "" when empty
   */
  iconKind(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    const font = Object.keys(FONT_ICON_SETS).find((id) => FONT_ICON_SETS[id].test.test(text));
    if (font) return font;
    if (/^(https?:)?\/\//i.test(text) || /\.(png|jpe?g|gif|svg|webp)(\?.*)?$/i.test(text))
      return "image";
    return "emoji";
  }

  /**
   * Draw an icon (an icon font class, an emoji or a picture address) inside an element
   */
  drawIcon(element, value) {
    element.textContent = "";
    const kind = this.iconKind(value);
    if (FONT_ICON_SETS[kind]) {
      const glyph = document.createElement("i");
      glyph.className = String(value);
      glyph.setAttribute("aria-hidden", "true");
      element.appendChild(glyph);
    } else if (kind === "image") {
      const picture = document.createElement("img");
      picture.src = String(value);
      picture.alt = "";
      element.appendChild(picture);
    } else {
      element.textContent = String(value || "");
    }
  }

  savedIcon(type) {
    return (
      this.core.getNestedProperty(
        this.core.config,
        `thumbnailSettings.iconSettings.customIcons.${type}`
      ) || ""
    );
  }

  standardIcon(type) {
    return (
      this.core.getNestedProperty(
        this.core.getDefaultConfig(),
        `thumbnailSettings.iconSettings.customIcons.${type}`
      ) || ""
    );
  }

  syncIconButtons(container = this.container) {
    container.querySelectorAll(".icon-pick-button").forEach((button) => {
      const preview = button.querySelector(".icon-pick-preview");
      if (preview) this.drawIcon(preview, this.savedIcon(button.dataset.iconType));
    });
  }

  /**
   * A short description of an icon for the "Current Icon" row
   */
  describeIcon(value) {
    const kind = this.iconKind(value);
    if (!kind) return "No icon";
    if (FONT_ICON_SETS[kind])
      return `${FONT_ICON_SETS[kind].label}: ${String(value).trim().split(/\s+/).pop()}`;
    if (kind === "image") return `Picture: ${String(value).split("?")[0].split("/").pop()}`;
    const name =
      window.EmojiLibrary && window.EmojiLibrary.nameOf ? window.EmojiLibrary.nameOf(value) : "";
    return name ? `Emoji: ${value} ${name}` : `Emoji: ${value}`;
  }

  /**
   * The "Current Icon" row: what the type shows now, and the way back to the standard icon
   */
  renderPickerCurrent() {
    const panel = this.panel();
    const type = this.picker.type;
    if (!panel || !type) return;
    const value = this.savedIcon(type);
    const standard = this.standardIcon(type);
    this.drawIcon(panel.querySelector("#iconPickerCurrentPreview"), value);
    panel.querySelector("#iconPickerCurrentDetail").textContent =
      this.describeIcon(value) + (value && value === standard ? " (the standard icon)" : "");
    panel.querySelector("#iconPickerDefault").disabled = !standard || value === standard;
    panel.querySelector("#iconPickerImageRemove").hidden = this.iconKind(value) !== "image";
  }

  openIconPicker(button) {
    const panel = this.panel();
    if (!panel) return;
    this.picker.button = button;
    this.picker.type = button.dataset.iconType;
    this.picker.label = button.dataset.typeLabel || this.picker.type;
    panel.querySelector("#iconPickerTitle").textContent = `Icon for ${this.picker.label}`;
    panel.hidden = false;
    const current = this.savedIcon(this.picker.type);
    this.setPickerMode(this.iconKind(current) || "fontawesome");
    this.renderPickerCurrent();
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    if (this.picker.mode !== "image") panel.querySelector("#iconPickerSearch").focus();
  }

  closeIconPicker() {
    const panel = this.panel();
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    const button = this.picker.button;
    this.picker.button = null;
    if (button) button.focus();
  }

  setPickerMode(mode) {
    const panel = this.panel();
    this.picker.mode = mode;
    panel.querySelectorAll(".icon-picker-tab").forEach((tab) => {
      tab.setAttribute("aria-selected", tab.dataset.mode === mode ? "true" : "false");
    });
    panel.querySelector('[data-mode-panel="icons"]').hidden = mode === "image";
    panel.querySelector('[data-mode-panel="image"]').hidden = mode !== "image";
    panel.querySelectorAll("[data-only-mode]").forEach((control) => {
      control.hidden = control.dataset.onlyMode !== mode;
    });
    const search = panel.querySelector("#iconPickerSearch");
    search.placeholder =
      mode === "emoji"
        ? "Search emojis, for example smile or house"
        : "Search icons, for example home or camera";
    if (mode === "emoji") this.fillEmojiGroups();
    if (mode === "image") {
      const current = this.savedIcon(this.picker.type);
      panel.querySelector("#iconPickerImage").value =
        this.iconKind(current) === "image" ? current : "";
      this.previewPickerImage();
    } else {
      this.renderPickerResults();
    }
  }

  fillEmojiGroups() {
    const select = this.panel().querySelector("#iconPickerGroup");
    const library = window.EmojiLibrary;
    if (select.options.length || !library || !library.groups) return;
    select.add(new Option("All Groups", "-1"));
    library.groups.forEach((name, index) => select.add(new Option(name, String(index))));
  }

  /**
   * The names of an icon set as full classes (cached): Font Awesome has its own list, the others are a prefix and names
   */
  iconsOfSet(mode) {
    if (this.picker.lists[mode]) return this.picker.lists[mode];
    let list = [];
    if (mode === "fontawesome") {
      const library = window.FontAwesomeIcons || {};
      list = [...(library.solid || []), ...(library.regular || []), ...(library.brands || [])];
    } else if (window.IconLibraries && window.IconLibraries[mode]) {
      const set = window.IconLibraries[mode];
      list = set.names.split(" ").map((name) => set.prefix + name);
    }
    this.picker.lists[mode] = list;
    return list;
  }

  /**
   * The icons that match the search words, at most 400 at a time (typing narrows them down)
   */
  renderPickerResults() {
    const panel = this.panel();
    const grid = panel.querySelector("#iconPickerGrid");
    const term = panel.querySelector("#iconPickerSearch").value.trim().toLowerCase();
    const mode = this.picker.mode;
    let list = []; // { icon, title }
    let missing = false;
    if (mode === "emoji") {
      const library = window.EmojiLibrary;
      if (library && library.find) {
        list = library
          .find({
            query: term,
            group: Number(panel.querySelector("#iconPickerGroup").value || -1),
            newest: panel.querySelector("#iconPickerNewest").checked,
          })
          .map((entry) => ({ icon: entry.emoji, title: entry.name }));
      } else {
        missing = true;
      }
    } else {
      const all = this.iconsOfSet(mode);
      missing = all.length === 0;
      const aliases = (window.FontAwesomeIcons && window.FontAwesomeIcons.aliases) || {};
      const nameOf = (icon) => icon.split(" ").pop();
      let found = all;
      if (term) {
        // icons whose own name matches come first, then the ones that only have the word as another name
        const named = all.filter((icon) => nameOf(icon).includes(term));
        const other =
          mode === "fontawesome"
            ? all.filter(
                (icon) => !nameOf(icon).includes(term) && (aliases[icon] || "").includes(term)
              )
            : [];
        found = named.concat(other);
      }
      list = found.map((icon) => ({ icon, title: nameOf(icon) }));
    }
    const shown = list.slice(0, 400);
    const current = this.savedIcon(this.picker.type);
    const fragment = document.createDocumentFragment();
    shown.forEach(({ icon, title }) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "icon-picker-option" + (icon === current ? " selected" : "");
      option.dataset.icon = icon;
      option.setAttribute("role", "option");
      option.setAttribute("aria-label", `Use ${title}`);
      option.title = title;
      this.drawIcon(option, icon);
      fragment.appendChild(option);
    });
    grid.textContent = "";
    grid.appendChild(fragment);
    panel.querySelector("#iconPickerCount").textContent = missing
      ? "This icon set could not be loaded."
      : list.length
        ? list.length > shown.length
          ? `Showing ${shown.length} of ${list.length}. Type to narrow them down.`
          : `${list.length} icons.`
        : "Nothing matches. Try another word.";
  }

  previewPickerImage() {
    const panel = this.panel();
    const preview = panel.querySelector("#iconPickerImagePreview");
    const apply = panel.querySelector("#iconPickerImageApply");
    const url = panel.querySelector("#iconPickerImage").value.trim();
    apply.disabled = true;
    if (!/^https?:\/\/.+\.(png|jpe?g|gif|svg|webp)(\?.*)?$/i.test(url)) {
      preview.textContent = url
        ? "Enter the full address of a picture that ends with .png, .jpg, .gif, .svg or .webp."
        : "The picture shows here";
      return;
    }
    preview.textContent = "Loading...";
    const picture = new Image();
    picture.onload = () => {
      if (panel.querySelector("#iconPickerImage").value.trim() !== url) return; // the address changed meanwhile
      preview.textContent = "";
      preview.appendChild(picture);
      apply.disabled = false;
    };
    picture.onerror = () => {
      if (panel.querySelector("#iconPickerImage").value.trim() === url) {
        preview.textContent = "That picture could not be loaded. Check the address.";
      }
    };
    picture.src = url;
  }

  /**
   * Empty the address box and the picture preview (what is saved stays until another icon is chosen)
   */
  clearPickerImage() {
    this.panel().querySelector("#iconPickerImage").value = "";
    this.previewPickerImage();
  }

  /**
   * Give the open type its standard icon again, empty the picture box and show the kind of tab the standard icon belongs to
   */
  resetToStandardIcon() {
    const standard = this.standardIcon(this.picker.type);
    if (!standard) return;
    this.chooseIcon(standard);
    this.clearPickerImage();
    this.setPickerMode(this.iconKind(standard) || "fontawesome");
  }

  /**
   * Save the icon of the open type, show it in its row and the "Current Icon" row, and send it to an open tour
   */
  chooseIcon(value) {
    try {
      const type = this.picker.type;
      if (!type) return;
      const path = `thumbnailSettings.iconSettings.customIcons.${type}`;
      this.core.safeSetNestedProperty(this.core.config, path, value);
      this.core.applyLivePreview(path, value);
      this.syncControls(this.container);
      this.renderPickerCurrent();
      this.container.querySelectorAll("#iconPickerGrid .icon-picker-option").forEach((option) => {
        option.classList.toggle("selected", option.dataset.icon === value);
      });
    } catch (error) {
      console.error("🚨 Error choosing an icon:", error);
    }
  }

  // ------------------------------------------------------------------------------------------------ Apply, summary, cleanup

  /**
   * Update config from the form (Apply Settings, Download): a field with a problem keeps its last good value
   */
  updateConfigFromForm(container = document) {
    try {
      container.querySelectorAll("[name]").forEach((input) => {
        const name = input.getAttribute("name");
        if (!name) return;
        let value;
        if (input.type === "checkbox") value = input.checked;
        else if (input.type === "number" || input.type === "range")
          value = input.value === "" ? null : parseFloat(input.value);
        else value = input.value;
        if (typeof value === "string" && this.core.isThumbnailAssetField(name))
          value = this.core.ensureAssetPrefix(value);
        if (this.getFieldProblem(name, value === null ? "" : value, input)) return;
        this.core.safeSetNestedProperty(this.core.config, name, value);
        this.core.mirrorToPluginNames(name, value);
      });
    } catch (error) {
      console.error("🚨 Error updating config from the Display tab:", error);
    }
  }

  getConfigSummary() {
    try {
      const config = this.core.config;
      return {
        tab: "Display",
        sections: {
          display: config.display,
          order: config.display?.typeOrder,
          pictures: {
            enableThumbnails: config.thumbnailSettings?.enableThumbnails,
            thumbnailSize: config.thumbnailSettings?.thumbnailSize,
            shape: config.thumbnailSettings?.shape,
          },
          icons: {
            showIconsInResults: config.display?.showIconsInResults,
            enableCustomIcons: config.thumbnailSettings?.iconSettings?.enableCustomIcons,
            iconSize: config.thumbnailSettings?.iconSettings?.iconSize,
          },
          elementTypes: {
            displayLabels: config.displayLabels,
            showFor: config.thumbnailSettings?.showFor,
          },
          unnamedItems: config.useAsLabel,
        },
      };
    } catch (error) {
      console.error("🚨 Error getting the Display tab summary:", error);
      return null;
    }
  }

  cleanup() {
    this.picker = { type: null, label: "", mode: "fontawesome", button: null };
    if (this.onContentChange) document.removeEventListener("change", this.onContentChange);
  }
}

// Export for module use
if (typeof module !== "undefined" && module.exports) {
  module.exports = DisplayTabHandler;
} else {
  window.DisplayTabHandler = DisplayTabHandler;
}
