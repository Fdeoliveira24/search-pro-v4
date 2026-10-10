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

The Control Panel is one app with eight tabs. A new field, section or tab must look and read as if the same person
built it. If a pattern below does not exist for your case, extend it here first, then use it.

## Overview
- A work tool for tour creators: calm, dense, content first, decoration last
- Every tab is the same page: a panel header, then sections (cards), each with a header and a grid of fields
- Changes go live to an open tour before "Apply Settings"; nothing is lost by trying a value
- Words are for people who build tours, not for programmers (see Wording)

## Source of truth
- Tokens live in `dashboard/css/control-panel-v4.css` under `:root` (colors, radius, spacing, shadows, z-index, transitions)
- This file mirrors them. When the CSS changes, change this file in the same commit
- Other styles: `sidebar-menu.css` (navigation), `toast.css`, `modal-system.css`, `validation-messages.css`, `control-panel-tooltip.css`
- The search bar that visitors see is NOT styled by these tokens: it is styled by `css/search-v4.css` and the Appearance tab

## Colors
- Tokens only. No hex values inside components, no new color to make something "pop"
- `primary` is for the main action, links, focus and the selected state of a control. Nothing else
- `success` green is the on state of a switch and the Apply button; `warning` for cautions; `danger` for errors only
- `sectionIcon` violet is only for the small icon in a section title; `primary` blue is only for the icon in the panel title
- Field cards sit on a pale blue tint (`.form-group`); the page is `background`, sections are `surface`
- Text passes 4.5:1 on its background. Muted text (`textMuted`, `textLight`) is for units, hints and placeholders only

## Typography
- One font family (the system stack), two weights: 400 and 600 (500 only for labels)
- Panel title 1.5rem / 600, section title 1.125rem / 600, labels and body 0.875rem, hints and units 0.75rem
- Nothing below 0.75rem. Never use bold inside a paragraph for emphasis

## Layout
- Spacing comes from the scale (`--space-1` 4px ... `--space-8` 32px). No one-off values
- Page: sidebar 300px (280px on small screens) + header 80px + content with 2rem padding
- Fields sit in `.form-grid` with `grid-2-col`, `grid-3-col` or `grid-4-col` (columns collapse on small screens)
- Group related fields in one section; use a `.subsection` (h4 title, top border) for a second level, never a third
- Build for 375px first, then check 1440px. No horizontal page scroll at any width
- Keep a section to about 8 fields. More than that means two sections

## Elevation & Depth
- Borders before shadows: cards use a 1px `border`; `shadow-sm` on sections only
- One raised level for overlays only (toasts, modals, tooltips use `shadow-md` and the `--z-*` scale)
- A hover on a section card may lift it 2px; fields only tint

## Shapes
- `rounded.lg` (16px) on section cards, `rounded.md` (8px) on field cards, inputs, selects and buttons, `rounded.sm` (4px) on chips, picker cells and small buttons

## Page anatomy (every tab)
```
.panel-header            icon + h2 (Title Case "<Name> Settings") + one-sentence description
.panel-content
  section.config-section
    .section-header.section-header-row
      .section-title-group   h3.section-title (icon + Title Case name) + p.section-description (one sentence)
      button.reset-section-button   "Restore Defaults"  (data-section="<key>")
    .form-grid.grid-N-col
      .form-group ...        one card per setting
    .subsection              optional second level
```
- A section title names a task ("Opening and Closing"), not a technology. No "Settings", "Configuration", "Advanced", "Professional" or "Complete" in titles
- Every section has a "Restore Defaults" button on the right of its header; it restores only that section
- Section icons are Font Awesome solid (`fas fa-...`) with `aria-hidden="true"`; no emoji in the interface

## Components
Reuse an existing component before creating one. Markup lives in `dashboard/tabs/*.html`.

| Component | Use it for | Rules |
|---|---|---|
| `.form-group` | one setting | label row (label + help icon), control, hidden `.sr-only` description (`aria-describedby`) |
| Help tooltip | what a setting does | `span.help-tooltip` with `data-tooltip`, `role="button"`, `tabindex="0"`, `aria-label="Help: ..."`; one or two plain sentences, say what On and Off do |
| Toggle | on / off | `.toggle-switch` + `input.toggle-input` + `.toggle-label`; the text beside it is a short sentence ("Escape clears the text and closes the search") |
| Device pair | the same setting for Desktop and Phone | ONE card with two controls, captions "Desktop" and "Phone" (`.device-pair`, `.device-pair-options`); never two separate cards |
| Number with unit | distances, delays, limits | `.input-wrapper` + `input.form-input` + `span.input-unit`; always `min`, `max`, `step`, `inputmode="numeric"` |
| Text | names, texts, widths | `input.form-input`; width fields add `width-input` (px, %, vw); visitor texts add `data-raw-text="true"` and `maxlength` |
| Select | a few exclusive choices (3 to 6) | `select.form-select`; for 2 choices that are on/off use a toggle |
| Color | a color of the visitor's search bar | `input.color-input` (type color) + a hex box `input.form-input` with id `<id>Hex` (shows and accepts `#rrggbb` / `#rgb`; a bad value gets `.error` and a message and is not saved) |
| Number with a written unit | sizes such as `14px`, `1.2em`, `1.5` | `input.form-input` with `data-unit="px"` (or `data-unit=""` for a plain number): the field shows the number, the setting is saved as text with the unit; the plugin reads a bare number as pixels |
| Font | a font of the visitor's search bar | `select.form-select` with `data-font-select`; first entry "Default" (the system font stack), then common fonts, then "Fonts of This Tour" (read from the tour's `fonts.css`); a value that is in no list is kept and shown as a custom entry, never replaced |
| Range | a feeling, not a number | `.range-input-wrapper` + `input.range-input` + `.range-value`; name both ends under it with `.range-scale` |
| Split layout | a few related fields next to one visual control | `.split-layout` (three equal columns; two below 1100px with the visual underneath; one below 640px): two `.field-stack` columns (fields on top of each other, two per column), the visual `.form-group` as the third column |
| Field hint | where a text appears | `p.field-hint` under the field (also listed in `aria-describedby`): one line saying where the visitor sees it, with an example; use for settings whose effect is not obvious from the label |
| Placement picker | where something sits on the screen | `.placement-picker` 3 x 3 of `.placement-cell` (`role="radio"`; the chosen cell draws the bar where it will sit) with a `.placement-caption` in words; two hidden `form-input` fields hold the values; use it inside a split layout |
| Restore Defaults | reset one section | `.reset-section-button` with `fa-undo`; label always "Restore Defaults" |
| Validation message | a value that cannot be used | `window.showValidationMessage(field, "error", text, 30000)`; cleared by `clearValidationMessage(field.id)` |
| Info / warning box | one thing to know | `.info-message` (blue) or `.infobox-warning` (yellow); no more than one per section |
| Toast | confirmation after an action | `core.showToast(type, title, message)`; a short title, one line of text |

### States
Interactive elements have hover, focus (`--color-border-focus` ring), disabled, loading and error states.
- Disabled: `.form-group.disabled` (dimmed) and `disabled` on the input; use it when another setting makes this one meaningless
- Inactive: `.form-group.inactive` (dimmed, still editable) plus one `.info-message` that says why (hidden with the `hidden` attribute while not needed); use it when another tab's switch decides whether this setting has any effect (Appearance › Tags needs Display › Show Tags in Results)
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
- Top bar buttons use four colors (green, blue, grey, orange): target is Apply = primary, Download and Load = secondary, Reset = destructive outline
- The "Control Panel Ready" toast stays long enough to cover fields; shorten it
- No "unsaved changes" mark although changes reach an open tour before Apply
- Headings, labels and wording of the other tabs still vary (Display and Content repeat the label settings; Data Sources uses question headings)
- Per-section "Restore Defaults" exists in General and Appearance; Filtering uses its own buttons
