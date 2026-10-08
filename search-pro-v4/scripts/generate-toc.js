#!/usr/bin/env node
/**
 * Search Pro V4 - Table of Contents generator for search-v4.js
 *
 * search-v4.js documents itself with numbered comments:
 *
 *   // ====...====
 *   // [4.0] SECTION: Main search module - what the section contains
 *   // ====...====
 *   // [4.6] Class: ConfigBuilder - what it does (a long description may continue on
 *   //      lines that start with "//" and six spaces)
 *   // [4.6.2] Method: setDisplayOptions(options) - what it does
 *   // [4.6.2.1] Any other text   <- a "step" comment inside a function (no "Kind:" prefix)
 *
 * This script keeps those numbers and the Table of Contents at the end of the file correct, so after you add,
 * remove or move a function you never have to renumber by hand:
 *
 *   1. Write the new header with the right DEPTH and any number, for example  // [4.13.x] Function: _foo() - ...
 *      (depth = how many numbers the tag has: [4.13.x] is a child of [4.13]; [4.13.x.x] a child of that child)
 *   2. Run  npm run toc
 *
 * What it does
 *   - renumbers every tag from the order of the file and the depth of each tag (the numbers you typed are ignored,
 *     "x" is fine); sections become [0.0], [1.0], [2.0] ...
 *   - rebuilds the Table of Contents block at the end of the file (every section, module, class, function, method,
 *     helper, handler ...; the stages of functions with 5 or more step comments are listed too) with line numbers
 *   - only comment lines change. Before writing it proves that every other line is byte-identical and that the
 *     result still compiles.
 *
 * Usage
 *   node scripts/generate-toc.js                 update search-v4.js in place
 *   node scripts/generate-toc.js --check         change nothing; exit code 1 when numbering or table are out of date
 *   node scripts/generate-toc.js --stamp         also set "Last Updated" in the file header to today's date
 *   node scripts/generate-toc.js --stamp 10/07/2026   ... or to a given MM/DD/YYYY date
 *   node scripts/generate-toc.js --file path/to/other.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

// ------------------------------------------------------------------------------------------------ settings
const KINDS = [
  "Section",
  "Group",
  "Module",
  "Class",
  "Function",
  "Sub-function",
  "Method",
  "Helper",
  "Handler",
  "State",
  "Constants",
  "Template",
  "Block",
  "Execution",
  "Member",
  "Alias",
];
const STEP_LIST_MIN = 5; // functions with at least this many direct step comments get their stages listed
const WIDTH = 118; // wrap width of the table
const TOC_TITLE = "SEARCH PRO - TABLE OF CONTENTS";
const TOC_END = "END OF TABLE OF CONTENTS";
const LEGEND = [
  "HOW TO READ THIS TABLE",
  "  [N.0] SECTION   a major part of the file, introduced by a framed banner comment",
  "  [N.k]           a module, group, class, function, state block or handler inside the section",
  "  [N.k.j]         a member / sub-function of the entry above (nesting follows the numbers)",
  `  Step comments   numbered [N.k.j...] inside functions describe the stages of the code. Functions with ${STEP_LIST_MIN} or`,
  "                  more stages have them listed here; for the others, numbers skipped in this table belong to step",
  "                  comments that exist in the code, right inside the function above the gap.",
  "KINDS",
  "  Section   major part of the file          Group      set of related helpers",
  "  Module    object holding related methods  Class      ES class",
  "  Function  top-level / module function     Sub-function  function defined inside _initializeSearch()",
  "  Method    member of a module / class      Helper     small utility",
  "  Handler   event / message handler         State      module-level variables",
  "  Constants fixed values                    Template   HTML template",
  "  Block     self-contained piece of logic   Execution  statement that starts something running",
  "  Member    property of the public API      Alias      second name for an object",
  "KEEPING IT CURRENT",
  "  Add a header with the right depth and any number, e.g. [4.13.x] Function: _foo() - what it does, then run",
  "  `npm run toc` (or node scripts/generate-toc.js). It renumbers the tags and rebuilds this table.",
];

// ------------------------------------------------------------------------------------------------ arguments
const args = process.argv.slice(2);
const flag = (name) => args.includes("--" + name);
const optValue = (name) => {
  const i = args.indexOf("--" + name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null;
};
if (flag("help") || flag("h")) {
  console.log(
    fs
      .readFileSync(__filename, "utf8")
      .split("*/")[0]
      .replace(/^#!.*\n/, "")
      .replace(/^\/\*\*?\n?|^ \* ?/gm, "")
  );
  process.exit(0);
}
const file = path.resolve(optValue("file") || path.join(__dirname, "..", "search-v4.js"));
const checkOnly = flag("check");
const stampDate = flag("stamp")
  ? optValue("stamp") ||
    (() => {
      const d = new Date();
      const p = (n) => String(n).padStart(2, "0");
      return `${p(d.getMonth() + 1)}/${p(d.getDate())}/${d.getFullYear()}`;
    })()
  : null;
if (stampDate && !/^\d{2}\/\d{2}\/\d{4}$/.test(stampDate))
  fail(`--stamp expects MM/DD/YYYY, got "${stampDate}"`);

function fail(message) {
  console.error("generate-toc: " + message);
  process.exit(2);
}

// ------------------------------------------------------------------------------------------------ read
if (!fs.existsSync(file)) fail("file not found: " + file);
const original = fs.readFileSync(file, "utf8");
const EOL = original.includes("\r\n") ? "\r\n" : "\n";
const lines = original.split(/\r?\n/);
const endsWithNewline = lines[lines.length - 1] === "";
if (endsWithNewline) lines.pop();

// the existing Table of Contents block: from its "/* ====" line to the closing "*/"
let tocStart = -1;
let tocEnd = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes(TOC_TITLE)) {
    tocStart = i - 1;
    while (tocStart > 0 && !lines[tocStart].startsWith("/*")) tocStart--;
    break;
  }
}
if (tocStart >= 0) {
  for (let i = tocStart; i < lines.length; i++) {
    if (lines[i].includes(TOC_END)) {
      tocEnd = i + 1; // the "*/" line follows
      if (lines[tocEnd] && lines[tocEnd].trim() === "*/") tocEnd++;
      break;
    }
  }
  if (tocEnd < 0) fail("found the Table of Contents title but not its end line (" + TOC_END + ")");
}
const codeEnd = tocStart >= 0 ? tocStart : lines.length; // tags are only read above the table

// ------------------------------------------------------------------------------------------------ parse tags
const TAG_LINE = /^(\s*(?:\/\/|\/\*\*?|\*)\s*)\[((?:\d+|x)(?:\.(?:\d+|x))+)\](\s?)(.*)$/;
const tags = []; // { line (0-based), depth, rest, kind, name, desc, isSection }
for (let i = 0; i < codeEnd; i++) {
  const m = lines[i].match(TAG_LINE);
  if (!m) continue;
  const parts = m[2].split(".");
  const isSection = parts.length === 2 && parts[1] === "0" && /^SECTION:/.test(m[4]);
  tags.push({
    line: i,
    prefix: m[1],
    oldTag: m[2],
    depth: isSection ? 1 : parts.length,
    rest: m[4],
    isSection,
  });
}
if (!tags.length)
  fail("no numbered comments such as [1.0] or [1.2.3] were found in " + path.basename(file));

// ------------------------------------------------------------------------------------------------ renumber
const problems = [];
const current = {}; // depth -> new tag of the latest entry at that depth
const counters = {}; // parent tag -> number of children so far
let sectionNumber = -1;
for (const t of tags) {
  if (t.isSection) {
    sectionNumber++;
    t.newTag = `${sectionNumber}.0`;
    t.key = String(sectionNumber);
    for (const d of Object.keys(current)) delete current[d];
    current[1] = t.key;
    counters[t.key] = 0;
    continue;
  }
  const parent = current[t.depth - 1];
  if (parent === undefined) {
    problems.push(
      `line ${t.line + 1}: [${t.oldTag}] has no parent entry at depth ${t.depth - 1} above it`
    );
    t.newTag = t.oldTag;
    t.key = t.oldTag;
    continue;
  }
  counters[parent] = (counters[parent] || 0) + 1;
  t.newTag = `${parent}.${counters[parent]}`;
  t.key = t.newTag;
  current[t.depth] = t.key;
  for (const d of Object.keys(current)) if (Number(d) > t.depth) delete current[d];
  counters[t.key] = 0;
}
if (problems.length) {
  console.error("generate-toc: the tags cannot be numbered:\n  " + problems.join("\n  "));
  console.error(
    "Fix: give each header the depth of its parent plus one, e.g. a child of [4.6] is [4.6.x]."
  );
  process.exit(2);
}

// ------------------------------------------------------------------------------------------------ classify
const entries = tags.map((t) => {
  // header text = first line + continuation lines ("//" followed by six or more spaces)
  let text = t.rest;
  let j = t.line + 1;
  while (j < codeEnd && /^\s*\/\/ {6,}\S/.test(lines[j]) && !TAG_LINE.test(lines[j])) {
    text += " " + lines[j].replace(/^\s*\/\/\s*/, "");
    j++;
  }
  text = text.replace(/\s+/g, " ").trim();
  const km = text.match(/^([A-Za-z-]+):\s*(.*)$/);
  const kind = km && KINDS.includes(km[1]) ? km[1] : null;
  const named = kind || t.isSection; // sections read "SECTION: name - description"
  const body = named ? km[2] : text;
  const dash = body.indexOf(" - ");
  return {
    tag: t.newTag,
    line: t.line + 1,
    depth: t.depth,
    isSection: t.isSection,
    kind,
    name: named ? (dash >= 0 ? body.slice(0, dash) : body) : "",
    desc: named ? (dash >= 0 ? body.slice(dash + 3) : "") : "",
    text, // for steps: the whole text
  };
});
// parent of each entry (nearest earlier entry with depth - 1)
const stack = {};
for (const e of entries) {
  e.parent = e.depth > 1 ? stack[e.depth - 1] || null : null;
  stack[e.depth] = e;
  for (const d of Object.keys(stack)) if (Number(d) > e.depth) delete stack[d];
  e.steps = [];
  e.children = [];
}
for (const e of entries) {
  if (!e.parent) continue;
  if (e.kind || e.isSection) {
    // a node nested under a step comment is listed under the nearest function / section above it
    let p = e.parent;
    while (p && !(p.kind || p.isSection)) p = p.parent;
    if (p) p.children.push(e);
  } else {
    e.parent.steps.push(e);
  }
}
// a step comment that sits directly under another step is part of that step, not of the function
for (const e of entries) {
  if (!e.kind && !e.isSection && e.parent && !e.parent.kind && !e.parent.isSection) {
    // nested step: not listed on its own
    e.nested = true;
  }
}

// ------------------------------------------------------------------------------------------------ build the table
function wrap(lead, body, pad) {
  const words = body.split(" ");
  const rows = [];
  let cur = lead;
  let empty = true;
  for (const w of words) {
    if (!empty && (cur + " " + w).length > WIDTH) {
      rows.push(cur);
      cur = pad + w;
    } else {
      cur = empty ? cur + w : cur + " " + w;
    }
    empty = false;
  }
  rows.push(cur);
  return rows.map((r) => r.replace(/\s+$/, ""));
}

const header = lines.slice(0, 20).join("\n");
const headerVersion = (header.match(/^Version:\s*([0-9][^\s-]*)/m) || [])[1] || "";
const headerDate = (header.match(/^Last Updated:\s*(\S+)/m) || [])[1] || "";
const subtitle =
  `Search Pro V4${headerVersion ? " (version " + headerVersion + ")" : ""} - search-v4.js` +
  `${headerDate ? " - Last Updated " + headerDate : ""}. Line numbers (Lnnnn) are valid for this revision.`;

const toc = [];
const bar = " " + "=".repeat(95);
toc.push("/* " + "=".repeat(95));
toc.push(" " + TOC_TITLE);
toc.push(" " + subtitle);
toc.push(bar);
LEGEND.forEach((l) => toc.push(" " + l));
toc.push(bar);

function emit(e) {
  const ind = "  ".repeat(Math.max(0, e.depth - 1));
  if (e.isSection) {
    toc.push("");
    toc.push(` [${e.tag}] ${e.name.toUpperCase()}  (L${e.line})`);
    if (e.desc) toc.push(...wrap("     ", e.desc, "     "));
  } else {
    const body = `[${e.tag}] ${e.kind}: ${e.name}${e.desc ? " - " + e.desc : ""}  (L${e.line})`;
    toc.push(...wrap(" " + ind, body, " " + ind + "      "));
  }
  const kids = e.children.map((c) => ({ line: c.line, node: c }));
  const stages = e.steps.filter((s) => !s.nested);
  if (e.steps.length >= STEP_LIST_MIN) stages.forEach((s) => kids.push({ line: s.line, step: s }));
  kids.sort((a, b) => a.line - b.line);
  for (const k of kids) {
    if (k.node) emit(k.node);
    else {
      const title = k.step.text.replace(/^(Step|Logic Block|Event Handler):\s*/, "");
      toc.push(
        ...wrap(" " + ind + "  ", `[${k.step.tag}] ${title}  (L${k.line})`, " " + ind + "        ")
      );
    }
  }
}
entries.filter((e) => e.isSection).forEach(emit);
toc.push("");
toc.push(" " + TOC_END);
toc.push("*/");

// ------------------------------------------------------------------------------------------------ assemble
const out = lines.slice(0, codeEnd);
for (const t of tags) {
  if (t.newTag !== t.oldTag) {
    out[t.line] = out[t.line].replace(`[${t.oldTag}]`, `[${t.newTag}]`);
  }
}
if (stampDate) {
  for (let i = 0; i < Math.min(out.length, 20); i++) {
    out[i] = out[i].replace(/^(Last Updated:\s*)\S+/, `$1${stampDate}`);
  }
}
// the table follows the code; a blank line separates them
while (out.length && out[out.length - 1].trim() === "") out.pop();
const finalLines = out.concat([""], toc);

// the subtitle takes its date from the (possibly stamped) header, so rebuild it once more if it changed
const newHeaderDate =
  (finalLines
    .slice(0, 20)
    .join("\n")
    .match(/^Last Updated:\s*(\S+)/m) || [])[1] || "";
if (newHeaderDate !== headerDate) {
  const i = finalLines.findIndex((l) => l.includes(TOC_TITLE)) + 1;
  finalLines[i] = " " + subtitle.replace(/Last Updated \S+\./, `Last Updated ${newHeaderDate}.`);
}
const result = finalLines.join(EOL) + EOL;

// ------------------------------------------------------------------------------------------------ safety proofs
// 1) only tag lines, the header date and the table changed; 2) the result still compiles
const isTag = (l) => TAG_LINE.test(l);
const stripTags = (arr) => arr.filter((l) => !isTag(l));
const beforeCode = stripTags(
  lines.slice(0, codeEnd).map((l) => (stampDate ? l.replace(/^(Last Updated:\s*)\S+/, "$1") : l))
);
const afterCodeLines = result.split(/\r?\n/);
const tocPos = afterCodeLines.findIndex((l) => l.includes(TOC_TITLE)) - 1;
const afterCode = stripTags(
  afterCodeLines
    .slice(0, tocPos)
    .map((l) => (stampDate ? l.replace(/^(Last Updated:\s*)\S+/, "$1") : l))
);
// ignore trailing blank lines (the separator before the table)
const trim = (arr) => {
  const a = arr.slice();
  while (a.length && a[a.length - 1].trim() === "") a.pop();
  return a;
};
const a1 = trim(beforeCode);
const a2 = trim(afterCode);
if (a1.length !== a2.length || a1.some((l, i) => l !== a2[i])) {
  fail(
    "internal check failed: lines other than the numbered comments would change. Nothing was written."
  );
}
try {
  new vm.Script(result, { filename: path.basename(file) });
} catch (error) {
  fail(
    "internal check failed: the result does not compile (" +
      error.message +
      "). Nothing was written."
  );
}

// ------------------------------------------------------------------------------------------------ report / write
const renumbered = tags.filter((t) => t.newTag !== t.oldTag).length;
const sections = entries.filter((e) => e.isSection).length;
const listed = entries.filter((e) => e.kind || e.isSection).length;
const upToDate = result === original;
if (checkOnly) {
  if (upToDate) {
    console.log(
      `generate-toc: OK - ${tags.length} numbered comments, ${sections} sections, Table of Contents is current.`
    );
    process.exit(0);
  }
  console.error(
    `generate-toc: OUT OF DATE - ${renumbered} tag(s) would be renumbered` +
      `${renumbered === 0 ? "; the Table of Contents (or the header date) differs" : ""}. Run: npm run toc`
  );
  process.exit(1);
}
if (upToDate) {
  console.log(
    `generate-toc: nothing to do - ${tags.length} numbered comments, ${sections} sections, ${listed} table entries.`
  );
} else {
  fs.writeFileSync(file, result);
  console.log(
    `generate-toc: updated ${path.basename(file)} - ${renumbered} tag(s) renumbered, ${sections} sections, ` +
      `${listed} table entries, ${tags.length} numbered comments in total.`
  );
}
