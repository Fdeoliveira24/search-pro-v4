/* Version 4.6 - Last Update on 10/12/2026 - Live Preview: runs inside the preview page, drives the real search plugin */
/**
 * What this script does (the plugin itself is not changed and does not know it is in a preview):
 *   - waits until the plugin has built its index from the sample tour, then tells the Control Panel ("ready");
 *   - applies the state chosen in the panel: Results / Nothing Found / Empty Field, Focus Ring, Desktop / Phone, and keeps
 *     looking until the page really shows it (the plugin ignores a second opening within 300 ms and clears its field when it closes);
 *   - applies the whole configuration the Control Panel sends once when the panel opens (every later change reaches the plugin
 *     over the channel that every open tour uses: the stored copy "searchProLiveConfig" and the browser's storage event);
 *   - keeps the search open (a click on a result closes it in a real tour, here it opens again a moment later);
 *   - shows a note with what a click on a result would do in the tour.
 * It never takes the keyboard from the Control Panel: the search field is focused only after the person clicked inside the
 * preview, and the focus ring is drawn by a class instead of by real focus.
 */
(function () {
  "use strict";

  /** Words typed in the field: "room" finds panoramas and hotspots, "zzqx" finds nothing, an empty field shows its placeholder */
  const TERMS = { results: "room", none: "zzqx", empty: "" };
  const state = { mode: "results", focus: false, device: "desktop" };
  let ready = false;
  let wantOpen = true;
  let insideByPerson = false;
  let noteTimer = null;
  let reopenTimer = null;

  const api = () => window.tourSearchFunctions;
  const field = () => document.getElementById("tourSearch");
  const box = () => document.getElementById("searchContainer");
  const isOpen = () => !!(box() && box().classList.contains("visible"));

  // ---------------------------------------------------------------------------
  // The plugin focuses the field when it opens: not before a person clicked in the preview
  // ---------------------------------------------------------------------------
  const nativeFocus = HTMLElement.prototype.focus;
  HTMLElement.prototype.focus = function (options) {
    if (this.id === "tourSearch" && !insideByPerson) return undefined;
    return nativeFocus.call(this, options);
  };
  document.addEventListener(
    "pointerdown",
    () => {
      insideByPerson = true;
    },
    true
  );
  window.addEventListener("blur", () => {
    insideByPerson = false;
  });

  // ---------------------------------------------------------------------------
  // The state
  // ---------------------------------------------------------------------------
  function typeIntoField(text) {
    const input = field();
    if (!input || input.value === text) return;
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function openSearch() {
    if (!api() || isOpen()) return;
    api().toggleSearch(true);
  }

  const wantedText = () => (TERMS[state.mode] !== undefined ? TERMS[state.mode] : TERMS.results);

  /** The rows the plugin shows now */
  const rowCount = () => document.querySelectorAll("#searchContainer .result-item").length;

  /** True when the page shows what the panel asked for */
  function holds() {
    const input = field();
    if (!input) return false;
    if (wantOpen && !isOpen()) return false;
    if (!isOpen()) return true;
    if (input.value !== wantedText()) return false;
    return state.mode === "results" ? rowCount() > 0 : rowCount() === 0;
  }

  let settleTimer = null;
  let settleTries = 0;

  /**
   * Brings the page to the chosen state; safe to call again at any time. The plugin may ignore a call (two openings within 300 ms,
   * a field cleared by its own closing, a typed word it answers once the typing delay has passed), so after each call the page is
   * looked at again until it holds the state, a few times at most.
   */
  function apply(fresh) {
    if (!ready) return;
    if (fresh) settleTries = 0;
    window.TDV.PlayerAPI.mobile = state.device === "phone";
    if (wantOpen) openSearch();
    if (isOpen()) {
      const input = field();
      // the word is in the field and the rows do not match it (a result list the plugin did not redraw): clear it first, the
      // next look types it again
      if (
        input &&
        input.value === wantedText() &&
        !holds() &&
        settleTries > 0 &&
        wantedText() !== ""
      ) {
        typeIntoField("");
      } else {
        typeIntoField(wantedText());
      }
    }
    const bar = document.querySelector(".search-field");
    if (bar) bar.classList.toggle("preview-focus", !!state.focus);
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      if (holds() || ++settleTries > 4) return;
      apply(false);
    }, 450);
  }

  // ---------------------------------------------------------------------------
  // The plugin places its bar when settings arrive, not when the window changes size (a real phone does not change size).
  // This page changes size when Desktop / Phone is switched, so the plugin is asked to place the bar again: the same
  // mobileBreakpoint again makes it restyle, exactly as a changed setting does.
  // ---------------------------------------------------------------------------
  let resizeTimer = null;
  function restyle() {
    if (!ready || !api()) return;
    try {
      window.TDV.PlayerAPI.mobile = state.device === "phone";
      api().updateConfig({ mobileBreakpoint: api().getConfig().mobileBreakpoint });
      setTimeout(apply, 80);
    } catch (error) {
      // the plugin is not ready: the next state message applies everything
    }
  }
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(restyle, 150);
  });

  // ---------------------------------------------------------------------------
  // Keep the search open, say what a click would do
  // ---------------------------------------------------------------------------
  function watchBox() {
    const el = box();
    if (!el) return;
    new MutationObserver(() => {
      if (isOpen() || !wantOpen) return;
      clearTimeout(reopenTimer);
      reopenTimer = setTimeout(() => {
        apply();
        // the plugin ignores two openings within 300 ms: look again
        setTimeout(apply, 450);
      }, 1500);
    }).observe(el, { attributes: true, attributeFilter: ["class"] });
  }

  function say(text) {
    const note = document.getElementById("sampleNote");
    if (!note) return;
    note.textContent = text;
    note.hidden = false;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => {
      note.hidden = true;
    }, 2400);
  }

  document.addEventListener(
    "click",
    (event) => {
      const row =
        event.target && event.target.closest ? event.target.closest(".result-item") : null;
      if (!row) return;
      const name = row.querySelector(".result-text");
      const text = (name ? name.textContent : row.textContent || "").replace(/\s+/g, " ").trim();
      say("In a tour this opens: " + (text || "this result"));
    },
    true
  );

  const sampleButton = document.getElementById("sampleSearchButton");
  if (sampleButton) {
    sampleButton.addEventListener("click", (event) => {
      event.stopPropagation(); // not an outside click for the plugin
      if (isOpen()) {
        wantOpen = false;
        api().toggleSearch(false);
      } else {
        wantOpen = true;
        apply();
      }
    });
  }

  // ---------------------------------------------------------------------------
  // The Control Panel
  // ---------------------------------------------------------------------------
  function fromPanel(event) {
    if (event.source !== window.parent) return false;
    const origin = event.origin || "";
    return (
      origin === window.location.origin ||
      (origin === "null" && window.location.protocol === "file:")
    );
  }

  window.addEventListener("message", (event) => {
    if (!fromPanel(event)) return;
    const data = event.data;
    if (!data || data.type !== "searchProPreview") return;
    if (data.action === "state" && data.state && typeof data.state === "object") {
      const next = data.state;
      if (next.mode === "results" || next.mode === "none" || next.mode === "empty")
        state.mode = next.mode;
      if (typeof next.focus === "boolean") state.focus = next.focus;
      if (next.device === "desktop" || next.device === "phone") state.device = next.device;
      wantOpen = true;
      apply(true);
    } else if (data.action === "config" && data.config && typeof data.config === "object") {
      if (api() && typeof api().updateConfig === "function") api().updateConfig(data.config);
      setTimeout(apply, 120);
    }
  });

  // after a change of settings the plugin may redraw: look once more that the state still holds
  window.addEventListener("storage", (event) => {
    if (event.key === "searchProLiveConfig") setTimeout(apply, 700);
  });

  // ---------------------------------------------------------------------------
  // Start: wait for the index of the sample tour
  // ---------------------------------------------------------------------------
  // A tour starts the search through the Button of its skin: tourSearchFunctions.initializeSearch(player). The sample does the
  // same once the plugin has built its markup (the plugin's own automatic start needs the 3DVista player).
  let started = false;
  function start() {
    if (started) return;
    if (!api() || typeof api().initializeSearch !== "function" || !box()) return;
    started = true;
    api().initializeSearch(window.tour.locManager.rootPlayer);
  }

  let tries = 0;
  const wait = setInterval(() => {
    tries++;
    start();
    let count = 0;
    try {
      count = api() && api().getSearchIndex ? api().getSearchIndex().length : 0;
    } catch (error) {
      count = 0;
    }
    if (window.searchListInitialized === true && count > 0 && box()) {
      clearInterval(wait);
      ready = true;
      watchBox();
      try {
        window.parent.postMessage(
          { type: "searchProPreviewReady", results: count, facts: window.sampleTourFacts || null },
          window.location.origin === "null" ? "*" : window.location.origin
        );
      } catch (error) {
        // not inside the Control Panel (the page opened by itself): nothing to tell
      }
      apply();
    } else if (tries > 150) {
      clearInterval(wait);
    }
  }, 100);
})();
