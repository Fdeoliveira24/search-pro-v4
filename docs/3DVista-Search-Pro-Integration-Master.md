# 3DVista & Search Pro V4 — Integration Master Reference

**Version:** 4.6  
**Last Verified Against:** `search-v4.js` (Search Pro V4.6, rev 10/13/2026)  
**Scope:** Verified by reading actual source code. No guesses or assumptions.  
**Start-up findings (sections 4, 10, 12):** measured in the browser on the project's test tour on 2026-10-10.  
**File authority:** This file is the single source of truth for how 3DVista and Search Pro V4 interact.

---

## Table of Contents

1. [How a 3DVista Tour Loads](#1-how-a-3dvista-tour-loads)
2. [Global Objects Available at Runtime](#2-global-objects-available-at-runtime)
3. [Tour Object Structure](#3-tour-object-structure)
4. [MainPlayList — Access and Navigation](#4-mainplaylist--access-and-navigation)
5. [Media Data Properties](#5-media-data-properties)
6. [Overlays — Types, Access, and Data](#6-overlays--types-access-and-data)
7. [PlayerAPI Methods Used by Search Pro](#7-playerapi-methods-used-by-search-pro)
8. [Event System](#8-event-system)
9. [Button Action Context (`this`)](#9-button-action-context-this)
10. [How Search Pro V4 Integrates](#10-how-search-pro-v4-integrates)
11. [Script Load Order](#11-script-load-order)
12. [Tour Readiness Detection](#12-tour-readiness-detection)
13. [Navigation — How Search Results Jump to Content](#13-navigation--how-search-results-jump-to-content)
14. [Toggling Native 3DVista UI Components](#14-toggling-native-3dvista-ui-components)
15. [Debug Mode](#15-debug-mode)
16. [Right-Click Context Menu](#16-right-click-context-menu)
17. [Control Panel Dashboard — How It Works](#17-control-panel-dashboard--how-it-works)
18. [Known Limitations and Gotchas](#18-known-limitations-and-gotchas)
19. [Release 4.6 — What Changed](#19-release-46--what-changed)
20. [Data Sources — Google Sheet / CSV](#20-data-sources--google-sheet--csv)
21. [Compatibility With 3DVista Builds](#21-compatibility-with-3dvista-builds)
22. [The Documentation Pages](#22-the-documentation-pages)

---

## 1. How a 3DVista Tour Loads

A 3DVista tour is a self-contained HTML application. The entry point is `index.html`, which:

1. Loads `lib/tdvplayer.js` — the 3DVista core engine.
2. Loads `script.js` — the auto-generated tour script (do not edit).
3. Loads `search-pro-v4/search-v4.js` — the Search Pro plugin.
4. Loads `search-pro-v4/config/search-pro-config.js` — the exported config from the Control Panel.

The `#viewer` div is the container where 3DVista renders its content. Search Pro injects its own `#searchContainer` div **inside** `#viewer`.

**Initialization sequence (verified):**

```
1. tdvplayer.js executes  → TDV namespace created
2. script.js executes     → tour = new TDV.Tour(...) created, player created
3. search-v4.js executes  → search plugin starts, waits for tour readiness
4. config.js executes     → _config object applied to search plugin
5. TDV.Tour.EVENT_TOUR_LOADED fires → search plugin binds to tour data
```

---

## 2. Global Objects Available at Runtime

These are confirmed globals accessible from any JavaScript running in the tour:

| Global | Type | Description |
|--------|------|-------------|
| `window.tour` | `TDV.Tour` | The main tour instance |
| `window.TDV` | Namespace | All 3DVista classes |
| `window.TDV.Tour` | Constructor | Tour constructor and event constants |
| `window.TDV.PlayerAPI` | Object | Entry point to the player API |
| `window.tour.player` | PlayerAPI | The active player instance |
| `window.tour.locManager` | Object | Localization manager |
| `window.tour.locManager.rootPlayer` | Player | Root player (used for overlay context) |
| `window.tour._isInitialized` | Boolean | True when tour is fully initialized |
| `window.tour._settings` | Object | Tour configuration settings |
| `window.tour._devicesUrl` | Object | Maps device types to script URLs |
| `window.tour.mainPlayList` | PlayList | The main scene playlist |

---

## 3. Tour Object Structure

```
window.tour
  ├── .player                       → PlayerAPI instance
  │     ├── .getByClassName(name)   → Array of matching objects
  │     ├── .getById(id)            → Single object by ID
  │     └── .mainPlayList           → Fallback playlist access via player
  ├── .mainPlayList                 → PlayList instance (primary access)
  │     ├── .get("items")           → Array of PlayListItems
  │     ├── .get("selectedIndex")   → Current scene index (integer)
  │     └── .set("selectedIndex", n) → Navigate to scene n
  ├── .locManager
  │     └── .rootPlayer
  │           └── .mainPlayList     → Same playlist, accessible via root player
  ├── ._isInitialized               → Boolean
  └── .bind(eventName, handler)     → Event subscription
```

**PlayListItem structure (verified):**

```javascript
const items = tour.mainPlayList.get("items");
const item   = items[0];
const media  = item.get("media");   // Panorama, Video360, Model3D, etc.
const data   = media.get("data");   // Object with label, subtitle, tags
```

---

## 4. MainPlayList — Access and Navigation

### Where the main playlist really lives (read this first)

> **Important:** `window.tour.mainPlayList` does **not exist** in the 3DVista export this project is tested with. The playlist is one level deeper, on the root player. Code that checks only `window.tour.mainPlayList` believes the tour is never ready.

3DVista exports differ between versions, so never assume one location. This is what the browser console showed on the test tour (2026-10-10):

| Expression | Result in the test tour |
|---|---|
| `window.tour.mainPlayList` | **`undefined`** |
| `window.tour.locManager.rootPlayer.mainPlayList` | **object** (8 items, `get("selectedIndex")` is `0`) |
| `window.tour.player.getByClassName` | function |
| `window.tour.bind` and `TDV.Tour.EVENT_TOUR_LOADED` | function and `"tourLoaded"` |
| `window.tour._isInitialized` | `true` |
| `window.tour.get` | `undefined` (do not call `tour.get("mainPlayList")` on the tour itself) |

**The rule for any new code:** look the playlist up with a fallback, try the root player, and treat "not found yet" as "keep waiting", not as an error.

```javascript
function findMainPlaylist() {
  const tour = window.tour;
  const rootPlayer = tour && tour.locManager && tour.locManager.rootPlayer;
  return (tour && tour.mainPlayList) || (rootPlayer && rootPlayer.mainPlayList) || null;
}
```

Inside the plugin use `PlaylistUtils.getAllPlayLists(tour)`. It returns `{ main, root }`: `root` is the root player's playlist (the one that works in the test tour) and `main` is found by direct access or by searching the player's playlists. Use whichever is not `null`. A tour button action does not need any lookup: `this` is the root player (section 9).

### Accessing the playlist (verified fallback chain)

Search Pro uses this priority order to find the playlist:

```javascript
// 1. Direct access: NOT available in the test tour (see above). Try it, never rely on it
tour.mainPlayList.get("items")

// 2. Via locManager root player: this is the one that works in the test tour
tour.locManager.rootPlayer.mainPlayList.get("items")

// 3. Fallback — via player.getByClassName
tour.player.getByClassName("PlayList").find(pl => pl.get("id") === "mainPlayList")

// 4. Fallback — via player property
tour.player.mainPlayList

// 5. Fallback — via player.get()
tour.player.get("mainPlayList")
```

### Checking tour readiness (verified)

```javascript
window.tour &&
window.tour.mainPlayList &&
typeof window.tour.mainPlayList.get === "function" &&
Array.isArray(window.tour.mainPlayList.get("items")) &&
window.tour.mainPlayList.get("items").length > 0
```

The `tour._isInitialized` flag is **also** checked — if it is explicitly `false`, the tour is not ready. If the property does not exist, that is acceptable.

### Navigating to a scene

```javascript
// Navigate by playlist index
tour.mainPlayList.set("selectedIndex", index);

// Navigate by triggering the PlayListItem directly
item.trigger("click");
```

---

## 5. Media Data Properties

All content (panoramas, videos, 3D models) exposes a `data` object. Access pattern:

```javascript
const data = media.get("data");
// or (if .get is unavailable):
const data = media.data;
```

### Confirmed properties on `data`

| Property | Type | Description |
|----------|------|-------------|
| `data.label` | String | The scene/media name shown in the editor |
| `data.subtitle` | String | The secondary text line (NOT `description`) |
| `data.tags` | Array\<String\> | Array of categorical tags |
| `data.id` | String | Internal 3DVista object ID |

> ⚠️ **Important:** The native 3DVista data property is `data.subtitle`, **not** `data.description`. The word `description` does not appear as a native 3DVista property in any verified code path. `description` only exists in external Google Sheets / CSV data imported by the plugin.

### Thumbnail access (verified at run time on the test tour's export)

```javascript
media.get("thumbnailUrl")  // The tour's own picture of a panorama, 3D model or video: absolute URL, about 256 px wide
```

* `thumbnailUrl` is the property this export exposes. The older names that earlier versions of this document listed (`thumbnail`, `firstFrame`, `preview`) returned nothing on that export; the plugin still tries them after `thumbnailUrl`.
* **Overlays:** a video overlay (`QuadVideoPanoramaOverlay`) has a poster picture in `overlay.get("image")`. An ordinary hotspot (`HotspotPanoramaOverlay`) only has its **icon graphic** in `items[0].get("image")`, a 3D hotspot (`SpriteModel3DObject`) the same in `image`: these are not pictures of the element and are not used as thumbnails. Webframes, polygons, 3D model objects and containers have no picture. Image / projected-image overlay classes are expected to expose `image` but are not part of the test tour.
* **What the plugin shows (thumbnails on):** sheet / CSV image, else the element's own tour picture, else the picture of the panorama / 3D model it lives in, else the per-type placeholder, else the generic placeholder (section 19, settings `thumbnailSettings.useTourPictures`, `useParentPictures`).
* **Picture and icon together or apart:** `thumbnailSettings.typeBadge` decides whether a small type icon is drawn in the corner of each picture: `"none"` (default, picture only), `"all"` (every picture) or `"borrowed"` (only a picture borrowed from the parent); `true` / `false` of earlier settings mean `"all"` / `"none"`. Icons only, without pictures, is `enableThumbnails: false`. The icon follows the icon settings (custom icons, `showIconFor` per type) and is hidden on 16 / 24 px pictures.
* **Look of the pictures (all optional, `thumbnailSettings`):** `shape` (`"square"`, `"circle"`, `"4:3"`, `"16:9"`, `"2:1"`; a wide shape keeps the height of `thumbnailSize` and widens the box, `"2:1"` shows a panorama preview whole), `fit` (`"cover"` / `"contain"`), `position` (`"left"` / `"center"` / `"right"`, the part kept when cropping), `sizeByType` (own size per element type, for example `{ "panorama": "80px", "hotspot": "48px" }`; keys are the lower-case type names used by `showFor`, `"other"` covers containers; empty = `thumbnailSize`), `badge` (`position` `"bottom-right"` / `"bottom-left"` / `"top-right"` / `"top-left"`, `shape` `"square"` / `"round"`, `size` `"small"` / `"medium"` / `"large"`, `style` `"icon"` / `"label"` (the type name as text), `color`, `background`, `opacity`), `mobile` (`mode` `"same"` / `"picture"` / `"picture-icon"` / `"icon"`, `size`, `shape`; applies up to `mobileBreakpoint`, a single `size` replaces `sizeByType` on phones; the open results are drawn again when the screen crosses the breakpoint) and `placeholder` (`style` `"generated"` = a small SVG tile with the type icon in `color`, `"files"` = the plugin's picture files; a placeholder file you configured yourself is always used; a sheet picture that fails to load also falls back to the tile). Colors must be `#rgb` or `#rrggbb`, other values are ignored. `hoverZoom` (`desktop` / `mobile` `true` or `false`, both off by default; `scale` 1.25 to 4, default 3; `delay` 0 to 1000 milliseconds, default 200): the picture of a result grows while the mouse rests on it (desktop) or while a finger holds it for at least 350 ms (phones; a quick tap still opens the result, and the tap that ends a hold does not). It is a plain bigger copy of the picture drawn on top of the page, no card; it disappears when the mouse leaves, the finger lifts, the page scrolls, a key is pressed, the results are drawn again or the search closes. The Control Panel offers all of it under Display, Thumbnail Configuration (Hover Zoom).
* **Element types and the per-type switches (verified on the test tour):** the search names its results `Panorama` (panoramas), `Video360` ("360 Video"), `FlatVideo` ("Flat Video"), `Album` ("Photo Album", off by default), `Map` (off by default), `Hotspot`, `Polygon`, `Video` (video overlays), `Webframe`, `Image`, `Text`, `ProjectedImage`, `3DModel`, `3DHotspot`, `3DModelObject`, `Container` and `Element` (an overlay the search cannot classify, rare). Overlays are classified by their class and, first, by keywords in their id or name (for example "image", "placeholder", "photo", "projected-image", "sprite"). The switches `thumbnailSettings.showFor`, `thumbnailSettings.iconSettings.showIconFor` and the sizes in `sizeByType` use the lower-case type names (`video360`, `flatvideo`, `album`, `map` for the new ones), ignore letter case (`projectedImage` = `projectedimage`), have a `container` key and an `other` catch-all for any type not listed. A switch turned off shows the plain icon (thumbnails) or no icon (icons, for the built-in icons as well as custom ones). The old `business` type no longer exists and is ignored if it is still in a saved configuration. Audio of a tour is not part of the search. Every type also has its own include switch (`includeContent.elements.include360Videos`, `includeFlatVideos`, `includeAlbums`, `includeMaps`; albums and maps are `false` by default, the other two `true`), label (`displayLabels`), placeholder file, custom icon and built-in icon. A saved sheet row that calls a 360 video or a flat video `Panorama` is still linked to it. Type filters (`filter.elementTypes`) use the same names, so a whitelist of `Panorama` no longer lets videos through.
* **How 3DVista builds the playlists (verified on the test tour):** `mainPlayList` holds the panoramas, 3D models, 360 videos and flat videos in tour order (item classes `PanoramaPlayListItem`, `Model3DPlayListItem`, `Video360PlayListItem`, `VideoPlayListItem`; media classes `Panorama`, `Model3D`, `Video360`, `Video`) and a result opens with `playlist.set("selectedIndex", index)`. The skin's thumbnail grid has its own playlist (`ThumbnailGrid_…_playlist`) that repeats those items and also holds the photo albums (`PhotoAlbumPlayListItem`, media class `PhotoAlbum`; the photos sit in the album's own playlist `album_…_AlbumPlayList` as `PhotoPlayListItem` / `Photo`). A map (`MapPlayListItem`, media class `Map`) sits alone in a one-item playlist, and every other one-item playlist belongs to an action of the tour. So albums and maps are found by looking through all `PlayList` objects (the playlist with the most items is the one the tour itself uses), not through the main playlist. All of these media have a `thumbnailUrl` (album `…_t.png`, map `…_t.jpg`). Opening an album = selecting its item in the grid playlist (the tour shows it in its photo viewer); opening a map = selecting it and showing its viewer, which the test tour hides until a button of its own opens it (the plugin sets the viewer's `visible` to `true`).
* **Picture size on disk (this export):** panorama `*_t.jpg` is 256 x 128, 3D model `*_t.jpg` about 200 x 160; the export also holds `*_hd_t.jpg` (panorama 1536 x 768, 3D model about 1200 x 960) that is not referenced by the `thumbnailUrl` property.

---

## 6. Overlays — Types, Access, and Data

### Overlay class names (verified from source)

These are the actual JavaScript class names used by 3DVista overlays:

| 3DVista Class Name | Search Pro Type | Description |
|--------------------|-----------------|-------------|
| `HotspotPanoramaOverlay` | `Hotspot` | Standard hotspot |
| `PolygonPanoramaOverlay` | `Polygon` | Polygon hotspot |
| `FramePanoramaOverlay` | `Webframe` | Embedded web page |
| `QuadVideoPanoramaOverlay` | `Video` | Video overlay |
| `ImagePanoramaOverlay` | `Image` | Image overlay |
| `TextPanoramaOverlay` | `Text` | Text overlay |
| `ProjectedImagePanoramaOverlay` | `ProjectedImage` | Projected image |
| `VideoPolygonPanoramaOverlay` | `Video` | Video polygon |
| `ImagePolygonPanoramaOverlay` | `Image` | Image polygon |
| `SpriteModel3DObject` | `3DModelObject` | Object inside a 3D model |
| `InnerModel3DObject` | `3DModelObject` | Inner object of 3D model |
| `Model3DObject` | `3DModelObject` | 3D model object |
| `Sprite3DObject` | `3DModelObject` | 3D sprite object |
| `SpriteHotspotObject` | `3DModelObject` | Hotspot inside 3D model |
| `Container` | `Container` | Container element |
| `Model3DPlayListItem` | `3DModel` | A 3D model as a PlayList item |

### Retrieving overlays for a media item (verified)

Search Pro uses this priority chain:

```javascript
// 1. Primary
const overlays = media.get("overlays");

// 2. Direct property
const overlays = media.overlays;

// 3. Via overlaysByTags (returns object, must flatten)
const tagOverlays = media.get("overlaysByTags");

// 4. Fallback: all PanoramaOverlays via player, filtered by parent media ID
const all = tour.player.getByClassName("PanoramaOverlay")
  .filter(o => o.get("media")?.get("id") === media.get("id"));

// 5. 3D-specific: SpriteModel3DObject, Model3DObject, Sprite3DObject, SpriteHotspotObject
tour.player.getByClassName("SpriteModel3DObject")
```

### Overlay data properties (verified)

```javascript
const data = overlay.get("data");  // primary
// or:
const data = overlay.data;         // direct property fallback

data.label     // Overlay/hotspot name
data.subtitle  // Secondary text line
data.tags      // Array of tags
```

Overlay type/class is accessed via:
```javascript
overlay.class           // Direct property (most reliable)
overlay.get("class")    // Via getter fallback
```

### Triggering an overlay programmatically

```javascript
overlay.trigger("click");
```

---

## 7. PlayerAPI Methods Used by Search Pro

These are the **actual** player methods called in the verified codebase:

| Method | Usage |
|--------|-------|
| `tour.player.getByClassName(className)` | Get all instances of a class (e.g. `"PlayList"`, `"PanoramaOverlay"`, `"Container"`, `"SpriteModel3DObject"`) |
| `tour.player.getById(id)` | Get a single element by its ID string |
| `tour.player.mainPlayList` | Access the main playlist via player object |
| `playlist.set("selectedIndex", n)` | Navigate to scene at index `n` |
| `playlist.get("items")` | Get all PlayListItems |
| `playlist.get("selectedIndex")` | Get current scene index |
| `element.trigger("click")` | Programmatically activate any element |
| `item.get("media")` | Get the media object from a PlayListItem |
| `media.get("data")` | Get the data object from media |
| `media.get("overlays")` | Get overlays attached to media |
| `media.get("id")` | Get the internal ID of a media object |

**Not used by Search Pro** (listed in analysis document but not found in verified code):
- `getMediaByName()` — not called
- `getActiveMediaWithViewer()` — not called  
- `getCurrentPlayers()` — not called
- `mixObject()` — not called
- `updateDeepLink()` — not called
- `getOverlaysByGroupname()` — not called (plugin uses `getByClassName` instead)

---

## 8. Event System

### Verified events used by Search Pro

```javascript
// Bind to tour loaded (primary binding strategy)
window.tour.bind(window.TDV.Tour.EVENT_TOUR_LOADED, function() {
    // Tour is ready — safe to read mainPlayList.get("items")
});

// Bind to tour ended (for cleanup)
window.tour.bind(window.TDV.Tour.EVENT_TOUR_ENDED, function() {
    // Tour is closing — clean up search
});

// Bind to a PlayListItem begin event (for navigation confirmation)
item.bind("begin", handler);
```

### Event constants (verified)

| Constant | Trigger |
|----------|---------|
| `TDV.Tour.EVENT_TOUR_INITIALIZED` | Basic tour structure is ready (not yet media-loaded) |
| `TDV.Tour.EVENT_TOUR_LOADED` | Media loaded, tour is fully playable — **use this for initialization** |
| `TDV.Tour.EVENT_TOUR_ENDED` | Tour has finished |
| `"begin"` | Fires on a PlayListItem when it starts playing |
| `"end"` | Fires on a PlayListItem when it stops |

### Event binding pattern

```javascript
// Subscribe
object.bind("eventName", handlerFunction);

// Unsubscribe
object.unbind("eventName", handlerFunction);
```

---

## 9. Button Action Context (`this`)

When a 3DVista button action executes, **`this` refers to the `rootPlayer` object**, not the button and not `window.tour`.

### The Search Pro button code (verified — `extras/Button.js`)

This is the exact code to paste into a 3DVista button's JavaScript action:

```javascript
try {
    var searchContainer = document.getElementById('searchContainer');
    if (searchContainer) {
        if (!window.searchListInitiinitialized) {
            window.tourSearchFunctions.initializeSearch(this);
        }
        window.tourSearchFunctions.toggleSearch(searchContainer.style.display !== 'block');
    }
} catch (error) {
    console.error('Button action error - Check if initialization is complete:', error);
}
```

### How this code works — line by line

1. **`getElementById('searchContainer')`** — checks that the Search Pro DOM element exists. If the plugin hasn't loaded yet, this returns `null` and nothing runs.

2. **`if (!window.searchListInitiinitialized)`** — guards against re-initializing on every button press.
   > ⚠️ **Note on the typo:** The variable name `searchListInitiinitialized` contains a double `i` ("Initii..."). This spelling is intentional — it matches a variable that `search-v4.js` also sets to `false` during cleanup (verified at line 804). The correctly spelled `window.searchListInitialized` is a separate variable. Both exist. The button check uses the typo spelling — do not "fix" it.

3. **`window.tourSearchFunctions.initializeSearch(this)`** — passes `this` (which is `rootPlayer`) to the plugin. The plugin recovers the real tour via `this.get("data").tour`. This is only called when the typo variable is falsy (i.e., on first press or after cleanup).

4. **`window.tourSearchFunctions.toggleSearch(searchContainer.style.display !== 'block')`** — toggles the search UI visibility every button press. The argument evaluates to `true` (show) when the container is hidden, or `false` (hide) when it is visible.

### How `this` is resolved inside the plugin (verified)

```javascript
// From _initializeSearch() — verified
if (tour && typeof tour.get === "function") {
    const tourFromContext = tour.get("data")?.tour;
    if (tourFromContext && tourFromContext.mainPlayList) {
        actualTour = tourFromContext;  // ← real tour recovered from rootPlayer
    }
}
```

`rootPlayer.get("data").tour` holds a reference back to `window.tour`. This is the only verified way to recover the actual tour object from a button action's `this` context.

### Button action environment

- Executes synchronously in the main thread
- Has full access to `window`, `document`, and all global variables
- `window.tourSearchFunctions` must already be initialized (i.e., `search-v4.js` must have loaded) before the button fires
- No automatic cleanup when leaving a scene

---

## 10. How Search Pro V4 Integrates

### What the plugin does on load

1. Starts loading CSS (`search-pro-v4/css/search-v4.css`)
2. Injects `#searchContainer` div inside `#viewer`
3. Loads Fuse.js (local first, CDN fallback)
4. Optionally loads Font Awesome (if enabled in config)
5. Optionally loads debug tools (if `debug=true` in URL or localStorage)
6. Waits for tour readiness, then binds to tour data

### How the search starts (verified 2026-10-10)

In this project the search does **not** start when the tour loads. It starts the first time somebody presses the tour's search button ("lazy start"). Step by step:

1. **The page loads.** `search-v4.js` creates the hidden `#searchContainer`, loads the stylesheet and Fuse.js, and applies the settings (the settings file and the Control Panel's saved settings). No search index exists yet.
2. **The plugin's own automatic start looks for the tour, and never finds it.** It waits up to 15 seconds for `window.tour.mainPlayList` (see section 4: that property does not exist in the test tour). It then writes `Tour not ready after waiting for 15000 ms` to the console and gives up. This warning is harmless and is the expected result in this tour. (Three further things in that code would stop it even with the right playlist: `isTourReady()` reads `PlaylistUtils`, which lives in another scope; `bindToTour()` leaves at the first failed strategy; `validateAndInitialize()` reads `window.tour.mainPlayList` again. Details and a safe clean-up in `_maintenance/audit/PLUGIN-AUTOSTART-FINDINGS-2026-10-13.md`; nothing was changed.)
3. **A visitor presses the search button.** The button action calls `window.tourSearchFunctions.initializeSearch(this)` with `this` = the root player (section 9). This builds the search index (and loads Google Sheet / CSV data if switched on) and opens the search.
4. **Every later press only opens and closes** the search. The index is built once.

**Exception for the Control Panel (2026-10-11):** the plugin listens on the `BroadcastChannel("tourSearchChannel")` from page load (it used to start listening inside `initializeSearch`, so the Data Sources test and the scan of the tour got no answer before the first press). Each request is confirmed at once with `searchProAck { id }`; if the search has not started, the plugin then starts it **without opening it** (`_ensureSearchStarted`: the playlist must be there; `openOnStart` does not open it either) and answers when the index exists (up to 20 seconds). Visitors are not affected: only a Control Panel open in the same browser can send these requests. The Control Panel waits 1.5 seconds for the confirmation (nothing = no tour open) and then up to 30 seconds for the report.


**Decision (2026-10-10): keep the lazy start.** The plugin could be made to start by itself, but it should not be, for every tour:

| | Lazy start (today) | Automatic start at page load |
|---|---|---|
| Tour start speed | Not affected | Slower: the index, and sheet data, are built for every visitor |
| Visitors who never search | Pay nothing | Pay the full cost anyway |
| First open of the search | A moment of work at the first press | Instant |

**Open When the Tour Starts (`openOnStart`) is the opt-in version of the automatic start.** It is off by default. When it is on for the visitor's device type, the plugin starts the search by itself, but only after the tour has really **started** (see "Ready versus started" in section 12), and opens it 800 ms later. Nothing changes for tours that leave it off. The setting is read when it arrives through `updateConfig` (settings file, Control Panel saved settings or live change) and the function that waits is `_startWhenOpenOnStart()` in `search-v4.js`.

### Tour binding strategies (verified)

These three strategies run **after** the entry check described above has passed. In the test tour the entry check never passes, so they only run when the search is started from the button (the button hands the root player straight to `initializeSearch`).

Search Pro tries three strategies in order:

**Strategy 1 — Official 3DVista Event (preferred)**
```javascript
window.tour.bind(TDV.Tour.EVENT_TOUR_LOADED, callback);
```

**Strategy 2 — Polling (fallback)**
```javascript
// Polls every 200ms for up to 20 seconds
// Checks: window.tour, mainPlayList, items.length > 0, player.getByClassName exists
```

**Strategy 3 — DOM Mutation Observer (last resort)**
```javascript
// Watches for [data-name], .PanoramaOverlay, .mainViewer elements in the DOM
```

### How the search index is built

Once the tour is ready:

```javascript
const items = tour.mainPlayList.get("items");
items.forEach((item, index) => {
    const media  = item.get("media");
    const data   = media.get("data");
    const label  = data?.label?.trim()    || "";
    const subtitle = data?.subtitle?.trim() || "";
    const tags   = Array.isArray(data?.tags) ? data.tags : [];
    // ... add to Fuse.js index
    
    const overlays = media.get("overlays");  // + multiple fallbacks
    overlays.forEach(overlay => {
        const oData = overlay.get("data") || overlay.data;
        // oData.label, oData.subtitle, oData.tags
    });
});
```

Fuse.js is used for fuzzy search over the built index. A wildcard `*` in the search field returns all results.

The main playlist is not the only source (changed 2026-10-11, section 21): after it the plugin adds the panoramas, 360 videos, flat videos and 3D models that another playlist holds (3DVista's "Include into PlayList" off; `source: "extra"`, the result carries `navPlaylist` / `navIndex`), then the photo albums and maps of the other playlists (when switched on), the audio files (when switched on), the rows of a sheet and the typed containers. When the search is started with `window.tour` instead of the tour's own button, the player's root playlist is read as well; an item whose media is already indexed from the main playlist is skipped (see "Main playlist versus root playlist" in section 21).

---

## 11. Script Load Order

The correct load order in `index.html` is **(verified)**:

```html
<!-- 1. 3DVista core (generated by 3DVista — do not edit) -->
<script src="lib/tdvplayer.js"></script>
<script src="script.js"></script>

<!-- 2. Search engine BEFORE config -->
<script src="search-pro-v4/search-v4.js"></script>

<!-- 3. Config AFTER search engine -->
<script src="search-pro-v4/config/search-pro-config.js"></script>
```

**Recommended: `search-v4.js` first, `search-pro-config.js` second.** This is the order the guide and the tests use. Checked on 2026-10-16 with a settings file made by the Control Panel (probe `order_probe.js`): the file only sets `window.searchProConfig`, and the plugin reads that object at `DOMContentLoaded` plus 100 ms, so both orders apply the settings with no error (the earlier statement that the file calls `window.tourSearchFunctions` and fails in the other order was wrong for these files). A hand-written settings file that calls plugin functions at load would still need the engine first; that case is not tested.

---

### What goes on the server (release 4.6)

The folder `search-pro-v4/` must sit beside the tour's `index.html` under exactly that name (the Live Preview page uses `<base href="../../../">` and loads `search-pro-v4/...`). What a visitor's browser fetches: `search-v4.js`, `css/search-v4.css`, `fuse.js/dist/fuse.min.js`, `config/search-pro-config.js` (the owner's file), the picture files of `assets/` when pictures are on, the icon fonts of `icons/` when a custom icon needs one (each has a CDN fallback with an integrity hash), a CSV file of `business-data/` when Data Sources reads one, and `dashboard/js/debug-core-v4.js` only with debug mode on. The Control Panel (`dashboard/`: `control-panel-v4.html`, `css/`, `js/`, `tabs/`, `fonts/`, `fontawesome/`, `preview/`) also needs `../fuse.js/dist/fuse.min.js`, `../icons/` (Bootstrap Icons and Ionicons style sheets) and, for the Live Preview, the plugin's own `search-v4.js` and `css/search-v4.css`. Not needed on a server: `documentation/`, `extras/`, `scripts/`, `node_modules/`, `package*.json`, `terser.config.json`, `.eslintrc.json`, `*-bck.*`, `dashboard/MIGRATION-V4-SUMMARY.md`. The step-by-step version for the owner's customers is `documentation/installation-guide.html`.

## 12. Tour Readiness Detection

### Ready versus started (read this before writing any "when the tour opens" feature)

Two different moments are often confused:

* **Ready:** the main playlist exists and has items. The tour data can be read and the search index can be built.
* **Started:** the visitor is looking at the first panorama. The playlist has a selected item: `playlist.get("selectedIndex")` is `0` or higher.

With the default 3DVista loading setting the two happen almost together. They do not when the tour has a start screen. 3DVista's **Global Settings > Initialization** has four modes:

| Initialization (3DVista) | The tour starts when | Playlist while the start screen waits |
|---|---|---|
| On Ready | the tour has loaded | not applicable (started at once) |
| On Click | the visitor clicks the start screen | ready, `selectedIndex` is `-1` |
| On Click or Video Finished | the visitor clicks, or the intro video ends | ready, `selectedIndex` is `-1` |
| When Video Finished | the intro video ends | ready, `selectedIndex` is `-1` |

The test tour uses On Ready, and there `selectedIndex` is `0` as soon as the playlist has items. The `-1` behavior of the other three modes follows 3DVista's own logic and was **simulated** (the check was made to report `-1` until released); it has not yet been observed on a real On Click export. `openOnStart` relies on it so the search does not appear on top of a start screen.

Rule of thumb: build data when the tour is **ready**; show anything to the visitor only when it has **started**.

### The old entry check (does NOT pass in the test tour)

The check below is what the plugin's automatic start waited for. It looks only at `window.tour.mainPlayList` and therefore never succeeds in the test tour (section 4). Use `findMainPlaylist()` from section 4 instead.

**Entry check used before 2026-10-10 (verified from source):**

```javascript
function isTourReady() {
    return (
        window.tour &&
        window.tour.mainPlayList &&
        typeof window.tour.mainPlayList.get === "function" &&
        Array.isArray(window.tour.mainPlayList.get("items")) &&
        window.tour.mainPlayList.get("items").length > 0 &&
        window.tour.player &&
        typeof window.tour.player.getByClassName === "function" &&
        window.tour._isInitialized !== false   // undefined is acceptable
    );
}
```

The most reliable signal is `TDV.Tour.EVENT_TOUR_LOADED`. Polling is a safe fallback.

---

## 13. Navigation — How Search Results Jump to Content

### Panorama / scene navigation (verified)

```javascript
playlist.set("selectedIndex", item.index);
```

### Overlay / hotspot activation (verified)

```javascript
// 1. Navigate to the parent panorama first
playlist.set("selectedIndex", item.parentIndex);

// 2. Then trigger the overlay
setTimeout(() => {
    const element = tour.player.getById(overlay.id);
    element.trigger("click");
}, delay);
```

### 3D Model navigation (verified)

```javascript
// Navigate to the 3D model scene
playlist.set("selectedIndex", item.index);
```

### 3D Model Object and 3D Hotspot results (verified, release 4.5)

```javascript
// 1. Navigate to the parent 3D model
playlist.set("selectedIndex", item.parentIndex);

// 2. 600 ms later: if the model is already the active item, continue at once;
//    otherwise wait for the model's "begin" event (only the most recent request keeps its handler)
parentItem.bind("begin", handler);

// 3a. 3D hotspot (SpriteModel3DObject): centre the camera on it. Its own click action is NOT fired
//     (it may navigate away, exactly like for panorama hotspots).
rootPlayer.setModel3DCameraSpot(playlist, modelItem, { x, y, z, distance }, 1, "cubic_in_out");

// 3b. 3D object (InnerModel3DObject): centre and frame the camera on it AND fire its click action
tour.player.getById(objectId).trigger("click");
```

How the camera target is found (both need the model file, `media.get("model").get("levels")[0].get("url")`):

* The plugin reads only the JSON header of the `.glb` / `.gltf` file once and caches it (nodes, parent links, mesh bounding boxes).
* **3D hotspot:** `x / y / z` are local to the glTF node `parentId`; the world position is the node's world matrix (node chain, parent first) times that local position.
* **3D object:** `objectId` is the glTF node index. The bounding box is the union of the node's own mesh and every mesh below it (POSITION accessor `min` / `max`, transformed by the node chain). The camera looks at its centre.
* **Distance:** hotspots use half of `initialDistance` (never zooming out from where the user is). Objects use the distance that fits the bounding sphere into the narrower of the horizontal / vertical view angle (× 1.6), at most half of `initialDistance`, and always inside the camera's `minDistance` / `maxDistance`.
* The orbit camera has these properties: `x, y, z, yaw, pitch, fov` (horizontal, degrees), `distance`, `initialDistance`, `minDistance`, `maxDistance`. Moving it: `rootPlayer.setModel3DCameraSpot(playlist, playListItem, spot, seconds, easing)`.
* If the model file cannot be read the camera is left alone (the model still opens and the object is still triggered).

### Container access (verified)

```javascript
const containers = window.tour.player.getByClassName("Container");
containers.forEach(c => {
    const data = c.get("data");
    // data.name holds the container name (not data.label). Names are NOT unique: several containers can share one.
});
```

---

## 14. Toggling Native 3DVista UI Components

3DVista has built-in UI component types (DropDown, ThumbnailList, etc.) that can be shown/hidden from JavaScript using the same `getByClassName` + `get` / `set` API pattern verified throughout the codebase.

### Confirmed pattern (consistent with verified API)

```javascript
// Show or hide any 3DVista UI component by class name
const components = window.tour.player.getByClassName('ClassName');
const target = components.find(c => c.get('id') === 'myComponentId');
if (target) {
    const isVisible = target.get('visible');
    target.set('visible', !isVisible);  // toggle
}
```

### Components confirmed usable with this pattern

| Class Name | Notes |
|------------|-------|
| `Container` | ✅ Verified in `search-v4.js` — `getByClassName("Container")` + `get("data")` |
| `PlayList` | ✅ Verified — used extensively to find `mainPlayList` |
| `PanoramaOverlay` | ✅ Verified — all hotspot/overlay types |
| `DropDown` | Plausible — follows the same API pattern. Not directly verified in Search Pro code but consistent with how 3DVista works |
| `ThumbnailList` | Plausible — same API pattern. Not directly verified in Search Pro code |

### Looking up a component by name (not ID)

3DVista IDs are auto-generated strings (e.g. `ThumbnailList_5BD019DE_64AA_D256_4165_BCCC5054D856_playlist`). When you don't know the ID, use the name stored in `data`:

```javascript
const components = window.tour.player.getByClassName('DropDown');
const target = components.find(c => c.get('data')?.name === 'MyDropdownName');
```

### Safe pattern with tour-ready guard

```javascript
if (!window.tour?.player) {
    console.warn('Tour not ready');
    return;
}
const items = window.tour.player.getByClassName('ClassName');
```

> **Note:** The `get('visible')` / `set('visible', bool)` property pattern is consistent with 3DVista's getter/setter API but was not verified directly from Search Pro's source code. It is shown here based on the consistency of the pattern with all other verified `get()`/`set()` calls throughout the codebase.

---

## 15. Debug Mode

Activate debug mode by appending `?debug=true` to the tour URL, or:

```javascript
localStorage.setItem("searchProDebugEnabled", "true");
```

When enabled:
- `search-pro-v4/dashboard/js/debug-core-v4.js` is dynamically loaded
- Verbose `[Search]` logging is active in the browser console
- The `window.Logger` object is replaced with the full debug logger

To disable:
```javascript
localStorage.removeItem("searchProDebugEnabled");
```

### Console silencer (by design, section 0.4 of `search-v4.js`)

When debug mode is **off**, the plugin replaces `console.log`, `console.info` and `console.debug` with empty functions for the **whole page** (the tour and every other script included), the moment `search-v4.js` loads. `console.warn` and `console.error` are never touched. The three originals come back after the first uncaught error of the page (`window` `error` event, once), and they stay as they were when debug mode is on (`?debug=true` in the address, or `searchProDebugEnabled` = `"true"` in `localStorage`).

What it means for a builder or developer: a `console.log` line of another script on the page shows nothing until debug mode is on. This is a known decision (item C15 of the 2026-10-06 audit, kept on purpose) and was raised again by two outside reviews on 2026-10-16. It is **not** a defect of the visitor's experience. Removing it means converting the plugin's own logging to the `Logger` object first (hundreds of lines), so it is a separate job, not a quick fix.

---

## 16. Right-Click Context Menu

### How 3DVista builds it (verified)

The right-click menu is **not** a browser default. It is a custom menu built entirely by `lib/tdvplayer.js` (the 3DVista engine, a 3.7 MB minified file). Key facts verified:

- **Listener location:** A `contextmenu` listener on `document` in the **capture phase** (`true`). It always calls `preventDefault()` and `stopImmediatePropagation()`, which is why the browser's own right-click menu never shows.
- **Menu element:** Built as a `<div>` appended directly to `<body>`, not inside `#viewer`.
- **Live Guided Session item:** Added by the remote script `https://remote.3dvista.com/lib/tdvremote.js`, loaded at runtime from 3DVista's servers (visible in `index.html`).
- **Tour name in menu:** The label (e.g. "PXL 360 Player") is encoded inside the minified player file — searching the source files for it finds nothing. It comes from tour export settings in 3DVista Studio.

### Why the `#viewer` approach does NOT work

This code (and variants like it) **does not work**:

```html
<!-- ❌ THIS DOES NOT WORK — do not use -->
<script>
document.getElementById('viewer').addEventListener('contextmenu', function(e) {
    e.preventDefault();
    e.stopPropagation();
}, true);
</script>
```

**Reason:** The player's listener is registered on `document` in the capture phase. The capture phase propagates `window → document → body → #viewer`. A `document` capture listener fires **before** a `#viewer` capture listener. The player also calls `stopImmediatePropagation()`, which prevents any other handlers on `document` from running — but a `#viewer` listener never gets the event to begin with.

### The correct solution (verified — already in `index.html`)

Place this in `<head>` — registering it on `window` (not `document`) means it fires before the player's `document` listener, regardless of script load order:

```html
<script>
window.addEventListener('contextmenu', function (e) {
    e.preventDefault();
    e.stopImmediatePropagation();
}, true);
</script>
```

This is already implemented in [index.html](/Users/franciscooliveira/Dropbox/360Virtual Tour Solutions/Projects/search/Development/Test-October-26/index.html) (lines 37–41). It removes the entire right-click menu including the Live Guided Session and fullscreen items.

### Options for customization

| Approach | How | Survives re-export? |
|----------|-----|---------------------|
| **Remove menu completely** | Use the `window` capture listener above (already done) | ✅ Yes — it's in `index.html`, not in 3DVista-generated files |
| **Restyle the existing menu** | A script placed after `tdvplayer.js` that watches for the menu div and re-applies styles with `setProperty(..., 'important')` | ✅ Yes — script lives in `index.html` |
| **Replace with a custom menu** | Block the player's menu with the window listener, then build your own `<div>` with custom items and actions | ✅ Yes |
| **Modify `tdvplayer.js` directly** | Edit the menu class and the method that builds items | ❌ No — overwritten every re-export from 3DVista Studio |
| **Change the tour name/link** | Edit encoded strings inside `tdvplayer.js` | ❌ No — overwritten every re-export |

> **Recommended:** The window capture listener (already in place) is the cleanest approach and survives all re-exports. Restyling or replacing the menu with a custom `<div>` is the next step if a branded right-click experience is needed.

---

## 17. Control Panel Dashboard — How It Works

### What the dashboard is

The Control Panel is a standalone HTML application at `search-pro-v4/dashboard/control-panel-v4.html`. It is **not** embedded in the tour — it runs as a separate browser tab or inside an `<iframe>` alongside the tour. It communicates with the tour via two channels: `localStorage` and `postMessage`.

### Configuration flow — full verified lifecycle

```
┌─────────────────────────────┐
│  Control Panel Dashboard    │
│  (control-panel-v4.html)    │
│                             │
│  1. User edits settings     │
│     in tab UI               │
│                             │
│  2. Clicks "Apply Settings" │
│     → applySettings()       │
│                             │
│  3. Saves to localStorage:  │   (every field change is also stored right
│     searchProLiveConfig     │    away as searchProLiveConfig - live preview)
│                             │  ←── full config JSON
│     searchProConfig         │  ←── same (backward compat)
│     searchProConfigUpdate   │  ←── timestamp
│                             │
│  4. If in iframe:           │
│     postMessage({           │
│       type: "searchProConfigUpdate",
│       config: {...}         │
│     }, "*")                 │
└────────────┬────────────────┘
             │ localStorage / postMessage
             ▼
┌─────────────────────────────┐
│  Tour (search-v4.js)        │
│                             │
│  On DOMContentLoaded:       │
│  1. Checks window.searchProConfig (from config file)
│  2. Checks localStorage.searchProLiveConfig
│  3. Compares with searchProLastAppliedConfig hash
│  4. If new → calls updateConfig(config)
│                             │
│  On postMessage:            │
│  → updateConfig(data.config)│
│                             │
│  On localStorage 'storage'  │  (release 4.5: instant, bursts merged in 250 ms;
│  event for the live config: │   the 2 s check below stays as a safety net)
│  → checkForLiveConfig()     │
│  Every 2 s: same check      │
└─────────────────────────────┘
```

### Starting the Control Panel again (release 4.5)

Every change is stored in the browser right away (`searchProLiveConfig`), but the Control Panel always starts from the defaults. When it starts and settings of the last session are stored, it asks **"Restore Previous Settings"**:

* **Restore Settings** — brings every setting back exactly as left (same mechanism as loading a configuration file).
* **Start with Defaults** (or Escape / clicking outside) — keeps the defaults. The stored copy stays until a setting changes.

Nothing is asked when nothing is stored, when the stored settings equal the defaults, or after **Reset** (which clears the stored copy).

### The four buttons of the top bar (rebuilt 2026-10-11)

| Button | What it does | Who gets it |
|---|---|---|
| **Apply Settings** (indigo gradient, Ctrl/Cmd + S) | Checks every tab first: a field that holds a refused value (red, with a message) stops it, and the window lists them ("Animations: Opening Duration - Enter a number from 0 to 2000."). Then it asks, collects the form, stores the settings (`searchProLiveConfig`, `searchProConfig`, `searchProConfigUpdate`) and sends them to an open tour (`postMessage` when the panel is inside the tour page, the stored copy and the `storage` event otherwise) | Only this browser; visitors need the downloaded file |
| **Download** (teal, Alt+Shift+D) | The same check, then collects the form (awaited) and writes `search-pro-config.js` | A file; every visitor gets it once it is uploaded to `search-pro-v4/config/` |
| **Load** (green, Alt+Shift+L) | Reads a `.js` file as DATA (it is never run, see "Settings files are read as data" below), gives `&` `<` `>` back to what was typed, merges it over the defaults, removes stray keys, completes the Display names from the plugin names, fills every form and sends the settings to an open tour | Only this browser |
| **Reset** (coral red) | Defaults in every tab, forms refilled, the stored copies removed (`searchProConfig`, `searchProLiveConfig`, `searchProConfigUpdate`, `searchProLastAppliedConfig` and the panel's own keys). An open tour gets the defaults; the live copy is removed 4 seconds later (or when the panel closes) so a tour opened afterwards uses the settings file of the server again | This browser; the file on the server stays |

* **Settings files are read as data, never run (fixed 2026-10-16).** Before, Load ran the file with `new Function(...)` and a "sandbox" that hid only `window`, `module` and `console`, so a file with code in it could use `document`, `localStorage` and `fetch` inside the Control Panel's page. Now `readSettingsFileAsData()` (top of `control-panel-v4.js`) strips the comments, finds `window.searchProConfig = {` (or `module.exports = {`, or a file that is only `{...}`), and reads the object with a small reader that accepts only plain values: text in single or double quotes with the usual escapes, numbers, `true`, `false`, `null`, lists and objects, comments and trailing commas, keys with or without quotes. Anything else (a call, a function, a name, `a + b`, a template string) stops the load with "The file has code in it, not only settings (near character N). Load a file downloaded from this Control Panel." and nothing in the file runs. A key named `__proto__` becomes an ordinary key, as with `JSON.parse`. Files made by the Download button are exactly this format, so they load as before; a hand-written file that used code to build a value must now hold the value itself. Probe: `_maintenance/audit/evidence/ui-release/loader_probe.js` (27 checks) and `encode_probe.js` (15 checks).
* **Settings text is stored exactly as typed (fixed 2026-10-16).** Before, every text field was escaped (`&` to `&amp;`) when it was typed and again when it was saved, and a loaded file was escaped once or twice more: `https://example.com/a.csv?x=1&y=2` was saved as `...x=1&amp;amp;y=2` (a broken address), and a name such as `Fish & Chips` never matched the same name in the tour. Now `limitText()` (core) only limits the length; nothing escapes a setting. The Control Panel never puts a setting into HTML (it uses `textContent`), and the plugin escapes every text where it draws it (checked 2026-10-16 by putting markup into all 223 text settings: none became markup, probe `xss_probe.js`). The check for unsafe content (`javascript:`, `on...=`, `<script`, ...) still looks at the escaped form of a text, as it always did, so what is accepted did not change. Settings written before the fix (a downloaded file, a stored session) hold `&amp;` `&lt;` `&gt;`, often several layers deep: `restoreTypedText()` turns them back on Load and on session restore, and it changes nothing in a text without those three words. A settings file already on a server keeps its old text until the builder downloads it again; the plugin was not changed for this.
* **What the collection used to get wrong.** `updateConfigFromForm` read every element of the page that has a `name`, so the five `<meta name="...">` tags of `control-panel-v4.html` (`viewport`, `description`, `generator`, `robots`, `format-detection`) became empty top-level keys of every stored and downloaded file, and a value the field itself had refused (99999 in a 0-2000 field) was written by Apply. Now only `input`, `select` and `textarea` inside a tab are read, a field marked `data-blocked` is skipped, a number with `data-unit` is saved as text with its unit (`"16px"`), as a changed field is, and a refused field makes Apply and Download stop with a list instead of saving the older value silently. `core.stripStrayKeys` removes exactly those five words from a loaded file, a restored session, a stored copy and a download. A stored session that differs from the defaults only by them no longer causes the "Restore Previous Settings" question. A failed collection restores the settings it started from (the backup was out of scope in the old `catch`).
* **Busy state.** `core.setLoading` switches off only the buttons that were enabled and switches back on only those (a "Previous" button on a first page stays off), and the dimming comes from the `:disabled` style: no inline `opacity` or `cursor` is left on a button.
* **Message window.** `showErrorModal(action, text | { message, details })`: `details` is a text or a list of texts, shown one by one. A plain text used to be replaced by "An error occurred during the operation".
* **Texts.** The Apply window no longer says to refresh the tour (an open tour changes at once) and says visitors do not see it yet; the Download window names the right folder (`search-pro-v4/config/`; it said `/search-pro-config/config/` and "directory:/config/"); the Reset window and toast say an open tour follows and the server file is unchanged; the Load toast no longer says "applied".

### The frame of the Control Panel (new interface shell, 2026-10-12)

Phase 1 of `search-pro-v4/ROADMAP-CONTRACT.md`. The nine tab pages did not change; they sit inside a new frame.

```
body (flex)
  aside#sidebar            280 px | 72 px rail (class "collapsed") | 288 px drawer under 900 px (class "is-open", "inert" while closed)
  div.app-container
    header.app-header      68 px: menu button | breadcrumb | search slot | unsaved pill | Preview slot | Download, Load, Reset | More | Apply
    div.app-body > main#mainContent    the only scroller (overflow-y auto, position relative); one .tab-panel per tab, at most 1120 px wide
```

| File | Role |
|---|---|
| `css/shell.css` | scroll area, top bar, buttons of the bar, unsaved pill, More menu, menu button of the drawer |
| `css/sidebar-menu.css` | sidebar, sub-menus, rail, flyout, drawer. It also still carries four rules that are not about the sidebar (`@keyframes fadeIn`, `.btn-secondary`, `.btn-danger`, `.logo-settings-panel`): other pages rely on them |
| `css/control-panel-v4.css` | the tokens under `:root` (palette, sidebar, sizes, shadows) and `@font-face` for Geist |
| `fonts/` | `Geist-Variable.woff2`, `GeistMono-Variable.woff2`, `OFL-LICENSE.txt` (SIL Open Font License; nothing is requested from outside) |
| `js/panel-index.js` | `window.panelIndex`: the cards and settings of every tab (see below) |
| `js/sidebar-menu.js` | `window.sidebarMenu`: sub-menus, scroll spy, dots, rail, flyout, drawer, `goTo(tabId, key)` |
| `js/header-bar.js` | `window.headerBar`: breadcrumb, unsaved pill, More menu (moves the three buttons in and out of it) |

**Panel index.** Reads every `.config-section` of a tab page: key (`data-section-key`), title (`.section-title`), icon (`.section-icon`), description, a hue (the two tabs of the design concept keep its hues by key, every other card takes the next hue of `[275, 240, 200, 150, 35, 262, 222, 172, 18]` in page order) and its settings (`.form-group` label, tooltip, hint, control id and name). It learns a tab from the loaded page (and gives the cards `id="sec-<tabId>-<key>"`, `data-hue`, `data-icon`) and, when the browser is idle after the first paint, from the page files (fetched once, parsed with `DOMParser`, never shown or initialized). Methods: `getTabs()`, `getTab(id)`, `getSections(id)`, `getSection(id, key)`, `findSectionById(id)`, `isReady()`. A new card or setting shows up in the sidebar by itself.

**Events.** `tabChanged` (tab-loader, after a switch), `tabContentLoaded` (a page was loaded), `panelindex:updated` / `panelindex:ready`, `sidebar:sectionchange` (the card on screen changed: `{ tabId, tabName, key, title }`), `settingsdirtychange` (what is unsaved changed: the result of `core.getDirty()`), `controlPanelConfigReplaced` (Load, restored session), `formpopulated`.

**Tabs.** tab-loader.js still does the switching (it sets `.active` and `aria-current="page"` on the sidebar button). `ensureAllTabsLoaded()` (Apply, Download) loads the other tabs by calling `.click()` on every `.nav-item`, so a click on a tab must always switch the tab; the sidebar only adds things around it: a second click on the open tab folds or unfolds its cards, a trusted click on another tab scrolls the page to the top, in the rail a trusted click also opens the flyout (a script's click does not).

**Unsaved marks.** `core.markSaved()` copies the settings (`core.savedConfig`) at the start, after Apply, after Load or a restored session (`controlPanelConfigReplaced`) and after Reset. `core.getDirty()` compares, card by card, the paths the tab handler lists in `sectionPaths` plus the `name` of every field of the card (older field names copied to plugin names are left out); the result is `{ total, tabs: { <tab>: { count, sections: { <key>: n } } } }`. Settings that are only copies of another one (`core.mirroredPaths`: `searchBar.mobileOverrides.breakpoint`, `includeContent.elements.skipEmptyLabels`, the container copies ...) never count, and the fill that Apply and Download do from the fields (`updateConfigFromForm`: a field nobody touched writes its default, a number gets its unit) is taken over into the saved copy (`core.absorbSilentChanges`) unless the person had changed that setting. The comparison runs a moment after any `input`, `change`, `click` or `formpopulated`. A Download does not clear the marks. The sidebar dots, the pill and (phase 4) the card badges read it.

**Buttons.** The ids (`applySettings`, `downloadConfig`, `loadConfig`, `resetAll`) and handlers are the ones of `control-panel-v4.js`. Under 1280 px `header-bar.js` moves Download, Load and Reset into `#headerMoreMenu` (`role="menuitem"`, shortcut text from `data-shortcut`) and moves them back when the window grows: one set of buttons, nothing copied. The floating button menu (`#fabContainer`, `js/fab-menu.js`, `css/fab-menu.css`) was removed in release 4.6: the top bar and its More menu are the only buttons.

**Last place (release 4.6).** `sidebar-menu.js` keeps `{ tab, section, offset, stamp }` in `localStorage` key `searchProLastPlace` 250 ms after the last tab change or scroll, and when the page is hidden: `section` is the card the scroll spy marks and `offset` is how far the page is scrolled from the top of that card (the scroll position itself when no card is on screen). `tab-loader.js` (`loadInitialTab`) opens, in this order, the tab of a valid URL hash, else the kept tab, else General, and then asks `sidebarMenu.restorePlace()` to scroll to the card once the tab's page is loaded (`tabContentLoaded`; waits at most 4 s) and once more 450 ms later unless the person has scrolled. Nothing is kept while it restores; a note older than 7 days, unreadable, naming an unknown tab, or a card that no longer exists is ignored (the tab opens at the top); choosing another tab while the page loads cancels it.

### The look of the pages (new interface, phase 4, 2026-10-12)

The tab pages keep their markup and settings; their look is written once in `css/pages.css` (loaded after `control-panel-v4.css`), from the classes every page already shares.

| Part | How |
|---|---|
| Page header | `.panel-header` is a grid: the icon tile (52 px, violet gradient) spans the title and the sentence; no line under it |
| Card | `.config-section`: white, 20 px corners, `--shadow-card`; its hue is `data-hue` (set by `panel-index.js`), exposed as `--hue`; the header (`.section-header`) is tinted `oklch(0.972 0.026 H)`, the tile (`.section-icon`, 44 px) is a gradient `oklch(0.76 0.14 H)` > `oklch(0.58 0.2 H)`; pointer over the card = a 3 px glow and a border in the hue. A browser without `oklch()` gets indigo fallbacks |
| Fields | `.form-group` = field card (`#F6F7FE`, 14 px); inputs and selects 42 px, 10 px corners, indigo focus ring (3 px, soft); switches 46 x 27 px, indigo gradient when on; a card with one switch (and no other) is a white row laid out with CSS `:has()` (name and sentence at the left, switch at the right) |
| Desktop and Phone | `.device-pair`: a white row, two 76 px columns of switches captioned Desktop / Phone (icons drawn with the Font Awesome glyphs in `::before`); a pair of numbers is a field card with two boxes |
| Desktop value | the phone cards of General that have a desktop twin carry `data-desktop-name="<path>"`; `general-tab.js` (`syncDesktopCaptions`) adds `p.field-caption` ("Desktop: 350px") and keeps it current |
| Appearance | in `#appearance-panel` the card is a grid of panels (one per `.subsection`, two columns from 840 px) whose settings are rows (name left, control right); Corner Radius is four small fields in a row |
| Badge | `core.getDirty()` > `panelIndex.markCards()` sets `data-unsaved-text` on the card title; `pages.css` draws "N unsaved changes" after it |
| Restore Defaults with Undo | every tab handler calls `core.restoreWithUndo({ button, restore, repopulate })`: it keeps a copy of the settings, runs the tab's own restore, and shows a toast with **Undo** for 6 s (`toast.js` takes `options.action`); Undo (`core.undoRestore`) puts back exactly the settings the restore changed (found with `core.diffSettings`) unless they were changed again, refills the tab with its own `repopulate`, and sends the settings to an open tour |
| Toast | one dark toast for all kinds; the icon is colored by kind (`#5BD39A` success, `#FF8A8A` error, `#FFB84D` warning, `#9A9BFF` info) |
| Top bar buttons | Download teal, Load green, Reset coral: filled gradients (`--btn-hue`, `--btn-l` set per id in `shell.css`; `--btn-l` is the lightest lightness that keeps white text at 4.5:1), the classes `btn-secondary` and `btn-danger-outline` unchanged |
| Buttons | one family in `pages.css` (`.btn`, `-primary` indigo gradient, `-secondary` white, `-danger` dark red, `-warning` amber, `-success` green, `-sm`); the rules that used to sit in `modal-system.css`, `sidebar-menu.css` and `control-panel-v4.css` (which overrode each other) are gone |
| Dialogs | `modal-system.css` (rewritten): one overlay and container reused for every dialog; a 20 px card, a round 44 px icon tinted by the type, 18 px title, boxes in the palette tints, buttons at the right; under 640 px a sheet at the bottom; the browser's `alert()` and `confirm()` are no longer used anywhere (the last-resort card is `window.showFallbackNotice` in `toast.js`) |
| Dropdown | `js/controls.js`: every `<select>` keeps working (hidden, 1 px, same id, name, value, options, events) and gets a button `.dd-trigger` in front of it and a menu `.dd-menu` (a card, `role="listbox"`, keyboard, type-ahead, flips up near the bottom, kept inside the screen). The two setters `value` and `selectedIndex` of each select are wrapped so code that sets them updates the button; a MutationObserver follows `disabled`, `hidden`, `class`, `title` and the options; a select added later is picked up by itself |
| Slider | `controls.js` also keeps `--range-fill` of each `input[type=range]`; `pages.css` draws the track in two colors and a round handle (WebKit and Firefox) |
| Native defaults | number spin buttons are hidden, controls and code take Geist and Geist Mono, scrollbars are thin and tinted (`scrollbar-color`, with a WebKit fallback) |
| Code windows (Knowledge) | the two code blocks are black editor windows: title bar with three dots and a name, white text, lemon green (`#CCFF33`) for strings, tag names, keywords and numbers; `knowledge-tab.js` splits the text into `.kb-tok` spans (the text itself is unchanged) |

Phones (under 640 px): every `.form-grid` is one column (the older tablet rule kept two columns), cards have 16 px padding, and the Appearance Corner Radius row is two by two. No element goes past the right edge of the page on any tab at 390 px (checked by the `pages` suite).

### The search of the Control Panel (new interface, phase 2, 2026-10-12)

A box in the top bar (an icon under 760 px) and `Ctrl/Cmd + K` open a palette over the page. It searches the settings of the Control Panel, never the tour; it keeps no history and saves nothing.

| Part | How |
|---|---|
| Index | `panelIndex` (js/panel-index.js) is the only source: every tab, card and setting with its label, tooltip, hint and field name; the Knowledge page also contributes the text of each card (`section.body`, 8000 characters, code blocks left out). A new card or setting is found by itself. The first time the palette opens, the tabs not yet read are fetched (`panelIndex.loadAll()`) |
| Ranking | Fuse.js (`search-pro-v4/fuse.js/dist/fuse.min.js`, loaded by the page; no CDN), one index for each kind: a category by name and words, a card also by description, contents and text, a setting by name, words, place (Tab > Card), tooltip and hint. A short word may be one letter off, a longer one more (score cut-off 0.18 / 0.26 / 0.3); a label equal to, starting with or containing the typed words is moved up |
| Words people use | `js/search-synonyms.js`, one file of plain data: `groups` (words that mean the same: typing one finds the others, as whole words), `settings` (extra words for one setting or a family, chosen by a part of the field name, e.g. `searchsettings.behavior.threshold` is also "typo", "fuzzy") and `tabs`. Add a word there and the search finds it |
| Opening a result | category: the tab opens at the top and its header flashes; card: `sidebarMenu.goTo(tab, key)` (switches, loads a tab that was never opened, scrolls) setting: the same, then the setting is scrolled to the middle. Nothing is drawn around the result (the owner removed the flash) and the keyboard is not moved; the search sets `document.body.dataset.cpsOpened` and fires `cpsearch:opened` when a result has landed (used by the suite), and a screen reader hears "Opened ... in ..." from the live region `#cpSearchStatus`. A setting hidden by its switch (inside an inactive group) flashes its card instead |
| Keyboard | `Ctrl/Cmd + K` anywhere (also inside a settings field), arrows, Enter, Escape (gives the keyboard back to the place it came from), Tab stays inside the palette; the palette does not open over a message window |
| Screen readers | field `role="combobox"` with `aria-activedescendant`, list `role="listbox"` with groups and options, the count in a polite live region ("5 results", "No results") |
| Files | `js/cp-search.js`, `js/search-synonyms.js`, `css/cp-search.css`, markup in `control-panel-v4.html` (`#headerSearchSlot`, `#cpSearch`); suite `cpsearch` |

### PDF documents opened by hotspots (phase 5, step A, 2026-10-13)

A hotspot of 3DVista can open a PDF in a window (the test tour: an Image hotspot in Room-1, file `files/PDF_en.pdf`). The PDF is not a media and is in no playlist.

| Part | How |
|---|---|
| Where the action is | the click of the hotspot is plain text in the tour's script files, on the `HotspotPanoramaOverlayArea` object: `"click":"this.openEmbeddedPDF(this.WebFrame_..., this.translate('PopupPDFBehaviour_....url')); this.showWindowBase(...)"`. It is not a property of the running objects (`area.get("click")` is undefined) |
| What the plugin does | `_loadPdfLinks()` reads the tour's `script*.js` files once (same origin, about 190 KB each; only when `includeContent.elements.includePDFs` is on or the Control Panel scans the tour), `_readPdfLinks()` collects the area ids whose click calls `openEmbeddedPDF`, `_pdfOfOverlay()` matches them with `overlay.get("areas")` and resolves the file with `rootPlayer.translate(key)` (or reads a plain string) |
| The result | one extra result of the kind `PDF` for such a hotspot (the hotspot's own result stays): its name is the hotspot's own name, or the file name without `.pdf` when the hotspot has only a 3DVista default name (Image, Text, Hotspot ...); the line is "PDF document"; its parent is the panorama |
| A click | NOT the hotspot path (that only points the camera): the panorama is selected and `area.trigger("click")` is fired on the hotspot's area (`_firePdfArea`), which runs the tour's own action and opens the PDF window. Firing the click of the overlay itself does nothing |
| Settings | `includeContent.elements.includePDFs` (off), `displayLabels.PDF`, `thumbnailSettings.showFor.pdf`, `iconSettings.showIconFor.pdf`, `customIcons.PDF` (`fas fa-file-pdf`), `defaultImages.PDF` (`assets/pdf-default.jpg`, a copy of the generic picture until a picture is supplied), `display.typeOrder` (after Audio); Content has a PDF row after Audio; Display > Element Types has a PDF row; Advanced > Scan has "PDF documents opened by hotspots" |
| Not done | step B (the text inside PDFs), PDFs that are not opened by a hotspot, the Live Preview sample (it has no script files) |

### The Live Preview (new interface, phase 3, 2026-10-12)

A **Preview** button in the top bar opens a panel on the right of the Control Panel with the real search running on a sample tour. Nothing of 3DVista is loaded and the plugin is not changed or told it is in a preview.

| Part | How |
|---|---|
| The page | `dashboard/preview/preview.html`, shown in an iframe of the panel. Its `<base href="../../../">` is the folder of the tour, because the plugin asks for `search-pro-v4/css/search-v4.css`, `search-pro-v4/fuse.js/...` and the pictures relative to the page, as it does in a tour. It loads `fixture-tour.js`, the real `search-v4.js` and `preview.js`. It does not load the settings file of the tour: the panel sends the settings it shows |
| The sample tour | `preview/fixture-tour.js` builds `window.tour` with the part of the 3DVista object model the plugin reads (found with the probe `spy_tour.js`: `mainPlayList` and its items, media with `id`, `data`, `thumbnailUrl`, `overlays` / `objects`, overlays with `class`, `id`, `data`, `projected`, `vertices`, `player.getByClassName(...)`). Objects offer their properties both through `get()` and directly (the plugin reads both). Content: 6 panoramas (one without a picture, one without a name that only has a subtitle), a 360 video, a flat video, 2 3D models with objects and 3D hotspots, 13 hotspots of every kind (two unnamed, one of them with a tag, one with a very long name, one with seven tags, groups of one), a photo album, a map, an audio file, two containers. Pictures are small SVG drawings kept as files in `preview/pictures/`: the plugin accepts a tour picture only when its address starts with `http(s)://` or `/` (anything else is read as a file of its assets folder), so a `data:` address would show the grey placeholder |
| Starting | the plugin's own automatic start needs the 3DVista player (the old `PlaylistUtils` scope error in section 3.9.6 of the plugin), so `preview.js` starts it the way the Button of a tour does: `tourSearchFunctions.initializeSearch(rootPlayer)`. `TDV.Tour.EVENT_TOUR_LOADED` exists and `tour.bind` fires it, so a plugin that is fixed later starts by itself (the second start is ignored) |
| Settings | the channel every open tour uses: the Control Panel stores the whole configuration under `searchProLiveConfig` on every change and the plugin applies it on the browser's `storage` event (about 0.6 s). Once, when the page says it is ready, the panel sends the settings it shows with one message `{ type: "searchProPreview", action: "config" }` (a Load, or a change made without an event, may not be stored yet); the page applies it with `updateConfig`. The panel never keeps a second copy |
| State | one message per change of Desktop / Phone, Results / Nothing Found / Empty Field, Focus Ring: `{ type: "searchProPreview", action: "state", state: { mode, focus, device } }`. The page types `room` (finds panoramas, hotspots, a 360 video, a web frame, the unnamed items) or `zzqx` (finds nothing) in the field, or leaves it empty. After every state message it looks again (up to four times, 450 ms apart) until the page really shows the state, because the plugin ignores a second opening within 300 ms and clears its field when it closes |
| Desktop and Phone | the width of the page in the frame is what the plugin looks at (`window.innerWidth` against `mobileBreakpoint`): Desktop is a page at least 800 px wide (more when the breakpoint is higher) scaled down to fit the panel, Phone is 390 px at full size. The plugin places its bar when settings arrive, not when the window changes size, so after a resize `preview.js` sends the same `mobileBreakpoint` again, which makes it restyle. `TDV.PlayerAPI.mobile` follows the switch for `phoneDetection: "tour"` |
| Not "the open tour" | the page has no `BroadcastChannel` (set to `undefined` before the plugin loads), so it never answers the Control Panel's questions about the open tour (Advanced scan, container picker, Data Sources test); they still reach a real tour that is open |
| Keyboard | the plugin focuses its field when it opens; the page lets that happen only after a person clicked in it, so the preview never takes the keyboard from the setting being edited. The focus ring of the **Focus ring** switch is a class (`preview-focus`) with the plugin's own rule and variable (`box-shadow: var(--search-focus-ring)`); the suite compares it with the plugin's `:focus-within` |
| A click on a result | the plugin runs its normal click (the sample has no player to move) and the page says "In a tour this opens: ..."; a search that closes itself opens again after 1.5 s |
| Size and room | the panel is 440 px, can be dragged wider (the edge, the arrow keys, double click = 440 px), is beside the settings from 1280 px and over them below. While it is open and the settings would drop under 720 px, the sidebar becomes the icon rail (`sidebarMenu.holdRail`, not remembered; the person's own choice always wins) |
| Cost | closed, the page is left (`about:blank`) and nothing runs; the panel sends no message for a changed setting |
| Phones | under 640 px there is no Preview button and no panel (it is for tablets and desktops); the shortcut does nothing; a panel that is open closes when the window becomes that small (and is not reopened) |
| Focus Ring | the Control Panel starts with a width of 1 px (`appearance.searchField.focusRing.width`); the Focus Ring switch of the panel draws that ring on the field. With a width of 0 nothing can be drawn and a plain line says so |

### Keyboard shortcuts of the Control Panel (release 4.5)

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + S` | Apply Settings |
| `Alt + Shift + D` | Download the configuration file |
| `Alt + Shift + L` | Load a configuration file |
| `Ctrl/Cmd + K` | Open the search of the Control Panel (it finds a category, a card or a setting and jumps to it; it is not the visitors' search of the tour) |
| `Alt + Shift + P` | Open or close the Live Preview |
| `Escape` | Dismiss the open dialog (same as Cancel); closes the Live Preview when no dialog or dropdown is open |

`Ctrl/Cmd + R` (reload), `Ctrl/Cmd + D` (bookmark) and `Ctrl/Cmd + L` (address bar) are the browser's own shortcuts and are not taken over. Reset All has no shortcut.

### Allowed Control Panel addresses (release 4.5)

The tour accepts live updates (`postMessage`) only from its own address and from the addresses listed here. Since the audit fixes of 2026-10-16 the page that embeds the tour (an `<iframe>` of another site) is **no longer trusted by default**: before, it was trusted while the list was empty, so any site that framed a tour could change its settings (and, in a browser that does not partition storage for framed pages, leave them stored). The tour on its own, the Control Panel at the same address (storage event, `BroadcastChannel`, same-address `postMessage`) and the Live Preview (a frame of the same address) are not affected. When the Control Panel, or a page that frames the tour and sends settings, is hosted at a **different** address, list that address in **Advanced → Control Panel Connection** (for example `https://panel.example.com`, several separated by commas). It is stored as `controlPanel.allowedOrigins`, exported with the configuration file, and may be an array or comma-separated text; entries are compared without a trailing slash and ignoring letter case. Cross-origin popups that merely opened the tour are never trusted unless listed. With the list empty (the default) nothing changes.

### Closing the search by clicking outside (release 4.5)

By default the search bar closes when the visitor clicks (desktop) or taps (mobile) anywhere outside it, as in earlier versions. The setting `closeOnOutsideClick: { mobile: true, desktop: true }` (Control Panel: **General → Opening and Closing**) turns that off per device type: with `false` the search stays open until the visitor uses the close button, `Escape`, the tour's own search button or chooses a result. It is separate from `autoHide`, which only decides whether the search closes **after a result was chosen**. The decision is read at the moment of each click, so a change made in the Control Panel reaches an open tour immediately. On touch devices a tap over the 3DVista panorama itself is swallowed by the player (before and after this setting), so it never reaches the page; taps on any other part of the page do.

### General settings (search bar placement, phones, keyboard, searching, texts)

The General tab of the Control Panel has four sections (Opening and Closing, Search Bar, Phones, Visitor Texts); every setting below is also a plain setting of the plugin. The searching settings below moved to the Advanced tab as **Search Tuning** because they need decisions most tour creators do not have to make; the plugin settings did not change.

* **Opening and Closing:** `autoHide`, `closeOnOutsideClick` and `openOnStart` (each `{ mobile, desktop }`, `openOnStart` is off by default and, when on, starts the search by itself once the tour has STARTED: the main playlist has items and a selected panorama, which 3DVista keeps at -1 while a start screen waits (loading screen Initialization `On Click`, `On Click or Video Finished`, `When Video Finished`). Without it the search still starts lazily with the first press of the tour's search button; the older automatic start looked for `window.tour.mainPlayList`, which this 3DVista build does not expose, so it never ran. The Control Panel's saved settings (`searchProLiveConfig`) are applied again on every page load, quietly, before the tour starts), `keyboard.escapeCloses` (default `true`: one press of Escape clears the typed text and closes the search; `false` = the plugin ignores Escape and does not swallow it, so the tour keeps its own Escape behavior) and `keyboard.shortcut` (default `true`: Ctrl / Cmd + K opens the search) and `showHiddenViewers` (default `true`, added 2026-10-11: choosing a result whose media lives in a window or container the tour keeps hidden - the floor plan, a photo album, a flat video - shows that window first, as the tour's own button does; `false` selects the media but leaves the window hidden. Card **Open Hidden Windows and Containers**; the plugin reads it at the moment of each click).
* **Search Tuning (Advanced tab, formerly "How Searching Works" in General until 2026-10-10; since 2026-10-10 it also holds the five fields of the former "Search Settings" section, so the Advanced tab has ONE search section with four subsections: When Searching Starts, Results, How Closely Results Must Match, What Matters Most):** `minSearchChars`, `searchSettings.typingDelay { desktop: 150, mobile: 300 }` (milliseconds to wait after typing; read at every key press), `searchSettings.resultLimit` (0 = all; typed searches only, `*` always lists everything), `searchSettings.behavior.threshold` (0 = exact, 1 = anything, default 0.4) and `searchSettings.fieldWeights { label 1, subtitle 0.8, tags 0.6, parentLabel 0.3 }` (must be above 0; a weight of 0 or less falls back to the default). The old Advanced-tab fields `searchSettings.debounce`, `searchSettings.maxResults` and `searchSettings.fuzzySearch.threshold` did nothing and were replaced by these. The four fields of the former Search Settings section are `searchSettings.highlightMatches`, `searchSettings.caseSensitive`, `searchSettings.behavior.minMatchCharLength` and `searchSettings.behavior.useExtendedSearch`; Restore Defaults of the section resets all of them. **Rebuilt 2026-10-12:** `highlightMatches` (default `true`; `false` draws results without `<mark>`) and `caseSensitive` (default `false`; `true` gives Fuse `isCaseSensitive`, which an exact term such as `'room` shows; a fuzzy term still tolerates one wrong letter at the default tolerance) did nothing before and now work (labels "Highlight Matches" and "Match Capital Letters"); `searchSettings.fuzzySearch.enabled` never changed the search and was removed from the page and from the Control Panel's defaults (Match Tolerance is the one control for how forgiving matching is; an older file that holds it is still read and ignored); "Enable Extended Search" is "Search Operators" and "Minimum Match Characters" is "Shortest Match". The Advanced page is now: the scan, Search Tuning and Control Panel Connection (`controlPanel.allowedOrigins`, now with Restore Defaults), every number checked against the min and max of its field and a refused Control Panel address blocked (`getFieldProblem`), no inline style, one shared way to restore, check and collect fields (`advanced-tab.js` 709 > about 330 lines).
* **Search Bar (desktop):** `searchBar.width`, `searchBar.zIndex` (default 9999) and `searchBar.placement { vertical: "top" | "middle" | "bottom", horizontal: "left" | "center" | "right", offsetX, offsetY }`. A bar placed at the bottom opens its results upwards, a centered bar is centered with auto margins, a bar in the middle sits at half the screen height. The older `searchBar.position { top, right, left, bottom }` still works when `placement` is not set (the Control Panel converts it when it loads a file); every placement is kept inside the screen (`max-width`).
* **Phones:** `phoneDetection` (`"width"` = the phone layout is used up to `mobileBreakpoint`; `"tour"` = whenever the tour itself loaded its phone version: 3DVista loads `script_mobile.js` on phones and `script_general.js` on computers and iPads, decided by the device, not by the width), `mobileBreakpoint` (the Control Panel also writes it to `searchBar.mobileOverrides.breakpoint`, so there is one breakpoint), `searchBar.mobileOverrides { enabled, width, maxWidth }` and `searchBar.mobilePlacement { vertical: "top" | "bottom", offsetY, margin }` (older `searchBar.mobilePosition` still works when `mobilePlacement` is not set). With the separate phone layout off, phones use the desktop placement, kept inside the screen. The Mobile Visibility Behavior and Element Triggering settings are no longer in the Control Panel (a 3DVista page does not scroll, "toggle" is disabled in the plugin); the plugin still accepts them in saved settings.
* **Visitor Texts:** `searchBar.placeholder` and `texts { noResults, minChars (with {count}), clearButton, resultSingular, resultPlural, parentPrefix, tagsLabel }`. A text that is empty falls back to the English one; the text is escaped where it is drawn (so the Control Panel stores it exactly as typed, including `&`). `texts.noResults` replaces the text the page came with (the icon stays).

### Appearance settings (colors, text, tags, focus)

The Appearance tab has four sections in the order a visitor meets them, each with its own Restore Defaults button and split into subsections: **Search Field** (Colors, Corner Radius, Focus Ring, Typed Text, Placeholder Text), **Results List** (Colors, Corner Radius, Result Text), **Group Headers** (Colors, Layout and Size) and **Tags and Highlight** (Highlight of Typed Letters, Tag Colors, Tag Look, Tag Border). Every field is a plain `appearance.*` setting of the plugin; a value from the Control Panel is read where it is used, with a safe fallback.

* **Colors:** `appearance.colors.*` (search background / text / icon, results background / hover / text / subtitle / subtext, `resultBorderLeft`, group header and count, highlight, tag colors, placeholder). `resultIconColor` is the one icon color of the result list; the Display tab's icon color writes the same setting (two-way mirror in the Control Panel). The unused `tagHover` color is gone (it was set but no stylesheet rule used it).
* **Accessible defaults:** the default placeholder color and group-count color are `#5f6f86` (about 5:1 on white; the earlier `#94a3b8` was 2.6:1) and the placeholder strength `appearance.searchField.typography.placeholder.opacity` is 1 (it was 0.7, which made the placeholder fainter still). A tour that saves its own value for any of these keeps it unchanged.
* **Text of the search field:** `appearance.searchField.typography` (`fontFamily`, `fontSize`, `fontWeight`, `fontStyle`, `letterSpacing`, `lineHeight`, `textTransform`), `.placeholder` (same keys plus `opacity`) and `.focus` (`fontSize`, `fontWeight`, `letterSpacing`: the text while the field is active). The three `.focus` values are no longer on the page (the focus ring replaces them); the plugin still reads them from older saved files and Restore Defaults of Search Field resets them. Sizes are text with a unit ("16px", "1.5" for line height); a number is read as pixels.
* **Text of the results list (new):** `appearance.searchResults.typography { fontFamily, nameSize, descriptionSize, parentSize, groupTitleSize, groupCountSize }`. The defaults are the sizes the list always had (14px, 12px, 11.2px, 14px, 14px), so nothing changes until a value is changed; a size is only applied when it looks like `14px`, `1.2em` or `0.9rem`. `fontFamily` defaults to the system font stack; "inherit" or a font name from the tour's `fonts.css` is allowed (only letters, digits, spaces, commas, quotes, dashes and dots are accepted).
* **Focus ring (new):** `appearance.searchField.focusRing { color: "#3b82f6", width: 1 }`. The Control Panel starts with a width of 1 (changed 2026-10-12 at the owner's request; Restore Defaults, Reset and a new download give 1). The plugin's own built-in default stays 0 (no ring, as before), so a tour that has no settings file, or an older one without this setting, does not change. 1 to 6 pixels draws a ring along the inside edge of the field while it is active (it is drawn inside because the search container clips everything outside the field); 0 draws no ring.
* **Borders (new):** `appearance.searchField.border` and `appearance.searchResults.border`, each `{ width, style, color, top, right, bottom, left }`. `width` is 0 to 10 pixels (0 = no border, the default, so nothing changes until used), `style` is `solid`, `dashed`, `dotted` or `double` (a double line needs 3 pixels or more), `top` / `right` / `bottom` / `left` switch each side (a side that is off gets width 0). The search field and the typing box are the same rounded shape, so there is one border for both. `appearance.searchResults.rowDivider { width 0 to 6, color }` draws a thin line under every result row (an inset shadow, so the rows keep their height).
* **Extra colors (new):** `appearance.colors.clearIconHover` (the X while the mouse is over it), `scrollbar` (the results list scrollbar), `noResultsText` and `noResultsBackground` (the "nothing found" message). The defaults are the colors that were fixed in the stylesheet before.
* **Scrollbar (fixed in P3b):** current browsers (Chrome / Edge 121+, Firefox) use the standard `scrollbar-color` / `scrollbar-width` and ignore `::-webkit-scrollbar`, so the stylesheet's `scrollbar-color: #94a3b8` hid every change of the scrollbar color. The color now drives `scrollbar-color` (default `#94a3b8`, what those browsers always showed) and `::-webkit-scrollbar-thumb`; `appearance.searchResults.scrollbarSize` is `thin` (default), `normal` or `hidden`.
* **Group headers (new):** `appearance.groupHeader { paddingTop 0-40 and paddingBottom 0-40 (space above and below the title, both default 12; an older single `paddingY` is still read), radius 0-24 (default 0), backgroundOpacity 0-1 (default 1), titleWeight 300-700 (default 400), titleCase none | uppercase | lowercase | capitalize, titleSpacing 0-0.3 em (default 0.01), border { width 0-6, style, color, top, right, bottom, left } }`. A border width of 0 keeps the very faint line below the header that headers always had (every header uses the same space above and below: the first header and a header at the bottom no longer use 10px where the others use 12px); above 0 the border is drawn on the sides that are switched on (`top` = a line between one group and the one before it, `bottom` = a line between the title and its results; the other sides are removed). `thumbnailSettings.groupHeaderAlignment` now accepts `center` (the stylesheet always had it). Showing or hiding the titles and the counts stays `display.showGroupHeaders` / `display.showGroupCount` (Display tab).
* **Group count badge (new):** the number of results in a group header ("5 results") is drawn inside `<span class="group-count-chip">` and can look like a small badge: `appearance.groupCount { backgroundColor, backgroundOpacity (0 = no background, the default), radius 0-30, padding ("top right bottom left" in px, default all 0), weight 300-700, textCase, border { width 0-6, style, color, top, right, bottom, left } }`. Its text color is `appearance.colors.groupCountColor` and its size `searchResults.typography.groupCountSize`. With every default the chip is plain inline text, so the header looks as before.
* **Nothing found message (new):** `appearance.noResults { iconStyle: "default" | "none" | "custom", icon, iconSize 12-64 }`. Custom takes an icon font class (Font Awesome `fas fa-search`, Bootstrap Icons `bi bi-search` or Ionicons `ion-md-search`; the library loads by itself, see "Icon libraries" in the Display section) or a short text such as an emoji; anything with `<` or `>` is refused and the built-in face stays. The icon uses the text color (`appearance.colors.noResultsText`). The words stay `texts.noResults` (General > Visitor Texts).
* **Tags:** with `display.showTagsInResults` on, every tag is drawn as its own chip (`.tag-item`, after the word `.tag-caption`). Earlier versions drew one chip around the whole "Tags:" line. The tag settings (`appearance.tags.*`: space inside, space between, size, weight, case, border, radius in pixels (0 = square corners), colors) style each chip; they have no effect while tags are hidden, and the Control Panel says so. `appearance.tags.padding` is saved as text (`"3px 10px 3px 10px"`, top right bottom left) and the page shows it as four fields; the short CSS forms (`"3px 10px"`) are still read. `appearance.tags.opacity` (0.1 to 1) fades the whole tag, `appearance.tags.backgroundOpacity` (0 to 1) only its background (default 1 = solid, both). `appearance.tags.maxCount` is the most tags shown for a result (0 = all). When 2 or more tags may show and a result has more, one `+2` chip (class `tag-more`) says how many were left out (`appearance.tags.showMore`, default on); with a limit of 1 there is no chip at all, so visitors are not told other tags exist, and the chip never lists the hidden names. `appearance.tags.rename` is a list `[{ "from": "MYCOOLTAG_01", "to": "Kitchen" }]` that shows another name for a tag without changing the tour (the match ignores letter case and spaces; an empty `to` hides the tag, and a hidden tag does not use up a place of `maxCount`). A result is found by the new name and by the original one (the index gets the new names as an extra field, `tagAliases`; changing the list rebuilds the index at once). The word before the tags is the visitor text `texts.tagsLabel` (default `Tags:`; an EMPTY text means no word, unlike the other texts where empty means the English default), set in General > Visitor Texts.
* **Fonts in the Control Panel:** the font lists offer "Default" (the system font stack), a short list of common fonts and "Fonts of This Tour" (read from the tour's `fonts.css`). A font written by hand in a saved file is kept and shown as a custom entry.
* **Checks:** a color typed in a hex box must look like `#abc` or `#aabbcc` (red outline and a message otherwise, the last good color is kept); number fields are held to their range (ring width 0 to 6, placeholder strength 0 to 1 ...); tag padding must be one to four sizes such as `3px 10px`. A value that cannot be used is explained under the field, not saved and not sent to the tour.

### Display settings (what a result shows: pictures, icons, names)

The Display tab has six sections, each with its own Restore Defaults button: **What Results Show**, **Pictures**, **Icons**, **Element Types**, **Unnamed Items** and, last, **Order of Results** (since 2026-10-12). The two big switches ("Show Pictures in Results" and "Show Icons in Results") hide the settings that only matter while they are on. The Element Types table keeps all seven columns visible; the columns of a switch that is off are greyed and locked (their values stay saved), and a state pill on top of each column group (Pictures, Icons) says why.

* **Order of Results (since 2026-10-12):** `display.typeOrder`, a list of the 18 kinds (`Panorama, Video360, FlatVideo, Hotspot, Polygon, Video, Webframe, Image, Text, ProjectedImage, 3DModel, 3DHotspot, Element, Container, Audio, Album, Map, 3DModelObject`: the order the plugin always used, now the default), first = listed first. The results are grouped by kind (one group, one heading each); the groups follow this list; a kind the list leaves out follows in its default place and a name that is no kind is ignored (`_getTypeOrder`). Inside a group results keep the order of the tour (playlist order, then name). The page shows one row per kind, **dragged by its handle** (mouse, pen or finger; the row follows the pointer, the page scrolls on its own near an edge because the list is taller than the screen, Escape puts the row back) or moved with the Move Up and Move Down buttons for the keyboard (the name is the one set in Element Types, a kind that Content switches off is greyed and says so, a screen reader hears "Panorama is now number 2 of 18"); every move reaches an open tour. Changing it redraws the visible results (`display` key group).
* **What Results Show:** `display.showGroupHeaders`, `showGroupCount`, `showTagsInResults`, `showSubtitlesInResults`, `showParentInfo` (the parts of one result), `display.onlySubtitles` (**Subtitle Instead of Name**, default `false`: a result that has a subtitle shows it in place of its name and no subtitle line is drawn; changing it rebuilds the search index because the label is chosen there; it had no Control Panel field before 2026-10-10), `display.rowSpacing` (`"compact"` | `"normal"` | `"roomy"`, default `"normal"`; sets `--result-item-padding` and `--result-item-gap`) and `display.descriptionLines` (1 to 5, default 2; sets `--text-overflow-lines`). All of them are live: `updateConfig` redraws the list for `display`.
* **Pictures:** `thumbnailSettings.enableThumbnails` (the master), `showFor.<type>` (one switch per element type, case-insensitive, containers included), the picture source order, size and border, shape and `thumbnailSettings.alignment` (`"left"` | `"right"`, default `"left"`), the small type icon on pictures (`typeBadge`: `none` | `all` | `borrowed`), a separate look on phones, placeholders and hover zoom. Details of the picture pipeline are in the thumbnail section above.
* **Icons:** `display.showIconsInResults` (the master), `thumbnailSettings.iconSettings.enableCustomIcons`, icon look and hover effect. There is no "Use Font Awesome" switch any more: the plugin loads an icon library by itself when a custom icon needs it (see "Icon libraries" below). `enableFontAwesome` and `fontAwesomeUrl` still work in a settings file (`enableFontAwesome: true` loads Font Awesome at once; an own `fontAwesomeUrl` is tried first). The shared icon color is one setting with Appearance (`core.mirrorToPluginNames`).
* **Element Types (one table, 19 rows):** per type the name shown (`displayLabels.<Type>`), the picture switch (`thumbnailSettings.showFor.<type>`), the picture size (`thumbnailSettings.sizeByType.<Type>`), the placeholder file (`thumbnailSettings.defaultImages.<Type>`, a file name that is prefixed with `assets/`, or a full address; it must end in an image extension) and the icon switch and icon (`thumbnailSettings.iconSettings.showIconFor.<type>`, `customIcons.<Type>`). The icon is chosen in **one shared icon picker** with five kinds: Font Awesome, Bootstrap Icons, Ionicons, Emoji and Picture Address. The picker has a **Current Icon** row (what the type shows now, with **Back to the Standard Icon**, which also empties the picture box and switches to the tab of the standard icon), a search box, a grid of at most 400 icons, and for pictures a **Clear** button (empties the address box) and **Remove Picture** (back to the standard icon). Restore Defaults here resets names, switches, sizes and files of the types and keeps the icons.
* **Unnamed Items:** `useAsLabel` describes what an item without a name shows, tried in this order: the subtitle (`subtitles`), the name of the panorama it sits in (`parentLabel`, optionally with the type in front when `parentWithType` is on: "Hotspot in Room 1"), its tags (`tags`), its element type (`elementType`, **off by default** in the builder, the built-in block and the Control Panel; the builder used to say `true`) and last the text in `customText` (default "[Unnamed Item]"). Both `parentLabel` and `parentWithType` were dead settings before 2026-10-10 and now work; they are off by default so nothing changes until used. For 3D objects the parent is the 3D model (earlier the object's own name was stored as its parent, so "Show Parent Info" said "in <itself>").
* **Removed settings:** `display.showParentLabel`, `showParentTags` and `showParentType` were set by the builder and read by nothing (only `showParentInfo` is real); a settings file that still holds them is harmless.
* **Live updates:** `updateConfig` treats `display` and `useAsLabel` like the other visual settings: `display` redraws the list and refreshes the CSS variables, `useAsLabel` rebuilds the index. The Control Panel's live preview also sends fields that are not inside a form group (table cells, the picker); before 2026-10-10 those were silently skipped.
* **Restore Defaults per section:** Pictures, Icons and Unnamed Items restore their listed settings and the matching Control Panel mirrors; Element Types resets `displayLabels`, `thumbnailSettings.showFor`, `sizeByType` and `thumbnails.defaults` and re-reads the page. Every restore is sent to an open tour.

#### Icon libraries (Font Awesome, Bootstrap Icons, Ionicons) and the lists of the picker

A custom icon is stored as text. What the text looks like decides how it is drawn: a class of an icon font (`fas fa-home`, `bi bi-house`, `ion-md-home`), a picture address (`https://.../icon.png` or a file name with an image extension), an inline `<svg>` (sanitised), or anything else as text (an emoji). Where the files come from:

1. **Local copy first:** `search-pro-v4/icons/<library>/...` (Font Awesome Free 6.7.2, Bootstrap Icons 1.13.2, Ionicons 4.6.3; `icons/README.md` lists versions, licenses and how to update).
2. **CDN second** (cdnjs for Font Awesome, jsDelivr for the other two), with a Subresource Integrity hash that equals the hash of the local file.
3. **Built-in icon of the type** when both fail (a console warning names the library). Earlier versions counted a failed CDN as loaded, because a `<link>` tag existed, and drew empty boxes.

A library is loaded **only when needed**: while custom icons are on, once for each library used by a saved custom icon, or when the nothing-found message uses an icon class (Appearance > Nothing Found); `enableFontAwesome: true` loads Font Awesome at start. Loading is checked twice: the style sheet must load AND its font file must load (`document.fonts.load`), otherwise the next source is tried. When a library becomes ready the open result list is drawn again. The code is the block "Icon libraries" in `search-v4.js` (`_ICON_LIBRARIES`, `_ensureIconLibrary`, `_loadIconLibrariesFor`, `_iconLibraryOf`). To add a library: add an entry to `_ICON_LIBRARIES` (class pattern, local path, CDN address and hash, a probe class and the font family), put its files in `icons/`, generate its picker list and add a tab to the picker.

The lists of the Control Panel picker are generated files: `dashboard/js/fontawesome-icons.js` (solid 1,410, regular 164, brands 501, plus an `aliases` map so "house" finds the home icon), `dashboard/js/icon-libraries.js` (Bootstrap Icons 2,078, Ionicons 696) and `dashboard/js/emoji-library.js` (Unicode Emoji 17.0, 1,914 emojis without skin tone variants, searchable by name and keywords, hidden when this browser cannot draw them, and by default also when newer than Emoji 14 because visitors may have older devices). **Never add a name by hand**: a name the font does not have draws an empty tile. Every list was checked by drawing each icon on a canvas (0 empty). Font Awesome's Regular and Brands fonts also contain copies of the digits and letters; those copies are left out.

### Content settings (what is searched, unnamed items, containers)

The Content tab has three sections, each with its own Restore Defaults button. It decides **which elements are in the index at all**; how a result looks is the Display tab, hiding single elements by name or tag is the Filtering tab.

* **What Is Searched:** one table, one row per kind of element (Panorama, 360 Video, Flat Video, Hotspot, Polygon, Video, Webframe, Text, Projected Image, Other Elements, 3D Model, 3D Hotspot, 3D Model Object, Audio, then Photo Album, Map and Image), each with a plain sentence saying what it is and an "In Search" switch (`includeContent.elements.include*`; `includeElements` = "Other Elements" = anything the plugin cannot classify; Photo Albums, Maps and Audio are off by default). Include All / Include None switch the 17 rows at once. A kind that is off is skipped at every index site (`_shouldIncludeElement`). Containers are not a row: they have their own section.
* **Audio (since 2026-10-11, off by default, `includeContent.elements.includeAudio`):** one result per audio file of the tour (3DVista class `MediaAudio`, named by `data.label`, for example "entrance"), listed in its own group "Audio" with a speaker icon and the line "Click to play or pause". A click calls the audio object's own `pause()` while its `state` is "playing", otherwise `play()` (verified on the test tour: playing -> paused -> playing). Indexed by `indexAudio` after the photo albums and maps; it passes `_shouldIncludeElement` like every kind (Filtering and the unnamed rules apply; a sheet row can describe an audio file with `elementType` Audio); its name, picture and icon are set in its own row of Display > Element Types (`displayLabels.Audio`, `thumbnailSettings.showFor.audio`, `sizeByType.audio`, `defaultImages.Audio`, `showIconFor.audio`, `customIcons.Audio`; standard icon `fa-volume-high`).
* **Unnamed Items:** an element is *unnamed* when its raw title (`data.label`) is empty. Three switches decide which unnamed elements are in the index, checked in this order: it has a subtitle (`includeContent.unlabeledWithSubtitles`, default on), else it has tags (`unlabeledWithTags`, default on), else it has nothing at all (`completelyBlank`, default on: such an element is listed as "[Unnamed Item]" unless Display > Unnamed Items names it otherwise; the test tour has one blank panorama). What an unnamed element is *called* is Display > Unnamed Items (`useAsLabel.*`). `includeContent.elements.minLabelLength` ("Shortest Name Shown", 0 = no limit) leaves out any element whose resolved name is shorter.
  * Implementation: `_isUnnamedExcluded(rawLabel, subtitle, tags)` is called by `_shouldIncludeElement` as its 5th argument, from every index site that has a raw label (panoramas, 360/flat videos, albums and maps, 3D models, 3D objects and hotspots, overlays, sheet rows that jump to a parent). Before 2026-10-10 the three switches did nothing and `skipEmptyLabels` was only checked for overlays (the label passed to `_shouldIncludeElement` was already the fallback name, so its own check never fired); unnamed panoramas were always listed.
  * **3D objects named just "Object" (since 2026-10-12, `includeContent.includePlainObjects`, default `false`):** 3DVista names the parts of a 3D file "Object" when the artist gave them no name (99 of the 115 objects of the test tour), and the plugin has always left them out. The switch **Objects Named Just Object** (Unnamed Items) puts them in the search (the 3D model is their parent); an object with no name at all stays out. The scan note ("N of them are called just "Object" ... and are left out") only appears while the switch is off.
  * `includeContent.elements.skipEmptyLabels` stays in the plugin for older files: `true` leaves out every unnamed element (same as the three switches off). The Control Panel no longer shows it; it keeps it in step (`true` = all three off) and reads a file with it ON as the three switches off. The built-in block used to say `true`, which hid every unnamed overlay by default (and left unnamed panoramas listed); it now says `false`, so with the three switches on (the defaults) every unnamed element is found: overlays included, which were hidden before. 3DVista names every element in its editor, so unnamed overlays are rare.
* **Containers:** a *container* is a 3DVista element that holds other elements (a menu, a gallery, a floor plan); the author drops it on the tour canvas and names it. It is not found by itself: each container the visitors may open is a row of the list "Container Names" (the same list design as Tag Names, with "Add a Container"), saved as `includeContent.containerSearch.containers`: `[{ name, phoneName, label }]`. `name` = the name in the tour (3DVista Name property), `phoneName` = the name in the phone version of the tour (empty = the same: 3DVista exports a desktop version, `script_general.js`, and a phone version, `script_mobile.js`, and an author may name the same container differently in each), `label` = what visitors see (empty = the name). The plugin lists one result per row (`_containerEntries`): on a phone layout (`_isPhoneScreen`: by screen width, or by the tour's own version when `phoneDetection` is "tour") it opens the container by `phoneName` when that is set, else by `name`; a name is listed once; a row with only a phone name is not listed on desktop. A click toggles the first container with that name (see "Container Search" in section 20); the plugin does not check that the name exists (a custom menu such as `window.tourMenu.toggleContainer` can use names that are not 3DVista containers). The second line of the result is the fixed text "Click to toggle container". **Pick From the Open Tour** (Content > Containers) asks the open tour for its containers over the same channel as the scan and lists each name once (with how many containers share it and whether it is hidden when the tour starts); ticked names are added as rows (names already in the list are ticked and locked). A tour can hold dozens of containers, most of them parts of its own interface, which is why the search does not take them all automatically. Older settings that only have `containerSearch.containerNames` (a list of names) still work; the Control Panel turns them into rows when it reads a file and keeps `containerNames` in step with the names of the rows. "Find Containers" is `includeContent.elements.includeContainers`; the Control Panel mirrors it into `containerSearch.enableContainerSearch` (the plugin needs both; a file with the container search off is read as Find Containers off).
* **Removed from the page** (the plugin still accepts them): the twelve "Label Field" / "Fallback Field" selects (`displayLabels.panoramas...`, `useAsLabel.panoramas...`: nothing ever read them), `includeContent.searchableProperties` and the stray top-level `containerNames` of the old page. The Control Panel drops these keys when it reads a file.
* Files: `dashboard/tabs/content-tab.html` (generated), `dashboard/js/content-tab.js`, `core.normalizeContentSettings` / `core.syncSkipEmptyLabels` / `mirrorToPluginNames` in `control-panel-core.js`; test suite `content`.

### Filtering settings (names, tags, panoramas by number)

The Filtering tab leaves results out of the search by what they are called, which tags they have and where they sit in the tour's list. The Content tab decides which KINDS are searched; Filtering decides which of those results stay. Three sections, each with Restore Defaults. A result must pass every filter that is on (and every Content switch), so two filters that disagree give an empty search.

* **Names:** `filter.mode` (`none`, `whitelist` = "Show Only These", `blacklist` = "Hide These"), `filter.allowedValues` / `blacklistedValues` (lists), `filter.valueMatchMode.whitelist` / `.blacklist` (`contains` is the default for both since 2026-10-10, before the Show Only default was `exact`; `exact`, `startsWith`, `regex`). The values are compared with the name shown in the results as the TOUR gives it (after fallbacks such as the subtitle or "[Unnamed Item]"; a title from a Data Sources sheet is not used, because the sheet is applied after the filters), so the filter applies to hotspots, 3D objects and containers too. Comparison removes capitals, accents (since 2026-10-10), quotes, brackets and dash variants from both sides; a regular expression is the exception: it is used exactly as typed (trimmed) and tested against the visible name, case-insensitively. An empty list means the filter is off. The Control Panel shows only the box and the comparison of the active mode.
* **Tags:** `filter.tagFiltering.mode`, `allowedTags` / `blacklistedTags`. The tag as written in 3DVista (the "other names" of Appearance and the tags of a Data Sources sheet are not used); capitals and accents do not matter. Show Only: an element WITHOUT tags is left out, panoramas and containers too.
* **Panoramas by Number:** `filter.mediaIndexes.mode`, `allowed` / `blacklisted`. The settings hold 0-based positions in the main playlist as text ("0", "1"); the page shows them counted from 1. The playlist holds panoramas, 360 / flat videos and 3D models, so the number is not only about panoramas; a hidden item takes everything inside it (hotspots, polygons, 3D objects) with it. Containers, photo albums and maps are not affected.
* **Lists** (`updateConfig` normalization): every list is trimmed, de-duplicated and cleaned; a list given as TEXT is split at commas and line breaks (before 2026-10-10 a text became an empty list, so a text sent by the live preview filtered nothing); tags are lower-cased.
* **Order of the checks** in `_shouldIncludeElement`: unnamed rules, shortest name (Content), names, element types (older), element labels (older), tags, Content switches. The panorama numbers are checked earlier, while the playlist is read.
* **Older settings the plugin still understands, no longer on the page:** `filter.elementTypes` (type whitelist / blacklist) and `filter.elementLabels` (label text, contains only). The Control Panel translates them when it reads a file or restores a session (`core.normalizeFilterSettings`): a type list becomes Content switches (a kind that was hidden is switched off, so visitors see the same result; Container and Element included) and the old lists are cleared; lists that name all 15 types of the old page are cleared without translating (the old page wrote such lists whenever only the mode was changed, because its boxes always showed as checked: a blacklist of every type left 1 result of 71); the label filter used alone moves into Names with "Contains"; used together with a Names filter it stays as it is and the page says so (Restore Defaults of Names removes it). The dead `filter.typeFilter` code of the result list was removed.
* **How the page saves:** the lists are not form fields (no `name`, `data-ui-only`, `data-target`): the tab script writes each one as a list at once and sends it to the open tour; fields with a name would send the box's text. The three modes and the comparison are plain fields. An invalid pattern or number is explained and not saved. "Restore Defaults" of a section and "Reset All" tell the open tour. "Filters on: ..." at the top follows what is saved and does something; an empty Show Only list gets a notice.
* Files: `dashboard/tabs/filtering-tab.html` (generated, 399 lines, was 866), `dashboard/js/filtering-tab.js`, `core.normalizeFilterSettings`; test suite `filtering`.

### Animation settings (the Animations tab)

Since 2026-10-11 the animations have a tab of their own (they were three sections of Advanced) and **one motion layer** in the plugin plays all of them. Only `opacity` and `transform` move, so the page stays smooth while the tour renders.

* **One decision:** `_motionState()` is `off` (`animations.enabled` is not true: everything appears at once, hover and focus changes are instant), `reduced` (the visitor's device asks for less motion and `reducedMotion.respectPreference` is not false: every effect becomes a fade of `reducedMotion.fallbackDuration` ms, no movement, no waiting between results) or `full`. Before, the script path (results, groups) ignored the visitor's preference and the bar tested only `enabled`.
* **`_motionPlay(el, name, options)`** plays an entrance (or, with `exit`, the matching exit) with the Web Animations API; `name` is `barOpen`, `barClose`, `group`, `item`, `panel` or `noResults`. It returns `{ animation, total }` (`total` = delay + duration in ms; the bar's focus delay and hide timer use it instead of a guessed `closeDuration + 50`). A new animation on an element stops the one that is playing; a later open cancels a pending hide. The injected stylesheet (`search-animation-styles`), the inline opacity / transform styles, the per-result `setTimeout`s and the `🎬` console lines are gone.
* **Settings (all under `animations`, every one read with a safe fallback; 0 is a real value, before `0` became the default):**
  * `enabled`, `easing` (any CSS easing; one the browser cannot read falls back to `cubic-bezier(0.22, 1, 0.36, 1)`; a `linear()` curve that an older browser cannot read becomes `cubic-bezier(0.34, 1.56, 0.64, 1)`), `reducedMotion.respectPreference` (default true), `reducedMotion.fallbackDuration` (0 to 1000).
  * `searchBar`: `openEffect`, `openDuration`, `closeEffect`, `closeDuration` (0 to 5000), `distance` (px), `scale` (% 50 to 100, the size the zoom effects start from), `easing` ("" = follow the default), `focusDuration`, `focusGrow` (% 100 to 110) and `clearDuration` for the search field and the clear button.
  * `results`: `itemEffect`, `fadeInDuration` (the duration of a result), `slideDistance`, `staggerDelay` (0 to 500), `staggerLimit` (1 to 100: only the first results move, the last one never waits longer than 800 ms), `replay` (`every-search` or `list-opens`), `groupEffect` / `groupDuration` / `groupDistance`, `panelEffect` / `panelDuration` / `panelDistance` (the box around the list), `noResultsEffect` / `noResultsDuration` / `noResultsDistance`, `scale`, `easing`, `hoverLift` (px 0 to 10), `hoverDuration`, `pressScale` (% 90 to 100), `iconHoverDuration`. A group, the list box and the message follow `fadeInDuration` and `slideDistance` until they have their own value (an older file keeps its look).
  * Effects: `none`, `fade`, `from-above`, `from-below`, `from-left`, `from-right`, `zoom`, `zoom-from-above`, `zoom-from-below` (shown as "Slide From Above" and so on; "Zoom and Slide From Above" is the look of the bar before). An unknown effect uses the default of that part.
  * Older settings that stay readable: `duration.fast / normal / slow` and `searchBar.scaleEffect` (no longer on the page; `scaleEffect` did nothing the bar's own transform did not already do).
* **One set of defaults:** `_MOTION_DEFAULTS` in the plugin, `getDefaultConfig().animations` in the Control Panel and the documented block (10.1.3.14) are the same numbers. The built-in block had test values (600 / 800 / 1200 ms, a bouncy curve, 150 ms between results, `respectPreference` false); they are gone, and the default for a tour with no settings file is off.
* **Small effects through CSS variables** (set on the document element by `_applyAnimationFlagAndVars`): `--sp-hover-duration`, `--sp-icon-duration`, `--sp-focus-duration`, `--sp-clear-duration`, `--sp-ease`, and, only while animations play, `--sp-hover-shift`, `--sp-press-scale`, `--sp-focus-grow`. While animations are off the durations are 0 ms and the stylesheet keeps its plain look (a result still rises 1 px on hover, instantly). The older `--animation-*` variables are still set for style sheets that read them.
* **Placement:** a bar placed with `data-position="center"` (older placement) keeps its `translateX(-50%)` through the effect; a bar placed with the newer placement centers with auto margins and needs no transform. The mobile "fixed" visibility rule (`opacity: 1 !important`) still wins over the effect, as before.
* **CSS change that goes with it:** `#searchContainer .visible` no longer sets `opacity: 1 !important` (an animation cannot beat an important declaration; the element is shown by the same rule's `display`).
* **API:** `tourSearchFunctions.getMotionSpec(name)` returns `{ effect, duration, distance, scale, easing, state }` for one part (read only). The Control Panel's Preview and the test suite compare their reading of the settings with it.
* **Control Panel:** the Animations tab has Motion (switch, Style, Easing and its exact curve, reduced motion), Opening and Closing, Search Field and Clear Button, Results Appearing (each result, groups, shared size and easing), List Box and Messages, Hover and Press, each with Restore Defaults, and a Preview (a mock bar with results that plays the effects with the same rules, "Nothing Found", hover / press / focus). **Style** (Balanced = the defaults, Subtle, Lively, Minimal) fills in the numbers and shows Custom as soon as one is changed; it is not saved. `core.normalizeAnimationSettings(config)` completes an older file (and a restored session) before it is merged. 35 settings, 6 Restore Defaults; the page is dimmed (not locked) while Enable Animations is off.
* Files: `search-v4.js` section 8, `css/search-v4.css` (hover / press / focus / clear variables), `dashboard/tabs/animations-tab.html` (generated), `dashboard/js/animations-tab.js`, `core.normalizeAnimationSettings`; test suite `anim`.

### Knowledge tab (the explaining page)

The one tab without a setting (navigation "Knowledge", title "Knowledge Base"; its internal id stays `management`, as stored `currentTab` values and the loader use it). Rebuilt 2026-10-11; before, it told visitors to load the settings file BEFORE the search engine (the opposite of section 11), pointed to a "Download Configuration" button that is not on the page, and did not mention the search button code.

* **Content (5 sections):** Saving and Sharing Your Settings (a table of the top-bar buttons: what each does and who sees it; visitors only see settings after the file is downloaded and uploaded), Add the Search to Your Tour (copy the folder, the two `index.html` lines with the engine first, the search button code, publish), Upload Your Settings File (Download, upload to `search-pro-v4/config/`, reload without the cache), Shortcuts (Control Panel and visitor), When Something Does Not Work (six problems and what to check).
* **The search button code on the page is `extras/Button.js`:** `dashboard/tabs/knowledge-tab.html` is generated and reads that file when it is generated (`_maintenance/audit/evidence/control-panel/knowledge/build_knowledge_html.py`); the test suite `knowledge` compares the page with the file, so a change of `Button.js` that is not copied to the page fails a test.
* **Script:** `dashboard/js/knowledge-tab.js` only does the two Copy buttons (`.kb-copy[data-copy-target]`: clipboard API, `execCommand` as a fallback, the label says "Copied" for a moment); the methods the core expects answer "nothing to do".
* The 480 lines of CSS of the old page are replaced by about 130 (`.kb-steps`, `.kb-code`, `.kb-copy`).

### Scan of the open tour (Advanced tab, "What the Search Sees in Your Tour")

The Advanced tab holds Search Tuning, Control Panel Connection and, since 2026-10-11, a read-only scan (the animations have a tab of their own since the same day). Nothing in the Control Panel decides *what the plugin can read*: that is built into the plugin (the main and root playlists, the overlays of panoramas and videos, 3D objects, photo albums and maps, typed containers, sheet rows); Content, Filtering and Data Sources only narrow or restyle it. The scan shows, for the tour that is open, what exists and what the search reads of it.

* **API:** `tourSearchFunctions.getTourInventory()` returns `{ ready, indexCount, kinds: [{ id, title, found, named, inSearch, status, note }] }` and changes nothing. `ready` is false until the index exists. `found` counts the tour's objects by 3DVista class through the player's `getByClassName`; `named` counts those with a name (`data.label` / `data.name`; for text boxes: with text); `inSearch` counts index entries of the types the search gives that kind.
* **Containers for the picker:** the report also carries `containerList: [{ name, count, visible }]` (unique names, sorted, `count` = containers sharing the name, `visible` = shown when the tour starts).
* **Kinds (16):** panoramas, 360 videos, flat videos, photo albums, maps, 3D models, overlays on panoramas and 360 videos (hotspots, polygons, images, texts, videos, web frames), objects and hotspots of 3D models, audio (read since 2026-10-11), containers, photos inside albums, hotspots on maps, text boxes and labels, buttons, menu entries, windows and pop-ups (added 2026-10-12, not searchable yet). Of everything the test tour defines (78 object classes in `script_general.js`) nothing else could be a result: the rest is parts of a media (levels, cameras, frames, lights, resources) or of the interface (viewer areas, thumbnail list, close button, images of the skin).
* **Status:** `searched` (everything the search can read is in), `off` (the kind is switched off in Content), `fewer` (fewer in the search than in the tour: Content or Filtering, or a reason in the note), `typed` (containers: only the typed names are searched), `later` (the search does not read this kind yet), `none` (the tour has none). 3D objects called exactly "Object" (the 3D file's default name) are left out unless Content > Unnamed Items asks for them, and the note says so. A media that no playlist holds, or that the tour shows in a hidden window without a width and a height, is left out and the note says so ("N of them sit in a hidden window that has no size ..."); when every item of a kind is left out the "What It Means" text is that note instead of "In the search".
* **Channel:** the Control Panel sends `searchProInventoryRequest { id }` on `BroadcastChannel("tourSearchChannel")` and the plugin answers `searchProInventoryReport { id, report }` (same mechanism as the Data Sources test; the tour must be open in the same browser and origin; 2.5 seconds without an answer = "no open tour").
* **Test tour (2026-10-11):** 5 panoramas (4 named), 1 + 1 videos, 1 album, 1 map, 1 3D model, 22 overlays, 103 3D objects (40 in the search), and not read: 5 photos, 1 map hotspot, 30 containers (only typed ones), 2 audios, 9 text boxes, 14 buttons, 9 menu entries.

### The two config channels — when each is used

| Channel | When active | Persistence |
|---------|-------------|-------------|
| `window.searchProConfig` | Set by the downloaded `search-pro-config.js` file included in `index.html` | Permanent — survives page refresh |
| `localStorage.searchProLiveConfig` | Set by "Apply Settings" in the Dashboard | Persists in browser — survives refresh until cleared |
| `postMessage` | When Dashboard is open in the same browser session as the tour (iframe or adjacent tab) | Session only — immediate live update |

### Config file download — what gets generated

When "Download Config" is clicked, `downloadConfig()` generates a JavaScript file (`search-pro-config.js`) with this structure:

```javascript
/**
 * Search Pro V4 Configuration
 * Generated on [date]
 * IMPORTANT: Do not add auto-apply code to this file.
 * The search engine (search-v4.js) will automatically detect and apply
 * this configuration via its DOMContentLoaded handler.
 *
 * Simply include this file after search-v4.js:
 * <script src="search-pro-v4/search-v4.js"></script>
 * <script src="search-pro-v4/config/search-pro-config.js"></script>
 */

window.searchProConfig = { /* full config object */ };

// Node.js module export compatibility
if (typeof module !== 'undefined' && module.exports) { module.exports = window.searchProConfig; }

// Configuration loaded - search engine will apply via DOMContentLoaded
```

Since 2026-10-11 the file prints nothing to the console when a visitor loads it (it used to log "CONFIG FILE: window.searchProConfig defined and ready"), contains none of the five stray keys, and is a complete round trip: Load the file and Download again gives the same file apart from the date line (suite `actions`). The setting `showHiddenViewers` is in it. Numbers with a unit are text (`"16px"`, `"1.5"`) by design, and 63 settings exist under two names on purpose (`displayElements.showFor.*` and `thumbnails.defaults.*` for the panel, `thumbnailSettings.showFor.*` and `thumbnailSettings.defaultImages.*` for the plugin; `minSearchChars` and `minSearchLength`; `mobileBreakpoint` and `searchBar.mobileOverrides.breakpoint`; `display.showTagsInResults` and `showTagsInResults`; the icon color).

This file is then saved to `search-pro-v4/config/search-pro-config.js` in the tour folder. On the next page load, `search-v4.js` reads `window.searchProConfig` via its `DOMContentLoaded` handler and calls `window.searchFunctions.updateConfig(window.searchProConfig)`.

### How `search-v4.js` applies configuration (verified priority order)

```
1. Built-in defaults  ← ConfigBuilder creates _config with all defaults
        ↓
2. External config file  ← window.searchProConfig (set by search-pro-config.js)
   Applied via: window.searchFunctions.updateConfig(window.searchProConfig)
        ↓
3. localStorage live config  ← searchProLiveConfig (set by Dashboard "Apply")
   Applied only if hash differs from searchProLastAppliedConfig
        ↓
4. postMessage update  ← sent when Dashboard is open live in same session
   Applied immediately via: window.searchFunctions.updateConfig(data.config)
```

Each step merges (deep merge) on top of the previous — it is additive, not a full replacement.

### The public API surface (verified)

Two global objects expose the same methods:

```javascript
window.tourSearchFunctions  // primary — defined inside search-v4.js module
window.searchFunctions      // alias — unified at end of file with same methods
```

| Method | What it does |
|--------|-------------|
| `initializeSearch(tour)` | Binds to tour data and builds the Fuse.js search index |
| `toggleSearch(show)` | Shows (`true`) or hides (`false`) the `#searchContainer` UI |
| `updateConfig(patch)` | Deep-merges `patch` into `_config` and rebuilds search index if needed |
| `getConfig()` | Returns a deep copy of the current `_config` object |
| `getMotionSpec(name)` | What one animated part does with the current settings (`barOpen`, `barClose`, `group`, `item`, `panel`, `noResults`); read only |

The Control Panel also looks for `reinitializeSearch(force)` on the parent window; the plugin does not define it, so `updateConfig` is what applies the settings.

### How Button.js connects to all of this

The Button.js action (`extras/Button.js`) is the user-facing trigger. Here is exactly how it fits into the full system:

```
User presses 3DVista button
        │
        ▼
Button.js action runs in rootPlayer context:
  1. Checks #searchContainer exists (plugin loaded?)
  2. Checks !window.searchListInitiinitialized (not yet initialized?)
     → if true: calls window.tourSearchFunctions.initializeSearch(this)
        - this = rootPlayer
        - plugin resolves actualTour = this.get("data").tour
        - _config is ALREADY set from search-pro-config.js (applied at DOMContentLoaded)
        - plugin builds Fuse.js index from tour data
  3. Calls window.tourSearchFunctions.toggleSearch(display !== 'block')
     → shows or hides #searchContainer
```

**Key connection:** The Button.js code does NOT configure the search — it only triggers it. All configuration (colors, filters, content types, thumbnails, etc.) was already applied when `search-pro-config.js` loaded, before the button was ever pressed. The Dashboard's "Apply" / "Download Config" flow is what controls what the search looks like and how it behaves.

### localStorage keys reference

| Key | Set by | Read by | Contents |
|-----|--------|---------|----------|
| `searchProLiveConfig` | Dashboard (every change + "Apply") | `search-v4.js` (on load, on the `storage` event, every 2 s); Dashboard on start (restore prompt) | Full config JSON |
| `searchProConfig` | Dashboard "Apply" | `search-v4.js` via `_getInitialConfig()` | Full config JSON (duplicate) |
| `searchProConfigUpdate` | Dashboard "Apply" (removed by Reset) | `search-v4.js` | Timestamp of last update |
| `searchProLastAppliedConfig` | `search-v4.js` after applying | `search-v4.js` on next load | Hash of last applied config (dedup guard) |
| `searchProDebugEnabled` | Manual / debug tools | `search-v4.js` on load | `"true"` to enable debug mode |
| `tourGoogleSheetsData` | `search-v4.js` (cache) | `search-v4.js` | Cached Google Sheets data |
| `searchProLastPlace` | `sidebar-menu.js` (Control Panel) | `tab-loader.js` / `sidebar-menu.js` on the next visit | `{ tab, section, offset, stamp }`: the tab and card where the Control Panel was left (this browser only, 7 days) |
| `searchProPreviewPanel` | Live Preview panel | Live Preview panel | `{ open, width, device, mode, typed, focus }`: whether the panel was open, its width and its state (this browser only) |

### Resetting / clearing configuration

The Dashboard "Reset" function clears `searchProConfig`, `searchProLiveConfig`, `searchProConfigUpdate`, `searchProLastAppliedConfig` and the Control Panel's own state keys (`searchProSettings`, `controlPanelState`, `sidebarCollapsed`, `currentTab`, `lastAppliedConfig`, `configBackup`) and sends the defaults to an open tour first (the plugin writes `searchProLastAppliedConfig` again when it applies them). To manually clear everything from the browser console:

```javascript
["searchProLiveConfig","searchProConfig","searchProConfigUpdate",
 "searchProLastAppliedConfig","tourGoogleSheetsData"]
 .forEach(k => localStorage.removeItem(k));
```

---

## 18. Known Limitations and Gotchas

| Issue | Details |
|-------|---------|
| **`window.tour.mainPlayList` is `undefined`** | In the test tour the playlist is at `window.tour.locManager.rootPlayer.mainPlayList` (section 4). Never test the shorter path alone: the plugin's automatic start did, and so it never ran. |
| **Console warning `Tour not ready after waiting for 15000 ms`** | Expected in the test tour (section 10, "How the search starts"). It is the automatic start giving up; the search still works from the button. |
| **The search starts at the first button press** | Deliberate (section 10). Any feature that needs the search before that, such as Open When the Tour Starts, has to start it itself. |
| **The plugin's own start (`TourBinding`) is dead code** | Four independent reasons stop it (section 10 and `_maintenance/audit/PLUGIN-AUTOSTART-FINDINGS-2026-10-13.md`): it waits on `window.tour.mainPlayList`, `isTourReady()` cannot see `PlaylistUtils`, `bindToTour()` stops at the first failed strategy, `validateAndInitialize()` reads the same wrong path. It is one of the five ESLint baseline errors. Do not "fix" it by making it work without deciding to build the index at load for every visitor. |
| **`extras/Button.js` checks `window.searchListInitiinitialized`** | A typo of `searchListInitialized`, so the check is always false and `initializeSearch` is called on every press. Harmless: a repeat call is ignored. Tours already built with this code keep working. |
| **`data.subtitle` not `data.description`** | Native 3DVista tour objects use `data.subtitle` for secondary text. `data.description` only exists in external Google Sheets / CSV data. Using `data.description` on a tour media or overlay object will return `undefined`. |
| **`searchListInitiinitialized` typo is intentional** | The button code checks `window.searchListInitiinitialized` (double "i"). This is NOT a bug to fix — `search-v4.js` also sets this same typo variable to `false` during cleanup (line 804). The two variables (`searchListInitialized` and `searchListInitiinitialized`) coexist on purpose. |
| **Overlays may not expose `.get()`** | Some overlay types expose data via `overlay.data` (direct property) rather than `overlay.get("data")`. Always use the `_safeGetData()` pattern: try `obj.data` first, then `obj.get("data")`. |
| **3D Model Objects require two-step navigation** | Navigate to the parent 3D model scene first; the plugin then waits for the model's `begin` event (or acts at once when the model is already active) before it centres the camera and triggers the object. |
| **mainPlayList may not be the correct playlist** | In some tours, the canonical playlist is at `tour.locManager.rootPlayer.mainPlayList`, not `tour.mainPlayList`. Always check both. |
| **Overlay parent-media matching is not guaranteed** | `media.get("overlays")` is the most reliable way to get overlays for a specific panorama. `tour.player.getByClassName("PanoramaOverlay")` returns ALL overlays across ALL scenes and must be filtered. |
| **`tour._isInitialized` may not exist** | This property exists on most tours but is not guaranteed. Treat `undefined` as acceptable (not as `false`). |
| **Script order (recommended, not required)** | Put `search-v4.js` first and `search-pro-config.js` second: it is the tested order. A settings file made by the Control Panel only sets `window.searchProConfig`, which the plugin reads after the page has loaded, so the other order also works (checked 2026-10-16). See section 11. |
| **Other scripts' `console.log` is silent** | Unless debug mode is on (`?debug=true`), the plugin replaces `console.log`, `console.info` and `console.debug` for the whole page until the first uncaught error; `console.warn` and `console.error` still work. By design; see section 15. |
| **The tour's search button cannot close a bar placed at the Bottom when Close on Outside Click is off** | Found by an outside review and confirmed on 2026-10-16 (probe `audit3_probe.js`). A bar placed at the bottom is shown with `style.display = "flex"`, and the button code of the tour (`toggleSearch(searchContainer.style.display !== 'block')`) then always asks to OPEN, which the plugin ignores because the search is already open. With the defaults the click on the button is also a click outside the search, so the search closes and nobody notices. With Close on Outside Click off (desktop and phone) the button only opens; the visitor closes the search with Escape, the close button or a result. Top and middle placements are not affected. **Not fixed by the owner's decision** (the clean fixes either change the button code, which every tour would have to paste again after each publish, or make the plugin keep `display: block` and lay the bar out with CSS). Until then: keep Close on Outside Click on when the bar is at the Bottom. |
| **`#viewer` must exist in the DOM** | Search Pro requires the `#viewer` element to inject `#searchContainer`. If `#viewer` is missing, initialization fails with a logged error. |
| **After an update, reload the tour without the cache** | `search-v4.js` and `css/search-v4.css` are two files that a browser caches separately. An old script with the new stylesheet shows the results animating but not the search bar (the old script animated only the results; the new stylesheet no longer animates the bar by itself; verified 2026-10-11). Reload with Cmd+Shift+R (Ctrl+F5), or switch on "Disable cache" in the developer tools while testing. To check which script runs, type `typeof tourSearchFunctions.getMotionSpec` in the tour's console: `function` = the current script, `undefined` = an old one. |
| **`search-v4.js` loaded twice** | A second `<script src="search-pro-v4/search-v4.js">` line in `index.html` makes the browser stop that copy with the red console error `Identifier 'SEARCH_PRO_VERSION' has already been declared` (found 2026-10-11 in the export made with the newer 3DVista). The first copy keeps working, so nothing breaks, but the line should be removed. The plugin cannot guard against it: the error comes from the browser before any plugin code runs. |
| **`HotspotPanoramaOverlay` may be a Polygon** | A `HotspotPanoramaOverlay` whose label contains "polygon" (case-insensitive) is reclassified as type `Polygon` by Search Pro. |

---

*Document maintained by: 360 Virtual Tour Solutions*  
## 19. Release 4.6 — What Changed

Release 4.6 (10/13/2026). The public API and the Button contract used by the tour are unchanged. This table lists what came after release 4.5 (10/07/2026); release 4.5 follows below.

| Area | Change |
|------|--------|
| Control Panel: new interface (phases 1 to 5, 2026-10-12 / 13) | A new frame (dark sidebar with the cards of the open tab, top bar, unsaved marks, More menu), restyled pages, a Live Preview of the real search on a sample tour, a search box for the Control Panel itself (Ctrl / Cmd + K) and PDF results; see section 17 for each part. No setting, id or tab changed. |
| Content, Filtering, Audio, Animations, compatibility, Order of Results (2026-10-10 to 12) | Content: the unnamed-item switches work for every kind; Filtering: lists filter what they say; Audio kind; one motion layer for all animations; media outside the main playlist, popup hotspots and hidden windows are handled (`showHiddenViewers`); `display.typeOrder`; `includePlainObjects`; Highlight Matches and Match Capital Letters work. |
| PDF results (phase 5, 2026-10-13) | Kind `PDF` (`includeContent.elements.includePDFs`, off by default): a hotspot that opens a PDF is also a result, named after the hotspot or the file; the plugin reads the tour's script files once to find them. See the PDF section. |
| Release (phase 7, 2026-10-13) | The floating button menu is removed; the Control Panel opens on the tab and card it was left at (`searchProLastPlace`, section 17); the Knowledge page has Update to a New Version, What the Search Finds, Find and Check Your Settings and plainer install steps; the Data Sources tab says what visitors can find by the table's words and what happens when it cannot be read; Flat Video has its own default picture `flat-video-default.jpg`; the preview of the Animations tab draws no focus ring; `documentation/installation-guide.html` is rewritten for V4.6 (V4 names, the upload list). |
| Version | `SEARCH_PRO_RELEASE = "4.6"` is shown in the debug log; `package.json` 4.6.0; every file changed after 10/07/2026 reads 4.6; `STATUS.md` and this document describe the same state. |
| Thumbnails (phases T1 / T1b / L1 / H1) | With thumbnails on, results show the tour's own pictures (property `thumbnailUrl`, section 5), elements inside a panorama / 3D model borrow that picture; the small type icon on the picture is off by default (`typeBadge`: `none` / `all` / `borrowed`); look options: shape and fit, size per element type, badge look and colors, a different look on phones, generated placeholders in a brand color, optional hover zoom of the picture (desktop mouse rest / phone touch and hold, section 5); matching Control Panel fields. Thumbnails themselves stay off by default. |
| General tab reorganised (G1-G3) | Five sections (Opening and Closing, How Searching Works, Search Bar, Phones, Visitor Texts; How Searching Works moved to Advanced as Search Tuning on 2026-10-10) with a Restore Defaults button each; placement picker (top / middle / bottom x left / center / right) replaces the four raw position numbers and fixes left-only, bottom and centered placement; a desktop position can no longer push the bar off a phone; one phone breakpoint and an option to follow the tour's own phone version; Escape and Ctrl / Cmd + K switches, open when the tour starts; typing delay, results limit, match tolerance and field priorities; editable visitor texts; invalid values are explained and not saved or sent (section 'General settings'). |
| Appearance tab repaired (P1) | Font lists with a Default entry and the tour's own fonts; clearer labels (Result Border, Subtitle, Subtext, one Icon Color); typography for the results list (font, name, description, panorama line, group title and count sizes); focus ring; one chip for each tag and a note when tags are hidden; hex boxes next to every color picker; sizes saved with their unit; checks that explain invalid values; Restore Defaults for every section; default placeholder and group-count colors now pass the 4.5:1 contrast rule (section 'Appearance settings'). |
| Appearance tab restructured (P2) | The eight sections became four that follow what the visitor sees (Search Field, Results List, Group Headers, Tags and Highlight), each with subsections; the focus ring replaces the three "text while active" fields (old values still read); the tag settings are dimmed as one group while tags are off; Restore Defaults of a section covers everything inside it (section 'Appearance settings'). |
| Appearance options expanded (P3a) | Borders for the search field and the results list (width, style, color, each side), a line between result rows, four new colors (clear icon on hover, scrollbar, nothing-found text and background), tag strength and background strength, most tags shown with a +N chip, a four-side Space Inside, and an editable (or empty) word before the tags in General > Visitor Texts (section 'Appearance settings'). |
| Tags, group headers, scrollbar, nothing-found message (P3b) | No "+N" chip when only one tag may show; tag names can be changed or hidden from the Control Panel without touching the tour; group headers get space, corner radius, title weight / case / spacing, lines above and below and a centered alignment; the scrollbar color really works in current browsers and has a size; the nothing-found message gets its own icon (default, none, Font Awesome or emoji) and size (section 'Appearance settings'). |
| Group headers and count badge, validation fix, Search Tuning (P3c) | Space above and below the group title are separate; group headers get a full border (each side) and a background strength; the group count can look like a badge (background, strength, radius, space inside, weight, case, border); an error message under a number field now disappears when the value is corrected; "How Searching Works" moved from General to the Advanced tab as "Search Tuning". |
| Result types: 360 Video, Flat Video, Photo Album, Map (C1) | 360 videos and flat videos are results of their own (they were "Panorama" before) with their own include switch, picture switch, icon, label, size and placeholder; photo albums and maps can be added (Content tab, off by default); type filters and sheet rows know the new names; the Control Panel has the matching fields in the Display, Content and Filtering tabs (section 5). |
| Icons and per-type switches (I1) | The Icon Size setting works (16-96 px; the built-in default stays 20 px); the per-type switches for thumbnails and icons ignore letter case and know the container; an icon switched off for a type also hides the built-in icon; the Icon Appearance, Hover and Visibility settings are always available in the Control Panel ("Use Custom Icons" only decides whether your own icons replace the built-in ones); the thumbnail visibility switches and placeholder files now reach an open tour live; the retired Business type is removed from the thumbnail and icon settings; the leftover Business Label and "Include Business Elements" fields of the Control Panel are removed too (nothing in the plugin read them). |

### Release 4.5 (10/07/2026)

| Area | Change |
|------|--------|
| 3D search results | 3D hotspots centre the camera on the hotspot; 3D objects centre and frame the camera on the object and still fire their click (section 13). |
| Live settings | The tour applies Control Panel changes instantly through the `storage` event (the 2 s check stays as a backup). |
| Control Panel | Restore of the previous session; `Ctrl/Cmd+D` and `Ctrl/Cmd+L` are no longer taken over (use `Alt+Shift+D / L`); `Ctrl/Cmd+R` is no longer taken over; closing a dialog any way re-enables the header buttons; new **Control Panel Connection** field (section 17). |
| Security / robustness | Origin check enforced and tolerant of text / trailing slash / letter case; HTML escaping and icon sanitising; CSV quoted fields; Fuse.js late-load handling (see `_maintenance/audit/` for the full list). |
| Audit fixes (2026-10-16) | Load reads a settings file as data (section 17); settings text stored as typed (section 17); a page that frames the tour is trusted only when listed in `controlPanel.allowedOrigins` (section 17, "Allowed Control Panel addresses"); `_cssPx` / `_cssLength` keep position values and widths out of the style text; `aria-setsize` on the options; "Test This Source" counts CSV records (`dsCountCsvRecords`); the console silencer is documented (section 15). Giving the focus back on close was tried and removed: the 3DVista player takes the focus away again at once. Full table: `_maintenance/audit/AUDIT-REVIEW-AND-FIXES-2026-10-16.md`. |
| Version | `SEARCH_PRO_RELEASE = "4.5"` is shown in the debug log; all file headers, `package.json` and `STATUS.md` read 4.5. |
| Data Sources | Google Sheet / CSV rebuilt: one source at a time, rows linked to tour elements by Title / Tag / Subtitle / id, parent jump, test report, everything off by default (section 20). |
| Clicking outside | New `closeOnOutsideClick { mobile, desktop }` setting (default `true` = earlier behaviour) with matching toggles in the General tab (section 17). |
| Search field | A very long text no longer runs outside the field: the field and the "no results" box use `box-sizing: border-box`, the text is cut with an ellipsis when it does not fit. |
| Control Panel sync | Every Control Panel field was changed and followed to the plugin (248 fields reach it unchanged); fixed: `minSearchChars` is no longer overwritten by a stale `minSearchLength`, the Advanced tab animation defaults now live at the top level (`animations`) instead of inside `googleSheets`, the built-in cache time of a Google Sheet is 60 minutes in the plugin as in the Control Panel. |
| Maintenance | `search-v4.js` documents itself with numbered comments; `npm run toc` renumbers them and rebuilds the Table of Contents at the end of the file. |

## 20. Data Sources — Google Sheet / CSV

An optional table (Google Sheet or CSV file) changes how tour items **look in the search results**: title, description, image and tags. It never changes the tour. Everything is **off by default**.

### Settings (`googleSheets` in the configuration)

| Key | Meaning |
|-----|---------|
| `useGoogleSheetData` | `false` = tour data only. `true` = use the source below. |
| `useLocalCSV` | `false` = Google Sheet (`googleSheetUrl`), `true` = CSV file (`localCSVUrl`). Only one source is active. |
| `googleSheetUrl` | Any Google Sheets link: sharing, edit, published (`pub`, `pubhtml`) or `export` / `gviz` links. It is converted to a CSV address automatically; a `gid` is kept. |
| `localCSVUrl` | Path inside the `search-pro-v4` folder (default `business-data/search-data.csv`) or a full `https://` address. (Older `localCSVDir` + `localCSVFile` still work.) |
| `caching` | `enabled` / `timeoutMinutes` / `storageKey`: remembers an online sheet in the browser, keyed by its address. Off by default; never used for CSV files. |

Retired (ignored when present in an old configuration): `includeStandaloneEntries`, `useAsDataSource`, `csvOptions`. The Control Panel's Data Sources tab shows one choice: **Tour only / Google Sheets / CSV file**, a **Test this source** button and an example CSV.

### Columns of the sheet (first row = column titles)

`id`, `tag`, `name`, `description`, `imageUrl`, `tags`, `elementType`, `parentId`. Titles are forgiving (`ID`, `Title`, `Subtitle`, `Image URL`, `Type`, `Parent` ...). Columns may be separated by a comma, semicolon or tab.

### How a row is matched to the tour

1. **Which element.** The `id` cell (the `tag` cell is a second chance) is compared, exactly and ignoring letter case and extra spaces, with the element's **internal id**, **Title** (`data.label`), **Tags** and **Subtitle**. When several elements match, the strongest kind wins (id, then Title, Tag, Subtitle). Partial titles do not match.
2. **Narrowing.** `elementType` prefers elements of that type (soft: a mismatch only produces a note). `parentId` (matched by the same rule against panoramas / 3D models) keeps only elements inside that panorama. A title shared by several elements with no `parentId` enriches all of them and is reported.
3. **Result.**
   * *Linked*: the element's own result shows the sheet's filled cells (`name`, `description`, `imageUrl`, `tags`); empty cells keep the tour's value. The tour title stays searchable. Clicking behaves exactly as before.
   * *Parent*: the element is not in the tour but `parentId` is: a result built from the row that **jumps to the parent panorama / 3D model**.
   * *Not used*: neither is found, or the element was already described by an earlier row. Not shown in the search; listed in the report.
4. A sheet never moves a result into another group: the group is the element's real type.

The tour exposes no custom id: panoramas / videos / 3D models have an internal id, Title, optional Subtitle and Tags; overlays have an internal id and a Title (often repeated, hence `parentId`) and rarely Tags.

### API and report

* `tourSearchFunctions.getDataSourceStatus()` — `{ state: "off" | "ok" | "error", source, url, rows, message, code, columns, ... }` with a plain-language `message`.
* `tourSearchFunctions.getDataSourceReport(settings?)` — Promise of `{ status, summary: { rows, linked, parent, notFound, duplicate }, items: [...] }` for the applied source or the settings given; changes nothing.
* `tourSearchFunctions.getTourInventory()` - what the open tour holds by kind and what the search reads of it (see "Scan of the open tour" in section 17).
* The Control Panel's **Test this source** button asks an open tour for this report through the same-origin `BroadcastChannel("tourSearchChannel")` (`searchProDataSourceReportRequest` / `searchProDataSourceReport`). With no tour open it only checks the connection and the columns. The result is shown in three blocks: **Connection** (rows read, separator, the columns found with the unused ones struck out), **How the rows relate to your tour** (five tiles - All rows, Linked, Jump to a parent, Not shown, Shown with a warning - which are also the filters) and **Rows** (a table with `#`, id, title, result, goes to and notes; a filter box, 25 / 50 / 100 rows per page, and **Download report (CSV)** with every row). It opens on the rows that need attention. Tested with 6,000 rows; text from the sheet is always shown as text.
* Matching rows to tour elements uses look-up tables built once per pass (by id, Title, Tag and Subtitle) instead of scanning the whole tour for every row: 10,000 elements x 8,000 rows took 1.6 s before and about 20 ms now, with identical results.
* Changing the source while the search box is open refreshes the visible results at once.

### What decides what a sheet can show (checked 2026-10-10)

A sheet is applied AFTER Content and Filtering have decided what is in the search (it changes how the elements that are there look). Consequences, verified on the test tour:

* **Pictures:** the sheet's `imageUrl` shows only while Display > Show Pictures in Results is on (`thumbnailSettings.enableThumbnails`, off by default), for a kind whose Picture switch (Display > Element Types, `thumbnailSettings.showFor`) is not off, and not on phones set to icons. `tags` follow Display > Show Tags in Results and `description` follows Show Subtitles in Results (both on by default). The Control Panel says so on the Data Sources page: a notice appears at the top while a source is on and one of these switches is off, and the column table names the switch.
* **Filtering uses the tour's own names and tags:** a Names filter does not see a title from the sheet (hiding "kitchen" does not hide a hotspot the sheet renamed "Kitchen Door"), and Tags Show Only does not count tags the sheet gives. An element hidden by Content or Filtering is not in the pool a row is matched against.
* **The Test report says so:** a row that finds nothing gets the note "Hotspot results are switched off in Content > What Is Searched, so this row cannot be used." when its declared kind is off, otherwise "Content or Filtering settings hide some elements. If this row is about one of them, it cannot be used." when any Content switch (other than Photo Albums, Maps and Containers, which are off or separate by default), unnamed rule, shortest name or Filtering filter is on (`_contentOrFilteringHides`, `_sheetHiddenNotes`). A row that "jumps to a parent" whose result would be hidden gets "Hidden by Content or Filtering settings, so this row is not shown." (`_sheetReportNotes`).
* **Unnamed elements:** a row can still describe an unnamed element by its internal id while Completely Blank is on (default); with it off the element is not indexed and the row finds nothing.
* Appearance > Tag Names (other names, hidden tags) are applied after the sheet, so the tags of a sheet are renamed or hidden too.

### A JSON file as a source (not built; only if a builder asks)

Version 3 could read `business-data/business.json`, a list of `{ id, name, description, matchTags: [...], imageUrl, localImage }`. It was dropped in 4.5 on purpose: those fields are a subset of the columns above (no `elementType`, no `parentId`, no subtitle), and the people who build the tours work in spreadsheets, where a missing comma does not break the file. It stays a possible feature **by request** (for example a builder whose CMS or API already produces JSON). **Cheapest route:** let the existing "CSV file" box (`googleSheets.localCSVUrl`) also accept an address that ends in `.json`, with the same column names as keys (`tags` as a list or as text), turn the objects into the same row objects the CSV reader produces, and let everything after that (matching, the report, the Test button) run unchanged. What it needs: the reader in `search-v4.js`, the row count and the clear messages of `localCheck` in `data-sources-tab.js` (a JSON syntax error must be explained in plain words), the label and hint of the CSV box, a test with a small `.json` and the Knowledge tab text. Not planned; do not add it without a request.

### Container Search (investigated, not yet part of the sheet)

`includeContent.containerSearch` adds results for container names typed in the Content tab. 3DVista containers (`Container` class) expose only `data.name`; the name is not unique (this tour has three called "Global"), and a click toggles the first container with that name (or uses `window.tourMenu.toggleContainer` when a custom menu defines it). A configured name that does not exist is still shown (and does nothing). Sheet rows for containers are planned: `elementType = Container`, `id` = container name.

## 21. Compatibility With 3DVista Builds

The plugin reads the tour only through the player's public API (`get("...")`, `getByClassName`, `bind`, the helper functions of the tour's own script) and never through the minified property names, which change with every build (a button has the keys `AD, o, Pra...` in one build and `cd, es, oH...` in the next).

| Build | Export | Checked |
|---|---|---|
| 0.2235 | November 2025 (`backuptour/` next to the test tour: 5 panoramas, 70 results) | the reference every suite was written against |
| 0.2373 | October 2026, made with the newest 3DVista, every kind of element added | 2026-10-11, see below |

Tested with 3DVista **2026.1.2**, the newest version (stated by the owner on 2026-10-17). The owner decided that this number does not go into the buyer documentation.

**Identical in both builds (verified by running the same probes on both exports, `_maintenance/audit/evidence/compat/`):** `rootPlayer.mainPlayList` (and `tour.mainPlayList` undefined), the item classes (`PanoramaPlayListItem`, `Video360PlayListItem`, `VideoPlayListItem`, `Model3DPlayListItem`, `PhotoAlbumPlayListItem`, `MapPlayListItem`), the media classes, `data.label / subtitle / tags`, `thumbnailUrl` (now `.webp` files), `media.get("overlays")` and the overlay classes the plugin knows, the 3D classes (`InnerModel3DObject`, `SpriteModel3DObject`), `MediaAudio`, `Container` / `Window` / `Player` with `data.name`, the events (`tourLoaded`, `tourEnded`, `tourInitialized`, `begin`), `TDV.PlayerAPI.mobile`, `rootPlayer.showWindow`, `rootPlayer.setModel3DCameraSpot`, `tour.focusOverlayByName`, the search button code inside the skin (`eval` of the same text), the Data Sources matching (name, id, 3D elements) and the Control Panel (all nine tabs). Clicking every result gave the same outcome on the old export before and after the changes below (74 of 74), the new export gave 64 results and no error (63 since 2026-10-12, when the flat video in a window without a size was left out). The page of the new export does not change how the plugin looks (computed styles of every plugin element identical).

**What the newer 3DVista and the test tour added, and what the plugin does about it:**
* **A media that is not in the main playlist.** 3DVista's "Include into PlayList" switch (3D models, panoramas, videos) takes a media out of the main playlist and gives it a playlist of its own (`playList_...`, one item), which the tour's buttons select. The plugin used to build its index from the main playlist only, so such media were missing from the search (the first scan of the new tour: 3D models 3 found, 0 in the search; flat video 1 found, 0). `indexOutsideMedia` now adds every panorama, 360 video, flat video and 3D model (with its hotspots and objects) that another playlist holds, with `source: "extra"`, `navPlaylist` and `navIndex`; a click selects it in that playlist after `_revealViewerOf` has shown its viewer. A media that no playlist holds at all (the test tour has "Extra-Room-01") cannot be opened by anything and is left out; the scan says so ("N of them are in no playlist"). **A media shown in a hidden window that has no width and no height is left out too (2026-10-12):** the test tour's `flat-video-01` lives in a `Window` 3DVista created by itself (`Window40870`, no `width`, no `height`; the owner never placed it, the windows of the tour's own buttons have `90%` or `400`), and a result for it opened a tiny black box. `_hasNoRoomToShow(entry)` walks from the viewer outwards (`_viewerChainOf`) and finds a hidden `Window` without size; such a media is not indexed (`indexOutsideMedia`) and the scan counts it ("sits in a hidden window that has no size"). Give the window a size in 3DVista and it becomes a result. The video hotspots (`QuadVideoPanoramaOverlay`, tag "FLAT VIDEO" in the test tour) are unaffected: they are results of kind Video and open the video the way the tour built it.
* **A viewer in a hidden window or container.** A flat video lives in a `Window` the tour keeps hidden, a floor plan in a hidden `Container`. `_revealViewerOf` walks from the viewer up through the containers (`children`) and shows what is hidden: a `Window` with `rootPlayer.showWindow(w, null, false)` (what the tour's own buttons call), anything else with `set("visible", true)`. This also fixed the floor plan result (before, the floor plan stayed hidden) and the photo album result of the older tour (its container stayed hidden). The tour author may want it closed, so the setting `showHiddenViewers` (default `true`, General > Opening and Closing > **Open Hidden Windows and Containers**) decides: with `false` the media is still selected but `_revealViewerOf` returns at once and the window stays hidden.
* **Main playlist versus root playlist** (the notes on "Playlist discovery", checked against the code 2026-10-11). `PlaylistUtils.getMainPlayList` finds `rootPlayer.mainPlayList`, `getRootPlayerPlayList` the playlist the player was started with; started from the tour's button (`this` = rootPlayer) the two are the same object, started with `window.tour` they are not. The old index then held every media twice (main items `0..n-1`, then the same items again at `mainLength + i`, `source: "root"`) and a flat video received the overlays of the panorama beside it. Now `prepareFuse` skips a root item whose media is already indexed from the main playlist, and every document of a root or outside item carries its **local** index in the playlist it belongs to plus `navPlaylist` / `navIndex` (`_attachNavigation`), so the click handler selects the item in that playlist; the offset index the notes warned about is no longer stored. `_getOverlays` reads the media's own `overlays` first, and a flat video is given none. Container results (`source: "container"`) are not playlist items: they toggle the container directly and never look for a playlist (the "No valid playlist found for navigation" error of the notes came from a container click that reached the playlist branch). Check: suite `compat` section [4b] (both start paths give the same 64 results (63 since 2026-10-12), no media twice, no overlay on the flat video).
* **Popup hotspots** (`PopupPanoramaOverlay`, new): mapped to "Hotspot"; before, they became unnamed "Element" or "Video" results, and an "Element" result did nothing when clicked (now an overlay of any type navigates like a hotspot).
* **`PhotoAlbumEditable...`**, an unnamed photo album 3DVista creates behind a popup hotspot: no longer a result and not counted by the scan.
* **No `fonts.css` / `fonts` folder** when the tour uses no custom font (the test tour uses Arial). The Control Panel asks for `../../fonts.css`, gets a 404 (one red line in its console) and shows no "Fonts of This Tour"; a tour with custom fonts is expected to behave as before (not testable with this export).
* New data keys the plugin ignores: `panoramaToPanoramaModelTransitionEnabled` on a 3D model, `group` / `groupIndex` on overlays.

**How to check a new export:** put it in the folder of the plugin (the old one stays in `backuptour/`), run `zsh run-tests.sh compat` (it serves the current export on port 8767 and works out what to expect from the tour itself), and read `_maintenance/audit/evidence/compat/probe_tour.js new` for the counts. The other suites keep running against the old export (port 8765; `TESTTOUR=<folder>` to use another one).

---

## 22. The Documentation Pages

**Where (since 2026-10-17):** `search-pro-v4/documentation/` holds five pages and one text file, all in the look of the Control Panel (the same tokens and components, `DESIGN.md`): `index.html` (Start), `installation-guide.html`, `settings-reference.html`, `third-party-components.html`, `terms-and-conditions.html`, `terms-and-conditions.txt`, plus `css/docs.css`, `js/docs.js` and `fonts/` (Geist and Geist Mono with `OFL-LICENSE.txt`). The folder is self-contained and opens from a file or from a server: no CDN, no style attribute, icons are inline SVG. Nothing in the product links to it. The old folder (the Version 3 guide, the 4.6 installation guide, the old Terms) is archived in `Archieved/Production-archieved-V3-2025/documents/archive/documentation-release-4.6/`; it is also in git (tag `release-4.6`) and in `_maintenance/backups/before-documentation-2026-10-17/`.

**How the pages are made.** They are generated, so what they say is checked when they are built. The generator is in `_maintenance/docs-generator/` (local only, like the test harness): `extract-settings.js` opens the real Control Panel, reads every setting (label, help text, hint, kind, choices, range, default, what it needs) and the plugin's own defaults from a tour with no settings file, and writes `settings-raw.json`; `build-docs.js` writes the pages from it and runs the project's Prettier over them (so `npm run format` changes nothing). Words that are not in the Control Panel are in `pages/*.js`. From real files, never typed twice: the button code (`extras/Button.js`), the two lines for `index.html` (checked against the test tour's own `index.html`), the table of default pictures (the Placeholder File defaults of the Display tab, checked against `assets/`), the versions of the libraries (read from the file headers; the build stops if two files disagree), the Terms (one source, `src/terms-v4.txt`, rendered as the page and shipped unchanged as the `.txt`). To change a page: edit its module in `pages/`, run `node build-docs.js`. After any setting is added, renamed or given another default: start a server (`python3 test-harness/serve-tour.py <tour> <plugin> 8791`), run `node extract-settings.js 8791` and `node build-docs.js`, then `zsh run-tests.sh docs`.

**The settings reference** has one entry for each setting of the Control Panel (267 entries, 412 keys of the settings file: the 403 fields and icon buttons plus the six Filtering lists and the three lists the page keeps in code: `display.typeOrder`, `appearance.tags.rename`, `includeContent.containerSearch.containers`). The two tables of kinds (Display > Element Types, Content > What Is Searched) are one entry for each column plus a table of the defaults of every kind. Where a card holds no field (Animations > Preview, Advanced > scan) the page says so.

**Defaults.** The reference states the Control Panel's value. The Control Panel and the plugin agree on every default except two, both known and left alone: `appearance.searchField.focusRing.width` (1 in the Control Panel since 2026-10-12, 0 in a tour with no settings file) and `thumbnailSettings.iconSettings.iconColor` (`#6e85f7` in the Control Panel and in every code path of `search-v4.js` that builds a configuration, `#3b82f6` in the documented block near the end of the file, which is what `getConfig()` returns in a tour with no settings file; the icons only show with Display > Show Icons in Results). The build stops when a third difference appears, so it is decided on purpose.

**Content rules (the owner, 2026-10-17).** The support contact stays a placeholder ("provided after your purchase"): the 3DVista marketplace does not allow contact details before the purchase is complete. The pages carry "Coming From Version 3" and the third-party table, no note about the Bottom-bar button (item B1 of section 18) and no tested-version line. Terms: "Search Pro V4 for 3DVista Virtual Tours", version 4.0, October 2026. **Date:** first month and year on every page; the same day the owner removed it, so now only the Terms carry it (their "Last Updated"); every other page says "Version 4.0" and nothing else, in the sidebar, the top bar, the footer and the header.

**Clean-up round (the owner, 2026-10-17, same branch).** (1) `css/search-v4-bck.css` deleted (nothing loads it: the plugin and `search-v4-bck.js` both load `css/search-v4.css`; the same bytes are in `_maintenance/backups/before-4.5-release/` and `backups/originals/search-css-and-js-before-2026-10-05/`; `audit/evidence/compat/probe_original.js` reads that copy). (2) **Each page has its own color** for its icon tile and its title (Start violet, Installation Guide blue, Settings Reference green, Third-Party Components orange, Terms and Conditions rose): `data-page` on `<main>` and four custom properties in `docs.css`; the sidebar is not touched. (3) **The page you are on folds and unfolds its list in the sidebar** when you click it again (`aria-expanded`, `aria-controls`, a chevron that only shows with JavaScript; without it the list stays open); on a phone the menu stays open while it folds. (4) **Printing:** the title tile and the card tiles printed as empty squares (a white icon on a background that print drops); `print-color-adjust: exact` now keeps the colors whatever the "Background graphics" box says, and headings stay with what follows. (5) Start says the folder goes "at the same level as your tour files" (no "beside"); the Installation Guide header lost the Version 3 sentence and the version line; step 6 of Start names `search-pro-config.js` (the owner edited this in the generated page; it is now in `pages/index.js`, so a rebuild keeps it).

**The Terms.** `src/make-terms-source.js` made `src/terms-v4.txt` from the archived Version 3 terms with exact, asserted replacements and a final check that no email, phone number, website, emoji or "v3" is left. Changed: the title, version and date; the product name; the Core Files (`search-v4.js`, `css/search-v4.css`); 7.4 (names the Third-Party Components page); the contact lines (10.1, 10.3, 10.4, 10.6, 12.3, 17.3, 20.1, 20.5, 29.2, 29.4, all of 30, 31, the closing line) which now point to "the contact details provided after your purchase, in the contact file that comes with it" (the file's name is not given); the support table of 10.8 (words instead of symbols); one list label of 29.1 (the letter "e" became "c"); and **one clause added, 17.1(e)**, that says the plugin requests nothing from other websites except what the builder sets up and backup copies of its libraries (verified in the code: Fuse.js and the icon fonts from `cdn.jsdelivr.net` / `cdnjs.cloudflare.com` only when their own copies cannot be loaded, a Google Sheet from `docs.google.com` only when chosen). Everything else is the owner's wording, unchanged. **Open for the owner and a lawyer:** 9.1 still promises free lifetime updates (does it cover a Version 3 buyer's move to Version 4?); 11.1 and 14.3 still say $149 USD (is that the Version 4 price?); "Core Files" still means only the two engine files, as in Version 3 (the Control Panel and the other files are not covered by clauses 4.4(e) and 5.3).

**Facts found while writing, recorded here.** (1) The button code of Version 3 and Version 4 is byte for byte the same. (2) A real Version 3 settings file (365 values) read by the Version 4 plugin as it is: 364 taken as written, no error, the search works. Loaded into the Version 4 Control Panel: no error, 266 of the 271 values both versions know come across unchanged (the other five: two element-type lists, two Unnamed Items switches whose place moved, an empty easing), 94 Version 3 values have no place in Version 4 (the old Business kind, `searchSettings.*`, per-kind lists such as `useAsLabel.panoramas`). Probe: `_maintenance/docs-generator/v3_migration_probe.js`. (3) `assets/panorama-default.jpg` is not used by default: the Placeholder File of Panorama is `default-thumbnail.jpg`; the guide says so. (4) Two small corrections made on the way: the comment in `extras/tour_index_update.txt` said the engine loads "AFTER config file" (now BEFORE, as everywhere else) and a Display tab note said "greyed" (now "grayed").

**The suite `docs`** (`_maintenance/test-harness/suites/docs_test.js`, 86 checks, in `run-tests.sh`): rules that hold on every page (no style attribute, no outside link or request, no contact details, American spelling, "Phone", Title Case, headings in order, links and anchors that exist, contrast of the text colors); what the pages say is true (button code, the two lines, every file of the plugin folder named in the upload list, the pictures, Terms page equals Terms text line by line); nothing drifted (the pages are rebuilt from the live Control Panel and must equal the files on disk byte for byte; every field and list of the Control Panel is documented and nothing else is); fit (320 to 1440 px, fonts, JavaScript off); behavior (phone drawer, the fold of the menu, Copy, filter, "On this page", print, no request leaves the page), and the look (each page has its own tile and title color at a readable contrast, the sidebar is the same on every page, a PDF printed with Background graphics off still shows the tiles and their icons).

---

*Source-verified against: `search-pro-v4/search-v4.js` (v4.6, 10/13/2026), `dashboard/js/control-panel-v4.js`, and `index.html`*
