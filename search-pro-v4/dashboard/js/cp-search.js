/**
 * Search of the Control Panel
 * Version 4.5 - Last Update on 10/12/2026 - New interface, search: find any category, card or setting and jump to it
 *
 * What it does
 *  - a box in the top bar (an icon under 760 px) and Ctrl/Cmd+K open a palette over the page;
 *  - the palette searches the index of the Control Panel (panel-index.js: every tab, card and setting with its label, tooltip and
 *    hint, plus the text of the Knowledge page), ranks with Fuse.js and lists Categories, Sections and Settings with the typed
 *    letters marked; the words people use come from js/search-synonyms.js (nothing is typed by hand here);
 *  - arrows move, Enter opens, Escape closes and gives the keyboard back to where it was;
 *  - opening a result switches to its tab (loading it when it was never opened), scrolls to the card or setting and flashes it
 *    for 2.4 seconds. The keyboard is not moved (no focus ring appears on the page); a screen reader is told what was opened.
 * It searches the settings of the Control Panel only, never the tour. It does not keep a history and it saves nothing.
 */

(function () {
  "use strict";

  const GROUPS = [
    { id: "category", name: "Categories", icon: "fa-layer-group", limit: 9 },
    { id: "section", name: "Sections", icon: "fa-table-cells-large", limit: 6 },
    { id: "setting", name: "Settings", icon: "fa-sliders", limit: 14 },
  ];
  const TYPE_NAME = { category: "Category", section: "Section", setting: "Setting" };
  const FLASH_MS = 2400;

  /** Lower case, no accents, single spaces: what the search compares */
  const norm = (value) =>
    String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const isMac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || "");

  class ControlPanelSearch {
    constructor() {
      this.overlay = document.getElementById("cpSearch");
      this.input = document.getElementById("cpSearchInput");
      this.list = document.getElementById("cpSearchList");
      this.count = document.getElementById("cpSearchCount");
      this.closeButton = document.getElementById("cpSearchClose");
      this.slot = document.getElementById("headerSearchSlot");
      this.openButton = document.getElementById("cpSearchOpen");
      this.items = [];
      this.fuse = null;
      this.stale = true;
      this.rows = []; // the option elements on screen, in order
      this.selected = -1;
      this.opener = null;
      this.flashTimer = null;
      this.open_ = false;
      if (!this.overlay || !this.input || !this.list) return;
      this.init();
    }

    // -----------------------------------------------------------------------
    // Start
    // -----------------------------------------------------------------------
    init() {
      const kbd = this.openButton ? this.openButton.querySelector(".cps-kbd") : null;
      if (kbd) kbd.textContent = isMac ? "⌘ K" : "Ctrl K";
      if (this.slot) this.slot.hidden = false;

      if (this.openButton) this.openButton.addEventListener("click", () => this.show());
      if (this.closeButton) this.closeButton.addEventListener("click", () => this.hide(true));
      this.overlay.addEventListener("pointerdown", (event) => {
        if (event.target.closest("[data-cps-close]")) this.hide(true);
      });
      this.input.addEventListener("input", () => this.render());
      this.overlay.addEventListener("keydown", (event) => this.onKey(event));
      this.list.addEventListener("mousemove", (event) => {
        const row = event.target.closest("[data-cps-index]");
        if (row) this.select(Number(row.dataset.cpsIndex), false);
      });
      this.list.addEventListener("click", (event) => {
        const row = event.target.closest("[data-cps-index]");
        if (row) this.choose(Number(row.dataset.cpsIndex));
        else if (event.target.closest("[data-cps-clear]")) this.clear();
      });

      document.addEventListener("keydown", (event) => {
        if (
          (event.ctrlKey || event.metaKey) &&
          !event.altKey &&
          !event.shiftKey &&
          event.key.toLowerCase() === "k"
        ) {
          event.preventDefault();
          if (this.open_) this.input.focus();
          else this.show();
        }
      });

      // A tab was read or loaded: the index changed. Rebuild when the palette is next used (or now, when it is open).
      const changed = () => {
        this.stale = true;
        if (this.open_) this.render();
      };
      document.addEventListener("panelindex:updated", changed);
      document.addEventListener("panelindex:ready", changed);
    }

    // -----------------------------------------------------------------------
    // Index: everything the panel index knows, with the words of the synonym list added
    // -----------------------------------------------------------------------
    build() {
      const syn = window.CP_SEARCH_SYNONYMS || { groups: [], settings: {}, tabs: {} };
      const index = window.panelIndex;
      const items = [];
      const wordsFor = (name) => {
        const lower = String(name || "").toLowerCase();
        if (!lower) return "";
        const found = [];
        Object.keys(syn.settings).forEach((part) => {
          if (lower.includes(part)) found.push(...syn.settings[part]);
        });
        return found.join(" ");
      };
      const tabs = index ? index.getTabs() : [];
      tabs.forEach((tab) => {
        items.push({
          type: "category",
          key: `tab:${tab.id}`,
          tab: tab.id,
          tabName: tab.name,
          label: tab.name,
          path: "",
          icon: tab.icon,
          words: (syn.tabs[tab.id] || []).join(" "),
          contents: tab.sections.map((section) => section.title).join(" "),
        });
        tab.sections.forEach((section) => {
          const names = section.settings.map((setting) => setting.name).filter(Boolean);
          const words = new Set();
          names.forEach((name) =>
            wordsFor(name)
              .split(" ")
              .forEach((word) => word && words.add(word))
          );
          items.push({
            type: "section",
            key: section.id,
            tab: tab.id,
            tabName: tab.name,
            section: section.key,
            sectionId: section.id,
            label: section.title,
            path: tab.name,
            description: section.description,
            icon: section.icon,
            contents: section.settings.map((setting) => setting.label).join(" "),
            words: [...words].slice(0, 40).join(" "),
            body: section.body || "",
          });
          section.settings.forEach((setting, position) => {
            if (!setting.label) return;
            items.push({
              type: "setting",
              key: `${section.id}:${setting.name || setting.id || position}`,
              tab: tab.id,
              tabName: tab.name,
              section: section.key,
              sectionId: section.id,
              sectionTitle: section.title,
              label: setting.label,
              path: `${tab.name} › ${section.title}`,
              tooltip: setting.tooltip,
              hint: setting.hint,
              words: wordsFor(setting.name || setting.id),
              control: { id: setting.id, name: setting.name },
            });
          });
        });
      });
      items.forEach((item) => {
        item.nLabel = norm(item.label);
        item.nPath = norm(item.path);
        item.nWords = norm(item.words);
        item.nTooltip = norm(item.tooltip);
        item.nHint = norm(item.hint);
        item.nDescription = norm(item.description);
        item.nContents = norm(item.contents);
        item.nBody = norm(item.body);
      });
      this.items = items;
      this.byKey = new Map(items.map((item) => [item.key, item]));
      const make = (list, keys) =>
        typeof window.Fuse === "function"
          ? new window.Fuse(list, {
              includeScore: true,
              threshold: 0.3,
              ignoreLocation: true,
              minMatchCharLength: 2,
              keys,
            })
          : null;
      const of = (type) => items.filter((item) => item.type === type);
      // what each kind is looked for in: a category by its name and words; a card also by what it says and holds (the Knowledge
      // page by its text); a setting by its name, words, place, tooltip and hint
      this.fuses = {
        category: make(of("category"), [
          { name: "nLabel", weight: 1 },
          { name: "nWords", weight: 0.8 },
        ]),
        section: make(of("section"), [
          { name: "nLabel", weight: 1 },
          { name: "nWords", weight: 0.8 },
          { name: "nDescription", weight: 0.4 },
          { name: "nContents", weight: 0.25 },
          { name: "nBody", weight: 0.2 },
        ]),
        setting: make(of("setting"), [
          { name: "nLabel", weight: 1 },
          { name: "nWords", weight: 0.8 },
          { name: "nPath", weight: 0.45 },
          { name: "nTooltip", weight: 0.5 },
          { name: "nHint", weight: 0.3 },
        ]),
      };
      this.fuse = this.fuses.setting;
      this.stale = false;
    }

    /** The query itself, then the same query with a word swapped for the other words of its synonym group */
    variants(query) {
      const groups = (window.CP_SEARCH_SYNONYMS && window.CP_SEARCH_SYNONYMS.groups) || [];
      const out = [query];
      const tokens = query.split(" ");
      const swap = (from, to) => {
        const padded = ` ${query} `;
        const at = padded.indexOf(` ${from} `);
        if (at < 0) return null;
        return `${padded.slice(0, at)} ${to} ${padded.slice(at + from.length + 2)}`
          .replace(/\s+/g, " ")
          .trim();
      };
      groups.forEach((group) => {
        const own = group.map(norm);
        const hit = own.find(
          (word) =>
            word === query ||
            tokens.includes(word) ||
            (word.includes(" ") && ` ${query} `.includes(` ${word} `))
        );
        if (!hit) return;
        own.forEach((word) => {
          if (word === hit) return;
          const next = swap(hit, word);
          if (next && !out.includes(next)) out.push(next);
        });
      });
      return out.slice(0, 14);
    }

    /** Results for a query: { category: [...], section: [...], setting: [...] } with the best first */
    find(query) {
      if (this.stale || !this.fuse) this.build();
      const q = norm(query);
      const result = { category: [], section: [], setting: [] };
      if (!q) return result;
      const best = new Map();
      const add = (item, score) => {
        const known = best.get(item.key);
        if (!known || score < known.score) best.set(item.key, { item, score });
      };
      const fields = [
        "nLabel",
        "nWords",
        "nPath",
        "nTooltip",
        "nDescription",
        "nHint",
        "nContents",
        "nBody",
      ];
      const wordStart = (text) => {
        const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`(^|[^a-z0-9])${escaped}`);
      };

      // 1. the typed words: Fuse.js (a typo or a missing letter still finds it), one index for each kind
      if (this.fuses && this.fuses.setting) {
        // a short word may be one letter off, not two ("typo" must not find "types")
        const cutoff = q.length <= 5 ? 0.18 : q.length <= 8 ? 0.26 : 0.3;
        Object.values(this.fuses).forEach((fuse) => {
          if (fuse)
            fuse.search(q).forEach((hit) => hit.score <= cutoff && add(hit.item, hit.score));
        });
      } else {
        // Fuse.js did not load: the words must appear as they are typed
        const own = wordStart(q);
        this.items.forEach((item) => {
          const at = fields.findIndex((field) => own.test(item[field]));
          if (at >= 0) add(item, at * 0.05);
        });
      }

      // 1b. every typed word as a whole word, in any field, in any order: this is what finds a sentence of the Knowledge page
      // (Fuse.js scores a long text low) and a name typed in another order
      const tokens = q.split(" ").filter((token) => token.length > 1);
      if (tokens.length) {
        const patterns = tokens.map(wordStart);
        this.items.forEach((item) => {
          const at = fields.findIndex((field) => patterns.every((re) => re.test(item[field])));
          if (at >= 0) add(item, 0.1 + at * 0.04);
        });
      }

      // 2. the other words of a synonym group: whole words only (no fuzziness, so "typo" does not find "types"); a little
      // below the same match of the typed words
      this.variants(q)
        .slice(1)
        .forEach((variant) => {
          const re = wordStart(variant);
          this.items.forEach((item) => {
            const at = fields.findIndex((field) => re.test(item[field]));
            if (at >= 0) add(item, 0.15 + at * 0.04);
          });
        });

      // A label that holds the typed words is the best answer, and the one that starts with them better still
      best.forEach((entry) => {
        if (entry.item.nLabel === q) entry.score = Math.max(0, entry.score - 0.3);
        else if (entry.item.nLabel.startsWith(q)) entry.score = Math.max(0, entry.score - 0.2);
        else if (entry.item.nLabel.includes(q)) entry.score = Math.max(0, entry.score - 0.12);
      });
      [...best.values()]
        .sort((a, b) => a.score - b.score || a.item.label.length - b.item.label.length)
        .forEach((entry) => result[entry.item.type].push(entry.item));
      return result;
    }

    /** What is listed when nothing is typed: the categories, and the cards of the open tab */
    browse() {
      if (this.stale || !this.fuse) this.build();
      const open = document.querySelector(".nav-item.active[data-tab]");
      const tabId = open ? open.getAttribute("data-tab") : null;
      return {
        category: this.items.filter((item) => item.type === "category"),
        section: tabId
          ? this.items.filter((item) => item.type === "section" && item.tab === tabId)
          : [],
        setting: [],
      };
    }

    // -----------------------------------------------------------------------
    // Palette: open, close, draw
    // -----------------------------------------------------------------------
    show() {
      if (this.open_) return;
      if (document.querySelector(".modal-overlay.active")) return; // a dialog has the keyboard
      this.opener =
        document.activeElement && document.activeElement !== document.body
          ? document.activeElement
          : this.openButton;
      this.open_ = true;
      this.overlay.hidden = false;
      document.body.classList.add("cps-open");
      if (this.openButton) this.openButton.setAttribute("aria-expanded", "true");
      this.input.value = "";
      if (window.panelIndex && !window.panelIndex.isReady()) window.panelIndex.loadAll();
      this.render();
      this.input.focus();
    }

    hide(restoreFocus) {
      if (!this.open_) return;
      this.open_ = false;
      this.overlay.hidden = true;
      document.body.classList.remove("cps-open");
      if (this.openButton) this.openButton.setAttribute("aria-expanded", "false");
      if (
        restoreFocus &&
        this.opener &&
        document.contains(this.opener) &&
        typeof this.opener.focus === "function"
      ) {
        this.opener.focus({ preventScroll: true });
      }
    }

    clear() {
      this.input.value = "";
      this.render();
      this.input.focus();
    }

    render() {
      const query = this.input.value;
      const typed = norm(query) !== "";
      const index = window.panelIndex;
      const reading = index && !index.isReady() && typed;
      const found = typed ? this.find(query) : this.browse();
      this.list.textContent = "";
      this.rows = [];
      let total = 0;
      const terms = norm(query)
        .split(" ")
        .filter((term) => term.length > 1);

      GROUPS.forEach((group) => {
        const all = found[group.id] || [];
        const shown = typed ? all.slice(0, group.limit) : all;
        if (!shown.length) return;
        const box = document.createElement("div");
        box.className = "cps-group";
        box.setAttribute("role", "group");
        const headingId = `cpsGroup-${group.id}`;
        box.setAttribute("aria-labelledby", headingId);
        const heading = document.createElement("div");
        heading.className = "cps-group-title";
        heading.id = headingId;
        const icon = document.createElement("i");
        icon.className = `fas ${group.icon}`;
        icon.setAttribute("aria-hidden", "true");
        heading.append(icon, document.createTextNode(` ${group.name}`));
        box.appendChild(heading);
        shown.forEach((item) => {
          const row = this.row(item, terms, this.rows.length);
          this.rows.push(row);
          box.appendChild(row);
          total += 1;
        });
        this.list.appendChild(box);
      });

      if (!this.rows.length) {
        this.list.appendChild(this.empty(query, typed, reading));
        this.selected = -1;
        this.input.removeAttribute("aria-activedescendant");
      } else {
        this.select(0, false);
      }
      this.say(
        typed
          ? total
            ? `${total} ${total === 1 ? "result" : "results"}`
            : reading
              ? "Reading the pages"
              : "No results"
          : ""
      );
    }

    row(item, terms, position) {
      const row = document.createElement("div");
      row.className = "cps-row";
      row.id = `cpsRow-${position}`;
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", "false");
      row.dataset.cpsIndex = String(position);
      row.dataset.cpsKey = item.key;

      const tile = document.createElement("span");
      tile.className = "cps-tile";
      const glyph = document.createElement("i");
      const fa =
        item.icon && item.icon.startsWith("fa-")
          ? item.icon
          : item.type === "setting"
            ? "fa-sliders"
            : "fa-table-cells-large";
      glyph.className = `fas ${fa}`;
      glyph.setAttribute("aria-hidden", "true");
      tile.appendChild(glyph);

      const text = document.createElement("div");
      text.className = "cps-text";
      const name = document.createElement("div");
      name.className = "cps-name";
      this.mark(name, item.label, terms);
      text.appendChild(name);
      const sub = item.type === "setting" ? item.path : item.type === "section" ? item.path : "";
      if (sub) {
        const path = document.createElement("div");
        path.className = "cps-path";
        path.textContent = sub;
        text.appendChild(path);
      }

      const kind = document.createElement("span");
      kind.className = "cps-kind";
      kind.textContent = TYPE_NAME[item.type];
      const enter = document.createElement("i");
      enter.className = "fas fa-turn-down cps-enter";
      enter.setAttribute("aria-hidden", "true");
      row.append(tile, text, kind, enter);
      return row;
    }

    /** The label with the typed words marked (text nodes only, never HTML) */
    mark(target, label, terms) {
      const lower = String(label).toLowerCase();
      const ranges = [];
      terms.forEach((term) => {
        let from = 0;
        for (;;) {
          const at = lower.indexOf(term, from);
          if (at < 0) break;
          ranges.push([at, at + term.length]);
          from = at + term.length;
        }
      });
      ranges.sort((a, b) => a[0] - b[0]);
      const merged = [];
      ranges.forEach((range) => {
        const last = merged[merged.length - 1];
        if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
        else merged.push(range.slice());
      });
      let cursor = 0;
      merged.forEach(([start, end]) => {
        if (start > cursor) target.appendChild(document.createTextNode(label.slice(cursor, start)));
        const hit = document.createElement("mark");
        hit.className = "cps-hit";
        hit.textContent = label.slice(start, end);
        target.appendChild(hit);
        cursor = end;
      });
      if (cursor < label.length) target.appendChild(document.createTextNode(label.slice(cursor)));
    }

    empty(query, typed, reading) {
      const box = document.createElement("div");
      box.className = "cps-empty";
      const tile = document.createElement("span");
      tile.className = "cps-empty-tile";
      const icon = document.createElement("i");
      icon.className = "fas fa-magnifying-glass";
      icon.setAttribute("aria-hidden", "true");
      tile.appendChild(icon);
      const title = document.createElement("div");
      title.className = "cps-empty-title";
      const help = document.createElement("p");
      help.className = "cps-empty-text";
      if (reading) {
        title.textContent = "Reading the pages…";
        help.textContent = "The settings of every tab are being read. Results appear in a moment.";
        box.append(tile, title, help);
        return box;
      }
      title.textContent = typed ? `No settings match “${query.trim()}”` : "Nothing to show yet";
      help.textContent = typed
        ? "Try a shorter word, or browse the categories in the sidebar."
        : "The pages are still being read.";
      box.append(tile, title, help);
      if (typed) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "cps-clear";
        button.dataset.cpsClear = "true";
        button.textContent = "Clear search";
        box.appendChild(button);
      }
      return box;
    }

    say(message) {
      if (this.count) this.count.textContent = message;
    }

    // -----------------------------------------------------------------------
    // Keyboard and choosing
    // -----------------------------------------------------------------------
    select(position, scroll) {
      if (!this.rows.length) return;
      const next = ((position % this.rows.length) + this.rows.length) % this.rows.length;
      if (this.rows[this.selected]) {
        this.rows[this.selected].classList.remove("is-selected");
        this.rows[this.selected].setAttribute("aria-selected", "false");
      }
      this.selected = next;
      const row = this.rows[next];
      row.classList.add("is-selected");
      row.setAttribute("aria-selected", "true");
      this.input.setAttribute("aria-activedescendant", row.id);
      if (scroll !== false) row.scrollIntoView({ block: "nearest" });
    }

    onKey(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        this.hide(true);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        this.select(this.selected + 1, true);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        this.select(this.selected - 1, true);
      } else if (event.key === "Home" && event.target === this.input && !this.input.value) {
        event.preventDefault();
        this.select(0, true);
      } else if (event.key === "Enter") {
        if (event.target.closest("[data-cps-clear]") || event.target === this.closeButton) return;
        event.preventDefault();
        if (this.selected >= 0) this.choose(this.selected);
      } else if (event.key === "Tab") {
        // the palette keeps the keyboard: the field and the close button, round and round
        const stops = [this.input, this.closeButton].filter(Boolean);
        const at = stops.indexOf(document.activeElement);
        event.preventDefault();
        stops[(at + (event.shiftKey ? -1 : 1) + stops.length) % stops.length].focus();
      }
    }

    choose(position) {
      const row = this.rows[position];
      const item = row && this.byKey.get(row.dataset.cpsKey);
      if (!item) return;
      this.hide(false);
      this.go(item);
    }

    // -----------------------------------------------------------------------
    // Going there: switch the tab, scroll, flash, focus
    // -----------------------------------------------------------------------
    calm() {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }

    /** Calls back with the element once it exists and has a size (the tab may still be loading), or gives up after a while */
    whenShown(find, callback, tries = 60) {
      const element = find();
      if (element && element.getClientRects().length > 0) {
        callback(element);
        return;
      }
      if (tries <= 0) {
        callback(element && element.getClientRects().length > 0 ? element : null);
        return;
      }
      setTimeout(() => this.whenShown(find, callback, tries - 1), 100);
    }

    flash(element) {
      if (!element) return;
      document.querySelectorAll(".cps-flash").forEach((node) => node.classList.remove("cps-flash"));
      clearTimeout(this.flashTimer);
      // restart the animation when the same element is flashed twice in a row
      void element.offsetWidth;
      element.classList.add("cps-flash");
      this.flashTimer = setTimeout(() => element.classList.remove("cps-flash"), FLASH_MS);
    }

    /** A control of a setting, or the nearest thing that can take the keyboard */
    controlOf(item, scope) {
      let control = null;
      if (item.control && item.control.id) control = document.getElementById(item.control.id);
      if (!control && item.control && item.control.name && scope) {
        control = scope.querySelector(`[name="${String(item.control.name).replace(/"/g, '\\"')}"]`);
      }
      return control;
    }

    /** Tells a screen reader where the result landed (the keyboard is not moved: no focus ring appears on the page) */
    announce(item) {
      const status = document.getElementById("cpSearchStatus");
      if (!status) return;
      const where = item.type === "category" ? "" : ` in ${item.tabName}`;
      status.textContent = "";
      setTimeout(() => {
        status.textContent = `Opened ${item.label}${where}`;
      }, 60);
    }

    go(item) {
      const menu = window.sidebarMenu;
      const loader = window.tabLoader;
      const scrollOptions = { block: "center", behavior: this.calm() ? "auto" : "smooth" };
      this.announce(item);

      if (item.type === "category") {
        if (loader && typeof loader.switchTab === "function") loader.switchTab(item.tab);
        this.whenShown(
          () => {
            const panel = document.getElementById(`${item.tab}-panel`);
            return panel && panel.dataset.loaded === "true" ? panel : null;
          },
          (panel) => {
            const main = document.getElementById("mainContent");
            if (main && typeof main.scrollTo === "function")
              main.scrollTo({ top: 0, behavior: this.calm() ? "auto" : "smooth" });
            const head = panel && (panel.querySelector(".panel-header") || panel.querySelector("h2"));
            if (head) this.flash(head);
          }
        );
        return;
      }

      // a card or a setting: the sidebar knows how to switch, load and scroll to a card
      if (menu && typeof menu.goTo === "function")
        menu.goTo(item.tab, item.section, { focus: false });
      else if (loader && typeof loader.switchTab === "function") loader.switchTab(item.tab);

      const card = () => document.getElementById(item.sectionId);
      if (item.type === "section") {
        this.whenShown(card, (element) => {
          if (element) setTimeout(() => this.flash(element), 350);
        });
        return;
      }

      // a setting: wait for its card to be on screen, then bring the setting itself to the middle of the page
      this.whenShown(card, (element) => {
        if (!element) return;
        setTimeout(() => {
          const control = this.controlOf(item, element);
          const group = control
            ? control.closest(".form-group") || control.closest(".toggle-switch")
            : null;
          const target = group && group.getClientRects().length > 0 ? group : element;
          target.scrollIntoView(scrollOptions);
          this.flash(target);
        }, 350);
      });
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    window.controlPanelSearch = new ControlPanelSearch();
  });
})();
