// markers.js
// Marker- és saját hely réteg, popupok, MapLibre feature-kattintás logika.
// A működés változtatása nélkül lett kiemelve az app.js-ből a könnyebb karbantartás miatt.

const markersById = new Map(); // id -> marker record (active)

// GeoJSON markers layer (DOM marker helyett)
const MARKERS_SOURCE_ID = "cm-markers";
const MARKERS_LAYER_ID = "cm-markers-layer";
const MARKERS_HIT_LAYER_ID = "cm-markers-hit";

// Saját hely GeoJSON layer (DOM marker helyett)
const MYLOC_SOURCE_ID = "cm-mylocation";
const MYLOC_HEADING_LAYER_ID = "cm-mylocation-heading";
const MYLOC_POINT_LAYER_ID = "cm-mylocation-point";
const MYLOC_HIT_LAYER_ID = "cm-mylocation-hit";


let activeMarkerPopup = null;
let activePopupMarkerId = null;

// === Marker ikonok (MapLibre symbol layer) ===
// Kizárólag a kért két módosítás:
//  (1) Saját hely: nyíl, Objektum: pin alak
//  (2) Popup ne nyíljon rossz markerre / a saját hely fölé
// Fontos: ne kulso fajlokbol (svg/png URL) toltsunk, mert GitHub Pages-en / SW-n
// konnyen 404/decoding hiba eseten beragad az init es eltunnek a markerek.
// Ezert a pin + sajat hely nyil ikonokat canvasbol generaljuk futas kozben.

function _pinImageIdFromColor(color){
  const c = String(color || "#6b7280").trim().toLowerCase();
  const m = c.match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i);
  const hex = m ? m[1] : "6b7280";
  return `cm-pin-${hex}`;
}

function _makeCanvas(size){
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return c;
}

function _drawPinCanvas(fillColor){
  const size = 72;
  const c = _makeCanvas(size);
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  ctx.clearRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size * 0.31;
  const topR = size * 0.20;
  const tipY = size * 0.86;
  const sideX = size * 0.26;
  const shoulderY = size * 0.50;

  // soft shadow
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, size * 0.90, size * 0.13, size * 0.024, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fill();
  ctx.restore();

  // clean teardrop / pin body, closer to the reference image
  ctx.beginPath();
  ctx.moveTo(cx, tipY);
  ctx.bezierCurveTo(
    cx - size * 0.10, size * 0.72,
    cx - sideX, shoulderY,
    cx - sideX, cy
  );
  ctx.bezierCurveTo(
    cx - sideX, size * 0.14,
    cx - size * 0.10, size * 0.08,
    cx, size * 0.08
  );
  ctx.bezierCurveTo(
    cx + size * 0.10, size * 0.08,
    cx + sideX, size * 0.14,
    cx + sideX, cy
  );
  ctx.bezierCurveTo(
    cx + sideX, shoulderY,
    cx + size * 0.10, size * 0.72,
    cx, tipY
  );
  ctx.closePath();
  ctx.fillStyle = String(fillColor || '#d90429');
  ctx.fill();

  // inner white hole
  ctx.beginPath();
  ctx.arc(cx, size * 0.28, topR * 0.72, 0, Math.PI * 2);
  ctx.fillStyle = '#f5f5f5';
  ctx.fill();

  return c;
}

function _drawArrowCanvas(){
  const size = 64;
  const c = _makeCanvas(size);
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  ctx.clearRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;

  // Shadow
  ctx.save();
  ctx.translate(0, 2);
  ctx.beginPath();
  ctx.moveTo(cx, cy - 22);
  ctx.lineTo(cx + 16, cy + 20);
  ctx.lineTo(cx, cy + 12);
  ctx.lineTo(cx - 16, cy + 20);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fill();
  ctx.restore();

  // Arrow
  ctx.beginPath();
  ctx.moveTo(cx, cy - 22);
  ctx.lineTo(cx + 16, cy + 20);
  ctx.lineTo(cx, cy + 12);
  ctx.lineTo(cx - 16, cy + 20);
  ctx.closePath();
  ctx.fillStyle = '#2563eb';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.stroke();

  return c;
}

function _ensureMapImage(name, canvas){
  if (!map || typeof map.hasImage !== 'function' || typeof map.addImage !== 'function') return;
  try {
    const has = map.hasImage(name);

    // MapLibre-ben a legstabilabb, ha ImageData-t adunk át (nem közvetlen canvas-t).
    // (Egyes böngészőkben a canvas átadás "csendben" nem rajzol semmit.)
    let img = canvas;
    try {
      const ctx = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
      if (ctx && canvas.width && canvas.height) {
        img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      }
    } catch (_) {}

    if (has) {
      // Ha korábban a basemap-fallback beillesztett egy 1x1 üres képet, cseréljük le.
      if (typeof map.updateImage === 'function') {
        map.updateImage(name, img);
      }
      return;
    }

    map.addImage(name, img, { pixelRatio: 2 });
  } catch (e) {
    // ne állítsuk meg az appot, de legyen nyoma a konzolban
    try { console.warn('addImage failed:', name, e); } catch (_) {}
  }
}

function _ensureMarkerPinImagesFromMarkers(){
  if (!map) return;
  try {
    _ensureMapImage('cm-pin-default', _drawPinCanvas('#6b7280'));
    for (const [, m] of markersById.entries()) {
      if (!m || m.deletedAt) continue;
      const col = _markerColorFor(m);
      const id = _pinImageIdFromColor(col);
      _ensureMapImage(id, _drawPinCanvas(col));
    }
  } catch (_) {}
}

function _ensureMyLocArrowImage(){
  try { _ensureMapImage('cm-myloc-arrow', _drawArrowCanvas()); } catch (_) {}
}

// Ha a style (pl. újratöltés után) hiányzó ikonokra hivatkozik, itt pótoljuk őket.
function _installCmStyleImageMissingHandlerOnce(){
  if (!map || map.__cmStyleImgMissingInstalled) return;
  map.__cmStyleImgMissingInstalled = true;
  try {
    map.on('styleimagemissing', (e) => {
      try {
        const id = e && e.id ? String(e.id) : '';
        if (!id || !id.startsWith('cm-')) return;

        if (id === 'cm-myloc-arrow') {
          _ensureMyLocArrowImage();
          return;
        }

        if (id === 'cm-pin-default') {
          _ensureMapImage('cm-pin-default', _drawPinCanvas('#6b7280'));
          return;
        }

        if (id.startsWith('cm-pin-')) {
          const hex = id.slice('cm-pin-'.length);
          const ok = /^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(hex);
          const col = ok ? ('#' + hex) : '#6b7280';
          _ensureMapImage(id, _drawPinCanvas(col));
          return;
        }
      } catch (_) {}
    });
  } catch (_) {}
}



function idText(id) {
  return "M-" + String(id).padStart(6, "0");
}

function popupHtml(m) {
  const isDeleted = !!m.deletedAt;
  const btnBase = 'width:100%;min-height:24px;padding:4px 8px;border:1px solid #cfd5df;border-radius:7px;background:#ffffff;color:#1f2937;font-size:10.5px;font-weight:600;line-height:1.15;box-sizing:border-box;';
  const btnPrimary = btnBase + 'box-shadow:0 1px 2px rgba(15,23,42,0.05);';
  const btnDanger = btnBase + 'border-color:#fecaca;background:#fff7f7;color:#b91c1c;box-shadow:0 1px 2px rgba(127,29,29,0.04);';
  const btnDisabled = btnBase + 'opacity:0.55;cursor:not-allowed;background:#f8fafc;color:#64748b;box-shadow:none;';
  return `
  <div class="cm-popup" style="min-width:188px;max-width:198px;line-height:1.34;font-size:12px;">
    <div><b>Azonosítószám:</b> ${idText(m.id)}</div>
    <div><b>Cím:</b> ${escapeHtml(m.address)}</div>
    <div><b>Típus:</b> ${escapeHtml(m.typeLabel)}</div>
    <div><b>Állapot:</b> ${escapeHtml(m.statusLabel)}</div>
    <div><b>Megjegyzés:</b> ${m.notes ? escapeHtml(m.notes) : "-"}</div>
    ${isDeleted ? '<div style="margin-top:8px;color:#b91c1c;font-weight:700;">TÖRÖLT</div>' : ''}

    <div style="margin-top:8px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;align-items:stretch;">
      <button class="btnPhotos" data-uuid="${m.uuid}" data-title="${idText(m.id)}" style="${btnPrimary}">Fotók (<span id="pc-${m.uuid}">…</span>)</button>
      <button data-del="${m.id}" style="${btnDanger}">Törlés</button>
      <button data-edit="${m.id}" ${isDeleted ? 'disabled title="A törölt objektum nem módosítható"' : ''} style="${isDeleted ? btnDisabled : btnPrimary}">Módosítás</button>
      <button data-move="${m.id}" ${isDeleted ? 'disabled title="A törölt objektum nem mozgatható"' : ''} style="${isDeleted ? btnDisabled : btnPrimary}">Mozgatás</button>
    </div>
  </div>`;
}

// === v6.2: Stabil marker réteg (DOM marker -> GeoJSON layer) ===
const _EMPTY_FC = { type: "FeatureCollection", features: [] };

function _markerColorFor(m){
  try {
    const meta = m && Number.isFinite(Number(m.typeId)) ? _typeMetaById.get(Number(m.typeId)) : null;
    const c = meta && meta.color ? String(meta.color).trim() : "#6b7280";
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c) ? c : "#6b7280";
  } catch (_) {
    return "#6b7280";
  }
}

function markerToFeature(m){
  const col = _markerColorFor(m);
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [Number(m.lng), Number(m.lat)] },
    properties: {
      id: Number(m.id),
      uuid: String(m.uuid || ""),
      address: String(m.address || ""),
      typeId: (Number.isFinite(Number(m.typeId)) ? Number(m.typeId) : null),
      statusId: (Number.isFinite(Number(m.statusId)) ? Number(m.statusId) : null),
      typeLabel: String(m.typeLabel || ""),
      statusLabel: String(m.statusLabel || ""),
      notes: String(m.notes || ""),
      color: col,
      icon: _pinImageIdFromColor(col)
    }
  };
}

function buildMarkersFeatureCollection({ recalcColor = false } = {}){
  const want = (activeMapFilterIds instanceof Set) ? activeMapFilterIds : null;
  const feats = [];
  for (const [id, m] of markersById.entries()) {
    if (!m || m.deletedAt) continue;
    if (want && !want.has(Number(id))) continue;
    feats.push(markerToFeature(m));
  }
  return { type: "FeatureCollection", features: feats };
}

async function ensureMarkersLayer(){
  if (!map) return;

  // FONTOS: MapLibre-ben a map.loaded() nem megbizhato jelzes arra,
  // hogy mar elmult-e a 'load' event. Ha a load mar lefutott, de loaded()
  // meg false, akkor az await-es varakozas orokre beragadhat, es emiatt
  // NEM kotodnek fel a gombok / nem toltenek be a markerek.
  // Ezert itt "probald meg" alapon hozunk letre mindent, es ha a stilus
  // meg nincs kesz, akkor egyszeri ujraproba load utan.

  try {
    if (map.getSource && map.getSource(MARKERS_SOURCE_ID)) return;

    map.addSource(MARKERS_SOURCE_ID, { type: 'geojson', data: _EMPTY_FC });

    // CityMap ikonok pótlása style refresh esetén
    _installCmStyleImageMissingHandlerOnce();

    // Canvas ikonok (pin) – ne kulso URL-bol!
    _ensureMarkerPinImagesFromMarkers();

    map.addLayer({
      id: MARKERS_HIT_LAYER_ID,
      type: 'circle',
      source: MARKERS_SOURCE_ID,
      paint: {
        'circle-color': '#000000',
        'circle-opacity': 0,
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 18, 18, 24, 22, 30]
      }
    });

    map.addLayer({
      id: MARKERS_LAYER_ID,
      type: 'symbol',
      source: MARKERS_SOURCE_ID,
      layout: {
        'icon-image': ['coalesce', ['get', 'icon'], 'cm-pin-default'],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 14, 0.92, 18, 1.18, 22, 1.45],
        'icon-anchor': 'bottom',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true
      },
      paint: {
        'icon-opacity': 1.0
      }
    });

    map.on('mouseenter', MARKERS_HIT_LAYER_ID, () => { try { map.getCanvas().style.cursor = 'pointer'; } catch (_) {} });
    map.on('mouseleave', MARKERS_HIT_LAYER_ID, () => { try { map.getCanvas().style.cursor = ''; } catch (_) {} });

    // Ha mar vannak betoltott markerek, azonnal rajzoljuk ki.
    try { refreshMarkersSource({ recalcColor: true }); } catch (_) { try { refreshMarkersSource(); } catch (_) {} }

  } catch (err) {
    // Tipikus ok: "Style is not done loading" – ilyenkor load utan ujraproba.
    console.warn('ensureMarkersLayer deferred', err);
    try {
      if (!ensureMarkersLayer.__retryScheduled) {
        ensureMarkersLayer.__retryScheduled = true;
        const retry = () => {
          ensureMarkersLayer.__retryScheduled = false;
          ensureMarkersLayer().catch(() => {});
        };
        if (map && typeof map.once === 'function') map.once('load', retry);
        else if (map && typeof map.__rawOn === 'function') map.__rawOn('load', retry);
        else if (map && typeof map.on === 'function') map.on('load', retry);
        // fallback: ha valamiert nem jon a load event, ne alljon meg az app
        setTimeout(retry, 1200);
      }
    } catch (_) {}
  }
}

function refreshMarkersSource(opts){
  if (!map) return;
  try {
    const src = map.getSource ? map.getSource(MARKERS_SOURCE_ID) : null;
    if (!src || typeof src.setData !== 'function') return;
    // Biztositsuk, hogy minden hasznalt pin ikon fel legyen veve a style-ba.
    try { _ensureMarkerPinImagesFromMarkers(); } catch (_) {}
    src.setData(buildMarkersFeatureCollection(opts));
  } catch (_) {
    // style még nem kész
  }
}


// === v6.3: Saját hely réteg stabilizálás (GeoJSON source + layer) ===
const _EMPTY_MYLOC_FC = { type: "FeatureCollection", features: [] };

function buildMyLocationFeatureCollection(lat, lng, headingDeg, accM){
  if (!isFinite(lat) || !isFinite(lng)) return _EMPTY_MYLOC_FC;
  const feats = [];
  // Saját hely pont (nyíl ikon a layer-ben)
  feats.push({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [Number(lng), Number(lat)] },
    properties: {
      kind: 'point',
      acc: (typeof accM === 'number' && isFinite(accM)) ? Number(accM) : null,
      heading: (typeof headingDeg === 'number' && isFinite(headingDeg))
        ? Number((navMode === 'heading') ? 0 : _normDeg(headingDeg))
        : null,
      icon: 'cm-myloc-arrow'
    }
  });

  return { type: 'FeatureCollection', features: feats };
}

async function ensureMyLocationLayer(){
  if (!map) return;

  // Ugyanaz a deadlock veszely, mint a markereknel: ne await-eljunk 'load'-ot.
  try {
    if (map.getSource && map.getSource(MYLOC_SOURCE_ID)) return;

    map.addSource(MYLOC_SOURCE_ID, { type: 'geojson', data: _EMPTY_MYLOC_FC });

    // CityMap ikonok pótlása style refresh esetén
    _installCmStyleImageMissingHandlerOnce();

    // Saját hely nyíl ikon (canvas)
    _ensureMyLocArrowImage();

    // A saját hely rétegek legyenek a markerek *és a marker hit layer* alatt,
    // hogy marker kattintásnál biztosan ne a saját hely "hit" réteg kapja el az eseményt.
    const _beforeMarkers = (map.getLayer && map.getLayer(MARKERS_HIT_LAYER_ID))
      ? MARKERS_HIT_LAYER_ID
      : ((map.getLayer && map.getLayer(MARKERS_LAYER_ID)) ? MARKERS_LAYER_ID : undefined);

    map.addLayer({
      id: MYLOC_POINT_LAYER_ID,
      type: 'symbol',
      source: MYLOC_SOURCE_ID,
      filter: ['==', ['get', 'kind'], 'point'],
      layout: {
        'icon-image': ['coalesce', ['get', 'icon'], 'cm-myloc-arrow'],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 14, 1.05, 18, 1.35, 22, 1.70],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-anchor': 'center',
        // Telefonon stabilabb, ha a nyíl viewporthoz igazodik.
        // Észak felül módban a headinget mutatja, haladási irány módban pedig fixen felfelé néz.
        'icon-rotation-alignment': 'viewport',
        'icon-rotate': ['coalesce', ['get', 'heading'], 0]
      },
      paint: {
        'icon-opacity': 1.0
      }
    }, _beforeMarkers);

    // Láthatatlan "hit" réteg – könnyebb rákattintani mobilon
    map.addLayer({
      id: MYLOC_HIT_LAYER_ID,
      type: 'circle',
      source: MYLOC_SOURCE_ID,
      filter: ['==', ['get', 'kind'], 'point'],
      paint: {
        'circle-color': '#000000',
        'circle-opacity': 0,
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 18, 18, 26, 22, 34]
      }
    }, _beforeMarkers);

    map.on('mouseenter', MYLOC_HIT_LAYER_ID, () => { try { map.getCanvas().style.cursor = 'pointer'; } catch (_) {} });
    map.on('mouseleave', MYLOC_HIT_LAYER_ID, () => { try { map.getCanvas().style.cursor = ''; } catch (_) {} });

    // Ha mar van pozicio, rajzoljuk ujra, mert eddig source hianyaban kimaradhatott.
    try {
      if (lastMyLocation && isFinite(lastMyLocation.lat) && isFinite(lastMyLocation.lng)) {
        setMyLocationGeoData(lastMyLocation.lat, lastMyLocation.lng, lastHeadingDeg, lastMyLocationAccM, { force: true });
      }
    } catch (_) {}

  } catch (err) {
    console.warn('ensureMyLocationLayer deferred', err);
    try {
      if (!ensureMyLocationLayer.__retryScheduled) {
        ensureMyLocationLayer.__retryScheduled = true;
        const retry = () => {
          ensureMyLocationLayer.__retryScheduled = false;
          ensureMyLocationLayer().catch(() => {});
        };
        if (map && typeof map.once === 'function') map.once('load', retry);
        else if (map && typeof map.__rawOn === 'function') map.__rawOn('load', retry);
        else if (map && typeof map.on === 'function') map.on('load', retry);
        setTimeout(retry, 1200);
      }
    } catch (_) {}
  }
}


function _projectDistanceToFeaturePoint(point, feature){
  try {
    const coords = feature && feature.geometry && feature.geometry.type === 'Point' ? feature.geometry.coordinates : null;
    if (!coords || !map || typeof map.project !== 'function' || !point) return Infinity;
    const p = map.project(coords);
    const dx = p.x - point.x;
    const dy = p.y - point.y;
    return Math.hypot(dx, dy);
  } catch (_) {
    return Infinity;
  }
}

function _queryLayerFeaturesNearPoint(layerId, point, padPx){
  try {
    if (!map || typeof map.queryRenderedFeatures !== 'function' || !point) return [];
    const pad = Math.max(0, Number(padPx) || 0);
    const bbox = pad > 0
      ? [[point.x - pad, point.y - pad], [point.x + pad, point.y + pad]]
      : point;
    return map.queryRenderedFeatures(bbox, { layers: [layerId] }) || [];
  } catch (_) {
    return [];
  }
}

function _pickNearestMarkerFeatureAtPoint(point){
  const feats = [
    ..._queryLayerFeaturesNearPoint(MARKERS_LAYER_ID, point, 8),
    ..._queryLayerFeaturesNearPoint(MARKERS_HIT_LAYER_ID, point, 14)
  ];
  if (!feats.length) return null;

  let best = null;
  let bestD = Infinity;
  for (const f of feats) {
    const id = f && f.properties ? Number(f.properties.id) : NaN;
    if (!Number.isFinite(id)) continue;

    // A pin ikon bottom-anchoros, a kattintható vizuális közép ezért feljebb van.
    let d = Infinity;
    try {
      const coords = f && f.geometry && f.geometry.type === 'Point' ? f.geometry.coordinates : null;
      if (coords && map && typeof map.project === 'function') {
        const p = map.project(coords);
        const z = (typeof map.getZoom === 'function') ? Number(map.getZoom()) : 18;
        const lift = z >= 20 ? 30 : (z >= 18 ? 26 : 22);
        const dx = p.x - point.x;
        const dy = (p.y - lift) - point.y;
        d = Math.hypot(dx, dy);
      }
    } catch (_) {}
    if (!isFinite(d)) d = _projectDistanceToFeaturePoint(point, f);

    if (d < bestD) {
      bestD = d;
      best = f;
    }
  }

  return (best && bestD <= 34) ? best : null;
}

function _pickMyLocationFeatureAtPoint(point){
  // A saját hely popup csak a tényleges nyílra kattintva nyíljon meg.
  // A korábbi hit-layer alapú logika túl nagy találati zónát adott,
  // ezért sokszor üres térképkattintásra is a saját hely popup jött fel.
  const feats = [
    ..._queryLayerFeaturesNearPoint(MYLOC_POINT_LAYER_ID, point, 6)
  ];
  if (!feats.length) return null;

  let best = null;
  let bestD = Infinity;
  for (const f of feats) {
    let d = Infinity;
    try {
      const coords = f && f.geometry && f.geometry.type === 'Point' ? f.geometry.coordinates : null;
      if (coords && map && typeof map.project === 'function') {
        const p = map.project(coords);
        const dx = p.x - point.x;
        const dy = p.y - point.y;
        d = Math.hypot(dx, dy);
      }
    } catch (_) {}
    if (!isFinite(d)) d = _projectDistanceToFeaturePoint(point, f);
    if (d < bestD) {
      bestD = d;
      best = f;
    }
  }

  return (best && bestD <= 18) ? best : null;
}

function installMapFeatureClickHandlerOnce(){
  if (!map || map.__cmFeatureClickInstalled) return;
  map.__cmFeatureClickInstalled = true;

  // Popup kezeléshez mindig a nyers MapLibre click eventet használjuk,
  // mert annak biztosan van e.point mezője. Így egyetlen központi döntési
  // pontból választjuk ki: marker / saját hely / üres térkép.
  const onRaw = (typeof map.__rawOn === 'function') ? map.__rawOn.bind(map) : map.on.bind(map);

  onRaw('click', async (e) => {
    try {
      if (moveModeMarkerId) return;
      const pt = e && e.point ? e.point : null;
      if (!pt) return;

      const markerHit = _pickNearestMarkerFeatureAtPoint(pt);
      if (markerHit) {
        try { closeMyLocationPopup(); } catch (_) {}

        const id = markerHit && markerHit.properties ? Number(markerHit.properties.id) : NaN;
        if (!Number.isFinite(id)) return;

        const m = markersById.get(id) || await DB.getMarkerById(id);
        if (!m || m.deletedAt) return;
        markersById.set(id, m);
        openMarkerPopup(m, { lng: Number(m.lng), lat: Number(m.lat) });
        return;
      }

      const myLocHit = lastMyLocation ? _pickMyLocationFeatureAtPoint(pt) : null;
      if (myLocHit) {
        try { closeActiveMarkerPopup(); } catch (_) {}
        openMyLocationPopup();
        return;
      }

      try { closeActiveMarkerPopup(); } catch (_) {}
      try { closeMyLocationPopup(); } catch (_) {}
    } catch (err) {
      console.warn('feature click handler failed', err);
    }
  });
}

function myLocationPopupHtml(){
  const lines = [];
  lines.push('<b>Saját hely</b>');
  if (myLocationAddressText) lines.push(escapeHtml(myLocationAddressText));
  const acc = (typeof lastMyLocationAccM === 'number' && isFinite(lastMyLocationAccM)) ? Math.round(lastMyLocationAccM) : null;
  if (acc !== null) lines.push(`Pontosság: ±${acc} m`);
  const hdg = (typeof lastHeadingDeg === 'number' && isFinite(lastHeadingDeg)) ? Math.round(_normDeg(lastHeadingDeg)) : null;
  if (hdg !== null) lines.push(`Irány: ${hdg}°`);
  const modeLabel = (navMode === 'heading') ? 'haladási irány' : 'észak felül';
  lines.push(`Navigáció: ${escapeHtml(modeLabel)}`);
  return lines.join('<br>');
}

function closeMyLocationPopup(){
  if (!myLocationPopup) return;
  try { myLocationPopup.remove(); } catch (_) {}
  myLocationPopup = null;
}

function openMyLocationPopup(){
  if (!map || !lastMyLocation) return;
  try {
    closeMyLocationPopup();
    const ll = [Number(lastMyLocation.lng), Number(lastMyLocation.lat)];
    const p = new maplibregl.Popup({ closeButton: true, closeOnClick: false, offset: [0, -22] });
    p.setLngLat(ll).setHTML(myLocationPopupHtml()).addTo(map);
    myLocationPopup = p;
  } catch (_) {}
}

function setMyLocationGeoData(lat, lng, headingDeg, accM, opts = {}){
  if (!map) return;
  const src = map.getSource ? map.getSource(MYLOC_SOURCE_ID) : null;
  if (!src || typeof src.setData !== 'function') return;

  const force = !!opts.force;
  const headingOnly = !!opts.headingOnly;

  const now = Date.now();
  const prev = _myLocLastRendered;

  if (!force && prev) {
    const d = distanceMeters(lat, lng, prev.lat, prev.lng);

    let dh = 999;
    if (typeof headingDeg === 'number' && isFinite(headingDeg) && typeof prev.heading === 'number' && isFinite(prev.heading)) {
      dh = Math.abs(shortestAngleDelta(prev.heading, headingDeg));
    }

    const minMove = headingOnly ? 0 : 0.6;
    const minHeading = 2.0;
    const minInterval = headingOnly ? 120 : 60;

    // túl sűrű, túl kicsi változás → skip
    if ((now - _myLocLastRenderedTs) < minInterval && d < minMove && dh < minHeading) return;

    // heading-only frissítésnél csak az irány változás számít
    if (headingOnly && dh < minHeading) return;

    // pozíció frissítésnél: ha alig mozdult és az irány sem változott érdemben, skip
    if (!headingOnly && d < minMove && dh < minHeading) return;
  }

  _myLocLastRendered = { lat, lng, heading: headingDeg, acc: accM };
  _myLocLastRenderedTs = now;

  try {
    src.setData(buildMyLocationFeatureCollection(lat, lng, headingDeg, accM));
  } catch (_) {}

  // Ha a saját hely popup nyitva van, frissítsük a pozíciót + szöveget
  if (myLocationPopup && typeof myLocationPopup.setLngLat === 'function') {
    try { myLocationPopup.setLngLat([Number(lng), Number(lat)]).setHTML(myLocationPopupHtml()); } catch (_) {}
  }
}

function closeActiveMarkerPopup(){
  if (!activeMarkerPopup) return;
  try { activeMarkerPopup.remove(); } catch (_) {}
  activeMarkerPopup = null;
  activePopupMarkerId = null;
}

function openMarkerPopup(m, lngLat){
  if (!map || !m) return;
  closeActiveMarkerPopup();

  const ll = lngLat ? [lngLat.lng, lngLat.lat] : [Number(m.lng), Number(m.lat)];
  const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, offset: [0, -20] });
  popup.on('open', () => {
    try { wireMarkerPopupButtons(popup, m); } catch (_) {}
  });
  popup.setLngLat(ll).setHTML(popupHtml(m)).addTo(map);
  // Fallback: egyes böngészőkben az "open" event késhet
  setTimeout(() => { try { wireMarkerPopupButtons(popup, m); } catch (_) {} }, 0);
  activeMarkerPopup = popup;
  activePopupMarkerId = Number(m.id);
}

function wireMarkerPopupButtons(popup, m){
  if (!popup || !m) return;
  const el = popup.getElement && popup.getElement();
  if (!el) return;

  // Fotók
  (async () => {
    const btn = el.querySelector('.btnPhotos');
    const span = el.querySelector(`#pc-${CSS.escape(m.uuid)}`);
    try {
      const cnt = await DB.countPhotosByMarkerUuid(m.uuid);
      if (span) span.textContent = String(cnt);
      if (btn) {
        btn.disabled = cnt === 0;
        btn.title = cnt === 0 ? 'Nincs hozzárendelt kép' : 'Képek megtekintése';
        btn.onclick = (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          openPhotoGallery(m.uuid, btn.getAttribute('data-title') || idText(m.id));
        };
      }
    } catch (_) {
      if (span) span.textContent = '0';
      if (btn) btn.disabled = true;
    }
  })();

  // Törlés
  const delBtn = el.querySelector(`button[data-del="${m.id}"]`);
  if (delBtn) {
    delBtn.onclick = async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const ok = confirm('Biztosan törlöd ezt a markert? (soft delete)\nA törölt marker később megjeleníthető a szűrés ablakban.');
      if (!ok) return;
      try {
        await DB.softDeleteMarker(Number(m.id));
        markersById.delete(Number(m.id));
        if (activeMapFilterIds instanceof Set) activeMapFilterIds.delete(Number(m.id));
        closeActiveMarkerPopup();
        refreshMarkersSource();
        updateShowAllButtonVisibility();
        try { _allMarkersCache = filterShowDeleted ? await DB.getAllMarkers() : await DB.getAllMarkersActive(); } catch (_) {}
        try { applyFilter(); } catch (_) {}
      } catch (err) {
        console.error('delete marker failed', err);
        alert('Nem sikerült törölni a markert.');
      }
    };
  }

  // Módosítás
  const editBtn = el.querySelector(`button[data-edit="${m.id}"]`);
  if (editBtn) {
    editBtn.onclick = async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      try {
        const fresh = await DB.getMarkerById(Number(m.id));
        if (!fresh || fresh.deletedAt) {
          alert('A törölt marker nem módosítható.');
          return;
        }
        closeActiveMarkerPopup();
        openEditModal(fresh);
      } catch (err) {
        console.error('open edit from popup failed', err);
        alert('Nem sikerült betölteni a marker adatait.');
      }
    };
  }

  // Mozgatás
  const moveBtn = el.querySelector(`button[data-move="${m.id}"]`);
  if (moveBtn) {
    moveBtn.onclick = async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      try {
        const fresh = await DB.getMarkerById(Number(m.id));
        if (!fresh || fresh.deletedAt) {
          alert('A törölt marker nem mozgatható.');
          return;
        }
        moveModeMarkerId = Number(m.id);
        showHint('Mozgatás: válaszd ki az új helyet a térképen.');
        closeActiveMarkerPopup();
      } catch (err) {
        console.error('move from popup failed', err);
        alert('Nem sikerült betölteni a marker adatait.');
      }
    };
  }
}


