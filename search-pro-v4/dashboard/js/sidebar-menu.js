/**
 * Sidebar Menu System
 * Version 4.5 - Last Update on 10/12/2026 - New interface shell: sub-menus (the cards of the open tab), scroll spy, unsaved dots, icon rail with flyout, drawer
 *
 * What it does:
 *  - the open tab lists its cards under its name (read from the Panel Index, never typed here); a click scrolls to the card
 *  - the card that is on screen is marked while scrolling (scroll spy) and the top bar says where you are
 *  - a dot marks the tabs and cards with changes that have not been applied yet (core.getDirty)
 *  - collapsed (72 px) the sidebar is an icon rail and a click on a tab also opens a flyout with its cards
 *  - under 900 px the sidebar is a drawer, opened by the menu button of the top bar
 *
 * Switching tabs stays the job of tab-loader.js (it fires "tabChanged"); this file only follows it. A click on a tab that is
 * already open folds or unfolds its cards.
 */

class SidebarMenu {
  constructor() {
    this.sidebar = null;
    this.overlay = null;
    this.collapseBtn = null;
    this.closeBtn = null;
    this.menuToggle = null;
    this.nav = null;
    this.scroller = null;
    this.flyout = null;
    this.flyoutTab = null;
    this.isCollapsed = false;
    this.isDrawerOpen = false;
    this.activeTab = null;
    this.activeSection = null;
    this.clickInfo = null;
    this.lockUntil = 0;
    this.scrollFrame = 0;
    this.scrollAnimation = 0;
    this.dirty = { total: 0, tabs: {} };
    this.drawerQuery = window.matchMedia("(max-width: 899px)");
    this.breakpoints = { mobile: 899 };

    this.init();
  }

  init() {
    this.sidebar = document.getElementById("sidebar");
    this.collapseBtn = document.getElementById("sidebarCollapseBtn");
    this.closeBtn = document.getElementById("sidebarClose");
    this.menuToggle = document.getElementById("mobileMenuToggle");
    this.nav = document.querySelector(".sidebar-nav");
    this.scroller = document.getElementById("mainContent");
    this.createOverlay();
    this.restoreState();
    this.setupEventListeners();

    const current = document.querySelector(".nav-item.active");
    this.activeTab = current ? current.getAttribute("data-tab") : null;
    this.renderAllSubs();
    this.applyLayout();
    this.updateCollapseButton();
  }

  createOverlay() {
    let overlay = document.getElementById("sidebarOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "sidebarOverlay";
      overlay.className = "sidebar-overlay";
      document.body.appendChild(overlay);
    }
    this.overlay = overlay;
  }

  /* ===================================
     Events
     =================================== */

  setupEventListeners() {
    if (this.collapseBtn) this.collapseBtn.addEventListener("click", () => this.toggleCollapse());
    if (this.closeBtn) this.closeBtn.addEventListener("click", () => this.closeDrawer(true));
    if (this.menuToggle) this.menuToggle.addEventListener("click", () => this.toggleDrawer());
    if (this.overlay) this.overlay.addEventListener("click", () => this.closeDrawer(true));

    // A click on a tab: note what it was (before tab-loader.js switches), then follow "tabChanged"
    if (this.nav) {
      this.nav.addEventListener(
        "click",
        (event) => {
          const item = event.target.closest(".nav-item");
          if (!item) return;
          this.clickInfo = {
            tab: item.getAttribute("data-tab"),
            wasActive: item.classList.contains("active"),
            trusted: event.isTrusted,
            keyboard: event.detail === 0, // Enter or Space (a mouse click has detail 1 or more)
          };
          // tab-loader.js has switched by now; a click that did not fire "tabChanged" must not leave its note behind
          setTimeout(() => {
            this.clickInfo = null;
          }, 0);
        },
        true
      );
      this.nav.addEventListener("click", (event) => {
        const sub = event.target.closest(".nav-sub");
        if (sub) this.goTo(sub.dataset.tab, sub.dataset.section, { focus: event.detail === 0 });
      });
    }

    document.addEventListener("tabChanged", (event) =>
      this.onTabChanged(event.detail && event.detail.tabId)
    );
    document.addEventListener("panelindex:updated", (event) =>
      this.onIndexUpdated(event.detail && event.detail.tabId)
    );
    document.addEventListener("settingsdirtychange", (event) => this.updateDots(event.detail));

    this.boundKeydownHandler = (event) => {
      if (event.key !== "Escape") return;
      if (this.flyout && !this.flyout.hidden) {
        const tab = this.flyoutTab;
        this.closeFlyout();
        const item = document.querySelector(`.nav-item[data-tab="${tab}"]`);
        if (item) item.focus();
      } else if (this.isDrawerOpen) {
        this.closeDrawer(true);
      }
    };
    document.addEventListener("keydown", this.boundKeydownHandler);

    this.boundPointerHandler = (event) => {
      if (!this.flyout || this.flyout.hidden) return;
      if (this.flyout.contains(event.target) || event.target.closest(".nav-item")) return;
      this.closeFlyout();
    };
    document.addEventListener("pointerdown", this.boundPointerHandler);

    if (this.scroller) {
      this.boundScrollHandler = () => this.onScroll();
      this.scroller.addEventListener("scroll", this.boundScrollHandler, { passive: true });
    }

    this.boundLayoutHandler = () => this.applyLayout();
    if (this.drawerQuery.addEventListener)
      this.drawerQuery.addEventListener("change", this.boundLayoutHandler);
    else this.drawerQuery.addListener(this.boundLayoutHandler);
  }

  /* ===================================
     Tabs and cards
     =================================== */

  onTabChanged(tabId) {
    if (!tabId) return;
    const info = this.clickInfo && this.clickInfo.tab === tabId ? this.clickInfo : null;
    this.clickInfo = null;
    const sameTab = tabId === this.activeTab;
    this.activeTab = tabId;

    this.closeFlyout();
    let expand = true;
    if (info && info.wasActive && sameTab && !this.isRail()) {
      // A second click on the open tab folds or unfolds its cards
      const group = this.groupOf(tabId);
      expand = !(group && group.querySelector(".nav-subs").classList.contains("is-open"));
    }
    this.setExpanded(tabId, expand);

    if (info && info.trusted && !sameTab && this.scroller) {
      this.scroller.scrollTop = 0;
    }

    // Until the page is scrolled, its first card is the place you are at
    this.activeSection = null;
    this.renderSubs(tabId);
    const sections = this.sectionsOf(tabId);
    this.setActiveSection(sections.length ? sections[0].key : null);

    if (info && info.trusted && this.isRail()) {
      if (!(info.wasActive && sameTab && this.flyoutTab === tabId))
        this.openFlyout(tabId, { focusFirst: info.keyboard });
    }
    if (info && info.trusted && this.drawerQuery.matches && !info.wasActive) {
      // Choosing another tab in the drawer is the choice: the drawer gives way to the page
      this.closeDrawer(false);
    }
  }

  onIndexUpdated(tabId) {
    if (!tabId) return;
    this.renderSubs(tabId);
    if (tabId === this.activeTab) {
      const sections = this.sectionsOf(tabId);
      if (!this.activeSection && sections.length) this.setActiveSection(sections[0].key);
      else this.setActiveSection(this.activeSection, true);
    }
    this.updateDots(this.dirty);
  }

  groupOf(tabId) {
    return document.querySelector(`.nav-group[data-group="${tabId}"]`);
  }

  sectionsOf(tabId) {
    return window.panelIndex ? window.panelIndex.getSections(tabId) : [];
  }

  /** Unfold the cards of one tab and fold the others */
  setExpanded(tabId, expanded) {
    document.querySelectorAll(".nav-group").forEach((group) => {
      const id = group.getAttribute("data-group");
      const open = id === tabId && expanded;
      group.querySelector(".nav-subs").classList.toggle("is-open", open);
      group.querySelector(".nav-item").setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  renderAllSubs() {
    document
      .querySelectorAll(".nav-group")
      .forEach((group) => this.renderSubs(group.getAttribute("data-group")));
  }

  /** The cards of a tab as buttons under its name (rebuilt only when the cards or their names changed) */
  renderSubs(tabId) {
    const group = this.groupOf(tabId);
    if (!group) return;
    const list = group.querySelector(".nav-subs-list");
    const sections = this.sectionsOf(tabId);
    const signature = sections.map((section) => `${section.key}|${section.title}`).join("\n");
    if (list.dataset.signature === signature) return;
    list.dataset.signature = signature;
    list.textContent = "";
    sections.forEach((section) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "nav-sub";
      button.dataset.tab = tabId;
      button.dataset.section = section.key;
      button.dataset.anchor = section.id;
      button.setAttribute("aria-current", "false");
      const text = document.createElement("span");
      text.className = "nav-sub-text";
      text.textContent = section.title;
      const dot = document.createElement("span");
      dot.className = "nav-dot";
      dot.setAttribute("role", "img");
      dot.setAttribute("aria-label", "Unsaved changes");
      dot.hidden = true;
      button.append(text, dot);
      list.appendChild(button);
    });
    this.markCurrent();
    this.updateDots(this.dirty);
  }

  /** The card that is on screen: marked in the sidebar and in the flyout, announced to the top bar */
  setActiveSection(key, force) {
    if (!force && key === this.activeSection) return;
    this.activeSection = key;
    this.markCurrent();
    const tab = window.panelIndex ? window.panelIndex.getTab(this.activeTab) : null;
    const section = tab ? tab.sections.find((entry) => entry.key === key) : null;
    this.dispatchEvent("sectionchange", {
      tabId: this.activeTab,
      tabName: tab ? tab.name : "",
      key: key,
      title: section ? section.title : "",
    });
  }

  markCurrent() {
    document.querySelectorAll(".nav-sub, .sidebar-flyout-item").forEach((button) => {
      const current =
        button.dataset.tab === this.activeTab && button.dataset.section === this.activeSection;
      button.setAttribute("aria-current", current ? "true" : "false");
    });
  }

  /** Go to a card of a tab (switching to the tab first when it is not the open one) */
  goTo(tabId, key, options = {}) {
    const run = () => {
      const card = document.getElementById(`sec-${tabId}-${key}`);
      if (!card) return false;
      this.scrollToCard(card, options);
      this.setActiveSection(key);
      if (this.drawerQuery.matches) this.closeDrawer(false);
      this.closeFlyout();
      return true;
    };
    if (tabId === this.activeTab) return run();

    // Another tab: switch, wait until its page is on screen, then go
    const panel = document.getElementById(`${tabId}-panel`);
    const switchNow = () => {
      if (window.tabLoader) window.tabLoader.switchTab(tabId);
    };
    if (panel && panel.dataset.loaded === "true") {
      switchNow();
      requestAnimationFrame(run);
    } else {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        document.removeEventListener("tabContentLoaded", onLoaded);
        requestAnimationFrame(run);
      };
      const onLoaded = (event) => {
        if (event.detail && event.detail.tabId === tabId) setTimeout(finish, 0);
      };
      document.addEventListener("tabContentLoaded", onLoaded);
      setTimeout(finish, 4000);
      switchNow();
    }
    return true;
  }

  scrollToCard(card, options = {}) {
    const scroller = this.scroller;
    if (!scroller) return;
    const top = Math.max(
      0,
      card.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top +
        scroller.scrollTop -
        24
    );
    this.lockUntil = Date.now() + 2000; // the scroll spy waits until the scroll has arrived (animateScroll lifts this)
    this.animateScroll(top);
    if (options.focus) {
      // A keyboard user lands on the title of the card
      const title = card.querySelector(".section-title");
      if (title) {
        if (!title.hasAttribute("tabindex")) title.setAttribute("tabindex", "-1");
        title.focus({ preventScroll: true });
      }
    }
  }

  animateScroll(to) {
    const scroller = this.scroller;
    const from = scroller.scrollTop;
    const distance = to - from;
    cancelAnimationFrame(this.scrollAnimation);
    const reduced =
      window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (Math.abs(distance) < 2 || reduced) {
      scroller.scrollTop = to;
      this.finishScroll();
      return;
    }
    const start = performance.now();
    const step = (now) => {
      const progress = Math.min(1, (now - start) / 320);
      const eased = 1 - Math.pow(1 - progress, 3);
      scroller.scrollTop = from + distance * eased;
      if (progress < 1) this.scrollAnimation = requestAnimationFrame(step);
      else this.finishScroll();
    };
    this.scrollAnimation = requestAnimationFrame(step);
  }

  /** The scroll has arrived: the scroll spy takes over again and looks at once where the page is */
  finishScroll() {
    this.lockUntil = 0;
    this.onScroll();
  }

  /** Scroll spy: the last card whose top has passed the upper part of the page is the one you are in */
  onScroll() {
    if (this.scrollFrame) return;
    this.scrollFrame = requestAnimationFrame(() => {
      this.scrollFrame = 0;
      if (Date.now() < this.lockUntil || !this.activeTab) return;
      const panel = document.getElementById(`${this.activeTab}-panel`);
      if (!panel) return;
      const cards = [...panel.querySelectorAll(".config-section[data-section-key]")].filter(
        (card) => card.offsetParent !== null
      );
      if (!cards.length) return;
      const scroller = this.scroller;
      const base = scroller.getBoundingClientRect().top;
      let current = cards[0];
      cards.forEach((card) => {
        if (card.getBoundingClientRect().top - base <= 140) current = card;
      });
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4)
        current = cards[cards.length - 1];
      this.setActiveSection(current.getAttribute("data-section-key"));
    });
  }

  /** Dots: a tab and a card with changes that have not been applied yet */
  updateDots(dirty) {
    this.dirty = dirty && dirty.tabs ? dirty : { total: 0, tabs: {} };
    document.querySelectorAll(".nav-group").forEach((group) => {
      const tabId = group.getAttribute("data-group");
      const state = this.dirty.tabs[tabId];
      group.querySelector(".nav-item > .nav-dot").hidden = !state;
      group.querySelectorAll(".nav-sub").forEach((button) => {
        button.querySelector(".nav-dot").hidden = !(
          state && state.sections[button.dataset.section]
        );
      });
    });
    if (this.flyout && !this.flyout.hidden) {
      this.flyout.querySelectorAll(".sidebar-flyout-item").forEach((button) => {
        const state = this.dirty.tabs[button.dataset.tab];
        button.querySelector(".nav-dot").hidden = !(
          state && state.sections[button.dataset.section]
        );
      });
    }
  }

  /* ===================================
     Rail flyout (collapsed sidebar)
     =================================== */

  isRail() {
    return this.isCollapsed && !this.drawerQuery.matches;
  }

  openFlyout(tabId, options = {}) {
    const item = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
    const tab = window.panelIndex ? window.panelIndex.getTab(tabId) : null;
    if (!item || !tab) return;
    if (!this.flyout) {
      this.flyout = document.createElement("div");
      this.flyout.className = "sidebar-flyout";
      this.flyout.setAttribute("role", "menu");
      this.flyout.hidden = true;
      this.flyout.addEventListener("click", (event) => {
        const entry = event.target.closest(".sidebar-flyout-item");
        if (entry)
          this.goTo(entry.dataset.tab, entry.dataset.section, { focus: event.detail === 0 });
      });
      this.flyout.addEventListener("keydown", (event) => this.onFlyoutKey(event));
      document.body.appendChild(this.flyout);
    }
    this.flyout.textContent = "";
    this.flyout.setAttribute("aria-label", `${tab.name} sections`);
    const title = document.createElement("div");
    title.className = "sidebar-flyout-title";
    title.textContent = tab.name;
    this.flyout.appendChild(title);
    tab.sections.forEach((section) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "sidebar-flyout-item";
      button.setAttribute("role", "menuitem");
      button.dataset.tab = tabId;
      button.dataset.section = section.key;
      const text = document.createElement("span");
      text.textContent = section.title;
      const dot = document.createElement("span");
      dot.className = "nav-dot";
      dot.setAttribute("role", "img");
      dot.setAttribute("aria-label", "Unsaved changes");
      dot.hidden = true;
      button.append(text, dot);
      this.flyout.appendChild(button);
    });
    this.flyout.hidden = false;
    this.flyoutTab = tabId;
    const rect = item.getBoundingClientRect();
    const top = Math.max(8, Math.min(rect.top, window.innerHeight - this.flyout.offsetHeight - 8));
    this.flyout.style.setProperty("--flyout-top", `${top}px`);
    this.markCurrent();
    this.updateDots(this.dirty);
    // From the keyboard the flyout is the next thing to use: the focus goes into it
    if (options.focusFirst) {
      const first = this.flyout.querySelector(".sidebar-flyout-item");
      if (first) first.focus({ preventScroll: true });
    }
  }

  closeFlyout() {
    if (this.flyout) this.flyout.hidden = true;
    this.flyoutTab = null;
  }

  onFlyoutKey(event) {
    const items = [...this.flyout.querySelectorAll(".sidebar-flyout-item")];
    if (!items.length) return;
    const at = items.indexOf(document.activeElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      items[(at + 1) % items.length].focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      items[(at - 1 + items.length) % items.length].focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      items[0].focus();
    } else if (event.key === "End") {
      event.preventDefault();
      items[items.length - 1].focus();
    } else if (event.key === "Tab") {
      // The flyout sits outside the tab order of the page: leaving it goes back to the tab it belongs to
      const tab = this.flyoutTab;
      event.preventDefault();
      this.closeFlyout();
      const item = document.querySelector(`.nav-item[data-tab="${tab}"]`);
      if (item) item.focus();
    }
  }

  /* ===================================
     Collapse, drawer, layout
     =================================== */

  toggleCollapse() {
    if (this.drawerQuery.matches) return;
    this.isCollapsed = !this.isCollapsed;
    this.closeFlyout();
    this.applyLayout();
    this.updateCollapseButton();
    this.saveState();
    this.dispatchEvent("sidebarToggle", { collapsed: this.isCollapsed });
  }

  collapse() {
    if (!this.isCollapsed && !this.drawerQuery.matches) this.toggleCollapse();
  }

  expand() {
    if (this.isCollapsed && !this.drawerQuery.matches) this.toggleCollapse();
  }

  updateCollapseButton() {
    if (!this.collapseBtn) return;
    const label = this.isCollapsed ? "Expand sidebar" : "Collapse sidebar";
    this.collapseBtn.setAttribute("aria-label", label);
    this.collapseBtn.setAttribute("title", label);
    this.collapseBtn.setAttribute("aria-expanded", this.isCollapsed ? "false" : "true");
    const text = this.collapseBtn.querySelector(".sidebar-collapse-label");
    if (text) text.textContent = label;
    const icon = this.collapseBtn.querySelector("i");
    if (icon) {
      icon.classList.toggle("fa-angles-left", !this.isCollapsed);
      icon.classList.toggle("fa-angles-right", this.isCollapsed);
    }
  }

  /** The sidebar is a rail when collapsed (900 px and wider) and a drawer under 900 px */
  applyLayout() {
    if (!this.sidebar) return;
    const drawer = this.drawerQuery.matches;
    this.sidebar.classList.toggle("collapsed", this.isCollapsed && !drawer);
    if (!drawer && this.isDrawerOpen) this.closeDrawer(false);
    // A drawer that is closed must not be reachable with the keyboard
    this.sidebar.inert = drawer && !this.isDrawerOpen;
    if (drawer) this.closeFlyout();
  }

  toggleDrawer() {
    if (this.isDrawerOpen) this.closeDrawer(true);
    else this.openDrawer();
  }

  openDrawer() {
    if (!this.drawerQuery.matches) return;
    this.isDrawerOpen = true;
    this.sidebar.inert = false;
    this.sidebar.classList.add("is-open");
    this.overlay.classList.add("active");
    if (this.menuToggle) this.menuToggle.setAttribute("aria-expanded", "true");
    const current = this.sidebar.querySelector(".nav-item.active") || this.closeBtn;
    if (current) current.focus({ preventScroll: true });
    this.dispatchEvent("mobileMenuOpen");
  }

  closeDrawer(restoreFocus) {
    if (!this.isDrawerOpen) return;
    this.isDrawerOpen = false;
    this.sidebar.classList.remove("is-open");
    this.overlay.classList.remove("active");
    if (this.menuToggle) this.menuToggle.setAttribute("aria-expanded", "false");
    this.sidebar.inert = this.drawerQuery.matches;
    if (restoreFocus && this.menuToggle) this.menuToggle.focus({ preventScroll: true });
    this.dispatchEvent("mobileMenuClose");
  }

  /* ===================================
     State
     =================================== */

  saveState() {
    try {
      localStorage.setItem(
        "sidebarState",
        JSON.stringify({ isCollapsed: this.isCollapsed, timestamp: Date.now() })
      );
    } catch (error) {
      console.warn("Could not save sidebar state:", error);
    }
  }

  restoreState() {
    try {
      const saved = localStorage.getItem("sidebarState");
      if (!saved) return;
      const state = JSON.parse(saved);
      // Same checks as before: a plain true/false that is less than 7 days old
      if (
        state &&
        typeof state.isCollapsed === "boolean" &&
        state.timestamp &&
        Date.now() - state.timestamp < 7 * 24 * 60 * 60 * 1000
      ) {
        this.isCollapsed = state.isCollapsed;
      }
    } catch (error) {
      try {
        localStorage.removeItem("sidebarState");
      } catch (clearError) {
        // nothing more to do
      }
    }
  }

  dispatchEvent(eventName, detail = {}) {
    document.dispatchEvent(new CustomEvent(`sidebar:${eventName}`, { detail, bubbles: true }));
  }

  getState() {
    return {
      isCollapsed: this.isCollapsed,
      isMobileOpen: this.isDrawerOpen,
      currentView: this.drawerQuery.matches ? "mobile" : "desktop",
      activeTab: this.activeTab,
      activeSection: this.activeSection,
    };
  }

  destroy() {
    document.removeEventListener("keydown", this.boundKeydownHandler);
    document.removeEventListener("pointerdown", this.boundPointerHandler);
    if (this.scroller && this.boundScrollHandler)
      this.scroller.removeEventListener("scroll", this.boundScrollHandler);
    if (this.drawerQuery.removeEventListener)
      this.drawerQuery.removeEventListener("change", this.boundLayoutHandler);
    else this.drawerQuery.removeListener(this.boundLayoutHandler);
    if (this.flyout && this.flyout.parentNode) this.flyout.parentNode.removeChild(this.flyout);
    if (this.overlay && this.overlay.parentNode) this.overlay.parentNode.removeChild(this.overlay);
  }
}

// Auto-initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  window.sidebarMenu = new SidebarMenu();
});

// Export for module systems
if (typeof module !== "undefined" && module.exports) {
  module.exports = SidebarMenu;
}
