# Search Pro V4 - Production Build Status

## Current Version: 4.5.0 (Maintenance and Control Panel Release)

**Last Updated:** October 7, 2026

## Version History

### V4.5.0 (October 7, 2026) - Maintenance and Control Panel Release
The public API and the Button contract used by the tour are unchanged.
- **Cleanup:** 15 unused functions, an unused CSV shim and cache-buster leftovers removed from `search-v4.js` (about 950 lines); CSS and Control Panel CSS cleaned (no visual change)
- **Security:** postMessage origin check enforced, prototype-pollution guard in `updateConfig`, HTML escaping and icon sanitising, integrity hashes on the CDN fallbacks
- **Fixes:** debug mode crash, 3D model + Google Sheets crash, Fuse.js loading late, repeat Button presses, first ArrowDown, searchBar-only live updates, CSV quoted fields, data sources following config changes, progressive-loading refresh, quick reopen wiping typed text, highlighting inside HTML entities, search icon vanishing after the search is closed
- **3D:** 3D hotspot results centre the camera on the hotspot; 3D object results centre and frame the camera on the object (and still fire their click)
- **Live settings:** the tour applies Control Panel changes instantly (`storage` event; the 2 s check stays as a backup)
- **Control Panel:** previous session can be restored after a reload; `Ctrl/Cmd+R`, `Ctrl/Cmd+D` and `Ctrl/Cmd+L` are no longer taken over (`Alt+Shift+D` = Download, `Alt+Shift+L` = Load, `Ctrl/Cmd+S` = Apply); closing a dialog any way re-enables the header buttons; new **Control Panel Connection** field (allowed Control Panel addresses)
- **Data Sources (unreleased feature) rebuilt:** one source at a time (Tour only / Google Sheets / CSV file), normal Google sharing links accepted, forgiving CSV (any separator, column titles), rows linked to tour elements by Title / Tag / Subtitle / id with `parentId` choosing the panorama, filled cells replace the result's title / description / image / tags, rows whose element is missing jump to their parent panorama, rows that lead nowhere are hidden, a **Test this source** button with a plain-language report, everything off by default; Apply Settings no longer switches the source off when CSV is selected
- **Clicking outside:** new setting `closeOnOutsideClick { mobile, desktop }` (default on = earlier behaviour) with toggles in the Control Panel General tab; off keeps the search open until it is closed with the button, Escape or a chosen result
- **Search field:** a very long text no longer breaks the layout (`box-sizing`, ellipsis)
- **Data Sources test report:** summary tiles that filter, searchable paged table, CSV download (tested with 6,000 rows); matching large sheets is about 90 times faster
- **Control Panel sync:** all 248 Control Panel fields checked end to end; fixed `minSearchChars` being overwritten by a stale `minSearchLength`, misplaced animation defaults, and the cache time default
- **Thumbnails (work in progress, branch `thumbnails`, phases T1 / T1b / L1 / H1):** results show the tour's own pictures (the tour exposes them as `thumbnailUrl`, which earlier versions never read), hotspots / objects / webframes borrow the picture of their panorama / 3D model; the small type icon on the picture is off by default (`typeBadge`: `none` / `all` / `borrowed`; icons only = thumbnails off); look options: picture shape (square, circle, 4:3, 16:9, 2:1) and fit, size per element type, badge look and colors, a different look on phones, generated placeholder tiles in a brand color, optional hover zoom of the picture (mouse rest on desktop, touch and hold on phones; off by default); all of it in the Control Panel (Display > Thumbnail Configuration)
- **Result types (C1):** 360 videos and flat videos are results of their own type ("360 Video", "Flat Video"; they were "Panorama"), photo albums and maps can be added (off by default); each type has its own include switch, picture / icon switches, label, size, placeholder and icon in the Control Panel; type filters and sheet rows know the new names (a whitelist of "Panorama" no longer lets videos through)
- **Icons and per-type switches (I1):** the Icon Size setting works (16-96 px, default stays 20 px); per-type thumbnail and icon switches ignore letter case and cover containers; an icon switched off for a type also hides the built-in icon; icon appearance / hover / visibility settings are always available in the Control Panel; visibility switches and placeholder files reach an open tour live; the thumbnail and icon section resets keep what they should; the retired Business type is removed from the thumbnail and icon settings, and the unused Business fields of the Control Panel are gone
- **Tooling:** `npm run toc` (`scripts/generate-toc.js`) renumbers the comment tags in `search-v4.js` and rebuilds its Table of Contents; build scripts now use the v4 file names
- **Version:** `SEARCH_PRO_RELEASE = "4.5"` (shown in the debug log and as `tourSearchFunctions.version`); every file header reads 4.5

### V4.0.0 (November 3, 2025) - Migration Release
- **Migrated from V3 to V4** with full backward compatibility
- Renamed `search-v3.js` → `search-v4.js`
- Renamed `search-v3.css` → `search-v4.css`
- Updated folder references: `search-pro-v3/` → `search-pro-v4/`
- Added `resolveSearchProPath()` helper for legacy path compatibility
- All V3 installations continue to work without changes
- Version constant: `SEARCH_PRO_VERSION = 'v4'`

### V3.2 (November 1, 2025)
- Google Sheets / CSV / Business JSON integration
- Runtime synchronization improvements
- Exact matches configuration
- Console silence fix
