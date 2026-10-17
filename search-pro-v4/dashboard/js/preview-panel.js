/**
 * Live Preview panel
 * Version 4.6 - Last Update on 10/12/2026 - New interface, Live Preview: the panel on the right with the real search on a sample tour
 *
 * The panel holds an iframe (preview/preview.html) that runs the real search plugin on a sample tour. Settings reach it the way
 * they reach any open tour: the Control Panel stores its settings under "searchProLiveConfig" on every change and the plugin,
 * which listens to the browser's storage event, applies them. This file only
 *  - opens and closes the panel (header button, close button, Escape, Alt+Shift+P) and remembers whether it was open,
 *  - sends the settings the panel shows once when the page is ready (a stored copy may not exist yet),
 *  - sends the state of the preview (Desktop / Phone, Results / Nothing Found / Empty Field, Focus Ring) as one message per change,
 *  - says what the preview shows now, and that a Focus Ring with a width of 0 shows nothing,
 *  - is not there on a phone-sized window (the preview is for tablets and desktops),
 *  - sizes the frame: Desktop shows the plugin in a wide page scaled down to fit, Phone shows it at its real width.
 * It never copies the settings and never changes one.
 */

class PreviewPanel {
  constructor() {
    this.panel = document.getElementById("previewPanel");
    this.slot = document.getElementById("headerPreviewSlot");
    this.toggle = document.getElementById("previewToggle");
    this.closeButton = document.getElementById("previewClose");
    this.stage = document.getElementById("previewStage");
    this.device = document.getElementById("previewDevice");
    this.frame = document.getElementById("previewFrame");
    this.focusButton = document.getElementById("previewFocus");
    this.caption = document.getElementById("previewCaption");
    this.note = document.getElementById("previewFocusNote");
    this.rules = document.getElementById("previewFrameRules");
    this.handle = document.getElementById("previewResize");
    this.storageKey = "searchProPreviewPanel";
    this.baseWidth = 440; // the width of the panel (it can be dragged wider to see a desktop page larger)
    this.width = this.baseWidth;
    this.pushQuery = window.matchMedia("(min-width: 1280px)");
    this.phoneQuery = window.matchMedia("(max-width: 639px)"); // no preview on a phone-sized window
    this.state = { mode: "results", focus: false, device: "desktop" };
    this.open = false;
    this.ready = false; // the page in the frame has told us it has built its index
    this.loaded = false; // the frame has been given its address
    this.layoutTimer = null;
    if (!this.panel || !this.toggle || !this.frame) return;
    this.init();
  }

  // ---------------------------------------------------------------------------
  // Start
  // ---------------------------------------------------------------------------
  init() {
    const saved = this.readSaved();
    if (saved) {
      if (saved.device === "phone") this.state.device = "phone";
      if (saved.mode === "none" || saved.mode === "empty") this.state.mode = saved.mode;
      if (saved.typed === false) this.state.mode = "empty"; // an older copy had a separate switch for the typed text
      if (saved.focus === true) this.state.focus = true;
      if (Number.isFinite(saved.width)) this.width = saved.width;
    }
    this.reflectState();
    if (this.slot) this.slot.hidden = false;

    this.toggle.addEventListener("click", () => this.setOpen(!this.open));
    this.closeButton.addEventListener("click", () => this.setOpen(false, true));

    this.panel.querySelectorAll("[data-device]").forEach((button) => {
      if (button.tagName !== "BUTTON") return;
      button.addEventListener("click", () => this.setState({ device: button.dataset.device }));
    });
    this.panel.querySelectorAll("[data-mode]").forEach((button) => {
      button.addEventListener("click", () => this.setState({ mode: button.dataset.mode }));
    });
    this.focusButton.addEventListener("click", () => this.setState({ focus: !this.state.focus }));

    if (this.handle) this.initHandle();
    window.addEventListener("message", (event) => this.onMessage(event));
    document.addEventListener("keydown", (event) => this.onKey(event));
    if (typeof ResizeObserver === "function" && this.stage) {
      new ResizeObserver(() => this.queueLayout()).observe(this.stage);
    }
    window.addEventListener("resize", () => {
      this.updateRoom();
      this.queueLayout();
    });
    // a change of the breakpoint decides where the page counts as a phone, and the focus ring width decides whether there is
    // a ring to show: look again after a setting changed
    ["input", "change"].forEach((name) =>
      document.addEventListener(name, () => this.queueLayout(), true)
    );
    document.addEventListener("controlPanelConfigReplaced", () => {
      this.sendConfig();
      this.queueLayout();
    });
    const phoneChange = () => this.onPhoneWindow();
    if (this.phoneQuery.addEventListener) this.phoneQuery.addEventListener("change", phoneChange);
    else this.phoneQuery.addListener(phoneChange);
    this.onPhoneWindow();

    // remembers open or closed: reopened at the next visit when the page is wide enough to hold it beside the settings
    if (!this.phoneQuery.matches && saved && saved.open === true && this.pushQuery.matches) {
      this.setOpen(true);
    }
  }

  // ---------------------------------------------------------------------------
  // Remembered choices (this browser only; a failure just means the defaults)
  // ---------------------------------------------------------------------------
  readSaved() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      const value = raw ? JSON.parse(raw) : null;
      return value && typeof value === "object" ? value : null;
    } catch (error) {
      return null;
    }
  }

  save() {
    try {
      localStorage.setItem(
        this.storageKey,
        JSON.stringify({ open: this.open, width: this.width, ...this.state })
      );
    } catch (error) {
      // storage blocked: the panel works, it just does not remember
    }
  }

  // ---------------------------------------------------------------------------
  // Open and close
  // ---------------------------------------------------------------------------
  /** On a phone-sized window the preview is not offered: the button goes, an open panel closes (without forgetting it was open) */
  onPhoneWindow() {
    const phone = this.phoneQuery.matches;
    if (this.slot) this.slot.hidden = phone;
    if (phone && this.open) this.setOpen(false, false, true);
  }

  setOpen(open, returnFocus, quiet) {
    if (open && this.phoneQuery.matches) return;
    this.open = Boolean(open);
    this.panel.hidden = !this.open;
    this.toggle.setAttribute("aria-expanded", this.open ? "true" : "false");
    this.toggle.classList.toggle("is-open", this.open);
    if (this.open) {
      if (!this.loaded) {
        this.loaded = true;
        this.ready = false;
        this.frame.src = "preview/preview.html";
      } else {
        this.sendConfig();
        this.sendState();
      }
      this.queueLayout();
    } else if (this.loaded) {
      // nothing keeps running behind a closed panel: the page is left, it starts again when the panel opens
      this.loaded = false;
      this.ready = false;
      this.frame.src = "about:blank";
    }
    if (!this.open && returnFocus) this.toggle.focus({ preventScroll: true });
    this.updateRoom();
    if (!quiet) this.save();
  }

  /**
   * The settings need room to keep their layout (their breakpoints follow the window, not the area beside the panel):
   * when the panel pushes the page and less than 720 px would be left, the sidebar becomes the icon rail while the panel is
   * open. The sidebar gives itself back when the panel closes; the person's own choice is never overwritten.
   */
  updateRoom() {
    const menu = window.sidebarMenu;
    if (!menu || typeof menu.holdRail !== "function") return;
    const full = 280; // --sidebar-width
    const needs =
      this.open && this.pushQuery.matches && window.innerWidth - full - this.width < 720;
    menu.holdRail(needs);
  }

  // ---------------------------------------------------------------------------
  // Width: drag the left edge (or use the arrow keys on it) to make the panel wider; double click goes back to 440 px
  // ---------------------------------------------------------------------------
  maxWidth() {
    // wide enough to be useful, never so wide that the settings (with the sidebar as the rail) drop under 600 px
    return Math.max(this.baseWidth, Math.min(900, window.innerWidth - 72 - 600));
  }

  setWidth(value, remember) {
    const next = Math.round(Math.min(this.maxWidth(), Math.max(this.baseWidth, value)));
    if (next === this.width) return;
    this.width = next;
    this.updateRoom();
    this.layout();
    if (remember) this.save();
  }

  initHandle() {
    const handle = this.handle;
    let dragging = false;
    handle.addEventListener("pointerdown", (event) => {
      dragging = true;
      handle.setPointerCapture(event.pointerId);
      this.panel.classList.add("is-resizing");
      event.preventDefault();
    });
    handle.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const edge = this.panel.getBoundingClientRect().right;
      this.setWidth(edge - event.clientX, false);
    });
    const stop = () => {
      if (!dragging) return;
      dragging = false;
      this.panel.classList.remove("is-resizing");
      this.save();
    };
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
    handle.addEventListener("dblclick", () => this.setWidth(this.baseWidth, true));
    handle.addEventListener("keydown", (event) => {
      const step = event.shiftKey ? 96 : 24;
      if (event.key === "ArrowLeft") this.setWidth(this.width + step, true);
      else if (event.key === "ArrowRight") this.setWidth(this.width - step, true);
      else if (event.key === "Home") this.setWidth(this.baseWidth, true);
      else if (event.key === "End") this.setWidth(this.maxWidth(), true);
      else return;
      event.preventDefault();
    });
  }

  // ---------------------------------------------------------------------------
  // State of the preview
  // ---------------------------------------------------------------------------
  setState(change) {
    Object.assign(this.state, change);
    this.reflectState();
    this.queueLayout();
    this.sendState();
    this.save();
  }

  reflectState() {
    this.panel.querySelectorAll("[data-device]").forEach((button) => {
      if (button.tagName === "BUTTON") {
        button.setAttribute("aria-pressed", String(button.dataset.device === this.state.device));
      }
    });
    this.panel.querySelectorAll("[data-mode]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.mode === this.state.mode));
    });
    this.focusButton.setAttribute("aria-pressed", String(this.state.focus));
    if (this.device) this.device.dataset.device = this.state.device;
    this.describe();
  }

  /** Width of the focus ring in the settings the panel shows (0 = no ring) */
  focusWidth() {
    const app = window.searchProControlPanel;
    const field =
      app && app.core && app.core.config && app.core.config.appearance
        ? app.core.config.appearance.searchField
        : null;
    const width = field && field.focusRing ? Number(field.focusRing.width) : 0;
    return Number.isFinite(width) ? width : 0;
  }

  /** One line for what the preview shows, and the note about the focus ring */
  describe() {
    const lines = {
      results: "A visitor typed a word that finds results.",
      none: "A visitor typed a word that finds nothing.",
      empty: "Nothing typed yet: the field shows its placeholder.",
    };
    if (this.caption) this.caption.textContent = lines[this.state.mode] || lines.results;
    // a Focus Ring with a width of 0 has nothing to draw: say so (no note while there is a ring to see)
    if (!this.note) return;
    const none = this.state.focus && this.focusWidth() <= 0;
    this.note.hidden = !none;
    if (none) {
      this.note.textContent =
        "No focus ring is set, so nothing is drawn. Set a Focus Ring Width above 0 in Appearance.";
    }
  }

  // ---------------------------------------------------------------------------
  // The page in the frame
  // ---------------------------------------------------------------------------
  post(message) {
    try {
      if (this.frame.contentWindow)
        this.frame.contentWindow.postMessage(
          message,
          window.location.origin === "null" ? "*" : window.location.origin
        );
    } catch (error) {
      console.warn("The preview could not be reached:", error);
    }
  }

  sendState() {
    if (!this.ready) return;
    this.post({ type: "searchProPreview", action: "state", state: { ...this.state } });
  }

  /** The settings the panel shows, once: the same copy that a changed field stores for an open tour */
  sendConfig() {
    if (!this.ready) return;
    const app = window.searchProControlPanel;
    const core = app && app.core;
    if (!core || !core.config) return;
    try {
      const copy = JSON.parse(JSON.stringify(core.config));
      if (typeof core.stripStrayKeys === "function") core.stripStrayKeys(copy);
      this.post({ type: "searchProPreview", action: "config", config: copy });
    } catch (error) {
      console.warn("The settings could not be sent to the preview:", error);
    }
  }

  onMessage(event) {
    if (!this.frame.contentWindow || event.source !== this.frame.contentWindow) return;
    const origin = event.origin || "";
    if (
      origin !== window.location.origin &&
      !(origin === "null" && window.location.protocol === "file:")
    )
      return;
    const data = event.data;
    if (!data || data.type !== "searchProPreviewReady") return;
    this.ready = true;
    this.sendConfig();
    this.sendState();
  }

  // ---------------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------------
  onKey(event) {
    if (
      event.altKey &&
      event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      event.code === "KeyP"
    ) {
      if (this.phoneQuery.matches) return;
      event.preventDefault();
      this.setOpen(!this.open, true);
      return;
    }
    if (event.key !== "Escape" || !this.open || event.defaultPrevented) return;
    // a dialog, the More menu or a dropdown that is open takes the Escape first
    if (document.querySelector(".modal-overlay.active, .dd-menu")) return;
    const more = document.getElementById("headerMoreMenu");
    if (more && !more.hidden) return;
    this.setOpen(false, true);
  }

  // ---------------------------------------------------------------------------
  // Size of the frame
  // ---------------------------------------------------------------------------
  queueLayout() {
    clearTimeout(this.layoutTimer);
    this.layoutTimer = setTimeout(() => this.layout(), 60);
  }

  /** Breakpoint under which the plugin counts a page as a phone (the setting, else its built-in 768) */
  breakpoint() {
    const app = window.searchProControlPanel;
    const value =
      app && app.core && app.core.config ? Number(app.core.config.mobileBreakpoint) : NaN;
    return Number.isFinite(value) && value > 0 ? value : 768;
  }

  layout() {
    this.describe();
    if (!this.open || !this.stage || !this.rules) return;
    const style = window.getComputedStyle(this.stage);
    const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const phone = this.state.device === "phone";
    const border = phone ? 5 : 1; // the border of the frame (preview-panel.css)
    const availW = Math.max(160, this.stage.clientWidth - padX - 2 * border);
    const availH = Math.max(160, this.stage.clientHeight - padY - 2 * border);
    let pageW;
    let scale;
    let pageH;
    let innerW;
    if (phone) {
      // a phone page: its real width (under the breakpoint), at full size when it fits
      pageW = Math.min(390, Math.max(280, this.breakpoint()));
      scale = Math.min(1, availW / pageW);
      pageH = Math.min(844, availH / scale);
      innerW = pageW * scale;
    } else {
      // a desktop page: wider than the breakpoint, scaled down to the width of the panel
      pageW = Math.max(800, this.breakpoint() + 32);
      scale = Math.min(1, availW / pageW);
      pageH = availH / scale;
      innerW = availW;
    }
    const innerH = pageH * scale;
    const round = (value) => Math.round(value * 1000) / 1000;
    // the width of the panel: only when it was dragged, and not on a phone (there it fills the window)
    const wide = this.width !== this.baseWidth && window.innerWidth >= 640;
    const rules =
      (wide ? `#previewPanel{width:min(${this.width}px,100%);}` : "") +
      "#previewDevice{" +
      `--pv-w:${round(pageW)}px;--pv-h:${round(pageH)}px;--pv-scale:${round(scale)};` +
      `--pv-box-w:${round(innerW + 2 * border)}px;--pv-box-h:${round(innerH + 2 * border)}px;}`;
    if (this.rules.textContent !== rules) this.rules.textContent = rules;
    if (this.handle) {
      this.handle.setAttribute("aria-valuenow", String(this.width));
      this.handle.setAttribute("aria-valuemax", String(this.maxWidth()));
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.previewPanel = new PreviewPanel();
});
