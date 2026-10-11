# 3DVista & Search Pro V4 — Integration Master Reference

**Version:** 4.5  
**Last Verified Against:** `search-v4.js` (Search Pro V4.5, rev 10/07/2026)  
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
19. [Release 4.5 — What Changed](#19-release-45--what-changed)
20. [Data Sources — Google Sheet / CSV](#20-data-sources--google-sheet--csv)

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
2. **The plugin's own automatic start looks for the tour, and never finds it.** It waits up to 15 seconds for `window.tour.mainPlayList` (see section 4: that property does not exist in the test tour). It then writes `Tour not ready after waiting for 15000 ms` to the console and gives up. This warning is harmless and is the expected result in this tour.
3. **A visitor presses the search button.** The button action calls `window.tourSearchFunctions.initializeSearch(this)` with `this` = the root player (section 9). This builds the search index (and loads Google Sheet / CSV data if switched on) and opens the search.
4. **Every later press only opens and closes** the search. The index is built once.

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

**search-v4.js must load before search-pro-config.js.** The config file calls methods on `window.tourSearchFunctions` which is defined by `search-v4.js`.

---

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

### Keyboard shortcuts of the Control Panel (release 4.5)

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + S` | Apply Settings |
| `Alt + Shift + D` | Download the configuration file |
| `Alt + Shift + L` | Load a configuration file |
| `Escape` | Dismiss the open dialog (same as Cancel) |

`Ctrl/Cmd + R` (reload), `Ctrl/Cmd + D` (bookmark) and `Ctrl/Cmd + L` (address bar) are the browser's own shortcuts and are not taken over. Reset All has no shortcut.

### Allowed Control Panel addresses (release 4.5)

By default the tour accepts live updates (`postMessage`) from its own address and from the page that embeds it. When the Control Panel is hosted at a **different** address, list that address in **Advanced → Control Panel Connection** (for example `https://panel.example.com`, several separated by commas). It is stored as `controlPanel.allowedOrigins`, exported with the configuration file, and may be an array or comma-separated text; entries are compared without a trailing slash and ignoring letter case. Cross-origin popups that merely opened the tour are never trusted unless listed. With the list empty (the default) nothing changes.

### Closing the search by clicking outside (release 4.5)

By default the search bar closes when the visitor clicks (desktop) or taps (mobile) anywhere outside it, as in earlier versions. The setting `closeOnOutsideClick: { mobile: true, desktop: true }` (Control Panel: **General → Opening and Closing**) turns that off per device type: with `false` the search stays open until the visitor uses the close button, `Escape`, the tour's own search button or chooses a result. It is separate from `autoHide`, which only decides whether the search closes **after a result was chosen**. The decision is read at the moment of each click, so a change made in the Control Panel reaches an open tour immediately. On touch devices a tap over the 3DVista panorama itself is swallowed by the player (before and after this setting), so it never reaches the page; taps on any other part of the page do.

### General settings (search bar placement, phones, keyboard, searching, texts)

The General tab of the Control Panel has four sections (Opening and Closing, Search Bar, Phones, Visitor Texts); every setting below is also a plain setting of the plugin. The searching settings below moved to the Advanced tab as **Search Tuning** because they need decisions most tour creators do not have to make; the plugin settings did not change.

* **Opening and Closing:** `autoHide`, `closeOnOutsideClick` and `openOnStart` (each `{ mobile, desktop }`, `openOnStart` is off by default and, when on, starts the search by itself once the tour has STARTED: the main playlist has items and a selected panorama, which 3DVista keeps at -1 while a start screen waits (loading screen Initialization `On Click`, `On Click or Video Finished`, `When Video Finished`). Without it the search still starts lazily with the first press of the tour's search button; the older automatic start looked for `window.tour.mainPlayList`, which this 3DVista build does not expose, so it never ran. The Control Panel's saved settings (`searchProLiveConfig`) are applied again on every page load, quietly, before the tour starts), `keyboard.escapeCloses` (default `true`: one press of Escape clears the typed text and closes the search; `false` = the plugin ignores Escape and does not swallow it, so the tour keeps its own Escape behavior) and `keyboard.shortcut` (default `true`: Ctrl / Cmd + K opens the search).
* **Search Tuning (Advanced tab, formerly "How Searching Works" in General until 2026-10-10; since 2026-10-10 it also holds the five fields of the former "Search Settings" section, so the Advanced tab has ONE search section with four subsections: When Searching Starts, Results, How Closely Results Must Match, What Matters Most):** `minSearchChars`, `searchSettings.typingDelay { desktop: 150, mobile: 300 }` (milliseconds to wait after typing; read at every key press), `searchSettings.resultLimit` (0 = all; typed searches only, `*` always lists everything), `searchSettings.behavior.threshold` (0 = exact, 1 = anything, default 0.4) and `searchSettings.fieldWeights { label 1, subtitle 0.8, tags 0.6, parentLabel 0.3 }` (must be above 0; a weight of 0 or less falls back to the default). The old Advanced-tab fields `searchSettings.debounce`, `searchSettings.maxResults` and `searchSettings.fuzzySearch.threshold` did nothing and were replaced by these. The five former Search Settings fields are `searchSettings.highlightMatches`, `searchSettings.caseSensitive`, `searchSettings.fuzzySearch.enabled`, `searchSettings.behavior.minMatchCharLength` and `searchSettings.behavior.useExtendedSearch`; Restore Defaults of the section resets all of them.
* **Search Bar (desktop):** `searchBar.width`, `searchBar.zIndex` (default 9999) and `searchBar.placement { vertical: "top" | "middle" | "bottom", horizontal: "left" | "center" | "right", offsetX, offsetY }`. A bar placed at the bottom opens its results upwards, a centered bar is centered with auto margins, a bar in the middle sits at half the screen height. The older `searchBar.position { top, right, left, bottom }` still works when `placement` is not set (the Control Panel converts it when it loads a file); every placement is kept inside the screen (`max-width`).
* **Phones:** `phoneDetection` (`"width"` = the phone layout is used up to `mobileBreakpoint`; `"tour"` = whenever the tour itself loaded its phone version: 3DVista loads `script_mobile.js` on phones and `script_general.js` on computers and iPads, decided by the device, not by the width), `mobileBreakpoint` (the Control Panel also writes it to `searchBar.mobileOverrides.breakpoint`, so there is one breakpoint), `searchBar.mobileOverrides { enabled, width, maxWidth }` and `searchBar.mobilePlacement { vertical: "top" | "bottom", offsetY, margin }` (older `searchBar.mobilePosition` still works when `mobilePlacement` is not set). With the separate phone layout off, phones use the desktop placement, kept inside the screen. The Mobile Visibility Behavior and Element Triggering settings are no longer in the Control Panel (a 3DVista page does not scroll, "toggle" is disabled in the plugin); the plugin still accepts them in saved settings.
* **Visitor Texts:** `searchBar.placeholder` and `texts { noResults, minChars (with {count}), clearButton, resultSingular, resultPlural, parentPrefix, tagsLabel, containerHint (set in the Content tab) }`. A text that is empty falls back to the English one; the text is escaped where it is drawn (so the Control Panel stores it exactly as typed, including `&`). `texts.noResults` replaces the text the page came with (the icon stays).

### Appearance settings (colors, text, tags, focus)

The Appearance tab has four sections in the order a visitor meets them, each with its own Restore Defaults button and split into subsections: **Search Field** (Colors, Corner Radius, Focus Ring, Typed Text, Placeholder Text), **Results List** (Colors, Corner Radius, Result Text), **Group Headers** (Colors, Layout and Size) and **Tags and Highlight** (Highlight of Typed Letters, Tag Colors, Tag Look, Tag Border). Every field is a plain `appearance.*` setting of the plugin; a value from the Control Panel is read where it is used, with a safe fallback.

* **Colors:** `appearance.colors.*` (search background / text / icon, results background / hover / text / subtitle / subtext, `resultBorderLeft`, group header and count, highlight, tag colors, placeholder). `resultIconColor` is the one icon color of the result list; the Display tab's icon color writes the same setting (two-way mirror in the Control Panel). The unused `tagHover` color is gone (it was set but no stylesheet rule used it).
* **Accessible defaults:** the default placeholder color and group-count color are `#5f6f86` (about 5:1 on white; the earlier `#94a3b8` was 2.6:1) and the placeholder strength `appearance.searchField.typography.placeholder.opacity` is 1 (it was 0.7, which made the placeholder fainter still). A tour that saves its own value for any of these keeps it unchanged.
* **Text of the search field:** `appearance.searchField.typography` (`fontFamily`, `fontSize`, `fontWeight`, `fontStyle`, `letterSpacing`, `lineHeight`, `textTransform`), `.placeholder` (same keys plus `opacity`) and `.focus` (`fontSize`, `fontWeight`, `letterSpacing`: the text while the field is active). The three `.focus` values are no longer on the page (the focus ring replaces them); the plugin still reads them from older saved files and Restore Defaults of Search Field resets them. Sizes are text with a unit ("16px", "1.5" for line height); a number is read as pixels.
* **Text of the results list (new):** `appearance.searchResults.typography { fontFamily, nameSize, descriptionSize, parentSize, groupTitleSize, groupCountSize }`. The defaults are the sizes the list always had (14px, 12px, 11.2px, 14px, 14px), so nothing changes until a value is changed; a size is only applied when it looks like `14px`, `1.2em` or `0.9rem`. `fontFamily` defaults to the system font stack; "inherit" or a font name from the tour's `fonts.css` is allowed (only letters, digits, spaces, commas, quotes, dashes and dots are accepted).
* **Focus ring (new):** `appearance.searchField.focusRing { color: "#3b82f6", width: 0 }`. Width 0 (default) draws no ring, as before; 1 to 6 pixels draws a ring along the inside edge of the field while it is active (it is drawn inside because the search container clips everything outside the field).
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

The Display tab has five sections, each with its own Restore Defaults button: **What Results Show**, **Pictures**, **Icons**, **Element Types** and **Unnamed Items**. The two big switches ("Show Pictures in Results" and "Show Icons in Results") hide the settings that only matter while they are on. The Element Types table keeps all seven columns visible; the columns of a switch that is off are greyed and locked (their values stay saved), and a state pill on top of each column group (Pictures, Icons) says why.

* **What Results Show:** `display.showGroupHeaders`, `showGroupCount`, `showTagsInResults`, `showSubtitlesInResults`, `showParentInfo` (the parts of one result), `display.onlySubtitles` (**Subtitle Instead of Name**, default `false`: a result that has a subtitle shows it in place of its name and no subtitle line is drawn; changing it rebuilds the search index because the label is chosen there; it had no Control Panel field before 2026-10-10), `display.rowSpacing` (`"compact"` | `"normal"` | `"roomy"`, default `"normal"`; sets `--result-item-padding` and `--result-item-gap`) and `display.descriptionLines` (1 to 5, default 2; sets `--text-overflow-lines`). All of them are live: `updateConfig` redraws the list for `display`.
* **Pictures:** `thumbnailSettings.enableThumbnails` (the master), `showFor.<type>` (one switch per element type, case-insensitive, containers included), the picture source order, size and border, shape and `thumbnailSettings.alignment` (`"left"` | `"right"`, default `"left"`), the small type icon on pictures (`typeBadge`: `none` | `all` | `borrowed`), a separate look on phones, placeholders and hover zoom. Details of the picture pipeline are in the thumbnail section above.
* **Icons:** `display.showIconsInResults` (the master), `thumbnailSettings.iconSettings.enableCustomIcons`, icon look and hover effect. There is no "Use Font Awesome" switch any more: the plugin loads an icon library by itself when a custom icon needs it (see "Icon libraries" below). `enableFontAwesome` and `fontAwesomeUrl` still work in a settings file (`enableFontAwesome: true` loads Font Awesome at once; an own `fontAwesomeUrl` is tried first). The shared icon color is one setting with Appearance (`core.mirrorToPluginNames`).
* **Element Types (one table, 18 rows):** per type the name shown (`displayLabels.<Type>`), the picture switch (`thumbnailSettings.showFor.<type>`), the picture size (`thumbnailSettings.sizeByType.<Type>`), the placeholder file (`thumbnailSettings.defaultImages.<Type>`, a file name that is prefixed with `assets/`, or a full address; it must end in an image extension) and the icon switch and icon (`thumbnailSettings.iconSettings.showIconFor.<type>`, `customIcons.<Type>`). The icon is chosen in **one shared icon picker** with five kinds: Font Awesome, Bootstrap Icons, Ionicons, Emoji and Picture Address. The picker has a **Current Icon** row (what the type shows now, with **Back to the Standard Icon**, which also empties the picture box and switches to the tab of the standard icon), a search box, a grid of at most 400 icons, and for pictures a **Clear** button (empties the address box) and **Remove Picture** (back to the standard icon). Restore Defaults here resets names, switches, sizes and files of the types and keeps the icons.
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

* **What Is Searched:** one table, one row per kind of element (Panorama, 360 Video, Flat Video, Photo Album, Map, Hotspot, Polygon, Video, Webframe, Image, Text, Projected Image, Other Elements, 3D Model, 3D Hotspot, 3D Model Object), each with a plain sentence saying what it is and an "In Search" switch (`includeContent.elements.include*`; `includeElements` = "Other Elements" = anything the plugin cannot classify; Photo Albums and Maps are off by default). Include All / Include None switch the 16 rows at once. A kind that is off is skipped at every index site (`_shouldIncludeElement`). Containers are not a row: they have their own section.
* **Unnamed Items:** an element is *unnamed* when its raw title (`data.label`) is empty. Three switches decide which unnamed elements are in the index, checked in this order: it has a subtitle (`includeContent.unlabeledWithSubtitles`, default on), else it has tags (`unlabeledWithTags`, default on), else it has nothing at all (`completelyBlank`, default on: such an element is listed as "[Unnamed Item]" unless Display > Unnamed Items names it otherwise; the test tour has one blank panorama). What an unnamed element is *called* is Display > Unnamed Items (`useAsLabel.*`). `includeContent.elements.minLabelLength` ("Shortest Name Shown", 0 = no limit) leaves out any element whose resolved name is shorter.
  * Implementation: `_isUnnamedExcluded(rawLabel, subtitle, tags)` is called by `_shouldIncludeElement` as its 5th argument, from every index site that has a raw label (panoramas, 360/flat videos, albums and maps, 3D models, 3D objects and hotspots, overlays, sheet rows that jump to a parent). Before 2026-10-10 the three switches did nothing and `skipEmptyLabels` was only checked for overlays (the label passed to `_shouldIncludeElement` was already the fallback name, so its own check never fired); unnamed panoramas were always listed.
  * `includeContent.elements.skipEmptyLabels` stays in the plugin for older files: `true` leaves out every unnamed element (same as the three switches off). The Control Panel no longer shows it; it keeps it in step (`true` = all three off) and reads a file with it ON as the three switches off. The built-in block used to say `true`, which hid every unnamed overlay by default (and left unnamed panoramas listed); it now says `false`, so with the three switches on (the defaults) every unnamed element is found: overlays included, which were hidden before. 3DVista names every element in its editor, so unnamed overlays are rare.
* **Containers:** a *container* is a 3DVista element that holds other elements (a menu, a gallery, a floor plan); the author drops it on the tour canvas and names it. It is not found by itself: its name is typed in the Control Panel (one per line, `includeContent.containerSearch.containerNames`, an array). A click toggles the first container with that name (see "Container Search" in section 20). "Find Containers" is `includeContent.elements.includeContainers`; the Control Panel mirrors it into `containerSearch.enableContainerSearch` (the plugin needs both; a file with the container search off is read as Find Containers off). "Line Under a Container" is `texts.containerHint` (default "Click to toggle container"; it used to be hard-coded; changing it rebuilds the index).
* **Removed from the page** (the plugin still accepts them): the twelve "Label Field" / "Fallback Field" selects (`displayLabels.panoramas...`, `useAsLabel.panoramas...`: nothing ever read them), `includeContent.searchableProperties` and the stray top-level `containerNames` of the old page. The Control Panel drops these keys when it reads a file.
* Files: `dashboard/tabs/content-tab.html` (generated), `dashboard/js/content-tab.js`, `core.normalizeContentSettings` / `core.syncSkipEmptyLabels` / `mirrorToPluginNames` in `control-panel-core.js`; test suite `content` (60 checks).

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

if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.searchProConfig;
}
```

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
| `searchProConfigUpdate` | Dashboard "Apply" | `search-v4.js` | Timestamp of last update |
| `searchProLastAppliedConfig` | `search-v4.js` after applying | `search-v4.js` on next load | Hash of last applied config (dedup guard) |
| `searchProDebugEnabled` | Manual / debug tools | `search-v4.js` on load | `"true"` to enable debug mode |
| `tourGoogleSheetsData` | `search-v4.js` (cache) | `search-v4.js` | Cached Google Sheets data |

### Resetting / clearing configuration

The Dashboard "Reset All" function clears `searchProConfig`, `searchProLiveConfig` and the Control Panel's own state keys (`searchProSettings`, `controlPanelState`, `sidebarCollapsed`, `currentTab`, `lastAppliedConfig`, `configBackup`). To manually clear everything from the browser console:

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
| **`extras/Button.js` checks `window.searchListInitiinitialized`** | A typo of `searchListInitialized`, so the check is always false and `initializeSearch` is called on every press. Harmless: a repeat call is ignored. Tours already built with this code keep working. |
| **`data.subtitle` not `data.description`** | Native 3DVista tour objects use `data.subtitle` for secondary text. `data.description` only exists in external Google Sheets / CSV data. Using `data.description` on a tour media or overlay object will return `undefined`. |
| **`searchListInitiinitialized` typo is intentional** | The button code checks `window.searchListInitiinitialized` (double "i"). This is NOT a bug to fix — `search-v4.js` also sets this same typo variable to `false` during cleanup (line 804). The two variables (`searchListInitialized` and `searchListInitiinitialized`) coexist on purpose. |
| **Overlays may not expose `.get()`** | Some overlay types expose data via `overlay.data` (direct property) rather than `overlay.get("data")`. Always use the `_safeGetData()` pattern: try `obj.data` first, then `obj.get("data")`. |
| **3D Model Objects require two-step navigation** | Navigate to the parent 3D model scene first; the plugin then waits for the model's `begin` event (or acts at once when the model is already active) before it centres the camera and triggers the object. |
| **mainPlayList may not be the correct playlist** | In some tours, the canonical playlist is at `tour.locManager.rootPlayer.mainPlayList`, not `tour.mainPlayList`. Always check both. |
| **Overlay parent-media matching is not guaranteed** | `media.get("overlays")` is the most reliable way to get overlays for a specific panorama. `tour.player.getByClassName("PanoramaOverlay")` returns ALL overlays across ALL scenes and must be filtered. |
| **`tour._isInitialized` may not exist** | This property exists on most tours but is not guaranteed. Treat `undefined` as acceptable (not as `false`). |
| **Script order matters** | `search-v4.js` must load before `search-pro-config.js`. Reversing this order will cause a runtime error because config tries to call `window.tourSearchFunctions` before it is defined. |
| **`#viewer` must exist in the DOM** | Search Pro requires the `#viewer` element to inject `#searchContainer`. If `#viewer` is missing, initialization fails with a logged error. |
| **`HotspotPanoramaOverlay` may be a Polygon** | A `HotspotPanoramaOverlay` whose label contains "polygon" (case-insensitive) is reclassified as type `Polygon` by Search Pro. |

---

*Document maintained by: 360 Virtual Tour Solutions*  
## 19. Release 4.5 — What Changed

Release 4.5 (10/07/2026). The public API and the Button contract used by the tour are unchanged.

| Area | Change |
|------|--------|
| 3D search results | 3D hotspots centre the camera on the hotspot; 3D objects centre and frame the camera on the object and still fire their click (section 13). |
| Live settings | The tour applies Control Panel changes instantly through the `storage` event (the 2 s check stays as a backup). |
| Control Panel | Restore of the previous session; `Ctrl/Cmd+D` and `Ctrl/Cmd+L` are no longer taken over (use `Alt+Shift+D / L`); `Ctrl/Cmd+R` is no longer taken over; closing a dialog any way re-enables the header buttons; new **Control Panel Connection** field (section 17). |
| Security / robustness | Origin check enforced and tolerant of text / trailing slash / letter case; HTML escaping and icon sanitising; CSV quoted fields; Fuse.js late-load handling (see `_maintenance/audit/` for the full list). |
| Version | `SEARCH_PRO_RELEASE = "4.5"` is shown in the debug log; all file headers, `package.json` and `STATUS.md` read 4.5. |
| Data Sources | Google Sheet / CSV rebuilt: one source at a time, rows linked to tour elements by Title / Tag / Subtitle / id, parent jump, test report, everything off by default (section 20). |
| Clicking outside | New `closeOnOutsideClick { mobile, desktop }` setting (default `true` = earlier behaviour) with matching toggles in the General tab (section 17). |
| Search field | A very long text no longer runs outside the field: the field and the "no results" box use `box-sizing: border-box`, the text is cut with an ellipsis when it does not fit. |
| Control Panel sync | Every Control Panel field was changed and followed to the plugin (248 fields reach it unchanged); fixed: `minSearchChars` is no longer overwritten by a stale `minSearchLength`, the Advanced tab animation defaults now live at the top level (`animations`) instead of inside `googleSheets`, the built-in cache time of a Google Sheet is 60 minutes in the plugin as in the Control Panel. |
| Thumbnails (work in progress, phases T1 / T1b / L1 / H1) | With thumbnails on, results show the tour's own pictures (property `thumbnailUrl`, section 5), elements inside a panorama / 3D model borrow that picture; the small type icon on the picture is off by default (`typeBadge`: `none` / `all` / `borrowed`); look options: shape and fit, size per element type, badge look and colors, a different look on phones, generated placeholders in a brand color, optional hover zoom of the picture (desktop mouse rest / phone touch and hold, section 5); matching Control Panel fields. Thumbnails themselves stay off by default. |
| General tab reorganised (G1-G3) | Five sections (Opening and Closing, How Searching Works, Search Bar, Phones, Visitor Texts; How Searching Works moved to Advanced as Search Tuning on 2026-10-10) with a Restore Defaults button each; placement picker (top / middle / bottom x left / center / right) replaces the four raw position numbers and fixes left-only, bottom and centered placement; a desktop position can no longer push the bar off a phone; one phone breakpoint and an option to follow the tour's own phone version; Escape and Ctrl / Cmd + K switches, open when the tour starts; typing delay, results limit, match tolerance and field priorities; editable visitor texts; invalid values are explained and not saved or sent (section 'General settings'). |
| Appearance tab repaired (P1) | Font lists with a Default entry and the tour's own fonts; clearer labels (Result Border, Subtitle, Subtext, one Icon Color); typography for the results list (font, name, description, panorama line, group title and count sizes); focus ring; one chip for each tag and a note when tags are hidden; hex boxes next to every color picker; sizes saved with their unit; checks that explain invalid values; Restore Defaults for every section; default placeholder and group-count colors now pass the 4.5:1 contrast rule (section 'Appearance settings'). |
| Appearance tab restructured (P2) | The eight sections became four that follow what the visitor sees (Search Field, Results List, Group Headers, Tags and Highlight), each with subsections; the focus ring replaces the three "text while active" fields (old values still read); the tag settings are dimmed as one group while tags are off; Restore Defaults of a section covers everything inside it (section 'Appearance settings'). |
| Appearance options expanded (P3a) | Borders for the search field and the results list (width, style, color, each side), a line between result rows, four new colors (clear icon on hover, scrollbar, nothing-found text and background), tag strength and background strength, most tags shown with a +N chip, a four-side Space Inside, and an editable (or empty) word before the tags in General > Visitor Texts (section 'Appearance settings'). |
| Tags, group headers, scrollbar, nothing-found message (P3b) | No "+N" chip when only one tag may show; tag names can be changed or hidden from the Control Panel without touching the tour; group headers get space, corner radius, title weight / case / spacing, lines above and below and a centered alignment; the scrollbar color really works in current browsers and has a size; the nothing-found message gets its own icon (default, none, Font Awesome or emoji) and size (section 'Appearance settings'). |
| Group headers and count badge, validation fix, Search Tuning (P3c) | Space above and below the group title are separate; group headers get a full border (each side) and a background strength; the group count can look like a badge (background, strength, radius, space inside, weight, case, border); an error message under a number field now disappears when the value is corrected; "How Searching Works" moved from General to the Advanced tab as "Search Tuning". |
| Result types: 360 Video, Flat Video, Photo Album, Map (C1) | 360 videos and flat videos are results of their own (they were "Panorama" before) with their own include switch, picture switch, icon, label, size and placeholder; photo albums and maps can be added (Content tab, off by default); type filters and sheet rows know the new names; the Control Panel has the matching fields in the Display, Content and Filtering tabs (section 5). |
| Icons and per-type switches (I1) | The Icon Size setting works (16-96 px; the built-in default stays 20 px); the per-type switches for thumbnails and icons ignore letter case and know the container; an icon switched off for a type also hides the built-in icon; the Icon Appearance, Hover and Visibility settings are always available in the Control Panel ("Use Custom Icons" only decides whether your own icons replace the built-in ones); the thumbnail visibility switches and placeholder files now reach an open tour live; the retired Business type is removed from the thumbnail and icon settings; the leftover Business Label and "Include Business Elements" fields of the Control Panel are removed too (nothing in the plugin read them). |
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
* The Control Panel's **Test this source** button asks an open tour for this report through the same-origin `BroadcastChannel("tourSearchChannel")` (`searchProDataSourceReportRequest` / `searchProDataSourceReport`). With no tour open it only checks the connection and the columns. The result is shown in three blocks: **Connection** (rows read, separator, the columns found with the unused ones struck out), **How the rows relate to your tour** (five tiles - All rows, Linked, Jump to a parent, Not shown, Shown with a warning - which are also the filters) and **Rows** (a table with `#`, id, title, result, goes to and notes; a filter box, 25 / 50 / 100 rows per page, and **Download report (CSV)** with every row). It opens on the rows that need attention. Tested with 6,000 rows; text from the sheet is always shown as text.
* Matching rows to tour elements uses look-up tables built once per pass (by id, Title, Tag and Subtitle) instead of scanning the whole tour for every row: 10,000 elements x 8,000 rows took 1.6 s before and about 20 ms now, with identical results.
* Changing the source while the search box is open refreshes the visible results at once.

### Container Search (investigated, not yet part of the sheet)

`includeContent.containerSearch` adds results for container names typed in the Content tab. 3DVista containers (`Container` class) expose only `data.name`; the name is not unique (this tour has three called "Global"), and a click toggles the first container with that name (or uses `window.tourMenu.toggleContainer` when a custom menu defines it). A configured name that does not exist is still shown (and does nothing). Sheet rows for containers are planned: `elementType = Container`, `id` = container name.

---

*Source-verified against: `search-pro-v4/search-v4.js` (v4.5, 10/07/2026), `dashboard/js/control-panel-v4.js`, and `index.html`*
