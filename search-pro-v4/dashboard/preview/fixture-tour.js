/* Version 4.6 - Last Update on 10/12/2026 - Live Preview: the sample tour the real search plugin runs on */
/**
 * A sample tour for the Live Preview of the Control Panel (dashboard/preview/preview.html).
 *
 * The real plugin (search-v4.js) is loaded unchanged and reads this object the way it reads a 3DVista tour: window.tour, a main
 * playlist of items, each with a media (panorama, 360 video, 3D model), overlays (hotspots, frames, videos, projected images),
 * 3D objects, and player.getByClassName(...) for albums, maps, audio and containers. Only the part of the 3DVista object model
 * that the plugin touches is offered (the list was taken from the real test tour by the probe _maintenance/audit/evidence/
 * ui-preview/spy_tour.js); an unknown property answers undefined, like the real player.
 *
 * Nothing here is loaded by a real tour and no 3DVista file is used. Pictures are small drawings kept as files in
 * preview/pictures/ (absolute addresses, as a real tour hands them over; the plugin does not accept a data address).
 *
 * What the sample shows (the sample is made to show every look of a result):
 *   6 panoramas (one without a picture, one without a name that only has a subtitle), 1 360 video, 1 flat video, 2 3D models
 *   with objects and 3D hotspots, 13 hotspots of every kind (two without a name, one of them with a tag; one with a very long
 *   name, one with many tags, groups of one result), 1 photo album, 1 map, 1 audio file, 2 containers.
 */
(function () {
  "use strict";

  // ===========================================================================
  // 1. Pictures: small drawings kept as files next to this one (preview/pictures/*.svg)
  // ===========================================================================

  // The plugin takes a tour picture only when its address starts with http(s):// or / (a real tour hands it absolute
  // addresses); anything else is read as a file of the plugin's assets folder. So the pictures are files, with absolute addresses.
  const PICTURE_FOLDER = "search-pro-v4/dashboard/preview/pictures/";
  const picture = (name) => new URL(PICTURE_FOLDER + name + ".svg", document.baseURI).href;
  const ROOM_PICTURES = ["entrance", "living", "kitchen", "bedroom", "terrace"];

  // ===========================================================================
  // 2. The part of the 3DVista object model the plugin reads
  // ===========================================================================

  /** Every object created here, so player.getByClassName() can list them */
  const registry = [];
  /** The class names an object answers to in getByClassName (a class and what it extends) */
  const EXTENDS = {
    HotspotPanoramaOverlay: ["PanoramaOverlay"],
    FramePanoramaOverlay: ["PanoramaOverlay"],
    QuadVideoPanoramaOverlay: ["PanoramaOverlay"],
    PopupPanoramaOverlay: ["PanoramaOverlay"],
    PanoramaPlayListItem: ["PlayListItem"],
    Video360PlayListItem: ["PlayListItem"],
    VideoPlayListItem: ["PlayListItem"],
    Model3DPlayListItem: ["PlayListItem"],
    MapPlayListItem: ["PlayListItem"],
    PhotoAlbumPlayListItem: ["PlayListItem"],
    MediaAudio: ["Media"],
  };

  /**
   * A 3DVista-like object: get / set / bind answer from a plain property bag. A 3DVista object also carries its properties
   * directly (overlay.id, overlay.class, overlay.projected, ...) and the plugin reads both, so both are offered.
   */
  class Thing {
    constructor(cls, props) {
      this._classes = [cls].concat(EXTENDS[cls] || []);
      this._props = Object.assign({ class: cls }, props || {});
      Object.keys(this._props).forEach((key) => {
        if (!(key in this)) this[key] = this._props[key];
      });
      registry.push(this);
    }

    get(name) {
      return this._props[name];
    }

    set(name, value) {
      this._props[name] = value;
      if (!(name in Thing.prototype) && name[0] !== "_") this[name] = value;
      if (typeof this._onSet === "function") this._onSet(name, value);
    }

    bind() {}

    unbind() {}

    // an audio file plays and pauses (the plugin's Audio result toggles it)
    play() {
      if (this._props.class === "MediaAudio") this._props.state = "playing";
    }

    pause() {
      if (this._props.class === "MediaAudio") this._props.state = "paused";
    }
  }

  const make = (cls, props) => new Thing(cls, props);

  /** Everything the plugin may ask for by class name, in the order it was made (like the player does) */
  function getByClassName(name) {
    return registry.filter((thing) => thing._classes.includes(name));
  }

  // ===========================================================================
  // 3. The viewers: every media is shown in a viewer area that sits in the main container
  // ===========================================================================

  const viewerAreas = {
    panorama: make("ViewerArea", { focusAreaScale: 0.5 }),
    video360: make("ViewerArea", { focusAreaScale: 0.5 }),
    model3d: make("ViewerArea", { focusAreaScale: 0.5 }),
    video: make("ViewerArea", { focusAreaScale: 0.5 }),
    map: make("ViewerArea", { focusAreaScale: 0.5 }),
    album: make("ViewerArea", { focusAreaScale: 0.5 }),
  };
  const players = {
    panorama: make("PanoramaPlayer", { viewerArea: viewerAreas.panorama }),
    video360: make("PanoramaPlayer", { viewerArea: viewerAreas.video360 }),
    model3d: make("Model3DPlayer", { viewerArea: viewerAreas.model3d }),
    video: make("VideoPlayer", { viewerArea: viewerAreas.video }),
    map: make("MapPlayer", { viewerArea: viewerAreas.map }),
    album: make("PhotoAlbumPlayer", { viewerArea: viewerAreas.album }),
  };
  // the container that holds the viewers (visible: nothing is hidden in the sample)
  make("Container", {
    id: "MainViewerContainer",
    visible: true,
    children: Object.values(viewerAreas),
    data: {},
  });

  // ===========================================================================
  // 4. The sample content
  // ===========================================================================

  const LONG_NAME =
    "Smart Kitchen Island with Induction Cooktop, Built-in Steamer and Integrated Wine Cooler";

  /** One hotspot of a panorama (a 3DVista hotspot has one image item with a position) */
  function hotspot(id, label, tags, extra) {
    const data = { defaultEnabledValue: true };
    if (label !== undefined && label !== null) data.label = label;
    if (tags) data.tags = tags;
    return make(
      "HotspotPanoramaOverlay",
      Object.assign(
        {
          id: id,
          data: data,
          projected: false,
          items: [make("HotspotPanoramaOverlayImage", { yaw: 0, pitch: 0, hfov: 12 })],
        },
        extra || {}
      )
    );
  }

  /** A web frame placed in a panorama */
  function frame(id, label, tags) {
    return make("FramePanoramaOverlay", {
      id: id,
      data: { label: label, tags: tags || [] },
      yaw: 20,
      pitch: 0,
      hfov: 40,
    });
  }

  /** A video placed in a panorama (a quad with four corners, a video and a poster) */
  function quadVideo(id, label, tags) {
    const corner = (yaw, pitch) => make("PanoramaPoint", { yaw: yaw, pitch: pitch });
    return make("QuadVideoPanoramaOverlay", {
      id: id,
      data: { label: label, tags: tags || [] },
      vertices: [corner(10, 8), corner(30, 8), corner(30, -8), corner(10, -8)],
      video: make("VideoResource", {}),
      image: make("ImageResource", {
        levels: [make("ImageResourceLevel", { url: picture("chef-video") })],
      }),
    });
  }

  /** A panorama with its hotspots (no picture when thumb is false: the result then shows the placeholder) */
  function panorama(id, label, subtitle, tags, overlays, seed, thumb) {
    const data = {};
    if (label) data.label = label; // a panorama without a name has no label at all, as in a real tour
    if (subtitle) data.subtitle = subtitle;
    if (tags) data.tags = tags;
    return make("Panorama", {
      id: id,
      data: data,
      overlays: overlays,
      thumbnailUrl: thumb === false ? undefined : picture(ROOM_PICTURES[seed] || "entrance"),
    });
  }

  const panoramas = [
    panorama(
      "panorama_entrance",
      "Entrance Hall",
      "Welcome area",
      ["lobby", "entry"],
      [
        hotspot("overlay_go_living", "Go to Living Room", ["navigation"]),
        hotspot("overlay_image_info_sign", "Information Sign", ["sign"]),
      ],
      0
    ),
    panorama(
      "panorama_living",
      "Living Room",
      "Open plan, south facing",
      ["lounge", "family"],
      [
        hotspot("overlay_fireplace", "Fireplace", ["decor", "warm"]),
        // no name, no subtitle, no tags: the search shows the Unnamed Items settings (it lives in a room the sample word finds)
        hotspot("overlay_unnamed_info", undefined),
        // no name but a tag: the Unnamed Items setting "use the tags" gives it a name
        hotspot("overlay_unnamed_tagged", undefined, ["reading room lamp"]),
        hotspot("overlay_family_portrait", "Family Portrait", ["art"], { projected: true }),
        frame("overlay_floor_plan_frame", "Floor Plan Viewer", ["plan"]),
      ],
      1
    ),
    panorama(
      "panorama_kitchen",
      "Kitchen",
      "Cooking area with island",
      ["appliances", "cooking"],
      [
        hotspot("overlay_kitchen_island", LONG_NAME, [
          "appliances",
          "island",
          "cooking",
          "smart-home",
          "energy-efficient",
          "premium",
          "built-in",
        ]),
        quadVideo("overlay_chef_video", "Chef Demo Video", ["video", "cooking"]),
      ],
      2
    ),
    panorama(
      "panorama_bedroom",
      "Master Bedroom",
      "Quiet side of the house",
      ["private"],
      [
        hotspot("overlay_closet", "Walk-in Closet", ["storage"]),
        hotspot("overlay_balcony", "Balcony Door", []),
      ],
      3
    ),
    panorama(
      "panorama_garden",
      "Garden",
      "",
      ["outdoor"],
      [
        hotspot("overlay_fountain", "Fountain", ["water"]),
        hotspot("overlay_pool", "Pool Entrance", ["water", "outdoor"]),
      ],
      4,
      false
    ),
  ];

  // a panorama without a name, only a subtitle: the Unnamed Items setting "use the subtitle" gives it a name
  panoramas.push(panorama("panorama_terrace", undefined, "Outdoor room by the pool", [], [], 4));

  const video360 = make("Video360", {
    id: "media_rooftop_360",
    data: {
      label: "Rooftop 360 Video",
      subtitle: "Sunset over the city",
      tags: ["video", "outdoor"],
    },
    thumbnailUrl: picture("rooftop-360"),
    overlays: [],
  });

  /** A 3D model with its objects (a part of the model) and 3D hotspots (sprites) */
  function model3d(id, label, seed, parts, sprites) {
    const objects = [];
    parts.forEach((part, at) => {
      objects.push(make("InnerModel3DObject", { id: id + "_part_" + at, data: { label: part } }));
    });
    sprites.forEach((name, at) => {
      objects.push(
        make("SpriteModel3DObject", { id: "sprite_" + id + "_" + at, data: { label: name } })
      );
    });
    return make("Model3D", {
      id: id,
      data: { label: label },
      thumbnailUrl: picture(seed === 3 ? "car" : "house"),
      objects: objects,
    });
  }

  const models = [
    model3d(
      "model_sports_car",
      "Sports Car",
      3,
      ["Body", "Front Wheel", "Rear Wheel"],
      ["Engine Detail"]
    ),
    model3d("model_house", "Architectural Model", 4, ["Roof", "Facade"], ["Main Entrance"]),
  ];

  const album = make("PhotoAlbum", {
    id: "album_family_photos",
    data: { label: "Family Photos" },
    thumbnailUrl: picture("album"),
  });
  const map = make("Map", {
    id: "map_floor_plan",
    data: { label: "Floor Plan" },
    thumbnailUrl: picture("floor-plan"),
    overlays: [],
  });
  const flatVideo = make("Video", {
    id: "video_walkthrough",
    data: { label: "Property Walkthrough", subtitle: "Two minutes", tags: ["video"] },
    thumbnailUrl: picture("walkthrough"),
  });
  make("MediaAudio", {
    id: "audio_ambient",
    data: { label: "Ambient Sound" },
    state: "stopped",
  });
  make("Container", { id: "MenuPanel", visible: true, children: [], data: { name: "Menu Panel" } });
  make("Container", {
    id: "InfoWindow",
    visible: false,
    children: [],
    data: { name: "Info Window" },
  });

  // ===========================================================================
  // 5. Playlists, the root player and the tour
  // ===========================================================================

  const item = (cls, media, playerKey, position) =>
    make(cls, { media: media, player: players[playerKey], index: position });

  const mainItems = []
    .concat(panoramas.map((media) => ["PanoramaPlayListItem", media, "panorama"]))
    .concat([["Video360PlayListItem", video360, "video360"]])
    .concat(models.map((media) => ["Model3DPlayListItem", media, "model3d"]))
    .map((entry, position) => item(entry[0], entry[1], entry[2], position));

  const mainPlayList = make("PlayList", { id: "mainPlayList", items: mainItems, selectedIndex: 0 });
  // the playlists behind the tour's own buttons: a flat video, a photo album and a map each have one
  make("PlayList", {
    id: "videoPlayList",
    items: [item("VideoPlayListItem", flatVideo, "video", 0)],
  });
  make("PlayList", {
    id: "albumPlayList",
    items: [item("PhotoAlbumPlayListItem", album, "album", 0)],
  });
  make("PlayList", { id: "mapPlayList", items: [item("MapPlayListItem", map, "map", 0)] });

  /** The preview page listens: a click on a result "opens" something, and the page says what */
  function announce(kind, id, extra) {
    try {
      window.dispatchEvent(
        new CustomEvent("sampleTourNavigate", {
          detail: Object.assign({ kind: kind, id: id }, extra || {}),
        })
      );
    } catch (error) {
      // an old browser without CustomEvent: the preview works without the note
    }
  }

  const nameOf = (media) => {
    const data = media && media.get && media.get("data");
    return (data && data.label) || String((media && media.get && media.get("id")) || "");
  };

  mainPlayList._onSet = function (name, value) {
    if (name !== "selectedIndex") return;
    const entry = mainItems[value];
    if (entry)
      announce("media", entry.get("media").get("id"), { name: nameOf(entry.get("media")) });
  };

  const rootPlayer = {
    mainPlayList: mainPlayList,
    getByClassName: getByClassName,
    get: function (name) {
      if (name === "data") return { tour: tour };
      return undefined;
    },
    // the plugin opens hidden windows through this when a result lives in one
    showWindow: function () {},
    setMainMediaByName: function () {},
  };

  const player = { getByClassName: getByClassName, get: function () {}, set: function () {} };

  const tour = {
    mainPlayList: mainPlayList,
    player: player,
    locManager: { rootPlayer: rootPlayer },
    _isInitialized: true,
    // the plugin starts when the tour says it is loaded: this sample is loaded the moment the plugin asks
    bind: function (eventName, callback) {
      if (eventName === window.TDV.Tour.EVENT_TOUR_LOADED && typeof callback === "function") {
        setTimeout(callback, 0);
      }
    },
    unbind: function () {},
    getByClassName: getByClassName,
    setMediaByIndex: function (position) {
      mainPlayList.set("selectedIndex", position);
    },
  };

  window.tour = tour;
  // the plugin asks the tour whether the visitor is on a phone when phoneDetection is "tour"; the preview page keeps
  // this value current from its Desktop / Phone switch
  window.TDV = window.TDV || {};
  window.TDV.Tour = { EVENT_TOUR_LOADED: "tourLoaded", EVENT_TOUR_ENDED: "tourEnded" };
  window.TDV.PlayerAPI = {
    mobile: false,
    getCurrentPlayer: function () {
      return rootPlayer;
    },
  };

  /** What the preview page needs to know about the sample (the counts the suite checks) */
  window.sampleTourFacts = {
    panoramas: panoramas.length,
    models: models.length,
    mainItems: mainItems.length,
    longName: LONG_NAME,
    unnamedId: "overlay_unnamed_info",
  };
})();
