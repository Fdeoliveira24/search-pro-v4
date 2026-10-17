---
name: Search Pro V4 Control Panel
colors:
  primary: "#3B82F6"
  primaryHover: "#2563EB"
  success: "#38A169"
  warning: "#D69E2E"
  danger: "#EF4444"
  background: "#F7FAFC"
  surface: "#FFFFFF"
  surfaceSecondary: "#EDF2F7"
  border: "#E5E7EB"
  textPrimary: "#2D3748"
  textSecondary: "#4A5568"
  textMuted: "#718096"
  textLight: "#A0AEC0"
  focus: "#3182CE"
  sectionIcon: "#8B5CF6"
typography:
  panelTitle: { fontFamily: system, fontSize: 1.5rem, fontWeight: 600 }
  sectionTitle: { fontFamily: system, fontSize: 1.125rem, fontWeight: 600 }
  label: { fontFamily: system, fontSize: 0.875rem, fontWeight: 500 }
  body: { fontFamily: system, fontSize: 0.875rem, lineHeight: 1.5 }
  hint: { fontFamily: system, fontSize: 0.75rem, lineHeight: 1.5 }
  system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
rounded: { sm: 4px, md: 8px, lg: 16px }
spacing: { 1: 4px, 2: 8px, 3: 12px, 4: 16px, 5: 20px, 6: 24px, 8: 32px }
---

# DESIGN.md

Read this before writing any Control Panel UI (`search-pro-v4/dashboard/`). Every line here should change what you build.
Compare the page you built with this file and with an existing finished tab before you hand it back.

The Control Panel is one app with nine tabs. A new field, section or tab must look and read as if the same person
built it. If a pattern below does not exist for your case, extend it here first, then use it.

## Overview
- A work tool for tour creators: calm, dense, content first, decoration last
- Every tab is the same page: a panel header, then sections (cards), each with a header and a grid of fields
- Changes go live to an open tour before "Apply Settings"; nothing is lost by trying a value
- Words are for people who build tours, not for programmers (see Wording)

## Source of truth
- Tokens live in `dashboard/css/control-panel-v4.css` under `:root` (colors, radius, spacing, shadows, z-index, transitions)
- This file mirrors them. When the CSS changes, change this file in the same commit
- The frame around the pages: `shell.css` (scroll area, top bar, unsaved pill, More menu) and `sidebar-menu.css` (sidebar, sub-menus, rail, flyout, drawer). Other styles: `toast.css`, `modal-system.css`, `validation-messages.css`, `control-panel-tooltip.css`
- The cards and settings of every tab are listed once, by `js/panel-index.js` (see The frame); sidebar, top bar and unsaved marks read it, so nothing about a card is typed twice
- The documentation pages (`search-pro-v4/documentation/css/docs.css`) reuse these tokens and components (sidebar, page header, hue-tinted cards, steps, code window, tables, buttons) with their own class names (`doc-card`, `doc-steps`, `doc-code`); when a token here changes, change `docs.css` in the same commit (the suite `docs` checks the contrast of the colors it uses)
- The search bar that visitors see is NOT styled by these tokens: it is styled by `css/search-v4.css` and the Appearance tab

## Colors
- Tokens only. No hex values inside components, no new color to make something "pop"
- The palette is the one of the new interface (ROADMAP-CONTRACT section 7): page `#F2F3FB` (`--color-background`), surfaces white, text `#14163A` / `#4B4F7A` / `#6B6F99`, borders `#E3E5F5`, accent indigo `#5B5BF0` with the gradient to `#8B5CF6` (`--color-primary`, `--color-primary-end`)
- `primary` (indigo) is for the main action (the Apply Settings gradient), links, focus and the selected state of a control. Nothing else
- The on state of a switch is the indigo gradient. `success` green is only for the ✓ of a confirmation; `warning` for cautions; `danger` for errors only
- Unsaved changes are amber: `--color-unsaved` on light surfaces (pill, card dots), `--color-unsaved-on-dark` on the sidebar. Amber means "not applied yet" and nothing else
- The sidebar is dark indigo (`--sidebar-bg`, `--sidebar-*` tokens); it is the only dark surface
- Every card has a hue (`data-hue`, see Card hues): its icon tile, the tint of its header and the border and glow when the pointer is over it use that hue. The panel title tile is always the violet gradient `#6C6CF5 > #A06BF8`
- Field cards sit on `--color-surface-secondary` (#F6F7FE) with a `--color-surface-inner-border` border; a row (a Desktop and Phone pair, a single switch, an Appearance row) is white on that panel; the page is `background`, cards are `surface`
- Text passes 4.5:1 on its background. Muted text (`textMuted`, `textLight`) is for units, hints and placeholders only

## Typography
- One font family: Geist, bundled in `dashboard/fonts/` (SIL Open Font License, no request leaves the page), the system stack when the file is missing; Geist Mono (`--font-family-mono`) for keys, values and code. Weights 400 and 600 (500 only for labels, 650 for the brand)
- Panel title 2rem / 650 (1.5rem on a phone), card title 1.1875rem / 650, labels and body 0.875rem, a caption 0.75rem uppercase with .07em spacing, hints 0.8125rem, units and values in Geist Mono 0.75rem
- Nothing below 0.75rem. Never use bold inside a paragraph for emphasis

## Layout
- Spacing comes from the scale (`--space-1` 4px ... `--space-8` 32px). No one-off values
- Frame: sidebar 280px (72px as a rail, 288px as a drawer under 900px) + top bar 68px + a scroll area (`main#mainContent`) whose page is at most 1120px wide and centered; page padding 36/32px from 1280px, 28/24px from 640px, 20/16px below
- Fields sit in `.form-grid` with `grid-2-col`, `grid-3-col` or `grid-4-col` (columns collapse on small screens)
- Group related fields in one section; use a `.subsection` (a small uppercase caption with a line after it) for a second level, never a third
- Under 640px every `.form-grid` is one column
- Build for 375px first, then check 1440px. No horizontal page scroll at any width
- Keep a group of fields to about 8. A section with more fields splits them into `.subsection`s of up to about 8 each (Appearance has up to five subsections in a section); a section that covers two tasks becomes two sections

## Elevation & Depth
- Borders before shadows: a card has a 1px `--color-border-card` border and `--shadow-card`; fields only have a border
- One raised level for overlays only (toasts, modals, tooltips use `shadow-md` and the `--z-*` scale)
- A hover on a card draws a 3px glow and a border in the hue of the card (no lift); a hover on a field changes its border

## Shapes
- Cards 20px, panels inside a card 14 to 16px, buttons and inputs 10 to 12px (the header buttons 11px), pills 999px, icon tiles 14px (card) and 16px (panel title)

## Page anatomy (every tab)
```
.panel-header            icon tile + h2 (Title Case "<Name> Settings") + one-sentence description (a grid: the tile spans both lines)
.panel-content
  section.config-section[data-section-key][data-hue]    a white card; its id (sec-<tab>-<key>), data-hue and data-icon are set by panel-index.js
    .section-header.section-header-row                  tinted in the hue of the card
      .section-title-group   h3.section-title (i.section-icon = the tile, then the Title Case name) + p.section-description (one sentence)
      button.reset-section-button   "Restore Defaults"  (data-section="<key>")
    .form-grid.grid-N-col
      .form-group ...        one card per setting
    .subsection              optional second level: h4.subsection-title (a caption) + fields
```
**Card hues.** `data-hue` is set by `panel-index.js`: the cards of General and Appearance keep the hues of the design (opening 275, searchBar 200, phones 150, texts 35; searchField 262, searchResults 222, groupHeader 172, tagsHighlight 18) and every other card takes the next hue of 275, 240, 200, 150, 35, 262, 222, 172, 18 in the order it appears on its page (Display: 275, 240, 200, 150, 35, 262; Content: 275, 240, 200; and so on). The hue is only color: it carries no meaning, so a screen reader hears nothing of it. A browser without `oklch()` shows the indigo fallbacks.
- A section title names a task ("Opening and Closing"), not a technology. No "Settings", "Configuration", "Advanced", "Professional" or "Complete" in titles
- A tab that only explains (Knowledge Base) has no Restore Defaults and no "Settings" in its title. Every other section has a "Restore Defaults" button on the right of its header; it restores only that section (a section that only explains, such as the table of sheet columns, has none)
- Section icons are Font Awesome solid (`fas fa-...`) with `aria-hidden="true"`; no emoji in the interface

## The frame (sidebar, top bar)
Built in phase 1 of the roadmap; the tab pages sit inside it unchanged. Sizes and breakpoints: drawer under 900px, More menu under 1280px, compact top bar under 640px.
```
aside#sidebar            brand tile + name | nine .nav-group (one per tab) | Collapse sidebar
  .nav-group             button.nav-item[data-tab] (icon, name, unsaved dot, chevron) + .nav-subs (the cards of the tab, opened only for the open tab)
header.app-header        menu button (drawer) | breadcrumb "Tab > Card" | search box (phase 2) | unsaved pill | Preview button | Download, Load, Reset | More | Apply Settings
main#mainContent         the scroll area; one .tab-panel per tab inside it
aside#previewPanel       Live Preview (phase 3): beside main from 1280px, over it below; hidden until the Preview button opens it
```
| Part | Rules |
|---|---|
| Sub-menu | One line per card of the OPEN tab, named like the card (`.section-title`), read from `panelIndex`; a click scrolls the card to 24px below the top (320ms ease-out, instant with reduced motion); the card on screen is marked (`aria-current="true"`, scroll spy); Enter from the keyboard also moves the focus to the card title. A click on the open tab folds or unfolds its cards; another tab folds the first one. Nothing is typed by hand: a new card appears by itself |
| Card ids | Every `.config-section` has `data-section-key` (in the page) and, when its tab loads, `id="sec-<tabId>-<key>"`, `data-hue`, `data-icon` (set by `panelIndex.decorate`). The key is the one the tab handler uses in `sectionPaths` and on the Restore Defaults button |
| Rail | Collapsed (72px): icons only, the name stays for screen readers (`title`), a click on a tab opens it and a flyout (`.sidebar-flyout`, `role="menu"`) with its cards; Escape closes it and returns the focus; arrows move inside it |
| Drawer | Under 900px the sidebar is off screen and `inert` until the menu button opens it (scrim, focus moves in, Escape or a click on the scrim closes it and returns the focus); choosing a tab or a card closes it |
| Unsaved marks | Amber dot on a tab and on a card, pill "N unsaved changes" in the top bar (only the number under 640px). "Unsaved" = changed since the last Apply, Load, restored session or Reset (changes already reach an open tour live; a Download does not clear it). `core.markSaved()` takes the snapshot, `core.getDirty()` compares it per card through the paths the tab handler lists in `sectionPaths` plus the `name` of every field of the card; settings that are only copies of another one are in `core.mirroredPaths` and never count; the fill that Apply and Download do from the fields is absorbed (`core.absorbSilentChanges`). A new tab handler needs nothing for this except a correct `sectionPaths` for settings that are not plain fields |
| Top bar buttons | Ids never change (`applySettings`, `downloadConfig`, `loadConfig`, `resetAll`). Apply Settings is the indigo gradient button on the right; Download, Load and Reset are filled gradients of their own colors with white text and a 1px edge, taken from the hues of the card headers: Download teal (200), Load green (150), Reset coral (18). Each sets `--btn-hue` and `--btn-l` (the lightest lightness that still gives white text 4.5:1: teal .515, green .535, coral .58); the classes `btn-secondary` and `btn-danger-outline` stay on them. Under 1280px the script moves Download, Load and Reset into the More menu (`role="menu"`, the same buttons, the shortcut in `data-shortcut`) and back |
| Search of the Control Panel | find a category, a card or a setting and jump to it | Box `#cpSearchOpen` in the top bar (`Ctrl/Cmd+K` in it; it shortens itself to the room the bar leaves and is an icon under 760px), palette `#cpSearch` (640px, 16px corners, scrim; field `role="combobox"`, list `role="listbox"`). Groups Categories, Sections, Settings; the typed letters are marked; arrows move, Enter opens, Escape closes and gives the keyboard back; a footer with the keys and the count (announced as "N results"); empty state with **Clear search**. A result switches to its tab (loading it when it was never opened), scrolls to the card or setting. Nothing is drawn around it (no flash) and the keyboard is NOT moved (no focus ring appears on the page; the owner's decision, 2026-10-13); a screen reader is told "Opened ... in ..." through `#cpSearchStatus`. The index is `panel-index.js` (nothing typed by hand); the words people use are in `js/search-synonyms.js`. Files: `js/cp-search.js`, `css/cp-search.css` |
| Live Preview | the real search on a sample tour, next to the settings | Button `#previewToggle` in the top bar (violet, `Alt+Shift+P`, a little darker while the panel is open, the icon only under 1100px); panel `#previewPanel` 440px wide (drag its left edge by the grip, or use the arrow keys, double click = 440px; remembered), beside the settings from 1280px (the sidebar folds to the rail while it is open when the settings would drop under 720px; not remembered), over them below 1280px, the whole window under 640px. Header: tile, name, close. Controls: one group of Results / Nothing Found / Empty Field (what the visitor typed) and, after a thin line, the **Focus Ring** switch; **Desktop / Phone sit under the frame** they change; one line under them says what is shown, and a plain amber line appears only when Focus Ring is on and its width is 0. Stage: a soft gradient ground (no stripes), the page of the sample in a frame (Desktop = a wide page scaled to fit, Phone = 390px at full size). Not offered under 640px (phones): no button, no panel. Escape closes it (unless a dialog or a dropdown is open). Files: `css/preview-panel.css`, `js/preview-panel.js`, `preview/` |
| Focus | **No ring around any button** (owner's decision, 2026-10-13: neither a focus ring nor a pressed ring; one rule at the end of `pages.css`). Fields keep the border they take when typed in. The older note follows: a 2px ring for the keyboard only (`:focus-visible`); light on the dark sidebar, indigo elsewhere. The older global `button:focus` ring is switched off in the frame |

## Components
Reuse an existing component before creating one. Markup lives in `dashboard/tabs/*.html`.

| Component | Use it for | Rules |
|---|---|---|
| `.form-group` | one setting | a field card (panel color, 14px radius): label row (label + help icon), control, hidden `.sr-only` description (`aria-describedby`). A card whose only control is one switch is a white ROW instead (name and sentence at the left, the switch in a 76px column at the right: pure CSS, `:has(> .toggle-switch)`) |
| Help tooltip | what a setting does | `span.help-tooltip` with `data-tooltip`, `role="button"`, `tabindex="0"`, `aria-label="Help: ..."`; one or two plain sentences, say what On and Off do. Drawn as a small outlined question mark (the page carries the solid icon; the regular weight of the same glyph is used), the bubble is dark (`#14163A`, 272px wide at most) |
| Toggle | on / off | `.toggle-switch` + `input.toggle-input` + `.toggle-label`; the text beside it is a short sentence ("Escape clears the text and closes the search"). 46 x 27px, indigo gradient when on, a grey groove when off, a focus ring for the keyboard only |
| Device pair | the same setting for Desktop and Phone | ONE white row with two controls (`.device-pair`, `.device-pair-options`): the name at the left, two aligned 76px columns at the right, each named below by its device (icon + "Desktop" / "Phone", drawn by CSS); never two separate cards. A pair of numbers (`.device-pair-field` + `.device-pair-caption`) is a field card with two boxes |
| Desktop value caption | show the desktop value under a phone setting | `data-desktop-name="<path of the desktop field>"` on the phone `.form-group`; the tab script adds `p.field-caption` ("Desktop: 350px") and keeps it in step with the desktop field (General > Phones) |
| Number with unit | distances, delays, limits | `.input-wrapper` + `input.form-input` + `span.input-unit` (the unit sits inside the box at the right, in Geist Mono); the browser's spin buttons are hidden (typing and the arrow keys still step); always `min`, `max`, `step`, `inputmode="numeric"` |
| Text | names, texts, widths | `input.form-input`; width fields add `width-input` (px, %, vw); visitor texts add `data-raw-text="true"` and `maxlength` |
| Select | a few exclusive choices (3 to 6) | `select.form-select` in the page; `controls.js` puts a styled button (`.dd-trigger`, 42px, chevron) in front of it and draws the list as a card (`.dd-menu`, `role="listbox"`, the chosen entry marked with a check, fonts previewed in a font list, `aria-activedescendant`, arrows / Home / End / Enter / Escape / type-ahead). The select itself stays (hidden, 1px) and is still the control the code reads and writes: `select.value = x`, options added later, `disabled`, `hidden` and the class `error` are followed by the button; a choice fires `input` and `change` on the select. Never rely on the browser's own list; for 2 choices that are on/off use a toggle |
| Color | a color of the visitor's search bar | `input.color-input` (type color) + a hex box `input.form-input` with id `<id>Hex` (shows and accepts `#rrggbb` / `#rgb`; a bad value gets `.error` and a message and is not saved) |
| Number with a written unit | sizes such as `14px`, `1.2em`, `1.5` | `input.form-input` with `data-unit="px"` (or `data-unit=""` for a plain number): the field shows the number, the setting is saved as text with the unit; the plugin reads a bare number as pixels |
| Four sides | a value for top, right, bottom and left (space inside a tag) | `.form-group.full-row` with `span.form-label`, then `.box-values` of four `.box-value` (caption + number with `px`); the four numbers are `data-ui-only="true"` (never saved themselves) and write the ONE setting kept in a hidden `input.form-input` named by `data-target`, in CSS order "top right bottom left"; short CSS forms are read back |
| Switch row | switches that belong together (the four sides of a border) | `.form-group` with `span.form-label`, then `.toggle-row` of `.toggle-switch`; each switch is its own boolean setting |
| Name list | a few "this -> that" pairs (other names for tags) | `.form-group.full-row` with `span.form-label`, a `p.field-hint`, then `.name-list` (`data-target` = the setting; head, rows, empty note) and an "Add" button; rows are made by the tab script from `.name-list-row` (two `data-ui-only` text boxes and `.name-list-remove`); the setting is an array of `{ from, to }` kept in the config by the script, and Restore Defaults lists it in `hiddenPaths` |
| Border | the border of one element | four cards in a `grid-2-col`: Border Width (px, 0 = none), Border Style (select), Border Color, Sides (switch row); width 0 must keep today's look |
| Font | a font of the visitor's search bar | `select.form-select` with `data-font-select`; first entry "Default" (the system font stack), then common fonts, then "Fonts of This Tour" (read from the tour's `fonts.css`); a value that is in no list is kept and shown as a custom entry, never replaced |
| Range | a feeling, not a number | `.range-input-wrapper` + `input.range-input` + `.range-value` (a Geist Mono chip); the track is drawn by the page (6px, indigo up to the handle, grey after it; `controls.js` keeps `--range-fill` current) and the handle is a round white one with an indigo ring; name both ends under it with `.range-scale` |
| Split layout | a few related fields next to one visual control | `.split-layout` (three equal columns; two below 1100px with the visual underneath; one below 640px): two `.field-stack` columns (fields on top of each other, two per column), the visual `.form-group` as the third column |
| Field hint | where a text appears | `p.field-hint` under the field (also listed in `aria-describedby`): one line saying where the visitor sees it, with an example; use for settings whose effect is not obvious from the label |
| Placement picker | where something sits on the screen | `.placement-picker` 3 x 3 of `.placement-cell` (`role="radio"`; the chosen cell draws the bar where it will sit) with a `.placement-caption` in words; two hidden `form-input` fields hold the values; use it inside a split layout |
| Master switch | one switch that decides whether a whole group of settings matters (pictures, icons) | the switch sits in the section header area; the settings below it live in `.master-content[data-needs="<switch name>"]`, which gets the `hidden` attribute while the switch is off (script: `syncControls`); the group opens and closes without losing saved values |
| Type table | one setting per element type (names, switches, sizes, files, icons) | `table.type-table` with a band row on top (`.type-table-bands`: one cell per column group with a state pill, `data-band-state`) and a header row; every cell of a group carries `data-col-group="pictures|icons|custom"`. All columns stay visible: when the switch of a group is off the script puts `.is-off` on its cells (greyed) and `disabled` on their controls, the values stay saved. Inputs in cells sit in `.form-group.cell-group` so messages can appear under them. Tooltips in the header open downwards (the scrolling wrapper cuts one that opens upwards) and the last two open towards the left |
| Icon picker | choosing an icon font icon, an emoji or a picture for a row | ONE panel (`#iconPickerPanel`) for the whole page, opened by the row's `.icon-pick-button`: a title, a **Current Icon** row (preview, description, "Back to the Standard Icon"), tabs (Font Awesome, Bootstrap Icons, Ionicons, Emoji, Picture Address), one `.icon-picker-row` (search box plus what belongs next to it: emoji group and "Include the newest emojis"; for pictures the address box and **Clear**), a grid capped at 400 results, for pictures a preview and an action row (**Use This Picture**, **Remove Picture**), and a foot with **Done**. No box for typing a class by hand. Controls inside it use `data-ui-only` or no `name`, so nothing of it is saved by the form |
| Plain type table | one switch per kind with a sentence of what it is (Content > What Is Searched) | `table.type-table.type-table-compact` (no minimum width, the sentence wraps; on phones the padding shrinks, names wrap, the switch column is narrow): columns Type (`th.type-name`), What It Is (`td.type-sentence`), the switch (`td.col-switch`, the label text is `sr-only`); above it `.type-table-actions` with two `.reset-section-button`s for bulk changes (**Include All**, **Include None**: they change the switches through their `change` events, so every switch is saved and sent live like a click) |
| Name list with three boxes | a list where each row has a name in the tour, a second name and what visitors see (Content > Containers) | the Name list component with `.name-list-three` (three equal columns and the remove button; on phones each row stacks its boxes under a line); each box sits in `.form-group.cell-group` so messages can appear; the tab script builds the rows, saves a list of objects, shows a message for a repeated name or an angle bracket and keeps the older list of names in step; locked as a whole while its switch is off |
| Filter list | a list of values, one per line, for a filter mode (Filtering) | `textarea.form-input` with `data-ui-only="true"`, no `name`, `data-target` = the setting and `data-kind` (`values`, `tags`, `numbers`) inside a `.form-group.full-row` with `data-shown-when="<select id>=<value>"` (the tab script sets `hidden` when the select has another value); a `p.field-hint` with the rule and a `span.list-count`; the tab script saves the lines as a LIST, drops empty lines and repeats, explains what cannot be used under the box and sends the list to the open tour; one `.infobox-warning[hidden]` per section for "the list is empty, so this filter does nothing yet" |
| Source choice | one choice among a few sources, each with its own fields (Data Sources) | `.ds-choice` (`role="radiogroup"`) of `.ds-option` buttons (`role="radio"`, `data-source`, arrow keys move and choose); the chosen source is kept in two hidden `.toggle-input` switches that the buttons set (so saving, loading, live preview and Restore Defaults work as for any setting); the fields of the other sources are hidden with `hidden`; a `.ds-banner` line says what is active; the tab script clears the Test result when the choice changes |
| Style select | a ready-made set of numbers for a whole tab (Animations > Motion: Balanced, Subtle, Lively, Minimal, Custom) | `select.form-select` with `data-ui-only="true"` and no `name`: choosing a style fills the real fields and saves them as usual; the select shows **Custom** as soon as the numbers match none (the tab script compares them); it is never saved itself |
| Easing list | a choice of movement curves | `select.form-select` inside `.form-group[data-easing-select]`; the value is the CSS text of the curve; a value that is in no list (an older setting, a typed curve) is added as **Custom: ...** and chosen, never replaced; an **Exact Curve** box next to the main list shows the curve and accepts a typed one |
| Page with a Preview | a tab where a setting is judged by looking (Animations) | `.anim-layout` (grid): the settings in `.anim-main`, the Preview in `aside.anim-preview-column` that sticks beside them from 1200px and comes first on narrower screens; the Preview section has no Restore Defaults and plays after every change; its colors are only for the Preview |
| Numbered steps | what to do, in order (Knowledge) | `ol.kb-steps` of `li.kb-step` (the number is drawn by CSS): a `span.kb-step-title`, a `span.kb-step-text`, optionally a code block; one action per step |
| Code block with Copy | text a person has to paste somewhere else (Knowledge) | `.kb-code` with `pre > code#<id>` and a `button.btn.btn-secondary.kb-copy[data-copy-target="<id>"]` (label "Copy", then "Copied" for a moment, a toast); the text comes from the real file when the page is generated, never typed twice by hand |
| Order list | the order of a few kinds (Display > Order of Results, the last section of Display) | `.subsection` with a `p.field-hint`, then `ol.order-list` (`data-target` = the setting) of `li.order-item[data-kind]`: `.order-handle` (grip; drag it with mouse, pen or finger: the row follows the pointer, the page scrolls itself near an edge, Escape puts the row back), `.order-position` (number), `.order-name` (the name visitors see, `.order-note` for the kind in brackets or "Switched off in Content", `.is-off` greys the row), `.order-buttons` with two `button.order-move` (Move Up, Move Down; `aria-label` "Move <name> Up", `title`, the first Up and the last Down are `disabled`); a `.sr-only[role="status"]` line says where the item went and the focus stays on the button that was used. The list has no field of its own: the tab script keeps the setting (an array) in the config, sends it to the tour and rebuilds the rows from it. Keyboard users use the two buttons (Tab and Enter), so nothing depends on dragging |
| Buttons | any action | the family `.btn` in `pages.css` (the dialogs and the top bar use it too): `.btn-primary` indigo gradient, `.btn-secondary` white with a border, `.btn-danger` solid dark red `#B42318`, `.btn-warning` amber-brown, `.btn-success` green, `.btn-sm` small; 38px high (40px in a dialog), a focus ring for the keyboard only, `:disabled` 50%. A page never styles a button of its own |
| Dialog | a question or a message that needs an answer | one overlay and one container reused by `modal-system.js` (`showApplySettingsModal`, `showDownloadConfigModal`, `showLoadConfigModal`, `showRestoreSessionModal`, `showResetAllModal`, `showErrorModal`, `showQuickConfirm`): a 20px card (480px wide at most; a sheet at the bottom of the screen under 640px) on a dark scrim; a round 44px icon tinted by the type (info and confirm indigo, success green, warning amber, danger and error red), a title (18px / 600), one sentence, a close button; boxes inside use the same tints (`.modal-info-box` indigo, `-warning-box` amber, `-danger-box` red, `.modal-tip` green); buttons at the right, Cancel white, the confirm button by `confirmClass`. The confirm button takes the focus, Escape and the X dismiss it. Last-resort messages are a card from `window.showFallbackNotice`, never a browser `alert()` or `confirm()` |
| Restore Defaults | reset one section | `.reset-section-button` with `fa-undo`; label always "Restore Defaults". Every tab calls `core.restoreWithUndo({ button, restore, repopulate })`: the card is restored as before and a toast offers **Undo** for six seconds (it puts back what the restore changed; a setting changed again since is left alone). A new tab handler uses the same helper |
| Card badge | say a card has changes not applied yet | nothing to write in a page: `panel-index.js` sets `data-unsaved-text="2 unsaved changes"` on the title (`.section-title`) of the card and `pages.css` draws it after the title text (the text of the heading stays clean) |
| Code window | text the reader has to paste (Knowledge) | `.kb-code` is a black editor window (`--code-*` tokens): a title bar with three dots and a name (`data-editor`, set by `knowledge-tab.js`), the Copy button in the bar, white code in Geist Mono and lemon green (`#CCFF33`) for strings, tag names, keywords and numbers (`.kb-tok`, spans made at run time; the text itself is untouched, so Copy copies exactly the code). Only two colors: white and lemon green |
| Appearance rows | the Appearance page (the page the design drew) | in `#appearance-panel` each `.subsection` is a panel (two columns from 840px, caption on top) and each `.form-group` in it is a row: name and help at the left, the control at the right (colors: swatch + hex box; numbers 112px; selects 210px; ranges 220px with the value chip); `.form-grid[aria-labelledby$="-radius"]` is four small fields in one row; a hint, the four sides or the tag name list take the whole row |
| Validation message | a value that cannot be used | `window.showValidationMessage(field, "error", text, 30000)`; cleared by `clearValidationMessage(field.id)` |
| Info / warning box | one thing to know | `.info-message` (indigo tint) or `.infobox-warning` (yellow); no more than one per section |
| Toast | confirmation after an action | `core.showToast(type, title, message, duration, { action: { label, onClick } })`; a short title, one line of text; one dark toast for every kind (the icon carries the kind: green ✓, red, amber, indigo); the optional action is a button inside the toast |

### States
Interactive elements have hover, focus (`--color-border-focus` ring), disabled, loading and error states.
- Disabled: `.form-group.disabled` (dimmed) and `disabled` on the input; use it when another setting makes this one meaningless
- Inactive: `.form-group.inactive` (dimmed, still editable) plus one `.info-message` that says why (hidden with the `hidden` attribute while not needed); use it when another tab's switch decides whether this setting has any effect: mark the `.subsection` with `data-requires="showTags"` and the tab script dims its cards (Appearance › Tag Colors, Tag Look and Tag Border need Display › Show Tags in Results)
- Error: `.error` on the input plus a validation message that says what to do ("Enter a number from 320 to 1200."). A value with an error is not saved and not sent to the tour
- Every list has an empty state and an error state

### Fields and settings
- `name` of a field is the settings path (`searchBar.placement.offsetX`); `id` is a camelCase label (`placementOffsetX`) and must be unique in the whole page
- Optional numbers show "Not set" or "Auto" as placeholder, never "null"
- A setting that only makes sense with another one is placed next to it and locked while the other is off
- One concept, one control. If two fields say the same thing, remove one
- A text setting says where it appears: the label names the moment ("Message When Nothing Is Found"), the hint gives the place and an example, the tooltip says what it is for. Group such fields by where the visitor meets them (Search Field, Messages, Result Lists)

## Wording
- American spelling (Color, Center)
- Headings and labels in Title Case ("Close After Choosing a Result"); toggle text, descriptions and tooltips in sentence case
- Say "Desktop" and "Phone" (not Mobile, Computer). 3DVista builds two versions of a tour: `script_general.js` for desktop and iPad, `script_mobile.js` for phones; the plugin can follow either the screen width or the tour's own choice (General tab > Phones)
- Say "visitors" for people using the tour and "you" for the person using the Control Panel
- No backend words in the interface: no CDN, stylesheet, debounce, z-index, regex, null, JSON. If a setting needs one, explain it in plain words ("Layer", "Wait After Typing")
- One sentence per description; verbs first ("Choose when...", "Set how long...")
- Errors say what to do, not what went wrong: "Enter a width such as 350px or 95%."

## Do's and Don'ts
- Do open the page in a browser and compare it with this file and with a finished tab
- Do keep the same section order inside a tab as the task order (open, search, place, phones, texts)
- Do add the setting in every place it lives (see the checklist below) in the same change
- Don't add gradients, emoji icons, or a new color to make something stand out
- Don't style a single field with inline `style=""`; add a class to the stylesheet if a pattern is missing
- Don't put the same setting in two tabs
- Don't hide a dead setting with CSS: remove it from the page and keep the plugin accepting old saved values

## Adding or changing a setting (checklist)
1. Field in the tab page: `name` = settings path, label, help tooltip, `.sr-only` description
2. Default in `dashboard/js/control-panel-core.js` `getDefaultConfig()` (same value as the plugin's default)
3. Plugin default in `search-v4.js` `ConfigBuilder` (and the documented block near the end of the file, section 10)
4. The plugin reads the value where it is used, with a safe fallback (a value from the Control Panel is not normalized by the builder)
5. Live update: `updateConfig` re-applies by key group (`styleTouch` / `indexTouch` in section 9); add the key if a redraw is needed
6. If the field name differs from the plugin name: `core.mirrorToPluginNames`
7. A tab handler checks its own fields in `getFieldProblem(name, value, input)`
8. "Restore Defaults": add the path to the section's list in the tab handler
9. Docs: `docs/3DVista-Search-Pro-Integration-Master.md` and `search-pro-v4/STATUS.md`
10. Defaults must keep today's behavior: a new setting that is never touched changes nothing for existing tours

## Rules of the project
- Only edit inside `search-pro-v4/` (plus the Master document and this file). The 3DVista export files in the folder above (`index.html`, `script*.js`, `lib/`, `media/` ...) are read-only
- `search-v4-bck.js` and `css/search-v4-bck.css` are the owner's own copies: never touch them
- `_maintenance/` (outside this folder) holds notes, evidence and backups: it is committed locally only and never pushed
- Nothing is pushed to GitHub unless the owner asks
- Run Prettier (project `.prettierrc`), then `npm run toc` for `search-v4.js`, then ESLint; the owner runs the tests

## Known gaps (to align tab by tab)
- Top bar buttons: Apply Settings = primary, Download and Load = `btn-secondary`, Reset = `btn-danger-outline` (the classes are kept; the colors are set by `shell.css`, see The frame); a busy button is only `disabled` (no inline style)
- The "Control Panel Ready" toast stays long enough to cover fields; shorten it
- Rules of the page that no longer rely on the browser: no `alert()`, `confirm()` or `prompt()`; no native select list; no native spin buttons or slider track; Geist (and Geist Mono for code) on every control and every text
- The Display icon picker, the container list and the Data Sources report keep their own layouts; they take colors, fonts, buttons and dropdowns from the shared pieces above
- The floating action button is gone (removed in 4.6, with `fab-menu.js` and `fab-menu.css`): the top bar has the same actions (the More menu under 1280px)
- The Control Panel opens on the tab and card it was left at (`searchProLastPlace`, kept 7 days by `sidebar-menu.js`); a URL hash wins
- No focus ring is drawn in the preview of the Animations tab or around a search result or a button of the Control Panel (the owner's decision)
- Headings, labels and wording of the other tabs still vary (Data Sources uses question headings)
- Per-section "Restore Defaults" exists in General, Appearance, Display, Content, Filtering, Data Sources, Animations and Advanced (Search Tuning and Control Panel Connection; the scan has none)
