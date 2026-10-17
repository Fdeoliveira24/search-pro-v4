/**
 * Panel Index
 * Version 4.6 - Last Update on 10/12/2026 - New interface shell: the one place that knows the cards (sections) and the settings of every tab
 *
 * The sidebar sub-menus, the breadcrumb, the unsaved marks and (later) the search of the Control Panel all read this index, so
 * a new card or setting in a tab page shows up everywhere by itself: nothing is typed by hand.
 *
 * Where it learns about a tab:
 *  1. when a tab page has been loaded into the panel (the live page, read at once and given its ids), and
 *  2. when the browser is idle after the first paint, from the tab page files (fetched once, parsed, never shown, never
 *     initialized), so the other tabs are known before they are opened.
 *
 * A card (section) is a .config-section of a tab page: its key is data-section-key, its title the .section-title, its icon the
 * .section-icon, its words the .section-description. Every card gets the id  sec-<tabId>-<key>  and the attributes
 * data-hue and data-icon, so a link (sub-menu, search) can find it.
 */

(function () {
  "use strict";

  // Tabs whose page file has another name than the tab id (same table as tab-loader.js)
  const FILE_OF = { management: "knowledge" };

  // Hue of a card (degrees on the color wheel, used for the tint of the card). The two tabs the design concept drew keep its
  // hues by section; every other card takes the next hue of the progression, in the order it appears on its page.
  const HUE_PROGRESSION = [275, 240, 200, 150, 35, 262, 222, 172, 18];
  const HUE_OF_KEY = {
    general: { opening: 275, searchBar: 200, phones: 150, texts: 35 },
    appearance: { searchField: 262, searchResults: 222, groupHeader: 172, tagsHighlight: 18 },
  };

  const clean = (text) =>
    String(text || "")
      .replace(/\s+/g, " ")
      .trim();

  /** Text of an element without the parts that are not its words (tooltip bubbles, screen reader notes) */
  function textOf(element, dropSelector) {
    if (!element) return "";
    const copy = element.cloneNode(true);
    if (dropSelector) copy.querySelectorAll(dropSelector).forEach((node) => node.remove());
    return clean(copy.textContent);
  }

  class PanelIndex {
    constructor() {
      this.tabs = [];
      this.byTab = new Map();
      this.fetching = false;
      this.fetched = false;
      this.readTabs();

      document.addEventListener("tabContentLoaded", (event) => {
        const detail = event.detail || {};
        if (detail.tabId && detail.tabPanel) this.fromLoaded(detail.tabId, detail.tabPanel);
      });

      // A card with changes that are not applied yet says so next to its title ("2 unsaved changes")
      document.addEventListener("settingsdirtychange", (event) => this.markCards(event.detail));

      // After the first paint, when the browser has nothing better to do
      const start = () => this.whenIdle(() => this.loadAll());
      if (document.readyState === "complete") start();
      else window.addEventListener("load", start, { once: true });
    }

    /** The categories of the sidebar, in the order of the sidebar */
    readTabs() {
      document.querySelectorAll(".sidebar-nav .nav-item[data-tab]").forEach((button) => {
        const id = button.getAttribute("data-tab");
        if (!id || this.byTab.has(id)) return;
        const icon = button.querySelector("i");
        const entry = {
          id,
          name: textOf(button.querySelector(".nav-text")) || id,
          icon: icon ? [...icon.classList].find((c) => c.startsWith("fa-")) || "" : "",
          sections: [],
          known: false,
        };
        this.tabs.push(entry);
        this.byTab.set(id, entry);
      });
    }

    whenIdle(callback) {
      if (typeof window.requestIdleCallback === "function")
        window.requestIdleCallback(callback, { timeout: 3000 });
      else setTimeout(callback, 400);
    }

    hueFor(tabId, key, position) {
      const own = HUE_OF_KEY[tabId] && HUE_OF_KEY[tabId][key];
      return own !== undefined ? own : HUE_PROGRESSION[position % HUE_PROGRESSION.length];
    }

    /** The key of a card: data-section-key, else the heading id without "-heading" */
    keyOf(card, position) {
      const given = card.getAttribute("data-section-key");
      if (given) return given;
      const labelled = card.getAttribute("aria-labelledby") || "";
      return labelled.replace(/-heading$/, "") || `section${position + 1}`;
    }

    /** What the index keeps about one card */
    describeSection(card, tabId, position) {
      const key = this.keyOf(card, position);
      const heading = card.querySelector(".section-title") || card.querySelector("h3, h2");
      const iconNode = card.querySelector(".section-icon");
      const icon = iconNode
        ? [...iconNode.classList].find((c) => c.startsWith("fa-") && c !== "fa-fw") || ""
        : "";
      return {
        id: `sec-${tabId}-${key}`,
        key,
        tab: tabId,
        position,
        title: textOf(heading, ".help-tooltip, .sr-only") || key,
        icon,
        description: textOf(card.querySelector(".section-description")),
        hue: this.hueFor(tabId, key, position),
        settings: this.readSettings(card),
        // the Knowledge page has words, not settings: its text is what the search of the Control Panel reads there
        body:
          tabId === "management"
            ? textOf(card, ".help-tooltip, .sr-only, .kb-code").slice(0, 8000)
            : "",
      };
    }

    /** The settings of a card: what the person sees (label, tooltip, hint) and which control holds the value */
    readSettings(card) {
      const settings = [];
      card.querySelectorAll(".form-group").forEach((group) => {
        const label = group.querySelector(".form-label");
        if (!label) return;
        const control = group.querySelector(
          "[name], input, select, textarea, button:not(.help-tooltip)"
        );
        const tooltip = group.querySelector(".help-tooltip[data-tooltip]");
        const hint = group.querySelector(".field-hint, .form-hint, small");
        settings.push({
          label: textOf(label, ".help-tooltip, .sr-only"),
          tooltip: tooltip ? clean(tooltip.getAttribute("data-tooltip")) : "",
          hint: textOf(hint),
          id: control ? control.id || "" : "",
          name: control ? control.getAttribute("name") || "" : "",
        });
      });
      return settings;
    }

    /** Read the cards under one element (the loaded panel, or the body of a parsed page) */
    readSections(root, tabId) {
      return [...root.querySelectorAll(".config-section")].map((card, position) =>
        this.describeSection(card, tabId, position)
      );
    }

    /** Give the cards of a loaded panel their ids and attributes */
    decorate(panel, tabId) {
      panel.querySelectorAll(".config-section").forEach((card, position) => {
        const section = this.describeSection(card, tabId, position);
        card.setAttribute("data-section-key", section.key);
        if (!card.id) card.id = section.id;
        card.setAttribute("data-hue", String(section.hue));
        if (section.icon) card.setAttribute("data-icon", section.icon);
      });
    }

    register(tabId, sections) {
      const entry = this.byTab.get(tabId);
      if (!entry) return;
      entry.sections = sections;
      entry.known = true;
      document.dispatchEvent(new CustomEvent("panelindex:updated", { detail: { tabId } }));
    }

    /** A tab page was loaded into the panel: read it as it is on screen */
    fromLoaded(tabId, panel) {
      this.decorate(panel, tabId);
      this.register(tabId, this.readSections(panel, tabId));
      const panelObject = window.searchProControlPanel;
      if (panelObject && panelObject.core) this.markCards(panelObject.core.dirty);
    }

    /** data-unsaved-text on the title of every loaded card that has unapplied changes (the words are drawn by pages.css) */
    markCards(dirty) {
      const tabs = dirty && dirty.tabs ? dirty.tabs : {};
      this.tabs.forEach((tab) => {
        tab.sections.forEach((section) => {
          const card = document.getElementById(section.id);
          const title = card && card.querySelector(".section-title");
          if (!title) return;
          const count = (tabs[tab.id] && tabs[tab.id].sections[section.key]) || 0;
          if (count)
            title.setAttribute(
              "data-unsaved-text",
              `${count} unsaved ${count === 1 ? "change" : "changes"}`
            );
          else title.removeAttribute("data-unsaved-text");
        });
      });
    }

    /** Fetch the pages of the tabs that are not known yet, one after the other (never initialized, never shown) */
    async loadAll() {
      if (this.fetching || this.fetched) return;
      this.fetching = true;
      for (const entry of this.tabs) {
        if (entry.known) continue;
        try {
          const response = await fetch(`tabs/${FILE_OF[entry.id] || entry.id}-tab.html`);
          if (!response.ok) continue;
          const page = new DOMParser().parseFromString(await response.text(), "text/html");
          if (!entry.known) this.register(entry.id, this.readSections(page.body, entry.id));
        } catch (error) {
          // A page that cannot be fetched stays unknown: its cards appear in the menu when the tab is opened
        }
      }
      this.fetching = false;
      this.fetched = true;
      document.dispatchEvent(new CustomEvent("panelindex:ready"));
    }

    getTabs() {
      return this.tabs;
    }

    getTab(tabId) {
      return this.byTab.get(tabId) || null;
    }

    getSections(tabId) {
      const entry = this.byTab.get(tabId);
      return entry ? entry.sections : [];
    }

    getSection(tabId, key) {
      return this.getSections(tabId).find((section) => section.key === key) || null;
    }

    findSectionById(id) {
      for (const entry of this.tabs) {
        const found = entry.sections.find((section) => section.id === id);
        if (found) return found;
      }
      return null;
    }

    /** True when every tab has been read */
    isReady() {
      return this.tabs.every((entry) => entry.known);
    }
  }

  window.PanelIndex = PanelIndex;
  // The sidebar is part of the first paint, so the index can read it as soon as this script runs (it is loaded after the markup)
  window.panelIndex = new PanelIndex();
})();
