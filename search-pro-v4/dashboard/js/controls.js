/**
 * Styled Controls
 * Version 4.5 - Last Update on 10/12/2026 - New interface: every <select> gets a styled button and menu, every slider a filled track
 *
 * 1. Dropdown (below). 2. Slider fill (at the end): the track of a range input is drawn in two colors; the script only keeps the
 *    custom property --range-fill (a percentage) of each slider up to date (in one <style> element), the look is in pages.css.
 *
 * The browser draws the closed box of a <select> and, worse, its open list, with its own fonts and colors. Here the real <select>
 * stays in the page (hidden, 1 px, never removed) and keeps being the control that the rest of the code reads and writes:
 * name, id, value, options, disabled, change events, Restore Defaults, Load. A button (.dd-trigger) is put in front of it and
 * shows the chosen option; its menu (.dd-menu, role="listbox") is a card drawn by pages.css.
 *
 * What stays true for the code that uses a select:
 *  - select.value = "x" (and selectedIndex) updates the button at once (the two setters of that element are wrapped)
 *  - options added, removed or renamed update the menu (MutationObserver)
 *  - select.disabled and the class "error" are mirrored on the button
 *  - choosing an entry sets the value and fires "input" and "change" on the select, exactly like the browser list
 *  - a select added later (the icon library list, a new row) is picked up by itself
 */

(function () {
  "use strict";

  const valueOfSelect = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
  const indexOfSelect = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "selectedIndex"
  );
  let menuCount = 0;

  class Dropdown {
    constructor(select) {
      this.select = select;
      this.open = false;
      this.activeIndex = -1;
      this.typed = "";
      this.typedTimer = null;
      this.build();
      this.wrapSetters();
      this.observe();
      this.refresh();
    }

    /* ---------------------------------------------------------------- the button */

    build() {
      const select = this.select;
      menuCount += 1;
      this.menuId = `ddMenu${menuCount}`;
      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "dd-trigger";
      trigger.setAttribute("role", "combobox");
      trigger.setAttribute("aria-haspopup", "listbox");
      trigger.setAttribute("aria-expanded", "false");
      trigger.setAttribute("aria-controls", this.menuId);
      const text = document.createElement("span");
      text.className = "dd-value";
      trigger.appendChild(text);
      this.trigger = trigger;
      this.text = text;

      // The name of the control: its own aria-label, else its label, else the label of the card around it
      const name = this.nameOf(select);
      if (name) trigger.setAttribute("aria-label", name);
      const described = select.getAttribute("aria-describedby");
      if (described) trigger.setAttribute("aria-describedby", described);

      select.classList.add("dd-native");
      select.setAttribute("tabindex", "-1");
      select.setAttribute("aria-hidden", "true");
      select.parentNode.insertBefore(trigger, select);
      select.dataset.dd = "true";
      this.copyState();

      trigger.addEventListener("click", () => (this.open ? this.close(true) : this.show()));
      trigger.addEventListener("keydown", (event) => this.onKey(event));
      trigger.addEventListener("blur", () => {
        // A click in the menu keeps the focus on the button (mousedown is prevented there), so a blur means "leave"
        if (this.open) this.close(false);
      });
      // A label that points at the select puts the focus on the button
      select.addEventListener("focus", () => trigger.focus());
    }

    nameOf(select) {
      const own = select.getAttribute("aria-label");
      if (own) return own;
      const by = select.getAttribute("aria-labelledby");
      if (by) {
        const words = by
          .split(/\s+/)
          .map((id) => document.getElementById(id))
          .filter(Boolean)
          .map((node) => node.textContent.replace(/\s+/g, " ").trim());
        if (words.length) return words.join(" ");
      }
      const label = select.id ? document.querySelector(`label[for="${select.id}"]`) : null;
      const group = select.closest(".form-group");
      const source = label || (group && group.querySelector(".form-label"));
      if (!source) return "";
      const copy = source.cloneNode(true);
      copy.querySelectorAll(".help-tooltip, .sr-only").forEach((node) => node.remove());
      return copy.textContent.replace(/\s+/g, " ").trim();
    }

    /** Disabled and error follow the select */
    copyState() {
      // A select that a script hides (hidden attribute or display: none) hides its button as well
      this.trigger.hidden = this.select.hidden || this.select.style.display === "none";
      this.trigger.disabled = this.select.disabled;
      this.trigger.classList.toggle("error", this.select.classList.contains("error"));
      if (this.select.title) this.trigger.title = this.select.title;
      if (this.select.disabled && this.open) this.close(false);
    }

    /** The button shows the chosen option */
    refresh() {
      const option = this.select.options[this.select.selectedIndex];
      this.text.textContent = option ? option.text : "";
      this.trigger.classList.toggle("is-empty", !option || option.value === "");
      if (this.open) this.renderOptions();
    }

    /* ---------------------------------------------------------------- the select keeps working like a select */

    wrapSetters() {
      const self = this;
      Object.defineProperty(this.select, "value", {
        configurable: true,
        get() {
          return valueOfSelect.get.call(this);
        },
        set(next) {
          valueOfSelect.set.call(this, next);
          self.refresh();
        },
      });
      Object.defineProperty(this.select, "selectedIndex", {
        configurable: true,
        get() {
          return indexOfSelect.get.call(this);
        },
        set(next) {
          indexOfSelect.set.call(this, next);
          self.refresh();
        },
      });
    }

    observe() {
      this.observer = new MutationObserver(() => {
        this.copyState();
        this.refresh();
      });
      this.observer.observe(this.select, {
        attributes: true,
        attributeFilter: ["disabled", "class", "title", "hidden", "style"],
        childList: true,
        subtree: true,
        characterData: true,
      });
    }

    /** The user chose an entry: same sequence as the browser list (value, then input, then change) */
    choose(index) {
      const option = this.select.options[index];
      if (!option || option.disabled) return;
      const changed = this.select.selectedIndex !== index;
      indexOfSelect.set.call(this.select, index);
      this.refresh();
      if (changed) {
        this.select.dispatchEvent(new Event("input", { bubbles: true }));
        this.select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }

    /* ---------------------------------------------------------------- the menu */

    show() {
      if (this.select.disabled || this.open) return;
      Dropdown.closeAll(this);
      this.open = true;
      this.menu = document.createElement("div");
      this.menu.id = this.menuId;
      this.menu.className = "dd-menu";
      this.menu.setAttribute("role", "listbox");
      const name = this.trigger.getAttribute("aria-label");
      if (name) this.menu.setAttribute("aria-label", name);
      // Keep the focus on the button while the pointer works in the menu
      this.menu.addEventListener("mousedown", (event) => event.preventDefault());
      this.menu.addEventListener("click", (event) => {
        const entry = event.target.closest(".dd-option");
        if (!entry || entry.getAttribute("aria-disabled") === "true") return;
        this.choose(Number(entry.dataset.index));
        this.close(true);
      });
      this.menu.addEventListener("mousemove", (event) => {
        const entry = event.target.closest(".dd-option");
        if (entry && entry.getAttribute("aria-disabled") !== "true")
          this.setActive(Number(entry.dataset.index), false);
      });
      document.body.appendChild(this.menu);
      this.activeIndex = Math.max(0, this.select.selectedIndex);
      this.renderOptions();
      this.trigger.setAttribute("aria-expanded", "true");
      this.place();
      this.scrollToActive();
      Dropdown.listen(this);
    }

    close(returnFocus) {
      if (!this.open) return;
      this.open = false;
      this.trigger.setAttribute("aria-expanded", "false");
      this.trigger.removeAttribute("aria-activedescendant");
      if (this.menu && this.menu.parentNode) this.menu.parentNode.removeChild(this.menu);
      this.menu = null;
      if (returnFocus) this.trigger.focus({ preventScroll: true });
      Dropdown.unlisten(this);
    }

    renderOptions() {
      if (!this.menu) return;
      this.menu.textContent = "";
      const fonts =
        /fontFamily/i.test(this.select.name || "") || this.select.hasAttribute("data-font-select");
      const addOption = (option, parent) => {
        const index = [...this.select.options].indexOf(option);
        const entry = document.createElement("div");
        entry.className = "dd-option";
        entry.id = `${this.menuId}-${index}`;
        entry.dataset.index = String(index);
        entry.setAttribute("role", "option");
        entry.setAttribute("aria-selected", index === this.select.selectedIndex ? "true" : "false");
        if (option.disabled) entry.setAttribute("aria-disabled", "true");
        if (fonts && option.value) entry.style.setProperty("--dd-font", option.value);
        const label = document.createElement("span");
        label.className = "dd-option-text";
        label.textContent = option.text;
        const check = document.createElement("i");
        check.className = "fas fa-check dd-check";
        check.setAttribute("aria-hidden", "true");
        entry.append(label, check);
        if (index === this.activeIndex) entry.classList.add("is-active");
        parent.appendChild(entry);
      };
      [...this.select.children].forEach((child) => {
        if (child.tagName === "OPTGROUP") {
          const group = document.createElement("div");
          group.className = "dd-group";
          group.setAttribute("role", "group");
          group.setAttribute("aria-label", child.label);
          const title = document.createElement("div");
          title.className = "dd-group-title";
          title.textContent = child.label;
          group.appendChild(title);
          [...child.children].forEach((option) => addOption(option, group));
          this.menu.appendChild(group);
        } else if (child.tagName === "OPTION") {
          addOption(child, this.menu);
        }
      });
      const active = this.menu.querySelector(".is-active");
      if (active) this.trigger.setAttribute("aria-activedescendant", active.id);
    }

    place() {
      if (!this.menu) return;
      const box = this.trigger.getBoundingClientRect();
      const menu = this.menu;
      menu.style.setProperty("--dd-min", `${Math.round(box.width)}px`);
      const margin = 8;
      const below = window.innerHeight - box.bottom - margin;
      const above = box.top - margin;
      const height = Math.min(menu.scrollHeight + 2, 320);
      const openUp = below < Math.min(height, 200) && above > below;
      const room = Math.max(120, openUp ? above : below);
      menu.style.setProperty("--dd-max", `${Math.min(320, room - 6)}px`);
      const width = Math.max(box.width, 160);
      const left = Math.min(
        Math.max(margin, box.left),
        Math.max(margin, window.innerWidth - width - margin)
      );
      menu.style.setProperty("--dd-left", `${Math.round(left)}px`);
      if (openUp) {
        menu.style.setProperty("--dd-top", "auto");
        menu.style.setProperty("--dd-bottom", `${Math.round(window.innerHeight - box.top + 6)}px`);
      } else {
        menu.style.setProperty("--dd-top", `${Math.round(box.bottom + 6)}px`);
        menu.style.setProperty("--dd-bottom", "auto");
      }
    }

    setActive(index, scroll) {
      if (!this.menu) return;
      this.activeIndex = index;
      this.menu.querySelectorAll(".dd-option").forEach((entry) => {
        entry.classList.toggle("is-active", Number(entry.dataset.index) === index);
      });
      const active = this.menu.querySelector(".is-active");
      if (active) this.trigger.setAttribute("aria-activedescendant", active.id);
      if (scroll) this.scrollToActive();
    }

    scrollToActive() {
      const active = this.menu && this.menu.querySelector(".is-active");
      if (active && active.scrollIntoView) active.scrollIntoView({ block: "nearest" });
    }

    /** The next enabled entry from an index, in a direction (-1 or 1); stays where it is at the ends */
    step(from, direction) {
      const options = this.select.options;
      for (let i = from + direction; i >= 0 && i < options.length; i += direction) {
        if (!options[i].disabled) return i;
      }
      return from;
    }

    onKey(event) {
      if (this.select.disabled) return;
      const key = event.key;
      const options = this.select.options;
      if (!this.open) {
        if (key === "ArrowDown" || key === "ArrowUp" || key === "Enter" || key === " ") {
          event.preventDefault();
          this.show();
          return;
        }
        if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          // Typing a letter picks the next entry that starts with it, like the browser select
          event.preventDefault();
          const found = this.find(key);
          if (found >= 0) this.choose(found);
        }
        return;
      }
      if (key === "ArrowDown") {
        event.preventDefault();
        this.setActive(this.step(this.activeIndex, 1), true);
      } else if (key === "ArrowUp") {
        event.preventDefault();
        this.setActive(this.step(this.activeIndex, -1), true);
      } else if (key === "Home") {
        event.preventDefault();
        this.setActive(this.step(-1, 1), true);
      } else if (key === "End") {
        event.preventDefault();
        this.setActive(this.step(options.length, -1), true);
      } else if (key === "Enter" || key === " ") {
        event.preventDefault();
        this.choose(this.activeIndex);
        this.close(true);
      } else if (key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        this.close(true);
      } else if (key === "Tab") {
        this.close(false);
      } else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        const found = this.find(key);
        if (found >= 0) this.setActive(found, true);
      }
    }

    /** Type-ahead: letters typed within a second make a prefix */
    find(letter) {
      clearTimeout(this.typedTimer);
      this.typed += letter.toLowerCase();
      this.typedTimer = setTimeout(() => (this.typed = ""), 900);
      const options = [...this.select.options];
      const start = this.open ? this.activeIndex : this.select.selectedIndex;
      const order = options.map(
        (_, i) => (i + start + (this.typed.length === 1 ? 1 : 0)) % options.length
      );
      return order.find(
        (i) => !options[i].disabled && options[i].text.trim().toLowerCase().startsWith(this.typed)
      );
    }

    destroy() {
      this.close(false);
      if (this.observer) this.observer.disconnect();
    }

    /* ---------------------------------------------------------------- one menu open at a time */

    static closeAll(except) {
      Dropdown.instances.forEach((dropdown) => {
        if (dropdown !== except && dropdown.open) dropdown.close(false);
      });
    }

    static listen(dropdown) {
      if (Dropdown.outside) return;
      Dropdown.outside = (event) => {
        Dropdown.instances.forEach((d) => {
          if (
            d.open &&
            !d.trigger.contains(event.target) &&
            !(d.menu && d.menu.contains(event.target))
          )
            d.close(false);
        });
      };
      Dropdown.reposition = (event) => {
        Dropdown.instances.forEach((d) => {
          if (!d.open) return;
          // Scrolling inside the menu itself must not move it
          if (
            event &&
            event.target &&
            d.menu &&
            (event.target === d.menu || d.menu.contains(event.target))
          )
            return;
          d.place();
        });
      };
      document.addEventListener("pointerdown", Dropdown.outside, true);
      window.addEventListener("resize", Dropdown.reposition);
      window.addEventListener("scroll", Dropdown.reposition, true);
    }

    static unlisten() {
      if ([...Dropdown.instances].some((d) => d.open)) return;
      document.removeEventListener("pointerdown", Dropdown.outside, true);
      window.removeEventListener("resize", Dropdown.reposition);
      window.removeEventListener("scroll", Dropdown.reposition, true);
      Dropdown.outside = null;
      Dropdown.reposition = null;
    }
  }

  /* ---------------------------------------------------------------- sliders */

  const valueOfInput = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");

  // The fill of every slider lives in one <style> element of the page (a rule per slider, written when a value changes), so no
  // element of a tab carries an inline style attribute.
  const fills = new Map();
  let fillSheet = null;
  let fillQueued = false;
  let fillCounter = 0;

  function writeFills() {
    fillQueued = false;
    if (!fillSheet) {
      fillSheet = document.createElement("style");
      fillSheet.id = "rangeFillRules";
      document.head.appendChild(fillSheet);
    }
    fillSheet.textContent = [...fills]
      .map(([key, share]) => `[data-range-fill="${key}"]{--range-fill:${share}}`)
      .join("");
  }

  function fillOf(input) {
    const min = input.min === "" ? 0 : Number(input.min);
    const max = input.max === "" ? 100 : Number(input.max);
    const value = Number(valueOfInput.get.call(input));
    const span = max - min;
    const share = span > 0 ? Math.min(1, Math.max(0, (value - min) / span)) : 0;
    const text = `${(share * 100).toFixed(1)}%`;
    if (fills.get(input.dataset.rangeFill) === text) return;
    fills.set(input.dataset.rangeFill, text);
    if (!fillQueued) {
      fillQueued = true;
      requestAnimationFrame(writeFills);
    }
  }

  function enhanceRange(input) {
    fillCounter += 1;
    input.dataset.rangeFill = `r${fillCounter}`;
    fillOf(input);
    input.addEventListener("input", () => fillOf(input));
    input.addEventListener("change", () => fillOf(input));
    // Code that sets the value (Load, Restore Defaults, a preset) redraws the fill too
    Object.defineProperty(input, "value", {
      configurable: true,
      get() {
        return valueOfInput.get.call(this);
      },
      set(next) {
        valueOfInput.set.call(this, next);
        fillOf(this);
      },
    });
    new MutationObserver(() => fillOf(input)).observe(input, {
      attributes: true,
      attributeFilter: ["min", "max", "step"],
    });
  }

  Dropdown.instances = new Set();
  Dropdown.outside = null;
  Dropdown.reposition = null;

  /** Give every plain select under a root a styled button and menu, and every slider its fill (done ones are skipped) */
  function enhance(root) {
    const scope = root || document;
    scope.querySelectorAll("select:not([data-dd]):not([multiple])").forEach((select) => {
      if (select.size > 1 || !select.parentNode) return;
      Dropdown.instances.add(new Dropdown(select));
    });
    scope.querySelectorAll('input[type="range"]:not([data-range-fill])').forEach(enhanceRange);
  }

  function start() {
    enhance(document);
    document.addEventListener("tabContentLoaded", (event) => {
      const panel = event.detail && event.detail.tabPanel;
      if (panel) enhance(panel);
    });
    // Selects that a script adds later (the icon library list, a row of a list)
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        enhance(document);
        // A select that left the page takes its button and menu with it
        Dropdown.instances.forEach((dropdown) => {
          if (!document.contains(dropdown.select)) {
            dropdown.destroy();
            Dropdown.instances.delete(dropdown);
          }
        });
      });
    }).observe(document.body, { childList: true, subtree: true });
  }

  window.StyledControls = { enhance };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
