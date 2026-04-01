/* === CityMap MapLibre map init + basemap style === */

window.createCityMap = function createCityMap(){
  if (!window.maplibregl) {
    throw new Error("MapLibre GL hiányzik (maplibregl). Ellenőrizd az index.html include-okat.");
  }
  if (!window.pmtiles) {
    throw new Error("PMTiles JS hiányzik (pmtiles). Ellenőrizd az index.html include-okat.");
  }

  try {
    if (!window.__citymapPmtilesProtocol) {
      const protocol = new pmtiles.Protocol();
      maplibregl.addProtocol("pmtiles", protocol.tile);
      window.__citymapPmtilesProtocol = protocol;
    }
  } catch (_) {}

  // Lokális PMTiles a csomagban (Oroszlány + 15km, részletesebb városi rétegekkel)
  const PM_HTTP_URL = new URL("./data/oroszlany_15km.pmtiles", window.location.href).toString();
  const PM_URL = `pmtiles://${PM_HTTP_URL}`;

  const OSM_ATTR = '© <a href="https://openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

  const style = {
    version: 8,
    glyphs: "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
    sources: {
      basemap: { type: "vector", url: PM_URL, attribution: OSM_ATTR }
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#f5f3ef" } },

      { id: "landcover-wood", type: "fill", source: "basemap", "source-layer": "landcover",
        filter: ["==", ["get", "class"], "wood"],
        paint: { "fill-color": "#dbead2", "fill-opacity": 0.9 } },
      { id: "landcover-grass", type: "fill", source: "basemap", "source-layer": "landcover",
        filter: ["==", ["get", "class"], "grass"],
        paint: { "fill-color": "#e6f0dd", "fill-opacity": 0.85 } },
      { id: "landcover-farmland", type: "fill", source: "basemap", "source-layer": "landcover",
        filter: ["==", ["get", "class"], "farmland"],
        paint: { "fill-color": "#efe9cf", "fill-opacity": 0.85 } },

      { id: "landuse-industrial", type: "fill", source: "basemap", "source-layer": "landuse",
        filter: ["==", ["get", "class"], "industrial"],
        paint: { "fill-color": "#e8e1d8", "fill-opacity": 0.9 } },
      { id: "landuse-garages", type: "fill", source: "basemap", "source-layer": "landuse",
        filter: ["==", ["get", "class"], "garages"],
        paint: { "fill-color": "#ece6df", "fill-opacity": 0.8 } },
      { id: "park-fill", type: "fill", source: "basemap", "source-layer": "park",
        paint: { "fill-color": "#d7ebcf", "fill-opacity": 0.95 } },

      { id: "water-fill", type: "fill", source: "basemap", "source-layer": "water",
        paint: { "fill-color": "#b9dcff" } },
      { id: "waterway-line", type: "line", source: "basemap", "source-layer": "waterway",
        paint: {
          "line-color": "#8cc3f0",
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.6, 13, 1.4, 16, 2.2]
        } },

      { id: "building-fill", type: "fill", source: "basemap", "source-layer": "building",
        minzoom: 13,
        paint: { "fill-color": "#ded8cf", "fill-opacity": 0.95 } },
      { id: "building-outline", type: "line", source: "basemap", "source-layer": "building",
        minzoom: 13,
        paint: { "line-color": "#c6bfb4", "line-width": 0.6 } },

      { id: "road-path", type: "line", source: "basemap", "source-layer": "transportation",
        filter: ["==", ["get", "class"], "path"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#ccb890",
          "line-width": ["interpolate", ["exponential", 1.5], ["zoom"], 12, 1.2, 14, 2.6, 16, 5.2, 18, 8.8, 20, 13.5],
          "line-dasharray": [1.2, 1.2]
        } },
      { id: "road-track", type: "line", source: "basemap", "source-layer": "transportation",
        filter: ["==", ["get", "class"], "track"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#c8b089",
          "line-width": ["interpolate", ["exponential", 1.5], ["zoom"], 12, 1.4, 14, 3.0, 16, 6.0, 18, 10.0, 20, 15.0],
          "line-dasharray": [2, 1]
        } },
      { id: "road-service-case", type: "line", source: "basemap", "source-layer": "transportation",
        filter: ["==", ["get", "class"], "service"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#cfc5b8",
          "line-width": ["interpolate", ["exponential", 2.0], ["zoom"], 10, 0.35, 12, 0.8, 14, 2.6, 16, 8.5, 18, 18.0, 20, 34.0],
          "line-opacity": 0.95
        } },
      { id: "road-service", type: "line", source: "basemap", "source-layer": "transportation",
        filter: ["==", ["get", "class"], "service"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#fffdfa",
          "line-width": ["interpolate", ["exponential", 2.0], ["zoom"], 10, 0.18, 12, 0.5, 14, 1.8, 16, 6.5, 18, 14.5, 20, 28.0],
          "line-opacity": 0.98
        } },
      { id: "road-minor-case", type: "line", source: "basemap", "source-layer": "transportation",
        filter: ["==", ["get", "class"], "minor"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#c8beb0",
          "line-width": ["interpolate", ["exponential", 2.05], ["zoom"], 10, 0.45, 12, 1.0, 14, 3.0, 16, 10.5, 18, 21.0, 20, 38.0],
          "line-opacity": 0.96
        } },
      { id: "road-minor", type: "line", source: "basemap", "source-layer": "transportation",
        filter: ["==", ["get", "class"], "minor"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#fffefc",
          "line-width": ["interpolate", ["exponential", 2.05], ["zoom"], 10, 0.25, 12, 0.65, 14, 2.2, 16, 8.0, 18, 17.0, 20, 31.0],
          "line-opacity": 0.99
        } },
      { id: "road-main-case", type: "line", source: "basemap", "source-layer": "transportation",
        filter: ["match", ["get", "class"], ["primary", "secondary", "tertiary", "trunk"], true, false],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#bf8b3f",
          "line-width": ["interpolate", ["exponential", 2.0], ["zoom"], 8, 0.8, 10, 1.8, 12, 3.8, 14, 7.2, 16, 15.0, 18, 26.0, 20, 42.0],
          "line-opacity": 0.98
        } },
      { id: "road-main", type: "line", source: "basemap", "source-layer": "transportation",
        filter: ["match", ["get", "class"], ["primary", "secondary", "tertiary", "trunk"], true, false],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#f7d18d",
          "line-width": ["interpolate", ["exponential", 2.0], ["zoom"], 8, 0.45, 10, 1.3, 12, 2.9, 14, 5.8, 16, 12.5, 18, 22.0, 20, 36.0],
          "line-opacity": 0.99
        } },
      { id: "road-motor-case", type: "line", source: "basemap", "source-layer": "transportation",
        filter: ["match", ["get", "class"], ["motorway"], true, false],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#b46f32",
          "line-width": ["interpolate", ["exponential", 2.0], ["zoom"], 8, 1.0, 10, 2.4, 12, 4.8, 14, 8.8, 16, 17.0, 18, 29.0, 20, 46.0],
          "line-opacity": 0.99
        } },
      { id: "road-motor", type: "line", source: "basemap", "source-layer": "transportation",
        filter: ["match", ["get", "class"], ["motorway"], true, false],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#f4b66d",
          "line-width": ["interpolate", ["exponential", 2.0], ["zoom"], 8, 0.65, 10, 1.8, 12, 3.8, 14, 7.0, 16, 14.5, 18, 25.0, 20, 40.0],
          "line-opacity": 0.99
        } },
      { id: "road-rail", type: "line", source: "basemap", "source-layer": "transportation",
        filter: ["==", ["get", "class"], "rail"],
        paint: {
          "line-color": "#8e8680",
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.8, 14, 1.4, 16, 2.6, 18, 3.8],
          "line-dasharray": [1.4, 1.2]
        } },

      { id: "place-town", type: "symbol", source: "basemap", "source-layer": "place",
        filter: ["==", ["get", "class"], "town"],
        layout: {
          "text-field": ["coalesce", ["get", "name"], ["get", "name_int"]],
          "text-font": ["Noto Sans Medium"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 8, 12, 13, 18],
          "text-letter-spacing": 0.02
        },
        paint: {
          "text-color": "#4f4a44",
          "text-halo-color": "rgba(255,255,255,0.92)",
          "text-halo-width": 1.4
        } },
      { id: "place-suburb", type: "symbol", source: "basemap", "source-layer": "place",
        minzoom: 11,
        filter: ["==", ["get", "class"], "suburb"],
        layout: {
          "text-field": ["coalesce", ["get", "name"], ["get", "name_int"]],
          "text-font": ["Noto Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 11, 10, 14, 13],
          "text-letter-spacing": 0.02
        },
        paint: {
          "text-color": "#6d655d",
          "text-halo-color": "rgba(255,255,255,0.9)",
          "text-halo-width": 1.2
        } },
      { id: "water-label", type: "symbol", source: "basemap", "source-layer": "water_name",
        minzoom: 11,
        layout: {
          "text-field": ["coalesce", ["get", "name"], ["get", "name_int"]],
          "text-font": ["Noto Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 11, 10, 15, 13]
        },
        paint: {
          "text-color": "#3f82c7",
          "text-halo-color": "rgba(255,255,255,0.9)",
          "text-halo-width": 1.2
        } },
      { id: "park-label", type: "symbol", source: "basemap", "source-layer": "park",
        minzoom: 12,
        layout: {
          "text-field": ["coalesce", ["get", "name"], ["get", "name_int"]],
          "text-font": ["Noto Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 12, 10, 15, 12],
          "text-max-width": 10
        },
        paint: {
          "text-color": "#5d8c56",
          "text-halo-color": "rgba(255,255,255,0.9)",
          "text-halo-width": 1.1
        } },
      { id: "road-label", type: "symbol", source: "basemap", "source-layer": "transportation_name",
        minzoom: 12,
        layout: {
          "symbol-placement": "line",
          "text-field": ["coalesce", ["get", "name"], ["get", "name_int"]],
          "text-font": ["Noto Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 12, 9, 16, 12],
          "symbol-spacing": 300
        },
        paint: {
          "text-color": "#6e655f",
          "text-halo-color": "rgba(255,255,255,0.92)",
          "text-halo-width": 1.1
        } },
      { id: "poi-label", type: "symbol", source: "basemap", "source-layer": "poi",
        minzoom: 13,
        filter: ["<=", ["coalesce", ["get", "rank"], 99], 8],
        layout: {
          "text-field": ["coalesce", ["get", "name"], ["get", "name_int"]],
          "text-font": ["Noto Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 13, 10, 16, 12],
          "text-offset": [0, 0.7],
          "text-anchor": "top",
          "text-max-width": 10
        },
        paint: {
          "text-color": "#5b524c",
          "text-halo-color": "rgba(255,255,255,0.94)",
          "text-halo-width": 1.1
        } },
      { id: "housenumber-label", type: "symbol", source: "basemap", "source-layer": "housenumber",
        minzoom: 14,
        layout: {
          "text-field": ["get", "housenumber"],
          "text-font": ["Noto Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 14, 9, 16, 11]
        },
        paint: {
          "text-color": "#7f746b",
          "text-halo-color": "rgba(255,255,255,0.96)",
          "text-halo-width": 1.1
        } }
    ]
  };;

  const map = new maplibregl.Map({
    container: "map",
    style,
    center: [18.31533, 47.48667],
    zoom: 14,
    attributionControl: false
  });

  try {
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
  } catch (_) {
    try { map.addControl(new maplibregl.AttributionControl(), "bottom-right"); } catch (_) {}
  }

  // v6.0.8: ha a basemap stílus hiányzó ikonokra hivatkozik, adjunk hozzá átlátszó 1x1 pixelt, hogy ne dobjon warningot
  // FONTOS: a CityMap saját (cm- prefixű) ikonokat NEM szabad itt "lenullázni",
  // mert különben a marker/saját hely ikonok 1x1 átlátszó pixellé válnak.
  try {
    map.on("styleimagemissing", (e) => {
      try {
        const id = e && e.id ? e.id : null;
        if (!id) return;
        if (String(id).startsWith('cm-')) return;
        if (map.hasImage && map.hasImage(id)) return;
        const empty = new Uint8Array([0,0,0,0]);
        map.addImage(id, { width: 1, height: 1, data: empty }, { pixelRatio: 1 });
      } catch(_) {}
    });
  } catch(_) {}

  try {
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
  } catch (_) {}

  map.getSize = () => {
    const c = map.getContainer();
    return { x: c.clientWidth || 0, y: c.clientHeight || 0 };
  };
  map.latLngToContainerPoint = (latlng) => {
    const lat = Array.isArray(latlng) ? latlng[0] : latlng.lat;
    const lng = Array.isArray(latlng) ? latlng[1] : latlng.lng;
    const p = map.project([lng, lat]);
    return { x: p.x, y: p.y };
  };
  map.mouseEventToContainerPoint = (ev) => {
    const r = map.getContainer().getBoundingClientRect();
    return { x: (ev.clientX - r.left), y: (ev.clientY - r.top) };
  };
  map.containerPointToLatLng = (p) => {
    const ll = map.unproject([p.x, p.y]);
    return { lat: ll.lat, lng: ll.lng };
  };

  map.setView = (latlng, zoom, opts = {}) => {
    const lat = Array.isArray(latlng) ? latlng[0] : latlng.lat;
    const lng = Array.isArray(latlng) ? latlng[1] : latlng.lng;
    const dur = opts && typeof opts.duration === "number" ? Math.round(opts.duration * 1000) : 0;
    map.easeTo({ center: [lng, lat], zoom: (typeof zoom === "number" ? zoom : map.getZoom()), duration: dur });
  };
  map.panTo = (latlng, opts = {}) => {
    const lat = Array.isArray(latlng) ? latlng[0] : latlng.lat;
    const lng = Array.isArray(latlng) ? latlng[1] : latlng.lng;
    const dur = opts && typeof opts.duration === "number" ? Math.round(opts.duration * 1000) : 0;
    map.easeTo({ center: [lng, lat], duration: dur });
  };

  const _fitBounds = map.fitBounds.bind(map);
  map.fitBounds = (b, opts = {}) => {
    try {
      if (b && typeof b.getSouthWest === "function" && typeof b.getNorthEast === "function") {
        const sw = b.getSouthWest();
        const ne = b.getNorthEast();
        return _fitBounds([[sw.lng, sw.lat], [ne.lng, ne.lat]], opts);
      }
      return _fitBounds(b, opts);
    } catch (_) {}
  };

  map.removeLayer = (layer) => { try { if (layer && typeof layer.remove === "function") layer.remove(); } catch (_) {} };

  const _on = map.on.bind(map);
  map.__rawOn = _on;
  map.on = (evt, layerOrHandler, maybeHandler) => {
    if (typeof layerOrHandler === 'string' || Array.isArray(layerOrHandler)) {
      return _on(evt, layerOrHandler, maybeHandler);
    }

    const handler = layerOrHandler;
    if (evt === "click") {
      return _on("click", (e) => handler({ latlng: { lat: e.lngLat.lat, lng: e.lngLat.lng }, originalEvent: e.originalEvent || e }));
    }
    if (evt === "dragstart" || evt === "zoomstart") {
      return _on(evt, (e) => handler({ originalEvent: e.originalEvent || e }));
    }
    return _on(evt, handler);
  };

  return map;
};
