# 3DVista & Search Pro V4 — Integration Master Reference

**Version:** 4.5  
**Last Verified Against:** `search-v4.js` (Search Pro V4.5, rev 10/07/2026)  
**Scope:** Verified by reading actual source code. No guesses or assumptions.  
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

### Accessing the playlist (verified fallback chain)

Search Pro uses this priority order to find the playlist:

```javascript
// 1. Primary — direct access (most tours)
tour.mainPlayList.get("items")

// 2. Fallback — via locManager root player
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

### Thumbnail access (verified)

```javascript
media.get("thumbnail")   // Primary thumbnail
media.get("firstFrame")  // Video first frame fallback
media.get("preview")     // Preview image fallback
```

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

### Three-strategy tour binding (verified)

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

**Definitive readiness check (verified from source):**

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

By default the search bar closes when the visitor clicks (desktop) or taps (mobile) anywhere outside it, as in earlier versions. The setting `closeOnOutsideClick: { mobile: true, desktop: true }` (Control Panel: **General → Clicking outside the search**) turns that off per device type: with `false` the search stays open until the visitor uses the close button, `Escape`, the tour's own search button or chooses a result. It is separate from `autoHide`, which only decides whether the search closes **after a result was chosen**. The decision is read at the moment of each click, so a change made in the Control Panel reaches an open tour immediately. On touch devices a tap over the 3DVista panorama itself is swallowed by the player (before and after this setting), so it never reaches the page; taps on any other part of the page do.

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
