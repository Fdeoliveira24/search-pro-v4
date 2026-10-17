/**
 * Search Pro Control Panel - Data Sources Tab Handler
 * Version 4.6 - Last Update on 10/16/2026 - Search Pro V4.6: the rows found without a tour are CSV records, not text lines (dsCountCsvRecords); earlier (4.5): Data Sources rebuilt - one source at a time (Tour only / Google Sheets / CSV file), Test button, plain-language options
 * Handles all functionality specific to the Data Sources settings tab: the choice of source, the Test button with its report,
 * Restore Defaults for the Source and Remember the Sheet sections, checks that explain a value that cannot be used, and a notice
 * while Display settings hide what the sheet fills in (pictures, tags, subtitles).
 */

// ---- helpers shared by the test button (same rules as the plugin) -------------------------------------------------
const DS_COLUMN_ALIASES = {
  id: "id",
  identifier: "id",
  tag: "tag",
  tags: "tags",
  name: "name",
  title: "name",
  label: "name",
  description: "description",
  desc: "description",
  subtitle: "description",
  imageurl: "imageUrl",
  image: "imageUrl",
  img: "imageUrl",
  imagelink: "imageUrl",
  thumbnail: "imageUrl",
  thumbnailurl: "imageUrl",
  picture: "imageUrl",
  photo: "imageUrl",
  elementtype: "elementType",
  type: "elementType",
  kind: "elementType",
  parentid: "parentId",
  parent: "parentId",
};

const DS_EXAMPLE_CSV = [
  "id,tag,name,description,imageUrl,elementType,parentId,tags",
  'Lobby,,Main Lobby,Welcome area with the reception desk,https://example.com/lobby.jpg,Panorama,,"entrance, reception"',
  "Info-Hotspot,,Opening Hours,Open every day from 9 to 5,,Hotspot,Lobby,",
  "Pool-Video,,Pool Tour,A short video of the pool,,Video,Lobby,video",
].join("\n");

function dsNormalizeSheetUrl(raw) {
  const url = String(raw || "").trim();
  let m = url.match(
    /^(https?:\/\/(?:docs|spreadsheets)\.google\.com\/spreadsheets\/d\/e\/[\w-]+)\/pub(?:html)?(\?[^#]*)?/i
  );
  if (m) {
    const q = new URLSearchParams(m[2] || "");
    ["widget", "headers", "chrome"].forEach((k) => q.delete(k));
    q.set("output", "csv");
    return { url: `${m[1]}/pub?${q.toString()}`, converted: true };
  }
  m = url.match(
    /^https?:\/\/(?:docs|spreadsheets)\.google\.com\/spreadsheets\/d\/([\w-]+)(?:\/([^?#]*))?(\?[^#]*)?(#.*)?$/i
  );
  if (m && m[1] !== "e") {
    const tail = (m[2] || "").toLowerCase();
    if (tail.startsWith("export") || tail.startsWith("gviz")) return { url, converted: false };
    const gid =
      new URLSearchParams(m[3] || "").get("gid") || ((m[4] || "").match(/gid=(\d+)/) || [])[1];
    return {
      url: `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv${gid ? "&gid=" + gid : ""}`,
      converted: true,
    };
  }
  return { url, converted: false };
}

function dsDetectDelimiter(text) {
  const first = String(text).replace(/^﻿/, "").split(/\r?\n/, 1)[0] || "";
  const counts = { ",": 0, ";": 0, "\t": 0 };
  let inQuotes = false;
  for (const ch of first) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch]++;
  }
  let best = ",";
  Object.keys(counts).forEach((d) => {
    if (counts[d] > counts[best]) best = d;
  });
  return best;
}

/**
 * Number of CSV records (the title row included). A line break inside "quotes" belongs to the cell, so it does not start
 * a new record, and empty lines count for nothing
 */
function dsCountCsvRecords(text) {
  let records = 0;
  let inQuotes = false;
  let hasContent = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      // a doubled quote ("") inside a cell flips twice and so stays inside the cell
      inQuotes = !inQuotes;
      hasContent = true;
    } else if ((c === "\n" || c === "\r") && !inQuotes) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      if (hasContent) records++;
      hasContent = false;
    } else if (!/\s/.test(c)) {
      hasContent = true;
    }
  }
  return hasContent ? records + 1 : records;
}

class DataSourcesTabHandler {
  constructor() {
    this.core = null;
    this.tabId = "data-sources";
    this.container = null;

    // The settings each "Restore Defaults" button puts back
    this.sectionPaths = {
      source: [
        "googleSheets.useGoogleSheetData",
        "googleSheets.useLocalCSV",
        "googleSheets.googleSheetUrl",
        "googleSheets.localCSVUrl",
      ],
      cache: ["googleSheets.caching"],
    };
  }

  /**
   * Set the core instance
   */
  setCore(core) {
    this.core = core;
  }

  /**
   * Initialize data sources tab functionality
   */
  init(container) {
    try {
      this.container = container;

      // Settings saved by older versions (separate directory + file name) become one CSV path
      this.upgradeLegacySettings();

      // Setup form listeners
      this.core.setupFormListeners(container);

      // Settings can be replaced from outside (restore, load a file): show the new state
      if (!this.replacedListener) {
        this.replacedListener = () => {
          const panel = document.getElementById("data-sources-panel");
          if (!panel) return;
          this.upgradeLegacySettings();
          this.populateDataSourcesForm(panel);
          this.validateForm(panel);
        };
        document.addEventListener("controlPanelConfigReplaced", this.replacedListener);
      }

      // What the sheet fills in only shows while Display allows it: follow those switches (they live in another tab)
      if (!this.displayListener) {
        const names = [
          "thumbnailSettings.enableThumbnails",
          "display.showTagsInResults",
          "display.showSubtitlesInResults",
        ];
        this.displayListener = (event) => {
          if (event.target && names.includes(event.target.name)) this.updateDisplayNotice();
        };
        this.tabListener = (event) => {
          if (event.detail && event.detail.tabId === "data-sources") this.updateDisplayNotice();
        };
        document.addEventListener("change", this.displayListener);
        document.addEventListener("tabChanged", this.tabListener);
      }
      container.addEventListener("formpopulated", () => this.updateDisplayNotice(container));

      // Populate form with current values, then show the choice
      this.populateDataSourcesForm(container);

      // Setup data sources specific features
      this.setupSourceChoice(container);
      this.setupTestButton(container);
      this.setupExampleButton(container);
      this.setupResetButtons(container);

      // Validate all fields
      this.validateForm(container);
    } catch (error) {
      console.error("❌ Error initializing Data Sources tab:", error);
    }
  }

  /**
   * Older settings kept the CSV in two fields (directory + file name); now it is one path
   */
  upgradeLegacySettings() {
    const gs = this.core.config.googleSheets;
    if (!gs) return;
    if (gs.localCSVFile !== undefined || gs.localCSVDir !== undefined) {
      const legacyPath = `${gs.localCSVDir || "business-data"}/${gs.localCSVFile || "search-data.csv"}`;
      // an address typed into the old panel wins; otherwise the old directory + file name become the path
      if (!gs.localCSVUrl || gs.localCSVUrl === "business-data/search-data.csv")
        gs.localCSVUrl = legacyPath;
      delete gs.localCSVFile;
      delete gs.localCSVDir;
    }
  }

  /**
   * Populate data sources form with current values
   */
  populateDataSourcesForm(container) {
    try {
      // Let core populate the fields first
      this.core.populateForm(container);
      this.updateSourceUI(container);
    } catch (error) {
      console.error("🚨 Security: Error populating data sources form:", error);
    }
  }

  /**
   * Which source is selected: "none", "sheet" or "csv" (kept in two hidden switches)
   */
  getMode(container) {
    const master = container.querySelector("#useGoogleSheetData");
    const csv = container.querySelector("#useLocalCSV");
    if (!master || !master.checked) return "none";
    return csv && csv.checked ? "csv" : "sheet";
  }

  /**
   * Setup the three-way source choice
   */
  setupSourceChoice(container) {
    try {
      const group = container.querySelector(".ds-choice");
      if (!group) return;
      const options = Array.from(group.querySelectorAll(".ds-option"));
      options.forEach((button, index) => {
        button.addEventListener("click", () => this.chooseSource(container, button.dataset.source));
        button.addEventListener("keydown", (event) => {
          let next = null;
          if (event.key === "ArrowRight" || event.key === "ArrowDown")
            next = (index + 1) % options.length;
          if (event.key === "ArrowLeft" || event.key === "ArrowUp")
            next = (index - 1 + options.length) % options.length;
          if (next !== null) {
            event.preventDefault();
            options[next].focus();
            this.chooseSource(container, options[next].dataset.source);
          }
        });
      });
    } catch (error) {
      console.error("🚨 Error setting up the source choice:", error);
    }
  }

  /**
   * Select a source: sets the two hidden switches like a person clicking them (saving, live preview and export follow)
   */
  chooseSource(container, mode) {
    const master = container.querySelector("#useGoogleSheetData");
    const csv = container.querySelector("#useLocalCSV");
    if (!master || !csv || this.getMode(container) === mode) return;
    const wanted = { master: mode !== "none", csv: mode === "csv" };
    [
      [master, wanted.master],
      [csv, wanted.csv],
    ].forEach(([box, value]) => {
      if (box.checked !== value) {
        box.checked = value;
        box.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    this.updateSourceUI(container);
    this.validateForm(container);
    const result = container.querySelector("#dsTestResult");
    if (result) result.replaceChildren();
  }

  /**
   * Show which source is active: selected button, only that source's fields, banner and Test button
   */
  updateSourceUI(container) {
    try {
      const mode = this.getMode(container);
      container.querySelectorAll(".ds-option").forEach((button) => {
        const selected = button.dataset.source === mode;
        button.setAttribute("aria-checked", selected ? "true" : "false");
        button.setAttribute("tabindex", selected ? "0" : "-1");
        button.classList.toggle("is-selected", selected);
      });
      const sheetPanel = container.querySelector("#dsSheetPanel");
      const csvPanel = container.querySelector("#dsCsvPanel");
      const testBox = container.querySelector("#dsTestBox");
      if (sheetPanel) sheetPanel.hidden = mode !== "sheet";
      if (csvPanel) csvPanel.hidden = mode !== "csv";
      if (testBox) testBox.hidden = mode === "none";

      const banner = container.querySelector("#dsBanner");
      if (banner) {
        const url = (container.querySelector("#googleSheetUrl") || {}).value || "";
        const file = (container.querySelector("#localCSVUrl") || {}).value || "";
        banner.className = "ds-banner";
        if (mode === "none") {
          banner.classList.add("ds-banner-off");
          banner.textContent = "Off. The search uses the tour's own titles, descriptions and tags.";
        } else if (mode === "sheet") {
          banner.classList.add(url.trim() ? "ds-banner-on" : "ds-banner-warn");
          banner.textContent = url.trim()
            ? "Active: Google Sheets. Results show the information from your sheet."
            : "Google Sheets is selected, but no link has been entered yet.";
        } else {
          banner.classList.add(file.trim() ? "ds-banner-on" : "ds-banner-warn");
          banner.textContent = file.trim()
            ? "Active: CSV file. Results show the information from your file."
            : "CSV file is selected, but no file has been entered yet.";
        }
      }
      this.updateDisplayNotice(container);
    } catch (error) {
      console.error("🚨 Error updating the data source choice:", error);
    }
  }

  // ---- Test button --------------------------------------------------------------------------------------------

  setupTestButton(container) {
    const button = container.querySelector("#dsTestButton");
    if (button) button.addEventListener("click", () => this.runTest(container));
    ["#googleSheetUrl", "#localCSVUrl", "#cacheTimeout"].forEach((selector) => {
      const field = container.querySelector(selector);
      if (!field) return;
      field.addEventListener("input", () => this.updateSourceUI(container));
    });
  }

  setupExampleButton(container) {
    const button = container.querySelector("#dsExampleButton");
    if (!button) return;
    button.addEventListener("click", () => {
      const url = URL.createObjectURL(new Blob([DS_EXAMPLE_CSV], { type: "text/csv" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "example-search-data.csv";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });
  }

  /**
   * The settings as typed in the form right now (not necessarily applied yet)
   */
  readSettings(container) {
    const mode = this.getMode(container);
    return {
      useGoogleSheetData: mode !== "none",
      useLocalCSV: mode === "csv",
      googleSheetUrl: ((container.querySelector("#googleSheetUrl") || {}).value || "").trim(),
      localCSVUrl: ((container.querySelector("#localCSVUrl") || {}).value || "").trim(),
      fetchMode:
        (this.core.config.googleSheets && this.core.config.googleSheets.fetchMode) || "csv",
    };
  }

  async runTest(container) {
    const box = container.querySelector("#dsTestResult");
    const button = container.querySelector("#dsTestButton");
    if (!box) return;
    button.disabled = true;
    this.showLine(box, "info", "Testing…");
    try {
      const settings = this.readSettings(container);
      const reply = await this.askTour(settings);
      if (reply) this.renderReport(box, reply, true);
      else this.renderReport(box, await this.localCheck(settings), false);
    } catch (error) {
      this.showLine(box, "error", `The test could not be completed: ${error.message}`);
    } finally {
      button.disabled = false;
    }
  }

  /**
   * Ask a tour that is open in this browser how the rows match it (answered by the plugin); null when none answers
   */
  askTour(settings) {
    return new Promise((resolve) => {
      if (typeof BroadcastChannel === "undefined") return resolve(null);
      const channel = new BroadcastChannel("tourSearchChannel");
      const id = `dsTest${Date.now()}${Math.random().toString(36).slice(2)}`;
      const giveUp = (wait) =>
        setTimeout(() => {
          channel.close();
          resolve(null);
        }, wait);
      // the plugin confirms at once that a tour is open (even before its search has started), then sends the report
      let timer = giveUp(1500);
      channel.onmessage = (event) => {
        const message = event.data;
        if (!message || !message.data || message.data.id !== id) return;
        if (message.type === "searchProAck") {
          clearTimeout(timer);
          timer = giveUp(30000);
        } else if (message.type === "searchProDataSourceReport") {
          clearTimeout(timer);
          channel.close();
          resolve(message.data.report);
        }
      };
      channel.postMessage({
        type: "searchProDataSourceReportRequest",
        data: { id, googleSheets: settings },
        timestamp: Date.now(),
      });
    });
  }

  /**
   * Connection-only check done by the Control Panel itself (when no tour answers)
   */
  async localCheck(settings) {
    const isCsv = settings.useLocalCSV;
    const status = {
      state: "error",
      source: isCsv ? "csv" : "sheet",
      rows: 0,
      message: "",
      columns: [],
      unknownColumns: [],
      missingColumns: [],
      converted: false,
    };
    const fail = (message) => ({
      tourReady: false,
      status: Object.assign(status, { state: "error", message }),
    });
    let url;
    if (isCsv) {
      const raw = settings.localCSVUrl;
      if (!raw) return fail("No CSV file has been entered.");
      url = /^https?:\/\//i.test(raw)
        ? raw
        : new URL(raw.replace(/^(\.\/|\/)+/, ""), new URL("../", location.href)).href;
    } else {
      if (!settings.googleSheetUrl) return fail("No Google Sheets link has been entered.");
      if (!/^https?:\/\//i.test(settings.googleSheetUrl))
        return fail("The Google Sheets link must start with https://");
      const n = dsNormalizeSheetUrl(settings.googleSheetUrl);
      url = n.url;
      status.converted = n.converted;
    }
    const what = isCsv ? "CSV file" : "sheet";
    let response;
    try {
      response = await fetch(url);
    } catch (error) {
      return fail(`The ${what} could not be reached (${error.message || "network error"}).`);
    }
    if (!response.ok) {
      const c = response.status;
      if (c === 404)
        return fail(
          isCsv ? `The CSV file was not found: ${url}` : "The sheet was not found. Check the link."
        );
      if (c === 401 || c === 403)
        return fail(
          "The sheet is private. In Google Sheets choose Share > Anyone with the link > Viewer, or File > Share > Publish to web."
        );
      return fail(`The ${what} could not be loaded (HTTP ${c}).`);
    }
    const type = response.headers.get("content-type") || "";
    const text = await response.text();
    if (/text\/html/i.test(type) || /^\s*<(!doctype|html|head|body)/i.test(text)) {
      return fail(
        "The link returned a web page, not data. In Google Sheets use File > Share > Publish to web > CSV, or share the sheet as 'Anyone with the link: Viewer'."
      );
    }
    const delimiter = dsDetectDelimiter(text);
    const lines = text
      .replace(/^﻿/, "")
      .split(/\r?\n/)
      .filter((l) => l.trim());
    const titles = (lines[0] || "").split(delimiter).map((t) => t.replace(/^"|"$/g, "").trim());
    const columns = titles.map(
      (t) => DS_COLUMN_ALIASES[t.toLowerCase().replace(/[\s_-]+/g, "")] || ""
    );
    status.columns = titles;
    status.unknownColumns = titles.filter((t, i) => t && !columns[i]);
    status.missingColumns = ["id", "name"].filter((c) => !columns.includes(c));
    status.rows = Math.max(0, dsCountCsvRecords(text.replace(/^﻿/, "")) - 1);
    if (
      !status.rows ||
      (!columns.includes("id") && !columns.includes("tag") && !columns.includes("name"))
    ) {
      return fail(
        `No usable rows were found. The first row must hold the column titles (id, name, description, imageUrl, elementType, parentId). Found columns: ${titles.join(", ")}.`
      );
    }
    status.state = "ok";
    status.message = `${status.rows} rows found`;
    return { tourReady: false, status };
  }

  // ---- Showing the result (built with textContent: sheet content is never inserted as HTML) --------------------------

  showLine(box, kind, text) {
    const line = document.createElement("p");
    line.className = `ds-line ds-${kind}`;
    line.textContent = text;
    box.replaceChildren(line);
    return line;
  }

  /**
   * Show the result of a test: the connection, summary tiles that double as filters, and a searchable table with
   * every row (25 / 50 / 100 per page, so tours with thousands of rows stay usable)
   */
  renderReport(box, report, fromTour) {
    box.replaceChildren();
    const el = (tag, className, text) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    };
    const status = report.status || {};

    // 1. Connection ---------------------------------------------------------------------------------------------
    const conn = el("div", "ds-block");
    conn.appendChild(el("h4", "ds-block-title", "Connection"));
    const say = (kind, text) => conn.appendChild(el("p", `ds-line ds-${kind}`, text));
    if (status.state !== "ok") {
      say("error", status.message || "The source could not be read.");
      box.appendChild(conn);
      return;
    }
    say(
      "ok",
      `Connected: ${Number(status.rows).toLocaleString()} rows read${status.fromCache ? " (remembered copy)" : ""}.`
    );
    if (status.converted)
      say("info", "Your link was converted to a data (CSV) address automatically.");
    if (status.delimiter && status.delimiter !== ",") {
      say(
        "info",
        `Columns are separated by ${status.delimiter === ";" ? "semicolons" : "tabs"}; that is understood.`
      );
    }
    if (status.columns && status.columns.length) {
      const chips = el("div", "ds-chips");
      chips.setAttribute("aria-label", "Columns found");
      status.columns.forEach((title) => {
        const used = !!DS_COLUMN_ALIASES[title.toLowerCase().replace(/[\s_-]+/g, "")];
        const chip = el(
          "span",
          `ds-chip ${used ? "ds-chip-used" : "ds-chip-muted"}`,
          title || "(empty title)"
        );
        chip.title = used ? "Used" : "Not used by the search";
        chips.appendChild(chip);
      });
      conn.appendChild(chips);
    }
    if (status.missingColumns && status.missingColumns.includes("id")) {
      say(
        "warn",
        "There is no 'id' column, so rows cannot be matched to the tour. Use the 'id' column to name the tour item."
      );
    }
    box.appendChild(conn);

    if (!fromTour || !report.summary) {
      box.appendChild(
        el(
          "p",
          "ds-line ds-info",
          "To also check how the rows match your tour, open the tour in this browser, press its search button once, and test again."
        )
      );
      return;
    }

    // 2. Summary tiles (they filter the table) ---------------------------------------------------------------------
    const items = report.items || [];
    const hiddenOf = (item) => item.result === "notfound" || item.result === "duplicate";
    const warnOf = (item) => !hiddenOf(item) && item.notes && item.notes.length > 0;
    const FILTERS = {
      all: { label: "All rows", test: () => true },
      linked: { label: "Linked to a tour item", test: (i) => i.result === "linked" },
      parent: { label: "Jump to a parent", test: (i) => i.result === "parent" },
      hidden: { label: "Not shown", test: hiddenOf },
      warn: { label: "Shown, with a warning", test: warnOf },
    };
    Object.keys(FILTERS).forEach(
      (key) => (FILTERS[key].count = items.filter(FILTERS[key].test).length)
    );
    const state = {
      filter: FILTERS.hidden.count ? "hidden" : FILTERS.warn.count ? "warn" : "all",
      query: "",
      page: 0,
      size: 25,
    };

    const sum = el("div", "ds-block");
    sum.appendChild(el("h4", "ds-block-title", "How the rows relate to your tour"));
    const tiles = el("div", "ds-tiles");
    const tileButtons = {};
    Object.keys(FILTERS).forEach((key) => {
      const tile = el("button", `ds-tile ds-tile-${key}`);
      tile.type = "button";
      tile.appendChild(el("span", "ds-tile-count", FILTERS[key].count.toLocaleString()));
      tile.appendChild(el("span", "ds-tile-label", FILTERS[key].label));
      tile.addEventListener("click", () => {
        state.filter = key;
        state.page = 0;
        draw();
      });
      tileButtons[key] = tile;
      tiles.appendChild(tile);
    });
    sum.appendChild(tiles);
    box.appendChild(sum);

    // 3. The table ---------------------------------------------------------------------------------------------------
    const tableBlock = el("div", "ds-block");
    tableBlock.appendChild(el("h4", "ds-block-title", "Rows"));
    const bar = el("div", "ds-toolbar");
    const search = el("input", "form-input ds-search");
    search.type = "search";
    search.placeholder = "Filter rows by id, title, target or note…";
    search.setAttribute("aria-label", "Filter rows");
    const sizeLabel = el("label", "ds-size", "Rows per page ");
    const size = el("select", "form-select");
    [25, 50, 100].forEach((n) => size.appendChild(new Option(String(n), String(n))));
    sizeLabel.appendChild(size);
    const download = el("button", "btn btn-secondary ds-download", "Download report (CSV)");
    download.type = "button";
    bar.append(search, sizeLabel, download);
    tableBlock.appendChild(bar);

    const wrap = el("div", "ds-table-wrap");
    wrap.tabIndex = 0;
    wrap.setAttribute("role", "region");
    wrap.setAttribute("aria-label", "Rows of the source");
    const table = el("table", "ds-table");
    const head = el("thead");
    const headRow = el("tr");
    ["#", "Id in the sheet", "Title in the sheet", "Result", "Goes to", "Notes"].forEach(
      (title) => {
        const th = el("th", "", title);
        th.scope = "col";
        headRow.appendChild(th);
      }
    );
    head.appendChild(headRow);
    const body = el("tbody");
    table.append(head, body);
    wrap.appendChild(table);
    tableBlock.appendChild(wrap);

    const pager = el("div", "ds-pager");
    const count = el("span", "ds-count");
    count.setAttribute("aria-live", "polite");
    const prev = el("button", "btn btn-secondary", "Previous");
    prev.type = "button";
    const next = el("button", "btn btn-secondary", "Next");
    next.type = "button";
    pager.append(count, prev, next);
    tableBlock.appendChild(pager);
    box.appendChild(tableBlock);

    const RESULT = {
      linked: ["ds-badge-linked", "Linked"],
      parent: ["ds-badge-parent", "Jumps to parent"],
      notfound: ["ds-badge-hidden", "Not shown"],
      duplicate: ["ds-badge-hidden", "Not shown (duplicate)"],
    };
    const goesTo = (item) => {
      if (item.result === "linked") {
        const first = (item.targets && item.targets[0]) || "";
        return item.targets && item.targets.length > 1
          ? `${first} (+${item.targets.length - 1} more)`
          : first;
      }
      return item.result === "parent" ? item.parent : "—";
    };
    const textOf = (item) =>
      [item.id, item.tag, item.name, goesTo(item), (item.notes || []).join(" ")]
        .join(" ")
        .toLowerCase();

    const draw = () => {
      const test = FILTERS[state.filter].test;
      const q = state.query.trim().toLowerCase();
      const rows = items.filter((item) => test(item) && (!q || textOf(item).includes(q)));
      const pages = Math.max(1, Math.ceil(rows.length / state.size));
      state.page = Math.min(state.page, pages - 1);
      const from = state.page * state.size;
      body.replaceChildren();
      rows.slice(from, from + state.size).forEach((item) => {
        const tr = el("tr");
        const cells = [String(item.n), item.id || item.tag || "", item.name || ""];
        cells.forEach((text) => tr.appendChild(el("td", "", text)));
        const resultCell = el("td");
        const [badgeClass, badgeText] = RESULT[item.result] || ["ds-badge-hidden", item.result];
        resultCell.appendChild(el("span", `ds-badge ${badgeClass}`, badgeText));
        tr.appendChild(resultCell);
        const target = el("td", "", goesTo(item));
        if (item.result === "linked" && item.targets && item.targets.length > 1)
          target.title = item.targets.join("\n");
        tr.appendChild(target);
        const notes = el("td", "ds-notes", (item.notes || []).join(" "));
        tr.appendChild(notes);
        body.appendChild(tr);
      });
      if (!rows.length) {
        const tr = el("tr");
        const td = el("td", "ds-empty", "No rows match this filter.");
        td.colSpan = 6;
        tr.appendChild(td);
        body.appendChild(tr);
      }
      Object.keys(tileButtons).forEach((key) => {
        tileButtons[key].classList.toggle("is-active", key === state.filter);
        tileButtons[key].setAttribute("aria-pressed", key === state.filter ? "true" : "false");
      });
      count.textContent = rows.length
        ? `${(from + 1).toLocaleString()}–${Math.min(from + state.size, rows.length).toLocaleString()} of ${rows.length.toLocaleString()} rows (page ${state.page + 1} of ${pages})`
        : "0 rows";
      prev.disabled = state.page === 0;
      next.disabled = state.page >= pages - 1;
    };

    search.addEventListener("input", () => {
      state.query = search.value;
      state.page = 0;
      draw();
    });
    size.addEventListener("change", () => {
      state.size = parseInt(size.value, 10) || 25;
      state.page = 0;
      draw();
    });
    prev.addEventListener("click", () => {
      state.page -= 1;
      draw();
    });
    next.addEventListener("click", () => {
      state.page += 1;
      draw();
    });
    download.addEventListener("click", () => this.downloadReport(items));
    draw();
  }

  /**
   * The whole report as a CSV file (for sheets with many rows)
   */
  downloadReport(items) {
    const cell = (value) => `"${String(value == null ? "" : value).replace(/"/g, '""')}"`;
    const lines = [
      [
        "row",
        "id",
        "tag",
        "name",
        "elementType",
        "parentId",
        "result",
        "matched_by",
        "goes_to",
        "notes",
      ].join(","),
    ];
    items.forEach((item) => {
      const goes =
        item.result === "linked"
          ? (item.targets || []).join(" | ")
          : item.result === "parent"
            ? item.parent
            : "";
      lines.push(
        [
          item.n,
          item.id,
          item.tag,
          item.name,
          item.elementType,
          item.parentId,
          item.result,
          item.via,
          goes,
          (item.notes || []).join(" "),
        ]
          .map(cell)
          .join(",")
      );
    });
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "data-source-report.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // ---- Validation -------------------------------------------------------------------------------------------------

  /**
   * Called by the core for every field of this tab: returns the text that explains why a value cannot be used, or ""
   */
  getFieldProblem(name, value, input) {
    try {
      const text = String(value === null || value === undefined ? "" : value).trim();
      const panel = input && input.closest ? input.closest("#data-sources-panel") : null;
      const mode = panel ? this.getMode(panel) : "none";
      if (name === "googleSheets.googleSheetUrl" && mode === "sheet" && text) {
        if (!/^https?:\/\//i.test(text)) return "The link must start with https://";
      } else if (name === "googleSheets.localCSVUrl" && mode === "csv" && text) {
        const isUrl = /^https?:\/\//i.test(text);
        if (!isUrl && (!/^[\w ./-]+$/.test(text) || text.includes(".."))) {
          return "Use a path such as business-data/search-data.csv, or a full web address.";
        }
      } else if (name === "googleSheets.caching.timeoutMinutes") {
        const n = Number(text);
        if (text === "" || !Number.isInteger(n) || n < 1 || n > 1440) {
          return "Enter a number of minutes from 1 to 1440.";
        }
      }
    } catch (error) {
      console.error("🚨 Error checking a Data Sources field:", error);
    }
    return "";
  }

  /**
   * Validate entire form for Data Sources tab
   */
  validateForm(container = document) {
    try {
      let valid = true;
      container.querySelectorAll("[name]").forEach((input) => {
        if (input.type === "checkbox" || input.type === "hidden") return;
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
    } catch (error) {
      console.error("🚨 Error validating the Data Sources tab:", error);
      return false;
    }
  }

  // ---- Restore Defaults ---------------------------------------------------------------------------------------

  setupResetButtons(container) {
    container.querySelectorAll(".reset-section-button[data-section]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        this.core.restoreWithUndo({
          button,
          restore: () => this.restoreSection(button.dataset.section),
          repopulate: () => {
            this.populateDataSourcesForm(
              this.container || document.getElementById("data-sources-panel")
            );
          },
        });
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
      });
      const container = this.container || document.getElementById("data-sources-panel");
      if (container) {
        container.querySelectorAll(`[data-section-key="${key}"] .error`).forEach((field) => {
          field.classList.remove("error");
          delete field.dataset.blocked;
          if (field.id && window.clearValidationMessage) window.clearValidationMessage(field.id);
        });
        const result = container.querySelector("#dsTestResult");
        if (key === "source" && result) result.replaceChildren();
        this.populateDataSourcesForm(container);
      }
      this.core.applyLivePreview(paths[0], this.core.getNestedProperty(this.core.config, paths[0]));
      return true;
    } catch (error) {
      console.error("🚨 Error restoring a Data Sources section:", error);
      return false;
    }
  }

  // ---- What depends on Display ----------------------------------------------------------------------------------

  /**
   * The picture, tags and description of a sheet only show while Display lets them: say so while a source is on
   */
  updateDisplayNotice(container = this.container) {
    try {
      const note = container && container.querySelector("#dsDisplayNotice");
      if (!note) return;
      const config = this.core.config || {};
      const display = config.display || {};
      const messages = [];
      if (this.getMode(container) !== "none") {
        if (!(config.thumbnailSettings && config.thumbnailSettings.enableThumbnails === true)) {
          messages.push(
            "Pictures are off in Display (Show Pictures in Results), so the imageUrl column is not shown."
          );
        }
        const tagsShown =
          display.showTagsInResults !== undefined
            ? display.showTagsInResults
            : config.showTagsInResults;
        if (tagsShown === false) {
          messages.push(
            "Tags are off in Display (Show Tags in Results), so the tags column is not shown."
          );
        }
        if (display.showSubtitlesInResults === false) {
          messages.push(
            "Subtitles are off in Display (Show Subtitles in Results), so the description column is not shown."
          );
        }
      }
      note.hidden = messages.length === 0;
      const text = note.querySelector("span");
      if (text) text.textContent = messages.join(" ");
    } catch (error) {
      console.error("🚨 Error updating the Display notice:", error);
    }
  }

  /**
   * Reset Data Sources tab to defaults
   */
  resetToDefaults() {
    try {
      const defaults = this.core.getDefaultConfig();
      if (defaults.googleSheets) {
        this.core.config.googleSheets = JSON.parse(JSON.stringify(defaults.googleSheets));
      }
      const container = document.getElementById("data-sources-panel");
      if (container) this.populateDataSourcesForm(container);
    } catch (error) {
      console.error("🚨 Security: Error resetting Data Sources tab:", error);
    }
  }

  /**
   * Get Data Sources tab configuration summary
   */
  getConfigSummary() {
    try {
      return {
        tab: "Data Sources",
        sections: { googleSheets: this.core.config.googleSheets || {} },
      };
    } catch (error) {
      console.error("🚨 Security: Error getting Data Sources tab config summary:", error);
      return null;
    }
  }

  /**
   * Cleanup resources when tab is unloaded
   */
  cleanup() {
    if (this.replacedListener)
      document.removeEventListener("controlPanelConfigReplaced", this.replacedListener);
    if (this.displayListener) document.removeEventListener("change", this.displayListener);
    if (this.tabListener) document.removeEventListener("tabChanged", this.tabListener);
    this.replacedListener = this.displayListener = this.tabListener = null;
  }

  /**
   * Update configuration from form values for Data Sources tab
   * @param {HTMLElement} container The data sources tab container element
   */
  updateConfigFromForm(container) {
    try {
      const formInputs = container.querySelectorAll("[name]");
      formInputs.forEach((input) => {
        const name = input.getAttribute("name");
        if (!name) return;
        let value;
        if (input.type === "checkbox") {
          value = input.checked;
        } else if (input.type === "number") {
          value = input.value === "" ? null : parseInt(input.value, 10);
        } else {
          value = String(input.value).trim();
        }
        this.core.safeSetNestedProperty(this.core.config, name, value);
      });

      // a relative CSV path is read from the plugin folder: "./" and a leading "/" mean nothing there
      const gs = this.core.config.googleSheets;
      if (gs && typeof gs.localCSVUrl === "string" && !/^https?:\/\//i.test(gs.localCSVUrl)) {
        gs.localCSVUrl = gs.localCSVUrl.replace(/^(\.\/|\/)+/, "");
      }
    } catch (error) {
      console.error("🚨 Security: Error updating config from Data Sources tab form:", error);
    }
  }
}

// Export for module use
if (typeof module !== "undefined" && module.exports) {
  module.exports = DataSourcesTabHandler;
} else {
  window.DataSourcesTabHandler = DataSourcesTabHandler;
}
