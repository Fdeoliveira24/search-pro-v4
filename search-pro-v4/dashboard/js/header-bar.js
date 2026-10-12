/**
 * Top Bar
 * Version 4.5 - Last Update on 10/12/2026 - New interface shell: where you are (breadcrumb), the unsaved pill, the More menu
 *
 * The buttons themselves (Apply Settings, Download, Load, Reset) belong to control-panel-v4.js, which keeps their ids and handlers.
 * This file only
 *  - says where you are: Category > Card (the sidebar tells it when the card on screen changes),
 *  - shows how many changes have not been applied yet (core.getDirty, event "settingsdirtychange"),
 *  - under 1280 px moves Download, Load and Reset into the More menu (the same buttons, so nothing is copied) and back.
 */

class HeaderBar {
  constructor() {
    this.category = document.getElementById("crumbCategory");
    this.separator = document.querySelector(".crumb-sep");
    this.section = document.getElementById("crumbSection");
    this.pill = document.getElementById("unsavedPill");
    this.pillText = document.getElementById("unsavedPillText");
    this.actions = document.querySelector(".header-actions");
    this.divider = document.querySelector(".header-actions-divider");
    this.moreButton = document.getElementById("headerMoreBtn");
    this.menu = document.getElementById("headerMoreMenu");
    this.moreQuery = window.matchMedia("(max-width: 1279px)");
    this.movable = ["downloadConfig", "loadConfig", "resetAll"];
    this.init();
  }

  init() {
    document.addEventListener("sidebar:sectionchange", (event) =>
      this.setLocation(event.detail || {})
    );
    document.addEventListener("settingsdirtychange", (event) => this.updatePill(event.detail));

    if (this.moreButton && this.menu) {
      this.moreButton.addEventListener("click", () => this.toggleMenu());
      this.menu.addEventListener("click", (event) => {
        if (event.target.closest(".btn")) this.closeMenu(false);
      });
      this.menu.addEventListener("keydown", (event) => this.onMenuKey(event));
      document.addEventListener("pointerdown", (event) => {
        if (!this.menu.hidden && !event.target.closest("#headerMore")) this.closeMenu(false);
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !this.menu.hidden) {
          this.closeMenu(true);
        }
      });
      if (this.moreQuery.addEventListener)
        this.moreQuery.addEventListener("change", () => this.placeActions());
      else this.moreQuery.addListener(() => this.placeActions());
    }
    this.placeActions();
    this.updatePill({ total: 0, tabs: {} });
  }

  /** Category > Card (the card part is left out until the cards of the tab are known) */
  setLocation(detail) {
    if (this.category && detail.tabName) this.category.textContent = detail.tabName;
    const hasSection = Boolean(detail.title);
    if (this.section) {
      this.section.textContent = detail.title || "";
      this.section.hidden = !hasSection;
    }
    if (this.separator) this.separator.hidden = !hasSection;
  }

  updatePill(dirty) {
    if (!this.pill || !this.pillText) return;
    const total = dirty && dirty.total ? dirty.total : 0;
    this.pill.hidden = total === 0;
    if (total === 0) return;
    const words = `unsaved ${total === 1 ? "change" : "changes"}`;
    this.pillText.textContent = "";
    const count = document.createElement("span");
    count.className = "pill-count";
    count.textContent = String(total);
    const label = document.createElement("span");
    label.className = "pill-words";
    label.textContent = ` ${words}`;
    this.pillText.append(count, label);
    this.pill.setAttribute("aria-label", `${total} ${words}`);
    this.pill.title = `${total} ${words}: changed since the last Apply. A tour that is open already shows them; download the settings file to give them to your visitors.`;
  }

  /** Wide: the three buttons sit in the bar. Narrow: they sit in the More menu. */
  placeActions() {
    if (!this.actions || !this.menu) return;
    const buttons = this.movable.map((id) => document.getElementById(id)).filter(Boolean);
    if (this.moreQuery.matches) {
      buttons.forEach((button) => {
        button.setAttribute("role", "menuitem");
        this.menu.appendChild(button);
      });
    } else {
      buttons.forEach((button) => {
        button.removeAttribute("role");
        this.actions.insertBefore(button, this.divider);
      });
      this.closeMenu(false);
    }
  }

  toggleMenu() {
    if (this.menu.hidden) this.openMenu();
    else this.closeMenu(true);
  }

  openMenu() {
    this.menu.hidden = false;
    this.moreButton.setAttribute("aria-expanded", "true");
    const first = this.menu.querySelector(".btn:not(:disabled)");
    if (first) first.focus({ preventScroll: true });
  }

  closeMenu(restoreFocus) {
    if (!this.menu || this.menu.hidden) return;
    this.menu.hidden = true;
    this.moreButton.setAttribute("aria-expanded", "false");
    if (restoreFocus) this.moreButton.focus({ preventScroll: true });
  }

  onMenuKey(event) {
    const items = [...this.menu.querySelectorAll(".btn:not(:disabled)")];
    if (!items.length) return;
    const at = items.indexOf(document.activeElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      items[(at + 1) % items.length].focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      items[(at - 1 + items.length) % items.length].focus();
    } else if (event.key === "Tab") {
      this.closeMenu(false);
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.headerBar = new HeaderBar();
});
