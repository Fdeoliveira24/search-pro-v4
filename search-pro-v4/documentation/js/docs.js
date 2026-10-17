/**
 * Search Pro V4 documentation - Version 4.0 - October 2026
 *
 * The behavior of the documentation pages. Nothing here is needed to read them: without JavaScript every page is a plain page
 * with the menu on top.
 *   1. the menu is a drawer under 900px (button, scrim, Escape, focus goes in and comes back)
 *   2. "On this page" marks the card you are reading
 *   3. Copy buttons of the code windows
 *   4. the filter of the Settings Reference
 *   5. a Print button
 * No library, no network request.
 */
(function () {
  "use strict";

  const doc = document;
  const root = doc.documentElement;
  root.classList.add("js");

  const $ = (selector, scope) => (scope || doc).querySelector(selector);
  const $$ = (selector, scope) => Array.from((scope || doc).querySelectorAll(selector));

  /* ---------- 1. Drawer ---------- */
  function setupDrawer() {
    const sidebar = $("#docsSidebar");
    const scrim = $("#docsScrim");
    const open = $("#docsMenuButton");
    const close = $("#docsSidebarClose");
    if (!sidebar || !scrim || !open) return;

    const narrow = window.matchMedia("(max-width: 899px)");
    let lastFocus = null;

    const setOpen = (state) => {
      sidebar.classList.toggle("is-open", state);
      scrim.classList.toggle("is-open", state);
      open.setAttribute("aria-expanded", state ? "true" : "false");
      if (state) {
        lastFocus = doc.activeElement;
        const first = $("[aria-current='page']", sidebar) || $("a", sidebar);
        // The menu is not ready to take the focus in the very frame it opens (with reduced motion it takes one more frame), so
        // the focus is asked for again, a few frames at most, until it has landed
        if (first) {
          let tries = 0;
          const place = () => {
            if (!sidebar.classList.contains("is-open")) return;
            first.focus();
            if (doc.activeElement !== first && (tries += 1) < 12)
              window.requestAnimationFrame(place);
          };
          window.requestAnimationFrame(place);
        }
      } else if (lastFocus && typeof lastFocus.focus === "function") {
        lastFocus.focus();
        lastFocus = null;
      }
    };

    // Under 900px a closed drawer cannot be reached by the keyboard or a screen reader
    const sync = () => {
      if (narrow.matches) {
        if (!sidebar.classList.contains("is-open")) sidebar.setAttribute("inert", "");
        else sidebar.removeAttribute("inert");
      } else {
        sidebar.removeAttribute("inert");
        sidebar.classList.remove("is-open");
        scrim.classList.remove("is-open");
        open.setAttribute("aria-expanded", "false");
      }
    };
    const toggle = (state) => {
      if (narrow.matches) {
        if (state) sidebar.removeAttribute("inert");
        setOpen(state);
        if (!state) sidebar.setAttribute("inert", "");
      }
    };

    open.addEventListener("click", () => toggle(!sidebar.classList.contains("is-open")));
    scrim.addEventListener("click", () => toggle(false));
    if (close) close.addEventListener("click", () => toggle(false));
    doc.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && sidebar.classList.contains("is-open")) toggle(false);
    });
    // Choosing a link closes the drawer
    sidebar.addEventListener("click", (event) => {
      if (event.target.closest("a") && narrow.matches) toggle(false);
    });
    narrow.addEventListener("change", sync);
    sync();
  }

  /* ---------- 2. Which card is on screen ---------- */
  function setupSpy() {
    const links = $$(".docs-subnav a[href^='#']");
    if (!links.length || !("IntersectionObserver" in window)) return;
    const byId = new Map(links.map((link) => [decodeURIComponent(link.hash.slice(1)), link]));
    const targets = [...byId.keys()].map((id) => doc.getElementById(id)).filter(Boolean);
    if (!targets.length) return;

    const visible = new Set();
    const mark = () => {
      // The first card (in page order) that is on screen
      const current = targets.find((target) => visible.has(target)) || null;
      links.forEach((link) => link.removeAttribute("aria-current"));
      if (current) {
        const link = byId.get(current.id);
        link.setAttribute("aria-current", "true");
        // Keep the link inside the visible part of the menu
        const nav = link.closest(".docs-nav");
        if (nav && nav.scrollHeight > nav.clientHeight) {
          const box = link.getBoundingClientRect();
          const area = nav.getBoundingClientRect();
          if (box.top < area.top + 40 || box.bottom > area.bottom - 40)
            nav.scrollTop += box.top - area.top - area.height / 2;
        }
      }
    };
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) visible.add(entry.target);
          else visible.delete(entry.target);
        });
        mark();
      },
      { rootMargin: "-88px 0px -55% 0px", threshold: 0 }
    );
    targets.forEach((target) => observer.observe(target));
  }

  /* ---------- 3. Copy buttons ---------- */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(
        () => true,
        () => legacyCopy(text)
      );
    }
    return Promise.resolve(legacyCopy(text));
  }

  // A page opened from a file is not a secure context in every browser, so the older way is kept
  function legacyCopy(text) {
    const area = doc.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.className = "sr-only";
    doc.body.appendChild(area);
    area.select();
    let done = false;
    try {
      done = doc.execCommand("copy");
    } catch (error) {
      done = false;
    }
    area.remove();
    return done;
  }

  function setupCopy() {
    const status = $("#docsStatus");
    $$(".doc-copy[data-copy-target]").forEach((button) => {
      const label = $("span", button);
      const original = label ? label.textContent : "";
      button.addEventListener("click", async () => {
        const target = doc.getElementById(button.dataset.copyTarget);
        if (!target) return;
        const ok = await copyText(target.textContent);
        if (label) label.textContent = ok ? "Copied" : "Press Ctrl or Cmd + C";
        button.classList.toggle("is-copied", ok);
        if (status)
          status.textContent = ok
            ? "Copied to the clipboard."
            : "Could not copy. Select the text and press Ctrl or Cmd + C.";
        if (!ok) {
          const range = doc.createRange();
          range.selectNodeContents(target);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
        }
        window.setTimeout(() => {
          if (label) label.textContent = original;
          button.classList.remove("is-copied");
        }, 2200);
      });
    });
  }

  /* ---------- 4. Filter of the Settings Reference ---------- */
  function fold(text) {
    return String(text || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
  }

  function setupFilter() {
    const input = $("#refSearch");
    if (!input) return;
    const box = input.closest(".ref-search");
    const clear = $("#refClear");
    const count = $("#refCount");
    const empty = $("#refEmpty");
    const emptyClear = $("#refEmptyClear");
    const status = $("#docsStatus");

    const entries = $$(".setting").map((node) => ({
      node,
      text: fold(node.dataset.search || node.textContent),
    }));
    const groups = $$(".ref-group");
    const cards = $$(".ref-card");
    const tabs = $$(".ref-tab");
    const total = entries.length;

    const apply = () => {
      const words = fold(input.value).split(/\s+/).filter(Boolean);
      let shown = 0;
      entries.forEach((entry) => {
        const match = words.every((word) => entry.text.includes(word));
        entry.node.hidden = !match;
        if (match) shown += 1;
      });
      // A group, a card or a tab with nothing left is hidden too (a table of defaults goes with the settings of its group)
      groups.forEach((group) => {
        const any = $(".setting:not([hidden])", group);
        group.hidden = words.length > 0 && !any;
      });
      cards.forEach((card) => {
        card.hidden = words.length > 0 && !$(".setting:not([hidden])", card);
      });
      tabs.forEach((tab) => {
        tab.hidden = words.length > 0 && !$(".ref-card:not([hidden])", tab);
      });
      box.classList.toggle("has-text", input.value.length > 0);
      count.innerHTML = words.length
        ? `<strong>${shown}</strong> of ${total} settings`
        : `<strong>${total}</strong> settings`;
      if (empty) empty.hidden = !(words.length && shown === 0);
      if (status && words.length)
        status.textContent = shown === 1 ? "1 setting found." : `${shown} settings found.`;
    };

    const reset = () => {
      input.value = "";
      apply();
      input.focus();
    };

    input.addEventListener("input", apply);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && input.value) {
        event.preventDefault();
        reset();
      }
    });
    if (clear) clear.addEventListener("click", reset);
    if (emptyClear) emptyClear.addEventListener("click", reset);

    // "/" jumps to the filter, as in the Control Panel's search
    doc.addEventListener("keydown", (event) => {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
      const tag = (event.target && event.target.tagName) || "";
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (event.target && event.target.isContentEditable))
        return;
      event.preventDefault();
      input.focus();
      input.select();
    });

    // A link to a setting that the filter hides clears the filter first
    const reveal = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      const target = id && doc.getElementById(id);
      if (target && (target.hidden || target.closest("[hidden]"))) {
        input.value = "";
        apply();
        target.scrollIntoView();
      }
    };
    window.addEventListener("hashchange", reveal);
    apply();
    reveal();
  }

  /* ---------- 5. Print ---------- */
  function setupPrint() {
    $$(".docs-print").forEach((button) => button.addEventListener("click", () => window.print()));
  }

  function start() {
    setupDrawer();
    setupSpy();
    setupCopy();
    setupFilter();
    setupPrint();
  }

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", start);
  else start();
})();
