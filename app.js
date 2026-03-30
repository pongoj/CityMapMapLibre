const APP_VERSION = "6.10.9";

/* === CityMap MapLibre adapter (Map NÉLKÜL) === */
(function(){
  if (window.CM) return;

  class Icon { constructor(opts){ Object.assign(this, opts || {}); } }

  class LatLngBounds {
    constructor(latlngs){
      let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity;
      for (const ll of (latlngs || [])) {
        const lat = Array.isArray(ll) ? ll[0] : ll.lat;
        const lng = Array.isArray(ll) ? ll[1] : ll.lng;
        if (!isFinite(lat) || !isFinite(lng)) continue;
        minLat = Math.min(minLat, lat); minLng = Math.min(minLng, lng);
        maxLat = Math.max(maxLat, lat); maxLng = Math.max(maxLng, lng);
      }
      this._sw = { lat: minLat, lng: minLng };
      this._ne = { lat: maxLat, lng: maxLng };
    }
    getSouthWest(){ return this._sw; }
    getNorthEast(){ return this._ne; }
  }

  class MarkerWrapper {
    constructor(latlng, options){
      this.options = options || {};
      this.__data = null;
      this._popup = null;
      this._popupOpenHandlers = [];
      this._map = null;
      this._icon = this.options.icon || null;

      this._el = document.createElement("div");
      this._el.className = "cm-ml-marker";
      this._el.style.position = "relative";
      this._el.style.willChange = "transform";
      this._el.style.pointerEvents = "auto";

      this._el.addEventListener("click", (ev) => {
        try { ev.preventDefault(); } catch(_){}
        try { ev.stopPropagation(); } catch(_){}
        if (!this._popup || !this._map) return;
        if (this._popup.isOpen()) this.closePopup();
        else this.openPopup();
      });

      const lat = Array.isArray(latlng) ? latlng[0] : latlng.lat;
      const lng = Array.isArray(latlng) ? latlng[1] : latlng.lng;

      this._applyIcon();
      const off = this._offset || [0, 0];

      this._gl = new maplibregl.Marker({ element: this._el, anchor: "top-left", offset: off })
        .setLngLat([lng, lat]);
    }

    _applyIcon(){
      const ic = this._icon;
      this._el.innerHTML = "";
      if (!ic) { this._offset = [0,0]; return; }

      const size = ic.iconSize || ic.icon_size || [30, 30];
      const anchor = ic.iconAnchor || [Math.round(size[0]/2), size[1]];

      this._el.style.width = `${size[0]}px`;
      this._el.style.height = `${size[1]}px`;

      if (ic.html) {
        this._el.innerHTML = ic.html;
      } else {
        const img = document.createElement("img");
        img.src = ic.iconUrl || ic.icon_url || "";
        img.alt = "";
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.display = "block";
        this._el.appendChild(img);
      }

      // Anchor offset MapLibre-hez (NE transform)
      this._offset = [-anchor[0], -anchor[1]];
    }

    _rebuildMarkerIfNeeded(){
      try{
        if (!this._gl) return;
        const ll = this._gl.getLngLat();
        const wasOpen = !!(this._popup && this._popup.isOpen());
        try { this._gl.remove(); } catch(_){}
        const off = this._offset || [0,0];
        this._gl = new maplibregl.Marker({ element: this._el, anchor: "top-left", offset: off }).setLngLat(ll);
        if (this._map) this._gl.addTo(this._map);
        if (wasOpen) { try { this.openPopup(); } catch(_){ } }
      } catch(_){}
    }

    addTo(map){ this._map = map; this._gl.addTo(map); return this; }
    remove(){ try { this._popup && this._popup.remove(); } catch(_){} try { this._gl.remove(); } catch(_){} return this; }

    getLatLng(){ const ll = this._gl.getLngLat(); return { lat: ll.lat, lng: ll.lng }; }
    setLatLng(latlng){
      const lat = Array.isArray(latlng) ? latlng[0] : latlng.lat;
      const lng = Array.isArray(latlng) ? latlng[1] : latlng.lng;
      this._gl.setLngLat([lng, lat]);
      try { if (this._popup && this._popup.isOpen()) this._popup.setLngLat([lng, lat]); } catch(_){}
      return this;
    }

    setIcon(icon){ this._icon = icon; this._applyIcon(); this._rebuildMarkerIfNeeded(); return this; }

    bindPopup(html){
      const offset = (this._icon && this._icon.popupAnchor) ? this._icon.popupAnchor : [0, -25];
      this._popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, offset });
      this._popup.setHTML(html || "");
      return this;
    }

    getPopup(){ return this._popup; }
    setPopupContent(html){ if (this._popup) this._popup.setHTML(html || ""); return this; }

    openPopup(){
      if (!this._popup || !this._map) return this;
      const ll = this._gl.getLngLat();
      this._popup.setLngLat(ll).addTo(this._map);
      const ev = { popup: { getElement: () => this._popup.getElement() } };
      for (const fn of this._popupOpenHandlers) { try { fn(ev); } catch(e){ console.warn("popupopen handler error", e); } }
      return this;
    }

    closePopup(){ try { if (this._popup) this._popup.remove(); } catch(_){} return this; }

    on(evt, fn){
      if (evt === "popupopen" && typeof fn === "function") this._popupOpenHandlers.push(fn);
      return this;
    }
  }

  window.CM = {
    Icon,
    icon: (opts) => new Icon(opts),
    divIcon: (opts) => new Icon(opts),
    marker: (latlng, opts) => new MarkerWrapper(latlng, opts),
    latLngBounds: (latlngs) => new LatLngBounds(latlngs),
    point: (x,y) => ({x,y}),
  };
})();





// Szűrés táblázat kijelölés (több sor is kijelölhető)
let selectedFilterMarkerIds = new Set();

// Szűrés listában töröltek megjelenítése (soft delete)
let filterShowDeleted = false;

function updateShowDeletedBtn(btn) {
  if (!btn) return;
  const label = filterShowDeleted ? "Töröltek elrejtése" : "Töröltek megjelenítése";
  btn.title = label;
  btn.setAttribute("aria-label", label);
  btn.classList.toggle("active", !!filterShowDeleted);
}
// Szűrés listában töröltek megjelenítése

const photoCountCache = new Map(); // uuid -> number
const photoCountInFlight = new Map(); // uuid -> Promise<number>

function getPhotoCountCached(uuid){
  if (!uuid) return Promise.resolve(0);
  if (photoCountCache.has(uuid)) return Promise.resolve(photoCountCache.get(uuid));
  if (photoCountInFlight.has(uuid)) return photoCountInFlight.get(uuid);
  const p = Promise.resolve(DB.countPhotosByMarkerUuid(uuid))
    .then((cnt) => {
      const n = Number(cnt) || 0;
      photoCountCache.set(uuid, n);
      return n;
    })
    .catch(() => 0)
    .finally(() => {
      photoCountInFlight.delete(uuid);
    });
  photoCountInFlight.set(uuid, p);
  return p;
}


// v5.15: térképi megjelenítés szűrése (csak kijelöltek / táblázat tartalma)
let activeMapFilterIds = null;

// Marker mozgatás mód (popup gomb → következő kattintás helye)
let moveModeMarkerId = null;
 // null = nincs térképi szűrés, minden aktív marker látszik

let map;
let pendingLatLng = null;

// Objektum módosítás (markerModal újrafelhasználása)
let markerModalMode = "add";
  const tb = document.getElementById('fTypeBtn'); if (tb) tb.disabled = false;
  const sb = document.getElementById('fStatusBtn'); if (sb) sb.disabled = false;
  setPickerValue('type', null);
  setPickerValue('status', null); // "add" | "edit"
let editingMarkerId = null;
let editingMarkerUuid = null;

// Térképi szűrés UI ("Összes megjelenítése" gomb) – GeoJSON layer
function _getVisibleMarkerRecords() {
  const out = [];
  const want = (activeMapFilterIds instanceof Set) ? activeMapFilterIds : null;
  for (const [id, m] of markersById.entries()) {
    if (!m || m.deletedAt) continue;
    if (want && !want.has(Number(id))) continue;
    out.push(m);
  }
  return out;
}

function getVisibleMarkerBounds() {
  if (!map) return null;
  const recs = _getVisibleMarkerRecords();
  const latlngs = recs.map(m => ({ lat: m.lat, lng: m.lng })).filter(ll => isFinite(ll.lat) && isFinite(ll.lng));
  if (latlngs.length === 0) return null;
  return CM.latLngBounds(latlngs);
}

function fitMapToVisibleMarkers() {
  const b = getVisibleMarkerBounds();
  if (!b) return;
  try { map.fitBounds(b, { padding: [30, 30] }); } catch (_) {}
}

function isMapFiltered() {
  if (!(activeMapFilterIds instanceof Set)) return false;
  const allIds = Array.from(markersById.keys()).map(Number).filter(Number.isFinite);
  if (allIds.length === 0) return false;
  if (activeMapFilterIds.size !== allIds.length) return true;
  for (const id of allIds) {
    if (!activeMapFilterIds.has(Number(id))) return true;
  }
  return false;
}

function updateShowAllButtonVisibility() {
  const btn = document.getElementById("btnShowAll");
  if (!btn) return;
  btn.style.display = isMapFiltered() ? "inline-block" : "none";
}

function clearMapMarkerVisibilityFilter() {
  activeMapFilterIds = null;
  refreshMarkersSource();
  updateShowAllButtonVisibility();
}

function showAllMarkersAndFit() {
  clearMapMarkerVisibilityFilter();
  fitMapToVisibleMarkers();
}

// v5.11: új markerhez fényképek hozzárendelése mentés előtt (draft uuid)
let currentDraftUuid = null;
let draftHasSaved = false;

async function updateAttachPhotoLabel() {
  const btn = document.getElementById("btnAttachPhoto");
  if (!btn) return;
  try {
    const n = currentDraftUuid ? await DB.countPhotosByMarkerUuid(currentDraftUuid) : 0;
    btn.textContent = `Fénykép hozzárendelése (${n})`;
  } catch (e) {
    console.warn("Photo count failed", e);
  }
}

async function cleanupDraftPhotosIfNeeded() {
  try {
    if (currentDraftUuid && !draftHasSaved) {
      await DB.deletePhotosByMarkerUuid(currentDraftUuid);
    }
  } catch (e) {
    console.warn("Draft photo cleanup failed", e);
  }
}

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


// Fotó galéria (markerhez rendelt képek megtekintése)
const photoGalleryModal = document.getElementById("photoGalleryModal");
const photoGalleryGrid = document.getElementById("photoGalleryGrid");
const photoGalleryMeta = document.getElementById("photoGalleryMeta");
const btnPhotoGalleryClose = document.getElementById("btnPhotoGalleryClose");
const btnPhotoGalleryCloseTop = document.getElementById("btnPhotoGalleryCloseTop");

function openSimpleModal(el) {
  if (!el) return;
  el.style.display = "block";
}

function closeSimpleModal(el) {
  if (!el) return;
  el.style.display = "none";
}

async function openPhotoGalleryForMarker(marker) {
  if (!marker) return;
  const uuid = marker.uuid || marker.markerUuid || marker.markerUUID;
  if (!uuid) return;
  const title = `${idText(marker.id)} – ${marker.address || ""}`;
  await openPhotoGallery(uuid, title);
}

async function openPhotoGallery(markerUuid, titleText) {
  try {
    const updatePopupPhotoCountUI = async () => {
      try {
        // db.js-ben a publikus függvény neve: countPhotosByMarkerUuid
        const count = await DB.countPhotosByMarkerUuid(markerUuid);
        const span = document.getElementById(`pc-${markerUuid}`);
        if (span) span.textContent = count;
        const btn = document.querySelector(`button.btnPhotos[data-uuid="${markerUuid}"]`);
        if (btn) btn.disabled = count === 0;
      } catch (_) {
        // no-op
      }
    };

    const render = async () => {
      const photos = await DB.getPhotosByMarkerUuid(markerUuid);
      if (photoGalleryGrid) photoGalleryGrid.innerHTML = "";
      if (photoGalleryMeta) {
        const t = titleText ? `${titleText} — ` : "";
        photoGalleryMeta.textContent = `${t}${photos.length} kép`;
      }

      if (!photoGalleryGrid) {
        openSimpleModal(photoGalleryModal);
        return;
      }

      if (photos.length === 0) {
        photoGalleryGrid.innerHTML = '<div class="photo-empty">Nincs hozzárendelt kép.</div>';
        await updatePopupPhotoCountUI();
        return;
      }

      for (const p of photos) {
        const url = URL.createObjectURL(p.blob);

        const item = document.createElement("div");
        item.className = "photo-item";

        const a = document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener";

        const img = document.createElement("img");
        img.src = url;
        img.alt = "Fénykép";
        a.appendChild(img);

        const meta = document.createElement("div");
        meta.className = "meta";
        meta.textContent = new Date(p.createdAt || Date.now()).toLocaleString();

        const del = document.createElement("button");
        del.type = "button";
        del.className = "photo-delete";
        del.textContent = "Törlés";
        del.title = "Kép törlése";
        del.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();

          const ok = confirm("Biztosan törlöd ezt a képet? Ez nem visszavonható.");
          if (!ok) return;

          try {
            URL.revokeObjectURL(url);
            await DB.deletePhotoById(p.id);
            await render();
          } catch (err) {
            console.error("delete photo error", err);
            alert("Nem sikerült törölni a képet.");
          }
        });

        item.appendChild(a);
        item.appendChild(del);
        item.appendChild(meta);
        photoGalleryGrid.appendChild(item);
      }

      await updatePopupPhotoCountUI();
    };

    await render();

    openSimpleModal(photoGalleryModal);
  } catch (err) {
    console.error("openPhotoGallery error", err);
    alert("Nem sikerült betölteni a képeket.");
  }
}

if (btnPhotoGalleryClose) btnPhotoGalleryClose.addEventListener("click", () => closeSimpleModal(photoGalleryModal));
if (btnPhotoGalleryCloseTop) btnPhotoGalleryCloseTop.addEventListener("click", () => closeSimpleModal(photoGalleryModal));
if (photoGalleryModal) {
  photoGalleryModal.addEventListener("click", (e) => {
    if (e.target === photoGalleryModal) closeSimpleModal(photoGalleryModal);
  });
}

function genUuid() {
  // NOTE: "crypto" nem minden környezetben elérhető (pl. egyes régi/korlátozott böngészők,
  // vagy bizonyos file:// futtatások). A "crypto &&" önmagában ReferenceError-t dobhat,
  // ezért typeof-ot használunk.
  try {
    if (typeof crypto !== "undefined" && crypto && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch (_) {}
  return String(Date.now()) + "-" + String(Math.random()).replace(".", "");
}


// v5.49: Marker színek a Beállítások / Objektum típusa (HEX) alapján
// typeId -> {color, internalId, type, description}
let _typeMetaById = new Map();
let _markerSvgUrlCache = new Map();

// v5.50: Típus/Állapot választó (szép, táblázatos lenyíló)
let _formTypes = [];
let _formStatuses = [];


function setTypeMetaCache(types) {
  _typeMetaById = new Map();
  (types || []).forEach((t) => {
    const id = Number(t.id);
    if (!Number.isFinite(id)) return;
    _typeMetaById.set(id, {
      color: String(t.color || "").trim(),
      internalId: String(t.internalId || "").trim(),
      type: String(t.type || "").trim(),
      description: String(t.description || "").trim(),
    });
  });
}

function markerSvgDataUrl(fillHex) {
  const hex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(fillHex || "").trim())
    ? String(fillHex).trim()
    : "#6b7280";
  const key = hex.toLowerCase();
  if (_markerSvgUrlCache.has(key)) return _markerSvgUrlCache.get(key);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="25" height="41" viewBox="0 0 25 41">
  <path d="M12.5 0C5.6 0 0 5.6 0 12.5c0 9.4 12.5 28.5 12.5 28.5S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0z"
    fill="${hex}" stroke="rgba(0,0,0,0.35)" stroke-width="1"/>
  <circle cx="12.5" cy="12.5" r="5" fill="rgba(255,255,255,0.85)"/>
</svg>`;
  const url = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
  _markerSvgUrlCache.set(key, url);
  return url;
}

function iconForMarker(m, zoom) {
  const z = Number.isFinite(Number(zoom)) ? Number(zoom) : (map && map.getZoom ? map.getZoom() : 18);
  const scale = markerScaleForZoom(z);
  const size = [25 * scale, 41 * scale];
  const anchor = [12 * scale, 41 * scale];
  const popup = [1 * scale, -34 * scale];

  const meta = m && Number.isFinite(Number(m.typeId)) ? _typeMetaById.get(Number(m.typeId)) : null;
  const color = meta && meta.color ? meta.color : "#6b7280";

  return new CM.Icon({
    iconUrl: markerSvgDataUrl(color),
    iconSize: size,
    iconAnchor: anchor,
    popupAnchor: popup,
  });
}
 // dbId -> leaflet marker

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Nominatim has strict usage limits. Throttle requests to avoid bursts
// (and the 4xx blocks you can see in DevTools).
let __cm_nominatim_lastCallAt = 0;
let __cm_nominatim_inflight = null;

function nominatimReverseJSONP(lat, lng, { timeoutMs = 8000, minGapMs = 1100, retries = 1 } = {}) {
  // Nominatim does not reliably send CORS headers, so browser fetch() can be blocked.
  // JSONP is supported via json_callback and works in Chrome/Edge without CORS.
  const runOnce = () => new Promise((resolve, reject) => {
    const cbName = "__cm_nominatim_cb_" + Math.random().toString(36).slice(2);
    const script = document.createElement("script");
    const cleanup = () => {
      try { delete window[cbName]; } catch (_) {}
      if (script && script.parentNode) script.parentNode.removeChild(script);
    };
    const t = setTimeout(() => {
      cleanup();
      reject(new Error("Nominatim timeout"));
    }, timeoutMs);

    window[cbName] = (data) => {
      clearTimeout(t);
      cleanup();
      resolve(data);
    };

    const url =
      "https://nominatim.openstreetmap.org/reverse" +
      "?format=jsonv2" +
      "&addressdetails=1" +
      "&zoom=18" +
      "&lat=" + encodeURIComponent(lat) +
      "&lon=" + encodeURIComponent(lng) +
      "&json_callback=" + encodeURIComponent(cbName);

    script.src = url;
    script.async = true;
    script.onerror = () => {
      clearTimeout(t);
      cleanup();
      reject(new Error("Nominatim load error"));
    };

    document.head.appendChild(script);
  });

  const now = Date.now();
  const waitMs = Math.max(0, (__cm_nominatim_lastCallAt + minGapMs) - now);

  const doCall = () => {
    __cm_nominatim_lastCallAt = Date.now();
    __cm_nominatim_inflight = runOnce()
      .catch((err) => {
        if (retries > 0) {
          return new Promise((res) => setTimeout(res, minGapMs)).then(() =>
            nominatimReverseJSONP(lat, lng, { timeoutMs, minGapMs, retries: retries - 1 })
          );
        }
        throw err;
      })
      .finally(() => {
        __cm_nominatim_inflight = null;
      });
    return __cm_nominatim_inflight;
  };

  if (__cm_nominatim_inflight) return __cm_nominatim_inflight;
  if (waitMs > 0) return new Promise((res) => setTimeout(res, waitMs)).then(doCall);
  return doCall();
}

function showHint(text, ms = 2500) {
  const el = document.getElementById("hint");
  el.textContent = text;
  el.style.display = "block";
  clearTimeout(showHint._t);
  showHint._t = setTimeout(() => (el.style.display = "none"), ms);
}

function openModal(latlng) {
  markerModalMode = "add";
  const tb = document.getElementById('fTypeBtn'); if (tb) tb.disabled = false;
  const sb = document.getElementById('fStatusBtn'); if (sb) sb.disabled = false;
  setPickerValue('type', null);
  setPickerValue('status', null);
  editingMarkerId = null;
  editingMarkerUuid = null;
  pendingLatLng = latlng;

  // v5.11: új marker felviteli folyamat => új draft uuid fényképekhez
  draftHasSaved = false;
  currentDraftUuid = genUuid();

  document.getElementById("fCity").value = "";
  document.getElementById("fStreet").value = "";
  document.getElementById("fHouse").value = "";
  document.getElementById("fNotes").value = "";
  try { const ts=document.getElementById('fType'); if (ts) ts.value=''; } catch(_){}
  try { const ss=document.getElementById('fStatus'); if (ss) ss.value=''; } catch(_){}

  setMarkerModalTitle("add");
  setMarkerModalControlsDisabled({ addressLocked: false });

  updateAttachPhotoLabel();

  // reverse geocode (CORS-safe JSONP)
  nominatimReverseJSONP(latlng.lat, latlng.lng)
    .then(j => {
      const a = (j && j.address) || {};
      if (a.city || a.town || a.village)
        document.getElementById("fCity").value = a.city || a.town || a.village || "";
      if (a.road)
        document.getElementById("fStreet").value = a.road;
      if (a.house_number)
        document.getElementById("fHouse").value = a.house_number;
    })
    .catch(() => {});

document.getElementById("markerModal").style.display = "flex";
}

async function closeModal() {
  document.getElementById("markerModal").style.display = "none";
  pendingLatLng = null;

  // Ha a felhasználó mégsem ment ÚJ MARKERT, a draft képeket töröljük, hogy ne maradjon szemét.
  if (markerModalMode === "add") {
    await cleanupDraftPhotosIfNeeded();
  }

  markerModalMode = "add";
  const tb = document.getElementById('fTypeBtn'); if (tb) tb.disabled = false;
  const sb = document.getElementById('fStatusBtn'); if (sb) sb.disabled = false;
  setPickerValue('type', null);
  setPickerValue('status', null);
  editingMarkerId = null;
  editingMarkerUuid = null;
  currentDraftUuid = null;
}

let myLocationMarker = null; // DEPRECATED (v6.3): DOM marker helyett GeoJSON layer
let myLocationPopup = null;
let myLocationWatchId = null;
let myLocationAddressText = "Saját hely";
let lastMyLocCenterTs = 0; // (megtartva kompatibilitás miatt, de már mindig követjük a pozíciót)
let lastMyLocationAccM = NaN;
let _myLocLastRendered = null;
let _myLocLastRenderedTs = 0;


// v5.40: GPS simítás (Google-szerűbb mozgás):
// - pontosság szűrés (nagyon rossz accuracy esetén nem frissítünk)
// - drift elleni deadzone (álló helyzetben ne remegjen)
// - EMA (exponenciális mozgóátlag) a folyamatosabb mozgáshoz
// - animált marker mozgatás két mérés között
// - követés ki/be: kézi térképmozgatás letiltja, "Saját helyem" gomb visszakapcsolja
const GPS_ACCURACY_MAX_M = 60;      // efölött nem frissítünk (beltér/rossz jel)
const GPS_DEADZONE_MIN_M = 4;       // ennyi alatt (állva) ne mozduljon
const GPS_DEADZONE_MAX_M = 10;      // deadzone felső korlát
const GPS_JUMP_REJECT_M = 120;      // irreális ugrás eldobása (ha túl gyors)
const GPS_MARKER_ANIM_MS = 650;     // marker animáció időtartam
const GPS_CENTER_ANIM_S = 0.42;     // térkép pan animáció
const GPS_MIN_CENTER_INTERVAL_MS = 900;

// MapLibre telefonos nav stabilizálás:
// - mozgás közben csak GPS/course irányt használunk
// - alacsony sebességnél nem váltunk vissza azonnal iránytűre (hiszterézis)
// - a kamera, a pozíció és a heading külön van szűrve
const NAV_MOVE_ENTER_SPEED_MPS = 1.0;
const NAV_MOVE_EXIT_SPEED_MPS = 0.40;
const NAV_MOVE_SPEED_STALE_MS = 7000;
const NAV_GEO_HEADING_MIN_ACC_M = 60;
const NAV_GEO_HEADING_KEEP_MS = 9000;
const NAV_COMPASS_STATIONARY_DEADBAND_DEG = 18;
const NAV_COMPASS_MOVING_DEADBAND_DEG = 999;
const NAV_CAMERA_MIN_INTERVAL_MOVING_MS = 260;
const NAV_CAMERA_MIN_INTERVAL_STATIONARY_MS = 700;
const NAV_CENTER_MIN_MOVE_MOVING_M = 2.0;
const NAV_CENTER_MIN_MOVE_STATIONARY_M = 5.0;
const NAV_BEARING_MIN_DELTA_MOVING_DEG = 6.0;
const NAV_BEARING_MIN_DELTA_NORTH_DEG = 1.5;
const NAV_BEARING_MIN_INTERVAL_MS = 220;
const NAV_SCREEN_DEADBAND_MOVING_PX = 14;
const NAV_SCREEN_DEADBAND_STATIONARY_PX = 22;

let myLocFollowEnabled = true;
// v5.41: Navigáció mód (térkép követés viselkedése)
// - "north": észak felül, középre követ
// - "heading": haladási irány (nyíl + "előrenézős" követés)
let navMode = (localStorage.getItem("citymap_nav_mode") || "north"); // "north" | "heading"

// v5.42: "heading" módban a saját helyet kissé lejjebb tartjuk (előrenézés érzet)
function navYOffsetPx() {
  try {
    const h = map && map.getSize ? map.getSize().y : 0;
    const px = Math.round(h * 0.18);
    return clamp(px, 60, 160);
  } catch (_) {
    return 90;
  }
}


// v5.45 – "Középre" gomb láthatóság (Google Maps-szerű)
// Csak akkor jelenjen meg, ha a térkép el van mozdítva, és a saját hely nincs középen.
function updateMyLocFabVisibility() {
  const btn = document.getElementById("btnMyLocFab");
  if (!btn || !map) return;

  if (!lastMyLocation) {
    btn.style.display = "none";
    return;
  }

  try {
    const p = map.latLngToContainerPoint([lastMyLocation.lat, lastMyLocation.lng]);
    const s = map.getSize();
    const cx = s.x / 2, cy = s.y / 2;
    const dx = p.x - cx;
    const dy = p.y - cy;
    const dist = Math.hypot(dx, dy);

    // 28px ~ kb. "középen van" tolerancia
    const THRESH_PX = 28;
    const show = dist > THRESH_PX;
    btn.style.display = show ? "inline-flex" : "none";
  } catch (_) {
    btn.style.display = "none";
  }
}

// Korábbi Leaflet/CSS rotate logika eltávolítva.
// MapLibre-ben a térkép forgatását közvetlenül a map.easeTo({ bearing }) kezeli.
function initRotateWrapperIfNeeded(){}
function setMapBearingDeg(_targetDeg){}
function setMapBearingTargetDeg(_targetDeg){}
function stopBearingAnimatorIfIdle(){}
function startBearingAnimator(){}

// Saját hely nyíl iránya (0..360). Ha a böngésző ad heading-et, azt használjuk,
// különben két GPS pontból számolunk irányt (ha van elmozdulás).
let lastHeadingDeg = 0;
let compassHeadingDeg = NaN; // 0..360, eszköz iránytűből (állva forgásnál is)
let _compassInited = false;
let _compassPermGranted = false;

// v5.42.3: kompasz zaj csillapítás (Google-szerűbb, kevesebb ugrálás)
let _compassLastTs = 0;
let _compassOutlierStreak = 0;

// A ténylegesen használt állóhelyi heading a kisimított iránytű értéke.
let fusedHeadingDeg = NaN;

// v5.42.4: legutóbbi sebesség becslés (ha mozgunk, ne írja felül a kompasz)
let lastSpeedMps = NaN;
let lastSpeedTs = 0;
let navMovingState = false;
let navMovingStateTs = 0;
let lastStableCourseDeg = NaN;
let lastStableCourseTs = 0;

function _recentSpeedMps(){
  try {
    const now = Date.now();
    if (isFinite(lastSpeedMps) && (now - lastSpeedTs) < NAV_MOVE_SPEED_STALE_MS) return Number(lastSpeedMps);
  } catch (_) {}
  return NaN;
}

function _updateNavMotionState(speedMps, accM, nowTs){
  const now = Number(nowTs || Date.now());
  const speed = (typeof speedMps === 'number' && isFinite(speedMps)) ? Number(speedMps) : NaN;
  const accOk = !(typeof accM === 'number' && isFinite(accM)) || accM <= 60;

  if (navMovingState) {
    if (accOk && isFinite(speed) && speed >= NAV_MOVE_EXIT_SPEED_MPS) {
      navMovingStateTs = now;
    } else if ((now - navMovingStateTs) > NAV_MOVE_SPEED_STALE_MS) {
      navMovingState = false;
    }
  } else {
    if (accOk && isFinite(speed) && speed >= NAV_MOVE_ENTER_SPEED_MPS) {
      navMovingState = true;
      navMovingStateTs = now;
    }
  }
  return navMovingState;
}

function _isMovingForNav(){
  return !!navMovingState;
}

function _shouldUseCompassHeading(){
  return !navMovingState;
}

function _rememberStableCourse(deg, nowTs){
  if (!(typeof deg === 'number' && isFinite(deg))) return;
  lastStableCourseDeg = _normDeg(deg);
  lastStableCourseTs = Number(nowTs || Date.now());
}

function _recentStableCourse(){
  const now = Date.now();
  if (typeof lastStableCourseDeg === 'number' && isFinite(lastStableCourseDeg) && (now - lastStableCourseTs) <= NAV_GEO_HEADING_KEEP_MS) {
    return Number(lastStableCourseDeg);
  }
  return NaN;
}

function _smoothHeadingToward(targetDeg, sourceKind){
  if (!(typeof targetDeg === "number" && isFinite(targetDeg))) return false;
  const target = _normDeg(targetDeg);
  if (!(typeof lastHeadingDeg === "number" && isFinite(lastHeadingDeg))) {
    lastHeadingDeg = target;
    return true;
  }

  const moving = _isMovingForNav();
  const delta = shortestAngleDelta(lastHeadingDeg, target);
  const absd = Math.abs(delta);
  const dead = moving
    ? (sourceKind === 'geo' ? 5 : NAV_COMPASS_MOVING_DEADBAND_DEG)
    : NAV_COMPASS_STATIONARY_DEADBAND_DEG;
  if (absd < dead) return false;

  let alpha;
  if (sourceKind === 'geo') {
    alpha = moving ? (absd > 35 ? 0.52 : absd > 15 ? 0.34 : 0.24) : (absd > 35 ? 0.24 : 0.14);
  } else if (sourceKind === 'hold') {
    alpha = moving ? 0.18 : 0.10;
  } else {
    alpha = moving ? (absd > 35 ? 0.22 : absd > 15 ? 0.15 : 0.10) : (absd > 35 ? 0.14 : absd > 15 ? 0.10 : 0.06);
  }

  lastHeadingDeg = _normDeg(lastHeadingDeg + delta * alpha);
  return true;
}


function _normDeg(d){
  d = (d % 360 + 360) % 360;
  return d;
}

function _getScreenAngle(){
  // 0, 90, 180, 270
  try {
    if (screen && screen.orientation && typeof screen.orientation.angle === 'number') return screen.orientation.angle;
  } catch (_) {}
  // iOS Safari
  try {
    if (typeof window.orientation === 'number') return window.orientation;
  } catch (_) {}
  return 0;
}

function _updateMyLocIconHeading(force = false){
  // v6.3: Saját hely DOM marker helyett GeoJSON layer – heading frissítés
  if (!map || !lastMyLocation) return;
  try {
    setMyLocationGeoData(lastMyLocation.lat, lastMyLocation.lng, lastHeadingDeg, lastMyLocationAccM, { force: !!force, headingOnly: !force });
  } catch (_) {}
}

function _handleDeviceOrientation(e){
  // iOS: webkitCompassHeading (0..360, észak=0, kelet=90)
  let hdg = NaN;
  if (typeof e.webkitCompassHeading === "number" && isFinite(e.webkitCompassHeading)) {
    hdg = e.webkitCompassHeading;
  } else if (typeof e.alpha === "number" && isFinite(e.alpha)) {
    // Android/Chromium: alpha-t több böngésző eltérően adja vissza.
    // Kiszámoljuk mindkét elterjedt variánst, és a legstabilabbat választjuk.
    const a = e.alpha;
    const sa = _getScreenAngle();
    const h1 = _normDeg(a + sa);             // alpha direkt
    const h2 = _normDeg((360 - a) + sa);     // alpha invertált

    const abs = (e && (e.absolute === true || e.type === "deviceorientationabsolute"));
    if (!isFinite(compassHeadingDeg)) {
      hdg = abs ? h1 : h2;
    } else {
      const d1 = Math.abs(shortestAngleDelta(compassHeadingDeg, h1));
      const d2 = Math.abs(shortestAngleDelta(compassHeadingDeg, h2));
      hdg = (d1 <= d2) ? h1 : h2;
    }
  }
  if (!isFinite(hdg)) return;
  hdg = _normDeg(hdg);

  // v5.42.3: adaptív (időalapú) simítás + deadband + outlier szűrés,
// hogy állva se "rezegjen", de forgásra gyorsan reagáljon.
  const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
  const dt = Math.min(0.08, Math.max(0.005, _compassLastTs ? (now - _compassLastTs) / 1000 : 0.02));
  _compassLastTs = now;

  if (!isFinite(compassHeadingDeg)) {
    compassHeadingDeg = hdg;
    _compassOutlierStreak = 0;
  } else {
    const delta = shortestAngleDelta(compassHeadingDeg, hdg);
    const absd = Math.abs(delta);

    // deadband: apró remegés ignorálása
    if (absd < 1.2) {
      // nem frissítünk, hogy ne remegjen
    } else {
      // outlier: nagy hirtelen ugrásokat (pl. szenzor "flip") csak akkor engedünk át,
      // ha egymás után többször előfordul (különben csak zaj).
      if (absd > 95 && dt < 0.06) {
        _compassOutlierStreak += 1;
        if (_compassOutlierStreak < 3) {
          // ignoráljuk
        } else {
          // 3 egymás után: valószínű tényleg elfordultunk
          _compassOutlierStreak = 0;
          compassHeadingDeg = _normDeg(compassHeadingDeg + delta * 0.35);
        }
      } else {
        _compassOutlierStreak = 0;

        // adaptív időállandó: nagy elfordulásra gyorsabb, kis változásra erősebb simítás
        let tau;
        if (absd > 35) tau = 0.12;
        else if (absd > 15) tau = 0.22;
        else tau = 0.75;

        let alpha = 1 - Math.exp(-dt / tau);
        alpha = clamp(alpha, 0.04, 0.35);
        compassHeadingDeg = _normDeg(compassHeadingDeg + delta * alpha);
      }
    }
  }
  // Telefonon a giroszkóp integráció több készüléken zajos / előjelesen hibás.
  // Ezért a tényleges nav headinghez itt a kisimított iránytűt használjuk,
  // mozgás közben pedig a watchPosition GPS/course heading veheti át a szerepet.
  fusedHeadingDeg = compassHeadingDeg;

  if (_shouldUseCompassHeading() && navMode !== 'heading' && isFinite(fusedHeadingDeg)) {
    if (_smoothHeadingToward(fusedHeadingDeg, 'compass')) {
      _updateMyLocIconHeading();
    }
  }
}




async function requestCompassPermissionIfNeeded(){
  // Csak user-gesture-ből hívjuk (gombnyomás), különben iOS nem engedi.
  try {
    if (!("DeviceOrientationEvent" in window)) return false;
    // iOS 13+
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      if (_compassPermGranted) return true;
      const res = await DeviceOrientationEvent.requestPermission();
      _compassPermGranted = (res === "granted");
      return _compassPermGranted;
    }
    // Android/Chromium: nincs külön permission prompt (ha szenzor elérhető)
    _compassPermGranted = true;
    return true;
  } catch (_) {
    return false;
  }
}

function startCompassIfPossible(){
  if (_compassInited) return;
  if (!("DeviceOrientationEvent" in window)) return;
  _compassInited = true;
  // Próbáljuk az abszolút eventet, ha van.
  window.addEventListener("deviceorientationabsolute", _handleDeviceOrientation, true);
  window.addEventListener("deviceorientation", _handleDeviceOrientation, true);
}

let _prevHeadingRaw = null; // {lat,lng,ts}
 // induláskor bekapcsolva (Saját helyem gomb visszakapcsolja)

let lastRawMyLocation = null;        // {lat,lng,ts,acc}
let filteredMyLocation = null;       // {lat,lng,ts}
let lastCenteredMyLocation = null;   // {lat,lng}
let lastMyLocation = null;           // { lat:number, lng:number, ts:number } (utolsó simított)

const myLocWaiters = new Set(); // resolves waiting for first fix

function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(a));
}

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

function pickAlpha(speedMps, accM) {
  // Navigációs nézethez a túl erős EMA nagy lagot okoz.
  // Kis sebességnél még simítunk, de mozgás közben gyorsabban követünk.
  let a;
  if (!isFinite(speedMps)) speedMps = 0;
  if (speedMps < 0.8) a = 0.14;
  else if (speedMps < 2.0) a = 0.22;
  else if (speedMps < 5.0) a = 0.34;
  else if (speedMps < 10.0) a = 0.48;
  else a = 0.60;

  if (accM <= 8) a = Math.min(0.68, a + 0.06);
  else if (accM >= 25) a = Math.max(0.12, a - 0.05);
  return a;
}

let myLocAnim = { raf: null, from: null, to: null, start: 0, dur: GPS_MARKER_ANIM_MS };
function cancelMyLocAnim() {
  if (myLocAnim.raf) {
    try { cancelAnimationFrame(myLocAnim.raf); } catch (_) {}
    myLocAnim.raf = null;
  }
}

function animateMarkerTo(marker, toLat, toLng, durationMs = GPS_MARKER_ANIM_MS) {
  if (!marker) return;
  const fromLL = marker.getLatLng();
  const from = { lat: fromLL.lat, lng: fromLL.lng };
  const to = { lat: toLat, lng: toLng };

  // ha nagyon közel van, inkább csak tegyük át
  const d = distanceMeters(from.lat, from.lng, to.lat, to.lng);
  if (d < 0.5) {
    marker.setLatLng([to.lat, to.lng]);
    return;
  }

  cancelMyLocAnim();
  myLocAnim = { raf: null, from, to, start: performance.now(), dur: durationMs };

  const step = (t) => {
    const k = clamp((t - myLocAnim.start) / myLocAnim.dur, 0, 1);
    // easeOutCubic
    const e = 1 - Math.pow(1 - k, 3);
    const lat = myLocAnim.from.lat + (myLocAnim.to.lat - myLocAnim.from.lat) * e;
    const lng = myLocAnim.from.lng + (myLocAnim.to.lng - myLocAnim.from.lng) * e;
    marker.setLatLng([lat, lng]);
    if (k < 1) {
      myLocAnim.raf = requestAnimationFrame(step);
    } else {
      myLocAnim.raf = null;
    }
  };

  myLocAnim.raf = requestAnimationFrame(step);
}

async function ensureMyLocationMarker(lat, lng, fetchAddressOnce = false) {
  // v6.3: Saját hely DOM marker helyett GeoJSON layer

  if (fetchAddressOnce) {
    try {
      const j = await nominatimReverseJSONP(lat, lng, { timeoutMs: 8000 });
      if (j && j.display_name) myLocationAddressText = j.display_name;
    } catch (e) {
      // no-op
    }
  }

  await ensureMyLocationLayer();

  // Első frissítésnél erőltessük, utána küszöbökkel / throttling-gal
  const force = !_myLocLastRendered;
  setMyLocationGeoData(lat, lng, lastHeadingDeg, lastMyLocationAccM, { force });

  // Popup szöveg frissítés (ha nyitva van)
  if (myLocationPopup && typeof myLocationPopup.setHTML === 'function') {
    try { myLocationPopup.setHTML(myLocationPopupHtml()); } catch (_) {}
  }
}

function startMyLocationWatch() {
  if (!navigator.geolocation) return;
  if (myLocationWatchId !== null) return;

  myLocationWatchId = navigator.geolocation.watchPosition(
    async (pos) => {
      const latRaw = pos.coords.latitude;
      const lngRaw = pos.coords.longitude;
      const acc = typeof pos.coords.accuracy === "number" ? pos.coords.accuracy : 999999;

      // Release any waiters that are waiting for first position fix
      if (myLocWaiters.size) {
        for (const fn of Array.from(myLocWaiters)) {
          try { fn(true); } catch (_) {}
        }
        myLocWaiters.clear();
      }

      const nowTs = Date.now();

      // v6.3: pontosság cache a saját hely layerhez
      lastMyLocationAccM = acc;

      // Heading források:
      // - mozgás közben kizárólag GPS/course (vagy két GPS pontból számolt bearing)
      // - állva inkább iránytű, de csak north-up módban használjuk aktívan
      let speedHint = (typeof pos.coords.speed === "number" && isFinite(pos.coords.speed)) ? pos.coords.speed : NaN;
      if (!isFinite(speedHint) && lastRawMyLocation) {
        const dtH = Math.max(0.001, (nowTs - lastRawMyLocation.ts) / 1000);
        const dH = distanceMeters(latRaw, lngRaw, lastRawMyLocation.lat, lastRawMyLocation.lng);
        speedHint = dH / dtH;
      }

      lastSpeedMps = speedHint;
      lastSpeedTs = nowTs;
      _updateNavMotionState(speedHint, acc, nowTs);

      const moving = _isMovingForNav();
      const geoHeadingOk = (typeof pos.coords.heading === "number" && isFinite(pos.coords.heading) && moving && acc <= NAV_GEO_HEADING_MIN_ACC_M);
      const hGeo = geoHeadingOk ? _normDeg(pos.coords.heading) : NaN;
      const hCompass = (typeof compassHeadingDeg === "number" && isFinite(compassHeadingDeg)) ? _normDeg(compassHeadingDeg) : NaN;

      let headingChanged = false;
      if (isFinite(hGeo)) {
        _rememberStableCourse(hGeo, nowTs);
        headingChanged = _smoothHeadingToward(hGeo, 'geo') || headingChanged;
        _prevHeadingRaw = { lat: latRaw, lng: lngRaw, ts: nowTs };
      } else if (_prevHeadingRaw) {
        const dHead = distanceMeters(latRaw, lngRaw, _prevHeadingRaw.lat, _prevHeadingRaw.lng);
        const dtHead = (nowTs - _prevHeadingRaw.ts) / 1000;
        const minMoveForHeading = moving ? 3.0 : clamp(Math.max(10, acc * 0.9), 10, 30);

        if (dHead >= minMoveForHeading && dtHead <= 8) {
          const rawBear = bearingDeg(_prevHeadingRaw.lat, _prevHeadingRaw.lng, latRaw, lngRaw);
          if (moving) _rememberStableCourse(rawBear, nowTs);
          headingChanged = _smoothHeadingToward(rawBear, moving ? 'geo' : 'hold') || headingChanged;
          _prevHeadingRaw = { lat: latRaw, lng: lngRaw, ts: nowTs };
        } else if (dtHead > 8) {
          _prevHeadingRaw = { lat: latRaw, lng: lngRaw, ts: nowTs };
        }
      } else {
        _prevHeadingRaw = { lat: latRaw, lng: lngRaw, ts: nowTs };
      }

      if (!headingChanged) {
        const stableCourse = _recentStableCourse();
        if (moving && isFinite(stableCourse)) {
          headingChanged = _smoothHeadingToward(stableCourse, 'hold') || headingChanged;
        } else if (!moving && navMode !== 'heading' && isFinite(hCompass)) {
          const hFused = (typeof fusedHeadingDeg === 'number' && isFinite(fusedHeadingDeg)) ? _normDeg(fusedHeadingDeg) : hCompass;
          headingChanged = _smoothHeadingToward(hFused, 'compass') || headingChanged;
        }
      }

      if (headingChanged) {
        _updateMyLocIconHeading();
      }

      // Nagyon rossz pontosságnál inkább ne frissítsünk (ugrálás/beltér).
      if (acc > GPS_ACCURACY_MAX_M) {
        lastRawMyLocation = { lat: latRaw, lng: lngRaw, ts: nowTs, acc };
        return;
      }

      // Sebesség becslés (ha nincs pos.coords.speed)
      let speed = (typeof pos.coords.speed === "number" && isFinite(pos.coords.speed)) ? pos.coords.speed : NaN;
      if (!isFinite(speed) && lastRawMyLocation) {
        const dt = Math.max(0.001, (nowTs - lastRawMyLocation.ts) / 1000);
        const d = distanceMeters(latRaw, lngRaw, lastRawMyLocation.lat, lastRawMyLocation.lng);
        speed = d / dt;
      }

      // Ugrás szűrés: ha irreálisan nagy az ugrás rövid idő alatt, eldobjuk.
      if (lastRawMyLocation) {
        const dt = Math.max(0.001, (nowTs - lastRawMyLocation.ts) / 1000);
        const d = distanceMeters(latRaw, lngRaw, lastRawMyLocation.lat, lastRawMyLocation.lng);
        const impliedSpeed = d / dt;
        if (d > GPS_JUMP_REJECT_M && impliedSpeed > 40) {
          // pl. 120m ugrás 1-2 mp alatt
          lastRawMyLocation = { lat: latRaw, lng: lngRaw, ts: nowTs, acc };
          return;
        }
      }

      lastRawMyLocation = { lat: latRaw, lng: lngRaw, ts: nowTs, acc };

      // EMA szűrés
      if (!filteredMyLocation) {
        filteredMyLocation = { lat: latRaw, lng: lngRaw, ts: nowTs };
      } else {
        const dToFiltered = distanceMeters(latRaw, lngRaw, filteredMyLocation.lat, filteredMyLocation.lng);
        const deadzone = clamp(Math.max(GPS_DEADZONE_MIN_M, acc * 0.35), GPS_DEADZONE_MIN_M, GPS_DEADZONE_MAX_M);

        // ha gyakorlatilag állunk és a drift kicsi → ne mozdítsuk
        if (dToFiltered < deadzone && (!isFinite(speed) || speed < 0.8)) {
          // csak az időt frissítjük
          filteredMyLocation.ts = nowTs;
        } else {
          const a = pickAlpha(speed, acc);
          filteredMyLocation = {
            lat: filteredMyLocation.lat + (latRaw - filteredMyLocation.lat) * a,
            lng: filteredMyLocation.lng + (lngRaw - filteredMyLocation.lng) * a,
            ts: nowTs,
          };
        }
      }

      lastMyLocation = { lat: filteredMyLocation.lat, lng: filteredMyLocation.lng, ts: nowTs };

      const shouldFetchAddress = myLocationAddressText === "Saját hely";
      await ensureMyLocationMarker(filteredMyLocation.lat, filteredMyLocation.lng, shouldFetchAddress);

      // Közös nav-kamera + bearing frissítés (ne fusson külön center és külön bearing easeTo).
      applyNavCameraAndBearing({ force: false, nowTs, accuracyM: acc });

      // v5.45: 'Középre' gomb frissítése
      updateMyLocFabVisibility();
    },
    (err) => {
      console.warn("watchPosition error", err);
      if (myLocationWatchId !== null) {
        try {
          navigator.geolocation.clearWatch(myLocationWatchId);
        } catch (_) {}
        myLocationWatchId = null;
      }

      // If someone is waiting for a fix, fail them.
      if (myLocWaiters.size) {
        for (const fn of Array.from(myLocWaiters)) {
          try {
            fn(false);
          } catch (_) {}
        }
        myLocWaiters.clear();
      }
    },
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 10000,
    }
  );
}

// Startup check: detect whether geolocation permission is enabled and notify the user if not.
// Note: browsers do not allow us to "enable" permission programmatically. We can only inform.
async function checkGeolocationPermissionOnStartup() {
  try {
    if (!navigator.geolocation) return;

    // Prefer Permissions API when available (does NOT trigger a prompt).
    if (navigator.permissions && navigator.permissions.query) {
      let p;
      try {
        p = await navigator.permissions.query({ name: "geolocation" });
      } catch (_) {
        // Some browsers throw for unsupported permission names.
        p = null;
      }

      if (p && p.state === "denied") {
        alert(
          "A helymeghatározás tiltva van ehhez az oldalhoz.\n\n" +
            "Engedélyezd a böngészőben a lakatszimbólumnál (Webhely beállításai → Hely), majd frissítsd az oldalt."
        );
      } else if (p && p.state === "prompt") {
        alert(
          "A helymeghatározás még nincs engedélyezve.\n\n" +
            "Ha a böngésző rákérdez, válaszd az Engedélyezés opciót, vagy állítsd be a lakatszimbólumnál (Webhely beállításai → Hely)."
        );
      }

      return;
    }

    // No reliable, prompt-free way to check without Permissions API.
    // We intentionally do nothing here to avoid an unsolicited permission prompt on page load.
  } catch (e) {
    // Never fail app startup due to permission checks.
    console.warn("Geolocation permission check failed", e);
  }
}

async function centerToMyLocation() {
  myLocFollowEnabled = true;
  // If we already have a recent fix from watchPosition, use it immediately.
  if (lastMyLocation && Date.now() - lastMyLocation.ts < 60_000) {
    lastMyLocCenterTs = Date.now();
    map.setView([lastMyLocation.lat, lastMyLocation.lng], 20, { animate: true, duration: 0.6 });
    lastCenteredMyLocation = { lat: lastMyLocation.lat, lng: lastMyLocation.lng };
    await ensureMyLocationMarker(lastMyLocation.lat, lastMyLocation.lng, false);
    applyNavCameraAndBearing({ force: true, nowTs: Date.now(), accuracyM: lastMyLocationAccM });
    startMyLocationWatch();
    return true;
  }

  // Try to get a fix via getCurrentPosition (this often triggers permission prompt).
  const got = await new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(false);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        lastMyLocationAccM = (typeof pos.coords.accuracy === "number" && isFinite(pos.coords.accuracy)) ? pos.coords.accuracy : lastMyLocationAccM;
        lastMyLocation = { lat, lng, ts: Date.now() };

        lastMyLocCenterTs = Date.now();
        map.setView([lat, lng], 20, { animate: true, duration: 0.6 });
        lastCenteredMyLocation = { lat, lng };
        await ensureMyLocationMarker(lat, lng, true);
        applyNavCameraAndBearing({ force: true, nowTs: Date.now(), accuracyM: lastMyLocationAccM });

        startMyLocationWatch();
        resolve(true);
      },
      () => resolve(false),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 }
    );
  });

  if (got) return true;

  // Fallback: start watch and wait briefly for first fix.
  startMyLocationWatch();
  const ok = await new Promise((resolve) => {
    const fn = (v) => resolve(v);
    myLocWaiters.add(fn);
    setTimeout(() => {
      if (myLocWaiters.has(fn)) {
        myLocWaiters.delete(fn);
        resolve(false);
      }
    }, 15000);
  });

  if (!ok || !lastMyLocation) return false;

  map.setView([lastMyLocation.lat, lastMyLocation.lng], 20, { animate: true, duration: 0.6 });
  lastCenteredMyLocation = { lat: lastMyLocation.lat, lng: lastMyLocation.lng };
  await ensureMyLocationMarker(lastMyLocation.lat, lastMyLocation.lng, true);
  applyNavCameraAndBearing({ force: true, nowTs: Date.now(), accuracyM: lastMyLocationAccM });
  return true;
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


function wirePopupDelete(marker, dbId) {
  marker.on("popupopen", (e) => {
    const el = e.popup.getElement();
    if (!el) return;
    const btn = el.querySelector(`button[data-del="${dbId}"]`);
    if (!btn) return;

    btn.addEventListener("click", async () => {
      const ok = confirm(
        "Biztosan törlöd ezt a markert? (soft delete)\nA törölt marker később megjeleníthető a szűrés ablakban."
      );
      if (!ok) return;

      await DB.softDeleteMarker(dbId);
      map.removeLayer(marker);
      markersById.delete(dbId);

      if (activeMapFilterIds instanceof Set) activeMapFilterIds.delete(Number(dbId));
      updateShowAllButtonVisibility();
    });
  });
}

function wirePopupMove(marker, dbId) {
  marker.on("popupopen", (e) => {
    const el = e.popup.getElement();
    if (!el) return;
    const btn = el.querySelector(`button[data-move="${dbId}"]`);
    if (!btn) return;

    btn.addEventListener("click", async () => {
      try {
        const m = await DB.getMarkerById(dbId);
        if (!m || m.deletedAt) {
          alert("A törölt marker nem mozgatható.");
          return;
        }
        // Mozgatás mód: a következő térképkattintás áthelyezi a markert.
        moveModeMarkerId = dbId;
        showHint("Mozgatás: válaszd ki az új helyet a térképen.");
        try { marker.closePopup(); } catch (_) {}
      } catch (err) {
        console.error("move from popup failed", err);
        alert("Nem sikerült betölteni a marker adatait.");
      }
    });
  });
}

function wirePopupEdit(marker, dbId) {
  marker.on("popupopen", (e) => {
    const el = e.popup.getElement();
    if (!el) return;
    const btn = el.querySelector(`button[data-edit="${dbId}"]`);
    if (!btn) return;

    btn.addEventListener("click", async () => {
      try {
        const m = await DB.getMarkerById(dbId);
        if (!m || m.deletedAt) {
          alert("A törölt marker nem módosítható.");
          return;
        }
        openEditModal(m);
      } catch (err) {
        console.error("open edit from popup failed", err);
        alert("Nem sikerült betölteni a marker adatait.");
      }
    });
  });
}

function wirePopupPhotos(marker, m) {
  marker.on("popupopen", async (e) => {
    const el = e.popup.getElement();
    if (!el) return;
    const btn = el.querySelector(".btnPhotos");
    const span = el.querySelector(`#pc-${CSS.escape(m.uuid)}`);

    try {
      const cnt = await DB.countPhotosByMarkerUuid(m.uuid);
      if (span) span.textContent = String(cnt);
      if (btn) {
        btn.disabled = cnt === 0;
        btn.title = cnt === 0 ? "Nincs hozzárendelt kép" : "Képek megtekintése";
        btn.onclick = (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          openPhotoGallery(m.uuid, btn.getAttribute("data-title") || idText(m.id));
        };
      }
    } catch (err) {
      console.error("photo count error", err);
      if (span) span.textContent = "0";
    }
  });
}

async function getMarker(id) {
  const n = Number(id);
  if (!Number.isFinite(n)) return null;
  return markersById.get(n) || null;
}

function addMarkerToMap(m) {
  if (!m || !Number.isFinite(Number(m.id))) return;
  markersById.set(Number(m.id), m);
  refreshMarkersSource();
  updateShowAllButtonVisibility();
}

function refreshAllMarkerIcons() {
  // DOM marker ikonok helyett: GeoJSON tulajdonságok újraszámolása (pl. színek)
  refreshMarkersSource({ recalcColor: true });
}


function setMarkerModalControlsDisabled({ addressLocked }) {
  const city = document.getElementById("fCity");
  const street = document.getElementById("fStreet");
  const house = document.getElementById("fHouse");
  const typeBtn = document.getElementById("fTypeBtn");
  if (city) city.disabled = !!addressLocked;
  if (street) street.disabled = !!addressLocked;
  if (house) house.disabled = !!addressLocked;
  if (typeBtn) typeBtn.disabled = !!addressLocked;
}

function setMarkerModalTitle(mode) {
  const titleEl = document.getElementById("markerModalTitle");
  const hintEl = document.getElementById("markerModalHint");
  if (titleEl) titleEl.textContent = mode === "edit" ? "Objektum módosítása" : "Objektum rögzítése";
  if (hintEl) {
    hintEl.textContent = mode === "edit"
      ? "A cím és a típus nem módosítható. Állapot, megjegyzés és fotók frissíthetők."
      : "Bökés helyén jön létre, utána húzással finomítható.";
  }
}

// v5.50: szép, táblázatos választó Típus/Állapot mezőkhöz
function getLabelForType(id){
  const n = Number(id);
  const rec = _formTypes.find(x => Number(x.id) === n);
  return rec ? String(rec.type || '').trim() : '';
}
function getLabelForStatus(id){
  const n = Number(id);
  const rec = _formStatuses.find(x => Number(x.id) === n);
  return rec ? String(rec.status || '').trim() : '';
}

function setPickerValue(kind, id){
  const hid = document.getElementById(kind === 'type' ? 'fType' : 'fStatus');
  const txt = document.getElementById(kind === 'type' ? 'fTypeBtnText' : 'fStatusBtnText');
  if (!hid || !txt) return;
  if (!id) {
    hid.value = '';
    txt.textContent = 'Válassz...';
    return;
  }
  hid.value = String(id);
  txt.textContent = kind === 'type' ? getLabelForType(id) : getLabelForStatus(id);
}

function openPickPanel(kind, anchorBtn){
  const panel = document.getElementById('cmPickPanel');
  if (!panel || !anchorBtn) return;

  const data = (kind === 'type') ? (_formTypes || []) : (_formStatuses || []);
  const selectedId = String(document.getElementById(kind === 'type' ? 'fType' : 'fStatus')?.value || '');

  const title = kind === 'type' ? 'Típus választása' : 'Állapot választása';
  const nameKey = kind === 'type' ? 'type' : 'status';

  const rows = data.map(r => {
    const id = String(r.id);
    const name = String(r[nameKey] || '').trim();
    const internalId = String(r.internalId || '').trim();
    const desc = String(r.description || '').trim();
    const sel = (id && id === selectedId) ? ' data-selected="1"' : '';
    return `<tr data-id="${escapeHtml(id)}"${sel}>
      <td class="col-name">${escapeHtml(name)}</td>
      <td class="col-int">${escapeHtml(internalId)}</td>
      <td class="col-desc">${escapeHtml(desc)}</td>
    </tr>`;
  }).join('');

  panel.innerHTML = `
    <div class="pick-head">
      <div class="pick-title">${escapeHtml(title)}</div>
      <button type="button" class="pick-close" aria-label="Bezárás">×</button>
    </div>
    <table>
      <thead><tr><th>${kind==='type'?'Típus':'Állapot'}</th><th>Saját az.</th><th>Leírás</th></tr></thead>
      <tbody>${rows || ''}</tbody>
    </table>
  `;

  const rect = anchorBtn.getBoundingClientRect();
  const maxW = Math.min(760, window.innerWidth - 20);
  const width = Math.max(320, Math.min(maxW, rect.width * 1.25));
  panel.style.width = width + 'px';
  panel.style.left = Math.min(window.innerWidth - width - 10, Math.max(10, rect.left)) + 'px';
  panel.style.top = Math.min(window.innerHeight - 240, rect.bottom + 8) + 'px';
  panel.style.display = 'block';

  const close = () => { panel.style.display = 'none'; };
  panel.querySelector('.pick-close')?.addEventListener('click', (e) => { e.preventDefault(); close(); });

  const onDoc = (ev) => {
    if (!panel.contains(ev.target) && ev.target !== anchorBtn) {
      document.removeEventListener('mousedown', onDoc, true);
      document.removeEventListener('touchstart', onDoc, true);
      close();
    }
  };
  document.addEventListener('mousedown', onDoc, true);
  document.addEventListener('touchstart', onDoc, true);

  panel.querySelectorAll('tbody tr[data-id]').forEach(tr => {
    tr.addEventListener('click', (e) => {
      e.preventDefault();
      const id = tr.getAttribute('data-id');
      setPickerValue(kind, id);
      close();
    });
  });
}


async function openEditModal(marker) {
  markerModalMode = "edit";
  editingMarkerId = marker.id;
  editingMarkerUuid = marker.uuid;
  pendingLatLng = null;

  setMarkerModalTitle("edit");
  setMarkerModalControlsDisabled({ addressLocked: true });

  // Cím mezők (csak megjelenítés)
  const parts = String(marker.address || "").split(",").map(x => x.trim()).filter(Boolean);
  document.getElementById("fCity").value = parts[0] || "";
  document.getElementById("fStreet").value = parts[1] || "";
  document.getElementById("fHouse").value = parts[2] || "";

  // Típus (nem módosítható)
  setPickerValue('type', marker.typeId || null);
  const typeBtn = document.getElementById('fTypeBtn');
  if (typeBtn) typeBtn.disabled = true;

  // Állapot + megjegyzés (módosítható)
  setPickerValue('status', marker.statusId || null);
  const statusBtn = document.getElementById('fStatusBtn');
  if (statusBtn) statusBtn.disabled = false;
  document.getElementById("fNotes").value = marker.notes || "";

  // Fotók hozzáadás: a marker UUID-hoz kötjük
  currentDraftUuid = editingMarkerUuid || genUuid();
  draftHasSaved = true; // szerkesztésnél soha ne töröljük a képeket cancel esetén
  await updateAttachPhotoLabel();

  document.getElementById("markerModal").style.display = "flex";
}

async function loadMarkers() {
  const all = await DB.getAllMarkersActive();
  markersById.clear();
  (all || []).forEach((m) => {
    if (m && Number.isFinite(Number(m.id)) && !m.deletedAt) markersById.set(Number(m.id), m);
  });
  refreshMarkersSource();
  updateShowAllButtonVisibility();
}

async function fillLookups() {
  // v5.50: Felvitel/szerkesztés a Beállításokban tárolt típusok/állapotok alapján
  const types = await DB.getAllObjectTypes().catch(() => []) || [];
  const statuses = await DB.getAllObjectStatuses().catch(() => []) || [];

  _formTypes = types;
  _formStatuses = statuses;

  // cache a marker színekhez (typeId -> color)
  try { setTypeMetaCache(types); } catch (_) {}

  
  // Marker színek frissítése (GeoJSON layer)
  try { refreshMarkersSource({ recalcColor: true }); } catch (_) {}
// alapértékek (nincs default kiválasztás)
  setPickerValue('type', null);
  setPickerValue('status', null);
}


async function saveMarker() {
  // EDIT mód
  if (markerModalMode === "edit") {
    if (!editingMarkerId) return;
    const notes = document.getElementById("fNotes").value.trim();
    const statusId = Number(document.getElementById("fStatus")?.value || NaN);
    const sRec = _formStatuses.find(x => Number(x.id) === statusId) || null;
    const statusLabel = sRec ? String(sRec.status || '').trim() : '';
    const statusInternalId = sRec ? String(sRec.internalId || '').trim() : '';  await DB.updateMarker(editingMarkerId, {
      statusId: Number.isFinite(statusId) ? statusId : null,
      status: String(statusInternalId || ""),
      statusLabel: String(statusLabel || ""),
      statusInternalId: String(statusInternalId || ""),
      notes,
      updatedAt: Date.now()
    });

    const updated = await DB.getMarkerById(editingMarkerId);
    if (updated && !updated.deletedAt) {
      markersById.set(Number(editingMarkerId), updated);
      refreshMarkersSource();
      if (activeMarkerPopup && activePopupMarkerId === Number(editingMarkerId)) {
        try {
          activeMarkerPopup.setLngLat([updated.lng, updated.lat]);
          activeMarkerPopup.setHTML(popupHtml(updated));
          setTimeout(() => {
            try { wireMarkerPopupButtons(activeMarkerPopup, updated); } catch (_) {}
          }, 0);
        } catch (_) {}
      }
    }

    closeModal();
    showHint("Objektum módosítva.");
    return;
  }

  // ADD mód
  if (!pendingLatLng) return;

  const city = document.getElementById("fCity").value.trim();
  const street = document.getElementById("fStreet").value.trim();
  const house = document.getElementById("fHouse").value.trim();

  const address = [city, street, house].filter(Boolean).join(", ");
  if (!address) {
    alert("A cím megadása kötelező (város / közterület / házszám).");
    return;
  }

  const uuid = currentDraftUuid || genUuid();
  const typeId = Number(document.getElementById("fType")?.value || NaN);
  const statusId = Number(document.getElementById("fStatus")?.value || NaN);

  if (!Number.isFinite(typeId)) {
    alert('A Típus kiválasztása kötelező.');
    return;
  }
  if (!Number.isFinite(statusId)) {
    alert('Az Állapot kiválasztása kötelező.');
    return;
  }
  const tRec = _formTypes.find(x => Number(x.id) === typeId) || null;
  const sRec = _formStatuses.find(x => Number(x.id) === statusId) || null;
  const typeInternalId = tRec ? String(tRec.internalId || '').trim() : '';
  const statusInternalId = sRec ? String(sRec.internalId || '').trim() : '';
  const typeLabel = tRec ? String(tRec.type || '').trim() : '';
  const statusLabel = sRec ? String(sRec.status || '').trim() : '';
  const marker = {
    lat: pendingLatLng.lat,
    lng: pendingLatLng.lng,
    address,
    // v5.48: a marker a kiválasztott típus/állapot ID-t menti (nem beégetett kódot)
    typeId: Number.isFinite(typeId) ? typeId : null,
    statusId: Number.isFinite(statusId) ? statusId : null,
    // kompatibilitás / ikonok: belső azonosító(k) külön is megmaradnak
    type: String(typeInternalId || ""),
    status: String(statusInternalId || ""),
    typeInternalId: String(typeInternalId || ""),
    statusInternalId: String(statusInternalId || ""),
    typeLabel: String(typeLabel || ''),
    statusLabel: String(statusLabel || ''),
    notes: document.getElementById("fNotes").value.trim(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deletedAt: null,
    uuid
  };

  const id = await DB.addMarker(marker);
  marker.id = id;

  // Ettől kezdve a draft-hoz tartozó képek "éles" markerhez vannak kötve.
  draftHasSaved = true;

  addMarkerToMap(marker);
  closeModal();
}

function registerSW() {
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (window.__cmReloaded) return;
    window.__cmReloaded = true;
    location.reload();
  });

  navigator.serviceWorker.register("./service-worker.js").then((reg) => {
    if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });

    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      if (!w) return;
      w.addEventListener("statechange", () => {
        if (w.state === "installed" && navigator.serviceWorker.controller) {
          w.postMessage({ type: "SKIP_WAITING" });
        }
      });
    });

    reg.update().catch(() => {});
  }).catch(() => {});
}

document.addEventListener("DOMContentLoaded", async () => {
  window.addEventListener("online", checkForUpdateOnline);
  document.getElementById("appVersion").textContent = "v" + APP_VERSION;
  registerSW();
  checkForUpdateOnline();

  // Induláskor ellenőrizzük, hogy engedélyezve van-e a helymeghatározás.
  // (Ez nem kér engedélyt automatikusan, csak tájékoztat.)
  await checkGeolocationPermissionOnStartup();

  // === MapLibre + PMTiles (v6.0.1) ===
  if (!window.maplibregl) {
    alert("MapLibre GL hiányzik (maplibregl). Ellenőrizd az index.html include-okat.");
    return;
  }
  if (!window.pmtiles) {
    alert("PMTiles JS hiányzik (pmtiles). Ellenőrizd az index.html include-okat.");
    return;
  }

  // PMTiles protocol regisztráció
  const protocol = new pmtiles.Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);

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
          "text-font": ["Noto Sans Bold"],
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
  };

  map = new maplibregl.Map({
    container: "map",
    style,
    center: [18.31533, 47.48667], // Oroszlány
    zoom: 14,
    attributionControl: true
  });


  // v6.0.8: ha a basemap stílus hiányzó ikonokra hivatkozik, adjunk hozzá átlátszó 1x1 pixelt, hogy ne dobjon warningot
  // FONTOS: a CityMap saját (cm- prefixű) ikonokat NEM szabad itt "lenullázni",
  // mert különben a marker/saját hely ikonok 1x1 átlátszó pixellé válnak.
  try {
    map.on("styleimagemissing", (e) => {
      try {
        const id = e && e.id ? e.id : null;
        if (!id) return;
        if (String(id).startsWith('cm-')) return; // CityMap custom icons
        if (map.hasImage && map.hasImage(id)) return;
        const empty = new Uint8Array([0,0,0,0]);
        map.addImage(id, { width: 1, height: 1, data: empty }, { pixelRatio: 1 });
      } catch(_) {}
    });
  } catch(_) {}


  // MapLibre zoom vezérlő (a saját UI gombok mellett)
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");

  // Map-kompatibilis segédfüggvények a meglévő kódrészekhez
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

  // Map setView/panTo kompat
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

  // fitBounds kompat (CM.latLngBounds-ból)
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

  // map.removeLayer kompat (marker wrapperhez)
  map.removeLayer = (layer) => { try { if (layer && typeof layer.remove === "function") layer.remove(); } catch (_) {} };

  // Események: Map-szerű click objektum (Leaflet-kompat), DE a MapLibre layer-es szignatúrákat is hagyjuk élni.
  const _on = map.on.bind(map);
  map.__rawOn = _on;
  map.on = (evt, layerOrHandler, maybeHandler) => {
    // MapLibre: map.on(event, layerId, handler)
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


  // v5.42.2: térkép forgatás wrapper + iránytű indítás (ha elérhető)
  // v6.x MapLibre: initRotateWrapperIfNeeded() kikapcsolva (CSS rotate wrapper nem kell)
  startCompassIfPossible();


  // v5.40: ha a felhasználó kézzel mozgatja/zoomolja a térképet, kikapcsoljuk a GPS-követést.
  // A "Saját helyem" gomb visszakapcsolja.
  map.on("dragstart", (e) => { if (e && e.originalEvent) myLocFollowEnabled = false; });
  map.on("zoomstart", (e) => { if (e && e.originalEvent) myLocFollowEnabled = false; });
  map.on("moveend", () => updateMyLocFabVisibility());
  map.on("zoomend", () => updateMyLocFabVisibility());


  await DB.init();

  // DB migrations / safety cleanups (uuid backfill, invalid photo rows)
  await DB.backfillMarkerMeta();
  await DB.cleanInvalidPhotos();

  await fillLookups();
  // v5.50: Táblázatos Típus/Állapot választó
  const fTypeBtn = document.getElementById('fTypeBtn');
  if (fTypeBtn) fTypeBtn.addEventListener('click', (e) => { e.preventDefault(); if (!fTypeBtn.disabled) openPickPanel('type', fTypeBtn); });
  const fStatusBtn = document.getElementById('fStatusBtn');
  if (fStatusBtn) fStatusBtn.addEventListener('click', (e) => { e.preventDefault(); if (!fStatusBtn.disabled) openPickPanel('status', fStatusBtn); });


  document.getElementById("btnCancel").addEventListener("click", closeModal);
  document.getElementById("btnSave").addEventListener("click", saveMarker);

  // v5.11: fénykép hozzárendelése (kamera / tallózás)
  const btnAttachPhoto = document.getElementById("btnAttachPhoto");
  const photoInput = document.getElementById("photoInput");
  if (btnAttachPhoto && photoInput) {
    btnAttachPhoto.addEventListener("click", () => {
      if (!currentDraftUuid) {
        draftHasSaved = false;
        currentDraftUuid = genUuid();
      }
      photoInput.value = "";
      photoInput.click();
    });

    photoInput.addEventListener("change", async (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      for (const f of files) {
        try {
          await DB.addPhoto(currentDraftUuid, f);
        } catch (err) {
          console.error("Photo save failed", err);
        }
      }
      await updateAttachPhotoLabel();
    });
  }
  const btnMyLocFab = document.getElementById("btnMyLocFab");
if (btnMyLocFab) {
  btnMyLocFab.addEventListener("click", async () => {
    // Saját hely középre (Google Maps-szerű gomb)
    try { await requestCompassPermissionIfNeeded(); } catch (_) {}
    startCompassIfPossible();
    myLocFollowEnabled = true;

    const ok = await centerToMyLocation();
    if (!ok) {
      alert(
	        "Nem sikerült lekérni a pozíciót.\n\n" +
	        "Ellenőrizd, hogy engedélyezve van-e a helymeghatározás, és hogy van-e GPS/jel."
      );
    }
    updateMyLocFabVisibility();
  });
}


  

// v5.41: Navigáció mód váltó gomb (észak felül / haladási irány)
const navBtn = document.getElementById("btnNavMode");
if (navBtn) {
  const syncNavBtn = () => {
    const isHeading = (navMode === "heading");
    navBtn.classList.toggle("nav-heading", isHeading);
    navBtn.title = isHeading ? "Navigáció: haladási irány" : "Navigáció: észak felül";
    navBtn.setAttribute("aria-label", navBtn.title);
  };
  syncNavBtn();


  navBtn.addEventListener("click", async () => {
    navMode = (navMode === "heading") ? "north" : "heading";
    localStorage.setItem("citymap_nav_mode", navMode);
    syncNavBtn();

    // Mindkét mód váltáskor: követés bekapcsol és saját hely középre
    myLocFollowEnabled = true;

    // Iránytű indítása (Androidon általában prompt nélkül működik)
    try { await requestCompassPermissionIfNeeded(); } catch (_) {}
    startCompassIfPossible();

    // Mindig középre rakjuk a saját helyet gombnyomásra (mindkét módban)
    try {
      await centerToMyLocation();
    } catch (_) {}

    // Forgatás/irány alkalmazása a kiválasztott navigáció mód szerint
    try { _updateMyLocIconHeading(true); } catch (_) {}
    try { applyNavCameraAndBearing({ force: true, nowTs: Date.now(), accuracyM: lastMyLocationAccM }); } catch (_) {}

    // frissítsük az alsó "Középre" gomb láthatóságát is
    try { updateMyLocFabVisibility(); } catch (_) {}
  });
}

  document.getElementById("btnClear").addEventListener("click", async () => {
    if (!confirm("Biztosan törlöd az összes markert?")) return;
    await DB.clearMarkers();
    markersById.clear();
    activeMapFilterIds = null;
    if (activeMarkerPopup) { try { activeMarkerPopup.remove(); } catch (_) {} activeMarkerPopup = null; activePopupMarkerId = null; }
    refreshMarkersSource();
    updateShowAllButtonVisibility();
  });
  map.on("click", async (e) => {
    // Ha marker mozgatás mód aktív, akkor a kattintás az új pozíció
    if (moveModeMarkerId) {
      const ll = rotatedClickLatLng(e);
      const id = Number(moveModeMarkerId);
      moveModeMarkerId = null;
      try {
        await DB.updateMarker(id, { lat: ll.lat, lng: ll.lng, updatedAt: Date.now() });
        const updated = await DB.getMarkerById(id);
        if (updated && !updated.deletedAt) {
          markersById.set(id, updated);
          refreshMarkersSource();
          if (activeMarkerPopup && activePopupMarkerId === id) {
            try {
              activeMarkerPopup.setLngLat([updated.lng, updated.lat]);
              activeMarkerPopup.setHTML(popupHtml(updated));
              setTimeout(() => {
                try { wireMarkerPopupButtons(activeMarkerPopup, updated); } catch (_) {}
              }, 0);
            } catch (_) {}
          }
        } else {
          markersById.delete(id);
          refreshMarkersSource();
        }
        showHint("Objektum áthelyezve.");
      } catch (err) {
        console.error("move marker failed", err);
        alert("Nem sikerült áthelyezni az objektumot.");
      }
      return;
    }
  });


  // v5.44: Új objektum felvitele csak hosszú nyomásra (mobilon is)
  (function setupLongPressAddObject(){
    const container = map.getContainer();
    const LONGPRESS_MS = 550;
    const MOVE_TOL_PX = 12;

    let timer = null;
    let startPt = null;
    let startEvt = null;
    let activePointerId = null;
    let suppressClickUntil = 0;

    function clear(){
      if (timer) { clearTimeout(timer); timer = null; }
      startPt = null;
      startEvt = null;
      activePointerId = null;
    }

    function getPrimaryEvent(ev){
      // TouchEvent -> Touch point; Pointer/Mouse -> itself
      if (ev.touches && ev.touches[0]) return ev.touches[0];
      if (ev.changedTouches && ev.changedTouches[0]) return ev.changedTouches[0];
      return ev;
    }

    function getPoint(ev){
      const e = getPrimaryEvent(ev);
      const x = typeof e.clientX === 'number' ? e.clientX : 0;
      const y = typeof e.clientY === 'number' ? e.clientY : 0;
      return {x,y};
    }

    function eventToLatLng(ev){
      const e = getPrimaryEvent(ev);
      const cp = map.mouseEventToContainerPoint(e); // needs clientX/Y
      return map.containerPointToLatLng(cp);
    }

    function trigger(ev){
      if (!ev) return;
      // Mozgatás módban a sima kattintás kezeli, longpress ne zavarjon be
      if (moveModeMarkerId) return;

      suppressClickUntil = Date.now() + 800;

      try { if (ev.preventDefault) ev.preventDefault(); } catch(_){}
      try { if (ev.stopPropagation) ev.stopPropagation(); } catch(_){}

      const latlngRaw = eventToLatLng(ev);
      const ll = rotatedClickLatLng({ latlng: latlngRaw, originalEvent: ev });
      openModal(ll);
    }

    function onDown(ev){
      // Csak bal gomb / touch / pointer
      if (ev.type === 'mousedown' && ev.button !== 0) return;
      if (ev.type === 'pointerdown') activePointerId = ev.pointerId;

      startPt = getPoint(ev);
      startEvt = ev;

      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        trigger(startEvt);
        clear();
      }, LONGPRESS_MS);
    }

    function onMove(ev){
      if (!startPt || !timer) return;
      if (ev.type === 'pointermove' && activePointerId !== null && ev.pointerId !== activePointerId) return;

      const p = getPoint(ev);
      const dx = p.x - startPt.x;
      const dy = p.y - startPt.y;
      if ((dx*dx + dy*dy) > (MOVE_TOL_PX*MOVE_TOL_PX)) clear();
    }

    function onUp(ev){
      if (ev && ev.type === 'pointerup' && activePointerId !== null && ev.pointerId !== activePointerId) return;
      clear();
    }

    // Pointer events (Android/modern browsers)
    container.addEventListener('pointerdown', onDown, {passive:false});
    container.addEventListener('pointermove', onMove, {passive:true});
    container.addEventListener('pointerup', onUp, {passive:true});
    container.addEventListener('pointercancel', onUp, {passive:true});

    // Fallback
    container.addEventListener('mousedown', onDown, {passive:true});
    container.addEventListener('mousemove', onMove, {passive:true});
    container.addEventListener('mouseup', onUp, {passive:true});
    container.addEventListener('mouseleave', onUp, {passive:true});

    // Touch fallback (iOS/older)
    container.addEventListener('touchstart', onDown, {passive:false});
    container.addEventListener('touchmove', onMove, {passive:true});
    container.addEventListener('touchend', onUp, {passive:true});
    container.addEventListener('touchcancel', onUp, {passive:true});

    // Prevent long-press context menu on mobile
    container.addEventListener('contextmenu', (e) => {
      if (timer || startPt) {
        try { e.preventDefault(); } catch(_){}
      }
    }, {passive:false});

    // Suppress synthetic click right after longpress
    map.on('click', (e) => {
      if (Date.now() < suppressClickUntil) {
        try { e.originalEvent && e.originalEvent.preventDefault && e.originalEvent.preventDefault(); } catch(_){}
        return;
      }
    });
  })();
  // v6.3.1: NE blokkoljuk az indulast geolocation prompttal.
  // Automatikus kozepre csak akkor, ha mar engedelyezve van a hely.
  (async () => {
    try {
      const p = (navigator.permissions && navigator.permissions.query)
        ? await navigator.permissions.query({ name: "geolocation" })
        : null;
      if (p && p.state === "granted") {
        centerToMyLocation().catch(() => {});
      }
    } catch (_) {}
  })();

  await ensureMarkersLayer();
  await ensureMyLocationLayer();
  installMapFeatureClickHandlerOnce();

  await loadMarkers();

  document.getElementById("btnFilter").addEventListener("click", () => {
    // Ha épp térképi megjelenítés-szűrés aktív (csak kijelöltek / táblázat tartalma),
    // akkor a Szűrés gomb úgy viselkedjen, mintha "Összes megjelenítése" történt volna.
    if (isMapFiltered()) showAllMarkersAndFit();
    openFilterModal();
  });
  document.getElementById("btnFilterClose").addEventListener("click", closeFilterModal);
  initFilterDragClose();

  const btnSettings = document.getElementById("btnSettings");
  if (btnSettings) btnSettings.addEventListener("click", openSettingsModal);
  const btnSettingsClose = document.getElementById("btnSettingsClose");
  if (btnSettingsClose) btnSettingsClose.addEventListener("click", closeSettingsModal);

  // oldalsó menü kattintás
  document.querySelectorAll("#settingsModal .settings-nav-item").forEach((b) => {
    b.addEventListener("click", () => setSettingsPage(b.dataset.page));
  });

  // overlay kattintás: csak ha a háttérre kattint (nem a tartalomra)
  const settingsModal = document.getElementById("settingsModal");
  if (settingsModal) {
    settingsModal.addEventListener("click", (e) => {
      if (e.target === settingsModal) closeSettingsModal();
    });
  }

  const btnShowAll = document.getElementById("btnShowAll");
  if (btnShowAll) {
    btnShowAll.addEventListener("click", () => {
      showAllMarkersAndFit();
      showHint("Összes marker megjelenítve.");
    });
  }

    const showBtn = document.getElementById("filterShowBtn");
  if (showBtn) {
    showBtn.disabled = true;
    showBtn.addEventListener("click", () => {
      // v5.15: Megjelenítés
      // - ha van kijelölés: csak a kijelölt (nem törölt) markerek maradjanak a térképen
      // - ha nincs kijelölés: a táblázat aktuális (szűrt) tartalma alapján

      const selectedIds = Array.from(selectedFilterMarkerIds)
        .map((x) => Number(x))
        .filter((x) => Number.isFinite(x));

      let idsToShow = [];
      if (selectedIds.length > 0) {
        // törölt elemeket ne próbáljuk megjeleníteni (amúgy sincsenek a térképen)
        const deletedInSelection = new Set(
          Array.from(document.querySelectorAll('#sfList tr.row-selected.row-deleted'))
            .map((tr) => Number(tr.dataset.markerId))
            .filter((x) => Number.isFinite(x))
        );
        idsToShow = selectedIds.filter((id) => !deletedInSelection.has(id));

        // Ha csak törölt elemek vannak kijelölve, akkor ne zárjuk be az ablakot
        if (idsToShow.length === 0) {
          showHint("Nem lehet megjeleníteni a törölt markereket.");
          return;
        }

        if (deletedInSelection.size > 0) {
          showHint("A törölt markereket nem lehet megjeleníteni – kihagyva.");
        }
      } else {
        idsToShow = getIdsFromCurrentFilterTable({ includeDeleted: false });
        if (idsToShow.length === 0) {
          showHint("Nincs megjeleníthető (nem törölt) marker a listában.");
          return;
        }
      }

      applyMapMarkerVisibility(idsToShow);
      // A térkép legyen úgy méretezve, hogy az összes megjelenített marker látszódjon
      fitMapToMarkersByIds(idsToShow);
      closeFilterModal();
    });
  }

  const clearBtn = document.getElementById("filterClearSelectionBtn");
  if (clearBtn) {
    clearBtn.disabled = true;
    clearBtn.addEventListener("click", clearAllFilterSelections);
  }

  const clearIconBtn = document.getElementById("filterClearSelectionIconBtn");
  if (clearIconBtn) {
    clearIconBtn.addEventListener("click", (e) => { e.preventDefault(); clearAllFilterSelections(); });
  }
  const editBtn = document.getElementById("filterEditBtn");
  if (editBtn) {
    editBtn.disabled = true;
    editBtn.addEventListener("click", async () => {
      const rows = Array.from(document.querySelectorAll('#sfList tr.row-selected'));
      if (rows.length !== 1) return;

      const tr = rows[0];
      if (tr.classList.contains('row-deleted')) return;

      const id = Number(tr.dataset.markerId);
      if (!Number.isFinite(id)) return;

      try {
        const m = await DB.getMarkerById(id);
        if (!m || m.deletedAt) {
          showHint("A törölt marker nem módosítható.");
          return;
        }
        closeFilterModal();
        openEditModal(m);
      } catch (err) {
        console.error("filter edit open failed", err);
        alert("Nem sikerült betölteni a marker adatait.");
      }
    });
  }

  const deleteBtn = document.getElementById("filterDeleteSelectedBtn");
  if (deleteBtn) {
    deleteBtn.disabled = true;
    deleteBtn.addEventListener("click", async () => {
      const ids = Array.from(selectedFilterMarkerIds)
        .map((x) => Number(x))
        .filter((x) => Number.isFinite(x));

      if (ids.length === 0) {
        alert("Nincs kijelölt sor.");
        return;
      }

      const count = ids.length;
      const ok = confirm(
        `Biztosan törlöd (soft delete) a kijelölt ${count} db marker(eke)t? A töröltek később megjeleníthetők.`
      );
      if (!ok) return;

      try {
        // Törlés az adatbázisból (soft delete) + eltávolítás a térképről
        for (const id of ids) {
          await DB.softDeleteMarker(id);

          // GeoJSON rétegből eltűnik (refreshMarkersSource)
          markersById.delete(Number(id));
          if (activeMapFilterIds instanceof Set) activeMapFilterIds.delete(Number(id));
        }

        updateShowAllButtonVisibility();

        // UI frissítés: cache frissítés + kiválasztások törlése + táblázat újraszűrése
        // (különben törlés után a táblázatban még látszódhatnak sorok a cache miatt)
        _allMarkersCache = filterShowDeleted ? await DB.getAllMarkers() : await DB.getAllMarkersActive();
        selectedFilterMarkerIds.clear();
        updateFilterShowButtonState();
        applyFilter();
      } catch (e) {
        console.error(e);
        alert("Hiba történt a törlés közben.");
      }
    });
  }
  const showDeletedBtn = document.getElementById("filterShowDeletedBtn");
  if (showDeletedBtn) {
    showDeletedBtn.addEventListener("click", async () => {
      filterShowDeleted = !filterShowDeleted;
      updateShowDeletedBtn(showDeletedBtn);
      clearAllFilterSelections();
      await refreshFilterData();
    });
  }

  const excelBtn = document.getElementById("filterExcelBtn");
  if (excelBtn) {
    excelBtn.disabled = false;
    excelBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      exportFilterTableToExcel();
    });
  }

  document.getElementById("sfAddress").addEventListener("input", applyFilter);
  document.getElementById("sfType").addEventListener("change", applyFilter);
  document.getElementById("sfStatus").addEventListener("change", applyFilter);
  const sfNotesEl = document.getElementById("sfNotes");
  if (sfNotesEl) sfNotesEl.addEventListener("input", applyFilter);

  // v5.31: Szűrők az oszlopfejlécben (felugró input/select)
  const popIds = ["sfAddressPop", "sfTypePop", "sfStatusPop", "sfNotesPop"];
  function closeHeaderFilterPops() {
    popIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.remove("open");
    });
  }

  function togglePop(popId, focusElId) {
    const pop = document.getElementById(popId);
    if (!pop) return;
    const willOpen = !pop.classList.contains("open");
    closeHeaderFilterPops();
    if (willOpen) {
      pop.classList.add("open");
      const f = document.getElementById(focusElId);
      if (f && typeof f.focus === "function") setTimeout(() => f.focus(), 0);
    }
  }

  const bAddr = document.getElementById("sfAddressFilterBtn");
  if (bAddr) bAddr.addEventListener("click", (e) => { e.stopPropagation(); togglePop("sfAddressPop", "sfAddress"); });
  const bType = document.getElementById("sfTypeFilterBtn");
  if (bType) bType.addEventListener("click", (e) => { e.stopPropagation(); togglePop("sfTypePop", "sfType"); });
  const bStatus = document.getElementById("sfStatusFilterBtn");
  if (bStatus) bStatus.addEventListener("click", (e) => { e.stopPropagation(); togglePop("sfStatusPop", "sfStatus"); });
  const bNotes = document.getElementById("sfNotesFilterBtn");
  if (bNotes) bNotes.addEventListener("click", (e) => { e.stopPropagation(); togglePop("sfNotesPop", "sfNotes"); });

  popIds.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("click", (e) => e.stopPropagation());
  });

  document.addEventListener("click", closeHeaderFilterPops);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeHeaderFilterPops();
  });

  // Modal bezáráskor is zárjuk a felugrókat
  const btnFilterClose = document.getElementById("btnFilterClose");
  if (btnFilterClose) btnFilterClose.addEventListener("click", closeHeaderFilterPops);

  const sfClearBtn = document.getElementById("sfClearAllFiltersBtn");
  if (sfClearBtn) sfClearBtn.addEventListener("click", (e) => {
    e.preventDefault();
    const a = document.getElementById("sfAddress");
    const t = document.getElementById("sfType");
    const s = document.getElementById("sfStatus");
    const n = document.getElementById("sfNotes");
    if (a) a.value = "";
    if (t) t.value = "";
    if (s) s.value = "";
    if (n) n.value = "";
    closeHeaderFilterPops();
    applyFilter();
  });

});


async function checkForUpdateOnline() {
  if (!navigator.onLine) return;

  try {
    const r = await fetch("./app.js", { cache: "no-store" });
    const t = await r.text();
    const m = t.match(/const\s+APP_VERSION\s*=\s*"([^"]+)"/);
    if (m && m[1] !== APP_VERSION) {
      location.reload();
    }
  } catch (e) {}
}


function markerScaleForZoom(z) {
  if (z >= 18) return 1.0;
  if (z === 17) return 0.95;
  if (z === 16) return 0.85;
  if (z === 15) return 0.75;
  if (z === 14) return 0.65;
  return 0.6;
}

function resizedIconForMarker(data, zoom) {
  return iconForMarker(data, zoom);
}


function userIconForZoom(zoom) {
  const scale = markerScaleForZoom(zoom);
  const size = 28 * scale;
  return CM.icon({
    iconUrl: "./icons/user.png",
    iconSize: [size, size],
    iconAnchor: [size / 2, size * 0.9],
    popupAnchor: [0, -size / 2]
  });
}


function myLocArrowIconForZoomHeading(zoom, headingDeg) {
  const scale = markerScaleForZoom(zoom);
  const size = 38 * scale;

  // CM.divIcon: az IMG forgatása inline style-lal történik (Map alap, nincs plugin).
  const rot = (typeof headingDeg === "number" && isFinite(headingDeg)) ? headingDeg : 0;

  return CM.divIcon({
    className: "my-loc-arrow-wrap",
    html:
      `<img class="my-loc-arrow" src="./icons/arrow.svg" ` +
      `style="width:${size}px;height:${size}px;transform:rotate(${rot}deg);transform-origin:50% 50%;" ` +
      `alt="irány">`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size * 0.9],
    popupAnchor: [0, -size / 2]
  });
}

function bearingDeg(lat1, lng1, lat2, lng2) {
  const toRad = (d) => d * Math.PI / 180;
  const toDeg = (r) => r * 180 / Math.PI;
  const φ1 = toRad(lat1), φ2 = toRad(lat2);
  const Δλ = toRad(lng2 - lng1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  let θ = toDeg(Math.atan2(y, x));
  θ = (θ + 360) % 360;
  return θ;
}

// Két szög (fok) közti legkisebb eltérés (-180..+180)
function shortestAngleDelta(fromDeg, toDeg) {
  let d = ((toDeg - fromDeg + 540) % 360) - 180;
  if (d === -180) d = 180;
  return d;
}

function offsetLatLng(lat, lng, bearing, meters) {
  // Nagyon kis távolságokra jó közelítés (nav kijelzéshez)
  const R = 6378137;
  const toRad = (d) => d * Math.PI / 180;
  const toDeg = (r) => r * 180 / Math.PI;

  const δ = meters / R;
  const θ = toRad(bearing);
  const φ1 = toRad(lat);
  const λ1 = toRad(lng);

  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));

  return [toDeg(φ2), toDeg(λ2)];
}


/* ===== Filter modal (v5.3) ===== */
let _allMarkersCache = [];
let _lastFilterList = [];

function openFilterModal() {
  photoCountCache.clear();
  const fm = document.getElementById("filterModal");
  if (fm) {
    const mc = fm.querySelector(".modal-content");
    if (mc) { mc.style.transition = ""; mc.style.transform = ""; mc.style.willChange = ""; }
    fm.style.display = "flex";
  }
  document.documentElement.classList.add("filter-modal-open");
  document.body.classList.add("filter-modal-open");
  initFilterDragClose();
  document.getElementById("sfAddress").value = "";

  // újranyitáskor alapból töröljük a kijelöléseket (később átállítható, ha kell)
  selectedFilterMarkerIds = new Set();
  const showBtn = document.getElementById("filterShowBtn");
  if (showBtn) showBtn.disabled = true;
  refreshFilterData().catch(console.error);

  const showDelBtn = document.getElementById("filterShowDeletedBtn");
  if (showDelBtn) {
    updateShowDeletedBtn(showDelBtn);
  }
}

function closeFilterModal() {
  const fm = document.getElementById("filterModal");
  if (fm) {
    const mc = fm.querySelector(".modal-content");
    if (mc) { mc.style.transition = ""; mc.style.transform = ""; mc.style.willChange = ""; }
    fm.style.display = "none";
  }
  document.documentElement.classList.remove("filter-modal-open");
  document.body.classList.remove("filter-modal-open");
  selectedFilterMarkerIds = new Set();
  const showBtn = document.getElementById("filterShowBtn");
  if (showBtn) showBtn.disabled = true;
}

// Mobilon: a szűrés ablak tetején lévő "fogantyú" lehúzásával bezárás
let _filterDragCloseInited = false;
function initFilterDragClose() {
  if (_filterDragCloseInited) return;
  const handle = document.getElementById("filterDragHandle");
  const modal = document.getElementById("filterModal");
  const modalContent = modal ? modal.querySelector(".modal-content") : null;
  if (!handle || !modal || !modalContent) return;

  _filterDragCloseInited = true;

  let startY = 0;
  let currentDY = 0;
  let dragging = false;

  const THRESHOLD_PX = 110;
  const MAX_TRANSLATE_PX = 260;

  const isMobile = () => window.matchMedia && window.matchMedia("(max-width: 640px)").matches;

  const resetTransform = () => {
    modalContent.style.transition = "";
    modalContent.style.transform = "";
  };

  handle.addEventListener("pointerdown", (e) => {
    if (!isMobile()) return;
    if (modal.style.display !== "flex") return;

    dragging = true;
    startY = e.clientY;
    currentDY = 0;

    modalContent.style.transition = "none";
    modalContent.style.willChange = "transform";

    try { handle.setPointerCapture(e.pointerId); } catch {}
    e.preventDefault();
  });

  handle.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dy = Math.max(0, e.clientY - startY);
    currentDY = dy;
    modalContent.style.transform = `translateY(${Math.min(dy, MAX_TRANSLATE_PX)}px)`;
    e.preventDefault();
  });

  const finish = () => {
    if (!dragging) return;
    dragging = false;

    modalContent.style.transition = "transform 160ms ease";
    modalContent.style.willChange = "";

    if (currentDY >= THRESHOLD_PX) {
      modalContent.style.transform = `translateY(${MAX_TRANSLATE_PX}px)`;
      setTimeout(() => {
        resetTransform();
        closeFilterModal();
      }, 170);
    } else {
      modalContent.style.transform = "translateY(0px)";
      setTimeout(() => resetTransform(), 180);
    }
  };

  handle.addEventListener("pointerup", finish);
  handle.addEventListener("pointercancel", finish);

  // Biztonság: ha bezárjuk más módon (ESC, overlay click), ne maradjon transform
  window.addEventListener("resize", () => {
    if (!isMobile()) resetTransform();
  });
}


async function fillFilterCombos() {
  // v5.48: szűrés a Beállításokban tárolt típusok/állapotok alapján
  let types = await DB.getAllObjectTypes().catch(() => []) || [];
  let statuses = await DB.getAllObjectStatuses().catch(() => []) || [];
  if (!types || types.length === 0) {
    const base = await DB.getLookup("markerTypes") || [];
    types = base.map((x, i) => ({ id: i + 1, internalId: x.code, type: x.label }));
  }
  if (!statuses || statuses.length === 0) {
    const base = await DB.getLookup("markerStatus") || [];
    statuses = base.map((x, i) => ({ id: i + 1, internalId: x.code, status: x.label }));
  }

  const t = document.getElementById("sfType");
  const s = document.getElementById("sfStatus");
    const n = document.getElementById("sfNotes");

  t.innerHTML = '<option value="">Összes</option>';
  types.forEach(x => {
    const o = document.createElement("option");
    o.value = String(x.id);
    o.textContent = String(x.type || "");
    o.dataset.internalId = String(x.internalId || "");
    t.appendChild(o);
  });

  s.innerHTML = '<option value="">Összes</option>';
  statuses.forEach(x => {
    const o = document.createElement("option");
    o.value = String(x.id);
    o.textContent = String(x.status || "");
    o.dataset.internalId = String(x.internalId || "");
    s.appendChild(o);
  });
}

function updateFilterShowButtonState() {
  // 5.8: a kijelöléshez kötött gombok állapotának frissítése
  const hasSelection = selectedFilterMarkerIds.size > 0;

  const tableHasRows = document.querySelectorAll('#sfList tr').length > 0;

  const showBtn = document.getElementById("filterShowBtn");
const clearBtn = document.getElementById("filterClearSelectionBtn");
  const deleteBtn = document.getElementById("filterDeleteSelectedBtn");
const editBtn = document.getElementById("filterEditBtn");

  // v5.15: Megjelenítés akkor is működjön, ha nincs kijelölés (ilyenkor a táblázat aktuális sorai alapján)
  if (showBtn) showBtn.disabled = !tableHasRows;
  if (clearBtn) clearBtn.disabled = !hasSelection;
  if (deleteBtn) deleteBtn.disabled = !hasSelection;

  // v5.19: Objektum módosítása gomb: pontosan 1 sor kijelölve ÉS nem törölt
  if (editBtn) {
    const selectedRows = Array.from(document.querySelectorAll('#sfList tr.row-selected'));
    if (selectedRows.length !== 1) {
      editBtn.disabled = true;
    } else {
      const tr = selectedRows[0];
      editBtn.disabled = tr.classList.contains('row-deleted');
    }
  }

  
  // v5.29: overlay szerkesztés ikon megjelenítése csak akkor, ha pontosan 1 (nem törölt) sor kijelölt
  const selectedRowsForOverlay = Array.from(document.querySelectorAll('#sfList tr.row-selected'));
  document.querySelectorAll('#sfList .sf-edit-overlay-btn').forEach((b) => (b.style.display = 'none'));
  if (selectedRowsForOverlay.length === 1) {
    const tr = selectedRowsForOverlay[0];
    if (!tr.classList.contains('row-deleted')) {
      const b = tr.querySelector('.sf-edit-overlay-btn');
      if (b) b.style.display = 'flex';
    }
  }
}

function getIdsFromCurrentFilterTable({ includeDeleted = false } = {}) {
  const ids = [];
  document.querySelectorAll('#sfList tr').forEach((tr) => {
    const idStr = tr.dataset.markerId;
    if (!idStr) return;
    if (!includeDeleted && tr.classList.contains('row-deleted')) return;
    const id = Number(idStr);
    if (Number.isFinite(id)) ids.push(id);
  });
  return ids;
}

function applyMapMarkerVisibility(idsToShow) {
  const want = new Set((idsToShow || []).map((x) => Number(x)).filter((x) => Number.isFinite(x)));
  // üres listánál -> 0 marker látszik
  activeMapFilterIds = (want.size > 0) ? want : new Set();
  refreshMarkersSource();
  updateShowAllButtonVisibility();
}

// A térkép igazítása a megjelenített markerekhez (szűrés után)
function fitMapToMarkersByIds(idsToShow) {
  if (!map) return;
  const ids = (idsToShow || []).map((x) => Number(x)).filter((x) => Number.isFinite(x));
  if (ids.length === 0) return;

  const latlngs = [];
  for (const id of ids) {
    const m = markersById.get(Number(id));
    if (!m || m.deletedAt) continue;
    latlngs.push({ lat: m.lat, lng: m.lng });
  }
  if (latlngs.length === 0) return;

  if (latlngs.length === 1) {
    const targetZoom = Math.max(map.getZoom(), 18);
    map.setView(latlngs[0], targetZoom, { animate: true });
    return;
  }

  const bounds = CM.latLngBounds(latlngs);
  map.fitBounds(bounds, { padding: [30, 30], maxZoom: 18, animate: true });
}

function toggleFilterRowSelection(markerId, trEl) {
  const id = Number(markerId);
  if (!Number.isFinite(id)) return;

  const cb = trEl ? trEl.querySelector('input.row-select') : null;

  if (selectedFilterMarkerIds.has(id)) {
    selectedFilterMarkerIds.delete(id);
    if (trEl) trEl.classList.remove("row-selected");
    if (cb) cb.checked = false;
  } else {
    selectedFilterMarkerIds.add(id);
    if (trEl) trEl.classList.add("row-selected");
    if (cb) cb.checked = true;
  }
  updateFilterShowButtonState();
}

function selectOnlyFilterRow(markerId, trEl) {
  const id = Number(markerId);
  if (!Number.isFinite(id)) return;

  // v5.30.3: ha már pontosan ez az egy van kijelölve és újra rákattintunk,
  // akkor vegyük vissza a kijelölést (toggle off).
  if (selectedFilterMarkerIds.size === 1 && selectedFilterMarkerIds.has(id)) {
    clearAllFilterSelections();
    return;
  }

selectedFilterMarkerIds.clear();
  document.querySelectorAll('#sfList tr.row-selected').forEach(tr => tr.classList.remove('row-selected'));
  document.querySelectorAll('#sfList input.row-select').forEach(cb => cb.checked = false);

  selectedFilterMarkerIds.add(id);
  if (trEl) {
    trEl.classList.add('row-selected');
    const cb = trEl.querySelector('input.row-select');
    if (cb) cb.checked = true;
  }

  updateFilterShowButtonState();
}

function clearAllFilterSelections() {
  selectedFilterMarkerIds.clear();
  document.querySelectorAll('#sfList tr.row-selected').forEach(tr => tr.classList.remove('row-selected'));
  document.querySelectorAll('#sfList input.row-select').forEach(cb => cb.checked = false);
  updateFilterShowButtonState();
}


function formatGps(m) {
  if (!m) return "";
  const lat = Number(m.lat);
  const lng = Number(m.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
  return lat.toFixed(6) + ", " + lng.toFixed(6);
}

function renderFilterList(list) {
const tb = document.getElementById("sfList");
  tb.innerHTML = "";
  _lastFilterList = Array.isArray(list) ? list.slice() : [];
  list.forEach(m => {
    const tr = document.createElement("tr");
    tr.dataset.markerId = String(m.id);
	tr.dataset.markerUuid = String(m.uuid || "");
	    if (selectedFilterMarkerIds.has(m.id)) {
	      tr.classList.add("row-selected");
	    }
	    // Soft delete: törölt sorok vizuális jelölése
	    if (m.deletedAt || m.deleted) {
	      tr.classList.add("row-deleted");
	    }
    tr.innerHTML = `
      <td style="text-align:center;"><input class="row-select" type="checkbox" ${selectedFilterMarkerIds.has(m.id) ? 'checked' : ''}></td>
      <td class="sf-photo-cell">
        <button class="sf-photo-btn" type="button" title="Fotók" aria-label="Fotók" disabled>
          <svg class="ico" aria-hidden="true"><use href="#i-camera"></use></svg>
        </button>
      </td>
      <td>${escapeHtml(m.address)}</td>
      <td>${escapeHtml(m.typeLabel)}</td>
      <td>${escapeHtml(m.statusLabel)}</td>
      <td>${escapeHtml(m.notes || "")}</td>
      <td class="sf-gps-cell">${escapeHtml(formatGps(m))}</td>
      <td class="sf-id-cell">
        <span class="sf-id-text">${idText(m.id)}</span>
        <button class="sf-edit-overlay-btn" type="button" title="Objektum módosítása" aria-label="Objektum módosítása">
          <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-edit"></use></svg>
        </button>
      </td>
`;

	    // Checkbox: többszörös kijelölés (nem törli a többit)
	    const cb = tr.querySelector('input.row-select');
	    if (cb) {
	      cb.addEventListener('click', (ev) => ev.stopPropagation());
	      cb.addEventListener('change', (ev) => {
	        ev.stopPropagation();
	        const markerId = tr.dataset.markerId;
	        if (!markerId) return;
	        toggleFilterRowSelection(markerId, tr);
	      });
	
	    // v5.29: overlay "Objektum módosítása" ikon az ID mezőn (csak 1 kijelölésnél fog látszani)
	    const overlayEditBtn = tr.querySelector('.sf-edit-overlay-btn');
	    if (overlayEditBtn) {
	      overlayEditBtn.addEventListener('click', async (ev) => {
	        ev.stopPropagation();
	        if (tr.classList.contains('row-deleted')) return;
	        const id = Number(tr.dataset.markerId);
	        if (!Number.isFinite(id)) return;
	        try {
	          const m = await DB.getMarkerById(id);
	          if (!m || m.deletedAt) {
	            showHint("A törölt marker nem módosítható.");
	            return;
	          }
	          closeFilterModal();
	          openEditModal(m);
	        } catch (err) {
	          console.error("filter edit open failed", err);
	          alert("Nem sikerült betölteni a marker adatait.");
	        }
	      });
	    

        // v5.30: fotó ikon oszlop (a bal oldali "Fotók" gomb kiváltása)
        const photoBtn = tr.querySelector('.sf-photo-btn');
        const uuid = String(tr.dataset.markerUuid || "");
        if (photoBtn) {
          // kattintás: galéria megnyitása az adott markerhez (kijelölést nem módosít)
          photoBtn.addEventListener('click', async (ev) => {
            ev.stopPropagation();
            const id = Number(tr.dataset.markerId);
            if (!Number.isFinite(id)) return;
            try {
              const marker = await DB.getMarkerById(id);
              if (!marker) return;
              // ugyanazt a galéria megnyitót használjuk, mint eddig a "Fotók" gomb
              openPhotoGalleryForMarker(marker);
            } catch (e) {
              console.error("openPhotoGalleryForMarker failed", e);
              alert("Nem sikerült megnyitni a fotókat.");
            }
          });

          // engedélyezés/halványítás fotószám alapján
          getPhotoCountCached(uuid).then((cnt) => {
            const has = Number(cnt) > 0;
            photoBtn.disabled = !has;
          });
        }
}

    }

	    // 1 kattintás: kijelölés (több sor is lehet)
	    tr.addEventListener("click", (ev) => {
	      ev.stopPropagation();
	      const markerId = tr.dataset.markerId;
	      if (!markerId) return;
	      selectOnlyFilterRow(markerId, tr);
	    });

	    // dupla kattintás: ugrás a markerre + ablak bezárása
	    tr.addEventListener("dblclick", (ev) => {
	      ev.stopPropagation();
	      // Törölt elemre ne ugorjunk / ne zárjuk be a szűrés ablakot
	      const markerId = tr.dataset.markerId;
	      if (markerId) {
	        // biztos kijelölés a duplakattnál is (egykijelölés)
	      selectOnlyFilterRow(markerId, tr);
	      }
	      // ha törölt (soft delete), akkor ne zárjuk be a modalt
	      if (tr.classList.contains("row-deleted")) return;
	      const id = Number(tr.dataset.markerId);
	      const m = markersById.get(id);
	      if (m && !m.deletedAt) {
	        map.setView({ lat: m.lat, lng: m.lng }, Math.max(map.getZoom(), 18));
	        // popup nyitás (GeoJSON layer)
	        try { openMarkerPopup(m, { lng: m.lng, lat: m.lat }); } catch (_) {}
	        closeFilterModal();
	      }
	    });
    tb.appendChild(tr);
  });
	  updateFilterShowButtonState();
}


function updateHeaderFilterIndicators() {
  const aVal = (document.getElementById("sfAddress")?.value || "").trim();
  const tVal = (document.getElementById("sfType")?.value || "").trim();
  const sVal = (document.getElementById("sfStatus")?.value || "").trim();
  const nVal = (document.getElementById("sfNotes")?.value || "").trim();

  const addrTh = document.getElementById("sfAddressTh");
  const typeTh = document.getElementById("sfTypeTh");
  const statusTh = document.getElementById("sfStatusTh");
  const notesTh = document.getElementById("sfNotesTh");

  if (addrTh) addrTh.classList.toggle("active", aVal.length > 0);
  if (typeTh) typeTh.classList.toggle("active", tVal.length > 0);
  if (statusTh) statusTh.classList.toggle("active", sVal.length > 0);
  if (notesTh) notesTh.classList.toggle("active", nVal.length > 0);
}

// ---------------------------
// Excel export (Filter table)
// ---------------------------
function csvEscape(val, delim) {
  const s = (val === null || val === undefined) ? "" : String(val);
  const needs = s.includes('"') || s.includes('\n') || s.includes('\r') || s.includes(delim);
  if (!needs) return s;
  return '"' + s.replace(/"/g, '""') + '"';
}

function buildFilterCsv(rows) {
  const delim = ';'; // HU locale friendly (Excel)
  const header = ["Cím", "Típus", "Állapot", "Megjegyzés", "GPS", "ID", "Törölt"];
  const lines = [];
  lines.push(header.map(h => csvEscape(h, delim)).join(delim));

  (rows || []).forEach((m) => {
    const deleted = (m && (m.deletedAt || m.deleted)) ? "IGEN" : "";
    const gps = formatGps(m);
    const line = [
      m?.address || "",
      m?.typeLabel || "",
      m?.statusLabel || "",
      m?.notes || "",
      gps || "",
      idText(m?.id),
      deleted
    ];
    lines.push(line.map(v => csvEscape(v, delim)).join(delim));
  });

  // UTF-8 BOM, so Excel reads accents correctly
  return '\ufeff' + lines.join('\r\n');
}

async function exportFilterTableToExcel() {
  try {
    const rows = Array.isArray(_lastFilterList) ? _lastFilterList : [];
    const csv = buildFilterCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });

    const fn = `CityMap_export_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`;

    // Prefer Save As dialog if available (Chromium)
    if (window.showSaveFilePicker) {
      const handle = await window.showSaveFilePicker({
        suggestedName: fn,
        types: [{ description: "CSV (Excel)", accept: { "text/csv": [".csv"] } }]
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    }

    // Fallback: normal download (browser will ask location depending on settings)
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fn;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (err) {
    // User cancelled the save dialog -> do nothing
    if (err && (err.name === "AbortError" || String(err.message || "").toLowerCase().includes("abort"))) {
      return;
    }
    console.error("Excel export failed", err);
    alert("Nem sikerült exportálni a táblázatot.");
  }
}

function applyFilter() {
  const a = (document.getElementById("sfAddress")?.value || "").trim().toLowerCase();
  const n = (document.getElementById("sfNotes")?.value || "").trim().toLowerCase();

  const typeSel = document.getElementById("sfType");
  const statusSel = document.getElementById("sfStatus");

  const tId = Number((typeSel?.value || "").trim());
  const sId = Number((statusSel?.value || "").trim());
  const hasType = Number.isFinite(tId) && tId > 0;
  const hasStatus = Number.isFinite(sId) && sId > 0;
  const tInternal = (hasType && typeSel && typeSel.selectedIndex >= 0)
    ? (typeSel.options[typeSel.selectedIndex]?.dataset?.internalId || "")
    : "";
  const sInternal = (hasStatus && statusSel && statusSel.selectedIndex >= 0)
    ? (statusSel.options[statusSel.selectedIndex]?.dataset?.internalId || "")
    : "";

  const res = (_allMarkersCache || []).filter((m) => {
    const addr = String(m?.address || "").toLowerCase();

    const typeOk = !hasType || (Number(m?.typeId) === tId) || (!!tInternal && (String(m?.typeInternalId || m?.type || "") === String(tInternal)));
    const statusOk = !hasStatus || (Number(m?.statusId) === sId) || (!!sInternal && (String(m?.statusInternalId || m?.status || "") === String(sInternal)));

    const addrOk = !a || addr.includes(a);
    const notes = String(m?.notes || "").toLowerCase();
    const notesOk = !n || notes.includes(n);

    return addrOk && typeOk && statusOk && notesOk;
  });

  updateHeaderFilterIndicators();
  renderFilterList(res);
}

// ---------------------------
// Settings modal (v5.20.0)
// ---------------------------

function openSettingsModal() {
  const m = document.getElementById("settingsModal");
  if (!m) return;
  m.style.display = "flex";
  setSettingsPage("type");
}

function closeSettingsModal() {
  const m = document.getElementById("settingsModal");
  if (!m) return;
  m.style.display = "none";
}

function setSettingsPage(page) {
  const titleEl = document.getElementById("settingsTitle");
  const hintEl = document.getElementById("settingsHint");
  const contentEl = document.getElementById("settingsContent");
  const navItems = Array.from(document.querySelectorAll("#settingsModal .settings-nav-item"));

  navItems.forEach((b) => b.classList.toggle("active", b.dataset.page === page));

  if (!titleEl || !hintEl || !contentEl) return;

  if (page === "status") {
    titleEl.textContent = "Objektum állapota";
    hintEl.textContent = "Állapotok kezelése (helyi adatbázis / IndexedDB).";
    renderSettingsObjectStatusesPage();
  } else if (page === "users") {
    titleEl.textContent = "Felhasználó kezelés";
    hintEl.textContent = "Itt később a felhasználók kezelése (jogosultságok, admin, felvivő stb.) lesz elérhető.";
    renderSettingsPlaceholderPage();
  } else {
    titleEl.textContent = "Objektum típusa";
    hintEl.textContent = "Típusok kezelése (helyi adatbázis / IndexedDB).";
    renderSettingsObjectTypesPage();
  }
}

// ---------------------------
// Settings: Objektum típusa (v5.21)
// ---------------------------

// ---------------------------
// Excel-szerű színválasztó (v5.22.1)
// - 30 szín: 10 oszlop x 3 árnyalat
// - "További színek...": natív color picker
// ---------------------------


// ---------------------------
// "Excel-szerű" (saját) szín dialógus – natív picker helyett
// Cél: Edge laptopon is működjön megbízhatóan.
// ---------------------------


function hexToRgb(hex) {
  const m = String(hex).trim().match(/^#([0-9a-fA-F]{6})$/);
  if (!m) return { r: 255, g: 255, b: 255 };
  const v = parseInt(m[1], 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

function rgbToHex(r, g, b) {
  const to2 = (x) => clamp(Math.round(x), 0, 255).toString(16).padStart(2, "0");
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = clamp(s, 0, 100) / 100;
  l = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0, g1 = 0, b1 = 0;
  if (h < 60) { r1 = c; g1 = x; b1 = 0; }
  else if (h < 120) { r1 = x; g1 = c; b1 = 0; }
  else if (h < 180) { r1 = 0; g1 = c; b1 = x; }
  else if (h < 240) { r1 = 0; g1 = x; b1 = c; }
  else if (h < 300) { r1 = x; g1 = 0; b1 = c; }
  else { r1 = c; g1 = 0; b1 = x; }
  return {
    r: (r1 + m) * 255,
    g: (g1 + m) * 255,
    b: (b1 + m) * 255
  };
}

// ---------------------------
// v5.23.2: "Színek szerkesztése" – Excel/Windows jellegű, egyetlen ablak
// - nincs több szintű felugró
// - Edge laptopon is megbízható (nem natív picker)
// - Alapszínek + Egyéni színek (mentve localStorage-ba)
// ---------------------------

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  const v = max;
  return { h, s: s * 100, v: v * 100 };
}

function hsvToRgb(h, s, v) {
  h = ((h % 360) + 360) % 360;
  s = clamp(s, 0, 100) / 100;
  v = clamp(v, 0, 100) / 100;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r1 = 0, g1 = 0, b1 = 0;
  if (h < 60) { r1 = c; g1 = x; b1 = 0; }
  else if (h < 120) { r1 = x; g1 = c; b1 = 0; }
  else if (h < 180) { r1 = 0; g1 = c; b1 = x; }
  else if (h < 240) { r1 = 0; g1 = x; b1 = c; }
  else if (h < 300) { r1 = x; g1 = 0; b1 = c; }
  else { r1 = c; g1 = 0; b1 = x; }
  return {
    r: (r1 + m) * 255,
    g: (g1 + m) * 255,
    b: (b1 + m) * 255
  };
}

const CUSTOM_COLORS_KEY = "citymap_custom_colors_v1";
function loadCustomColors() {
  try {
    const raw = localStorage.getItem(CUSTOM_COLORS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (Array.isArray(arr)) {
      const out = arr.map((x) => (typeof x === "string" ? x : "")).slice(0, 24);
      while (out.length < 24) out.push("");
      return out;
    }
  } catch {}
  return Array(24).fill("");
}
function saveCustomColors(arr) {
  try { localStorage.setItem(CUSTOM_COLORS_KEY, JSON.stringify(arr)); } catch {}
}

// Alapszínek: közel Excel/Win paletta hangulat (48 db)
const BASE_COLORS = [
  "#F87171","#EF4444","#7F1D1D","#FCA5A5","#F59E0B","#F97316","#9A3412","#FDBA74","#FDE047","#FACC15","#A16207","#FEF08A",
  "#86EFAC","#22C55E","#166534","#BBF7D0","#34D399","#14B8A6","#0F766E","#99F6E4","#22D3EE","#06B6D4","#0E7490","#A5F3FC",
  "#60A5FA","#3B82F6","#1D4ED8","#BFDBFE","#818CF8","#6366F1","#4338CA","#C7D2FE","#A78BFA","#8B5CF6","#6D28D9","#DDD6FE",
  "#F472B6","#EC4899","#BE185D","#FBCFE8","#FB7185","#E11D48","#9F1239","#FECDD3","#111827","#6B7280","#D1D5DB","#FFFFFF"
];

let _colorsEditorOverlay = null;

function openColorsEditorDialog(startHex, onOk) {
  const initial = /^#([0-9a-fA-F]{6})$/.test(String(startHex || "")) ? String(startHex).toUpperCase() : "#3B82F6";
  const rgb0 = hexToRgb(initial);
  const hsv0 = rgbToHsv(rgb0.r, rgb0.g, rgb0.b);

  let hue = hsv0.h;  // 0..360
  let sat = hsv0.s;  // 0..100
  let val = hsv0.v;  // 0..100
  let currentHex = initial;

  // overlay újraépítése
  if (_colorsEditorOverlay) _colorsEditorOverlay.remove();
  const overlay = document.createElement("div");
  overlay.className = "colors-editor-overlay";
  overlay.innerHTML = `
    <div class="colors-editor colors-editor-compact" role="dialog" aria-modal="true">
      <div class="colors-editor-titlebar">
        <div class="colors-editor-title">Színek szerkesztése</div>
        <button type="button" class="colors-editor-x" aria-label="Bezár">×</button>
      </div>

      <div class="colors-editor-main">
        <div class="ce-left">
          <div class="ce-picker">
            <div class="ce-sv" aria-label="Szín kiválasztása" tabindex="0">
              <div class="ce-sv-white"></div>
              <div class="ce-sv-black"></div>
              <div class="ce-sv-cursor" aria-hidden="true"></div>
            </div>
            <div class="ce-bars">
              <div class="ce-bar ce-hue" aria-label="Árnyalat" tabindex="0">
                <div class="ce-bar-cursor" data-bar="hue"></div>
              </div>
            </div>
          </div>
        </div>

        <div class="ce-right">
          <label class="small" style="color:#6b7280; font-weight:800;">Kód (HEX)</label>
          <input class="ce-hex" type="text" value="${initial}" />

          <div class="ce-preview" style="margin-top:14px;">
            <div class="ce-preview-box">
              <div class="ce-preview-swatch" data-kind="new"></div>
              <div>
                <div class="ce-preview-label">Új</div>
                <div class="ce-preview-hex" data-kind="new"></div>
              </div>
            </div>
            <div class="ce-preview-box">
              <div class="ce-preview-swatch" data-kind="old"></div>
              <div>
                <div class="ce-preview-label">Jelenlegi</div>
                <div class="ce-preview-hex" data-kind="old"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="colors-editor-bottom">
        <div class="ce-section">
          <div class="ce-section-title">Alapszínek</div>
          <div class="ce-base"></div>
        </div>
      </div>

      <div class="colors-editor-actions">
        <button type="button" class="btn btn-primary ce-ok">OK</button>
        <button type="button" class="btn ce-cancel">Mégse</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  _colorsEditorOverlay = overlay;

  const btnX = overlay.querySelector(".colors-editor-x");
  const btnOk = overlay.querySelector(".ce-ok");
  const btnCancel = overlay.querySelector(".ce-cancel");
  const sv = overlay.querySelector(".ce-sv");
  const svCursor = overlay.querySelector(".ce-sv-cursor");
  const hueBar = overlay.querySelector(".ce-hue");
  const hueCursor = overlay.querySelector(".ce-bar-cursor[data-bar='hue']");
  const hexInput = overlay.querySelector(".ce-hex");
  const prevNewSw = overlay.querySelector(".ce-preview-swatch[data-kind='new']");
  const prevOldSw = overlay.querySelector(".ce-preview-swatch[data-kind='old']");
  const prevNewHex = overlay.querySelector(".ce-preview-hex[data-kind='new']");
  const prevOldHex = overlay.querySelector(".ce-preview-hex[data-kind='old']");
  const baseWrap = overlay.querySelector(".ce-base");

  function setFromHsv() {
    const rgb = hsvToRgb(hue, sat, val);
    currentHex = rgbToHex(rgb.r, rgb.g, rgb.b).toUpperCase();
    hexInput.value = currentHex;
    updateUi();
  }

  function setFromHex(hex) {
    const v = String(hex || "").trim();
    if (!/^#([0-9a-fA-F]{6})$/.test(v)) return;
    const rgb = hexToRgb(v);
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    hue = hsv.h; sat = hsv.s; val = hsv.v;
    currentHex = v.toUpperCase();
    hexInput.value = currentHex;
    updateUi();
  }

  function updateUi() {
    // SV háttér: hue alapján
    const hueRgb = hsvToRgb(hue, 100, 100);
    const hueHex = rgbToHex(hueRgb.r, hueRgb.g, hueRgb.b);
    sv.style.background = hueHex;

    // SV cursor
    const svRect = sv.getBoundingClientRect();
    const x = clamp((sat / 100) * svRect.width, 0, svRect.width);
    const y = clamp(((100 - val) / 100) * svRect.height, 0, svRect.height);
    svCursor.style.left = `${x}px`;
    svCursor.style.top = `${y}px`;

    // hue cursor
    const hb = hueBar.getBoundingClientRect();
    hueCursor.style.top = `${clamp((hue / 360) * hb.height, 0, hb.height)}px`;

    // preview
    prevNewSw.style.background = currentHex;
    prevNewHex.textContent = currentHex;
  }

  function initPreview() {
    prevOldSw.style.background = initial;
    prevOldHex.textContent = initial;
    prevNewSw.style.background = currentHex;
    prevNewHex.textContent = currentHex;
  }

  function renderBaseColors() {
    baseWrap.innerHTML = "";
    BASE_COLORS.forEach((hex) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ce-swatch";
      b.style.background = hex;
      b.title = hex;
      b.addEventListener("click", () => setFromHex(hex));
      baseWrap.appendChild(b);
    });
  }

  function close() {
    overlay.remove();
    if (_colorsEditorOverlay === overlay) _colorsEditorOverlay = null;
  }

  function commit() {
    onOk(currentHex);
    close();
  }

  // Interakciók: SV
  function handleSv(e) {
    const r = sv.getBoundingClientRect();
    const cx = clamp(e.clientX - r.left, 0, r.width);
    const cy = clamp(e.clientY - r.top, 0, r.height);
    sat = (cx / r.width) * 100;
    val = 100 - (cy / r.height) * 100;
    setFromHsv();
  }
  sv.addEventListener("pointerdown", (e) => {
    sv.setPointerCapture(e.pointerId);
    handleSv(e);
    const move = (ev) => handleSv(ev);
    const up = (ev) => {
      try { sv.releasePointerCapture(ev.pointerId); } catch {}
      sv.removeEventListener("pointermove", move);
      sv.removeEventListener("pointerup", up);
      sv.removeEventListener("pointercancel", up);
    };
    sv.addEventListener("pointermove", move);
    sv.addEventListener("pointerup", up);
    sv.addEventListener("pointercancel", up);
  });

  // Hue bar
  function handleHue(e) {
    const r = hueBar.getBoundingClientRect();
    const cy = clamp(e.clientY - r.top, 0, r.height);
    hue = (cy / r.height) * 360;
    setFromHsv();
  }
  hueBar.addEventListener("pointerdown", (e) => {
    hueBar.setPointerCapture(e.pointerId);
    handleHue(e);
    const move = (ev) => handleHue(ev);
    const up = (ev) => {
      try { hueBar.releasePointerCapture(ev.pointerId); } catch {}
      hueBar.removeEventListener("pointermove", move);
      hueBar.removeEventListener("pointerup", up);
      hueBar.removeEventListener("pointercancel", up);
    };
    hueBar.addEventListener("pointermove", move);
    hueBar.addEventListener("pointerup", up);
    hueBar.addEventListener("pointercancel", up);
  });

  // HEX input
  hexInput.addEventListener("change", () => setFromHex(hexInput.value));

  // Gombok
  btnX.addEventListener("click", close);
  btnCancel.addEventListener("click", close);
  btnOk.addEventListener("click", commit);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  const esc = (e) => {
    if (!_colorsEditorOverlay) return;
    if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc); }
  };
  document.addEventListener("keydown", esc);

  // init
  renderBaseColors();
  initPreview();
  updateUi();

  setTimeout(() => hexInput.focus(), 0);
}



let _objectTypesCache = [];
let _objectTypesUiWired = false;

function renderSettingsPlaceholderPage() {
  const container = document.getElementById("settingsExtra");
  if (!container) return;
  container.innerHTML = "";
}

function renderSettingsObjectTypesPage() {
  const container = document.getElementById("settingsExtra");
  if (!container) return;

  container.innerHTML = `
    <div style="margin-top:12px; display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
      <div class="small" style="color:#666;">Oszlopok: Azonosító, Belső azonosító, Típus, Leírás, Szín</div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-save" id="btnAddObjectType" type="button">Új sor</button>
      </div>
    </div>

    <div class="settings-table-wrap" style="margin-top:10px;">
      <table class="sf-table" id="objectTypesTable" style="min-width:900px;">
        <thead>
          <tr>
            <th style="width:120px;">Azonosító</th>
            <th style="width:160px;">Belső azonosító</th>
            <th style="width:220px;">Típus *</th>
            <th style="width:260px;">Leírás</th>
            <th style="width:140px;">Szín</th>
          </tr>
        </thead>
        <tbody id="objectTypesTbody"></tbody>
      </table>
    </div>
  `;

  if (!_objectTypesUiWired) {
    _objectTypesUiWired = true;


    // delegált eseménykezelés (minden input/select)
    container.addEventListener("input", (e) => {
      const tr = e.target.closest("tr[data-ot-id]");
      if (!tr) return;
      markRowDirty(tr);
    });
    container.addEventListener("change", async (e) => {
      const tr = e.target.closest("tr[data-ot-id]");
      if (!tr) return;
      // pl. rejtett szín input csak change eseményt kap
      markRowDirty(tr);
      await saveObjectTypeRow(tr);
    });
    container.addEventListener("blur", async (e) => {
      const tr = e.target.closest("tr[data-ot-id]");
      if (!tr) return;
      await saveObjectTypeRow(tr);
    }, true);
    container.addEventListener("click", async (e) => {
      // Új sor (delegált, mert a jobb oldal újrarenderelődik lapváltáskor)
      const addBtn = e.target.closest("#btnAddObjectType");
      if (addBtn) {
        await DB.init();
        const newRec = {
          internalId: "",
          type: "",
          description: "",
          color: "#22c55e",
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        const id = await DB.addObjectType(newRec);
        showHint("Új sor létrehozva.");
        await loadAndRenderObjectTypes({ focusId: id });
        return;
      }

      // Sor törlése
      const btn = e.target.closest("button[data-action='delete-ot']");
      if (btn) {
        const tr = btn.closest("tr[data-ot-id]");
        if (!tr) return;
        const id = Number(tr.dataset.otId);
        if (!Number.isFinite(id)) return;
        if (!confirm("Biztosan törlöd ezt a típust?")) return;
        await DB.deleteObjectType(id);
        showHint("Típus törölve.");
        await loadAndRenderObjectTypes();
        return;
      }

      // Szín gomb (v5.23.2): közvetlen, egyetlen "Színek szerkesztése" ablak
      const colorBtn = e.target.closest("button.color-btn");
      if (colorBtn) {
        const tr = colorBtn.closest("tr[data-ot-id]");
        if (!tr) return;
        const input = tr.querySelector("input[data-field='color']");
        if (!input) return;
        openColorsEditorDialog(String(input.value || "#22c55e"), (hex) => {
          input.value = hex;
          input.dispatchEvent(new Event("change", { bubbles: true }));
          markRowDirty(tr);
        });
        return;
      }
    });
  }

  loadAndRenderObjectTypes();
}

function markRowDirty(tr) {
  tr.dataset.dirty = "1";
}

function readObjectTypeRow(tr) {
  const id = Number(tr.dataset.otId);
  const internalId = (tr.querySelector("input[data-field='internalId']")?.value || "").trim();
  const type = (tr.querySelector("input[data-field='type']")?.value || "").trim();
  const description = (tr.querySelector("input[data-field='description']")?.value || "").trim();
  const color = tr.querySelector("input[data-field='color']")?.value || "#22c55e";
  return { id, internalId, type, description, color };
}

function validateObjectType(rec) {
  if (rec.internalId && rec.internalId.length > 10) return "A 'Belső azonosító' max 10 karakter.";
  if (!rec.type) return "A 'Típus' mező kötelező.";
  if (rec.type.length > 30) return "A 'Típus' max 30 karakter.";
  if (rec.description && rec.description.length > 50) return "A 'Leírás' max 50 karakter.";
  return null;
}

async function saveObjectTypeRow(tr) {
  const isDirty = tr.dataset.dirty === "1";
  if (!isDirty) return;

  const rec = readObjectTypeRow(tr);
  const err = validateObjectType(rec);
  if (err) {
    showHint(err);
    return;
  }

  await DB.init();
  await DB.updateObjectType(rec.id, {
    internalId: rec.internalId,
    type: rec.type,
    description: rec.description,
    color: rec.color,
    updatedAt: Date.now()
  });
  tr.dataset.dirty = "0";
  // v5.50: színváltozás azonnal hasson a markerekre
  try { _objectTypesCache = await DB.getAllObjectTypes(); setTypeMetaCache(_objectTypesCache); } catch (_) {}
  refreshAllMarkerIcons();
}

async function loadAndRenderObjectTypes(opts = {}) {
  await DB.init();
  _objectTypesCache = await DB.getAllObjectTypes();
  try { setTypeMetaCache(_objectTypesCache); } catch (_) {}
  refreshAllMarkerIcons();
  renderObjectTypesTable();
  if (opts.focusId) {
    const row = document.querySelector(`#objectTypesTbody tr[data-ot-id='${opts.focusId}'] input[data-field='type']`);
    if (row) row.focus();
  }
}

function renderObjectTypesTable() {
  const tb = document.getElementById("objectTypesTbody");
  if (!tb) return;
  tb.innerHTML = "";

  _objectTypesCache.forEach((rec) => {
    const tr = document.createElement("tr");
    tr.dataset.otId = rec.id;
    tr.innerHTML = `
      <td>
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
          <span>${escapeHtml(rec.id)}</span>
          <button class="btn btn-ghost" type="button" data-action="delete-ot" style="padding:4px 8px;">🗑</button>
        </div>
      </td>
      <td><input data-field="internalId" type="text" maxlength="10" value="${escapeHtml(rec.internalId || "")}" style="width:100%;"/></td>
      <td><input data-field="type" type="text" maxlength="30" value="${escapeHtml(rec.type || "")}" style="width:100%;" placeholder="pl. Pad"/></td>
      <td><input data-field="description" type="text" maxlength="50" value="${escapeHtml(rec.description || "")}" style="width:100%;"/></td>
      <td>
        <div class="color-cell">
          <button type="button" class="color-btn" title="Szín kiválasztása">
            <span class="color-dot" style="background:${escapeHtml(String(rec.color || "#22c55e"))}"></span>
            <span class="color-hex">${escapeHtml(String(rec.color || "#22c55e"))}</span>
          </button>
          <input data-field="color" type="hidden" value="${escapeHtml(String(rec.color || "#22c55e"))}" />
        </div>
      </td>
    `;
    tb.appendChild(tr);

    // Szín UI frissítése (rejtett input -> gombon a dot + HEX)
    const colorInput = tr.querySelector("input[data-field='color']");
    const dot = tr.querySelector(".color-dot");
    const hexLabel = tr.querySelector(".color-hex");
    if (colorInput && dot && hexLabel) {
      const apply = () => {
        const v = String(colorInput.value || "#22c55e").trim();
        dot.style.background = v;
        hexLabel.textContent = v;
      };
      apply();
      colorInput.addEventListener("change", apply);
    }
  });
}



// ---------------------------
// Settings: Objektum állapota (v5.47)
// - mezők: Azonosító (auto), Belső azonosító, Állapot*, Leírás
// - felvitel/törlés logika: mint a típusoknál
// ---------------------------

let _objectStatusesCache = [];
let _objectStatusesUiWired = false;

function renderSettingsObjectStatusesPage() {
  const container = document.getElementById("settingsExtra");
  if (!container) return;

  container.innerHTML = `
    <div style="margin-top:12px; display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
      <div class="small" style="color:#666;">Oszlopok: Azonosító, Belső azonosító, Állapot, Leírás</div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-save" id="btnAddObjectStatus" type="button">Új sor</button>
      </div>
    </div>

    <div class="settings-table-wrap" style="margin-top:10px;">
      <table class="sf-table" id="objectStatusesTable" style="min-width:760px;">
        <thead>
          <tr>
            <th style="width:120px;">Azonosító</th>
            <th style="width:160px;">Belső azonosító</th>
            <th style="width:240px;">Állapot *</th>
            <th style="width:300px;">Leírás</th>
          </tr>
        </thead>
        <tbody id="objectStatusesTbody"></tbody>
      </table>
    </div>
  `;

  if (!_objectStatusesUiWired) {
    _objectStatusesUiWired = true;

    // delegált input
    container.addEventListener("input", (e) => {
      const tr = e.target.closest("tr[data-os-id]");
      if (!tr) return;
      markRowDirty(tr);
    });

    // mentés blur-re
    container.addEventListener(
      "blur",
      async (e) => {
        const tr = e.target.closest("tr[data-os-id]");
        if (!tr) return;
        await saveObjectStatusRow(tr);
      },
      true
    );

    container.addEventListener("click", async (e) => {
      // Új sor
      const addBtn = e.target.closest("#btnAddObjectStatus");
      if (addBtn) {
        await DB.init();
        const newRec = {
          internalId: "",
          status: "",
          description: "",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        const id = await DB.addObjectStatus(newRec);
        showHint("Új sor létrehozva.");
        await loadAndRenderObjectStatuses({ focusId: id });
        return;
      }

      // Törlés
      const btn = e.target.closest("button[data-action='delete-os']");
      if (btn) {
        const tr = btn.closest("tr[data-os-id]");
        if (!tr) return;
        const id = Number(tr.dataset.osId);
        if (!Number.isFinite(id)) return;
        if (!confirm("Biztosan törlöd ezt az állapotot?")) return;
        await DB.deleteObjectStatus(id);
        showHint("Állapot törölve.");
        await loadAndRenderObjectStatuses();
        return;
      }
    });
  }

  loadAndRenderObjectStatuses();
}

function readObjectStatusRow(tr) {
  const id = Number(tr.dataset.osId);
  const internalId = (tr.querySelector("input[data-field='internalId']")?.value || "").trim();
  const status = (tr.querySelector("input[data-field='status']")?.value || "").trim();
  const description = (tr.querySelector("input[data-field='description']")?.value || "").trim();
  return { id, internalId, status, description };
}

function validateObjectStatus(rec) {
  if (rec.internalId && rec.internalId.length > 10) return "A 'Belső azonosító' max 10 karakter.";
  if (!rec.status) return "Az 'Állapot' mező kötelező.";
  if (rec.status.length > 30) return "Az 'Állapot' max 30 karakter.";
  if (rec.description && rec.description.length > 50) return "A 'Leírás' max 50 karakter.";
  return null;
}

async function saveObjectStatusRow(tr) {
  const isDirty = tr.dataset.dirty === "1";
  if (!isDirty) return;

  const rec = readObjectStatusRow(tr);
  const err = validateObjectStatus(rec);
  if (err) {
    showHint(err);
    return;
  }

  await DB.init();
  await DB.updateObjectStatus(rec.id, {
    internalId: rec.internalId,
    status: rec.status,
    description: rec.description,
    updatedAt: Date.now(),
  });
  tr.dataset.dirty = "0";
  // v5.50: színváltozás azonnal hasson a markerekre
  try { _objectTypesCache = await DB.getAllObjectTypes(); setTypeMetaCache(_objectTypesCache); } catch (_) {}
  refreshAllMarkerIcons();
}

async function loadAndRenderObjectStatuses(opts = {}) {
  await DB.init();
  _objectStatusesCache = await DB.getAllObjectStatuses();
  renderObjectStatusesTable();
  if (opts.focusId) {
    const el = document.querySelector(
      `#objectStatusesTbody tr[data-os-id='${opts.focusId}'] input[data-field='status']`
    );
    if (el) el.focus();
  }
}

function renderObjectStatusesTable() {
  const tb = document.getElementById("objectStatusesTbody");
  if (!tb) return;
  tb.innerHTML = "";

  _objectStatusesCache.forEach((rec) => {
    const tr = document.createElement("tr");
    tr.dataset.osId = rec.id;
    tr.innerHTML = `
      <td>
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
          <span>${escapeHtml(rec.id)}</span>
          <button class="btn btn-ghost" type="button" data-action="delete-os" style="padding:4px 8px;">🗑</button>
        </div>
      </td>
      <td><input data-field="internalId" type="text" maxlength="10" value="${escapeHtml(rec.internalId || "")}" style="width:100%;"/></td>
      <td><input data-field="status" type="text" maxlength="30" value="${escapeHtml(rec.status || "")}" style="width:100%;" placeholder="pl. Új"/></td>
      <td><input data-field="description" type="text" maxlength="50" value="${escapeHtml(rec.description || "")}" style="width:100%;"/></td>
    `;
    tb.appendChild(tr);
  });
}
async function refreshFilterData() {
  _allMarkersCache = filterShowDeleted
    ? await DB.getAllMarkers()
    : await DB.getAllMarkersActive();
  await fillFilterCombos();
  applyFilter();
}


// === v6.0.1 MapLibre: nav bearing és kattintás korrekció (Map rotate wrapper helyett) ===
function rotatedClickLatLng(e){ return (e && e.latlng) ? e.latlng : { lat: 0, lng: 0 }; }

let __cm_nav_bearing_raf = null;

function _getNavBearingTarget(){
  if (!map || typeof map.getBearing !== "function") return null;
  if (navMode !== 'heading') return 0;

  const moving = _isMovingForNav();
  if (moving && typeof lastHeadingDeg === 'number' && isFinite(lastHeadingDeg)) {
    return _normDeg(-lastHeadingDeg);
  }

  const stableCourse = _recentStableCourse();
  if (typeof stableCourse === 'number' && isFinite(stableCourse)) {
    return _normDeg(-stableCourse);
  }

  return null;
}

function applyNavCameraAndBearing({ force = false, nowTs = Date.now(), accuracyM = lastMyLocationAccM } = {}){
  try {
    if (!map || !lastMyLocation || !myLocFollowEnabled) return;

    const moving = _isMovingForNav();
    const targetCenter = [Number(lastMyLocation.lng), Number(lastMyLocation.lat)];
    const targetBearing = _getNavBearingTarget();
    const currentBearing = (typeof map.getBearing === 'function') ? Number(map.getBearing()) : 0;

    const size = (typeof map.getSize === 'function') ? map.getSize() : { x: 0, y: 0 };
    const desiredPx = {
      x: size.x / 2,
      y: size.y / 2 + ((navMode === 'heading') ? navYOffsetPx() : 0)
    };

    let currentUserPx = null;
    try {
      const p = map.project(targetCenter);
      currentUserPx = { x: p.x, y: p.y };
    } catch (_) {}

    const pixelDelta = currentUserPx
      ? Math.hypot(currentUserPx.x - desiredPx.x, currentUserPx.y - desiredPx.y)
      : Infinity;

    const centerThresholdPx = moving ? NAV_SCREEN_DEADBAND_MOVING_PX : NAV_SCREEN_DEADBAND_STATIONARY_PX;
    const centerThresholdAccPx = clamp((Number(accuracyM) || 0) * 0.35, 0, moving ? 8 : 14);
    const needCenter = force || pixelDelta >= (centerThresholdPx + centerThresholdAccPx);

    let needBearing = false;
    if (navMode === 'heading') {
      if (targetBearing !== null && targetBearing !== undefined) {
        const d = Math.abs(shortestAngleDelta(currentBearing, targetBearing));
        needBearing = force || d >= NAV_BEARING_MIN_DELTA_MOVING_DEG;
      }
    } else {
      const d = Math.abs(shortestAngleDelta(currentBearing, 0));
      needBearing = force || d >= NAV_BEARING_MIN_DELTA_NORTH_DEG;
    }

    const minInterval = moving ? NAV_CAMERA_MIN_INTERVAL_MOVING_MS : NAV_CAMERA_MIN_INTERVAL_STATIONARY_MS;
    if (!force && (nowTs - lastMyLocCenterTs) < minInterval && !needBearing) return;
    if (!needCenter && !needBearing) return;

    const easeOpts = {
      center: targetCenter,
      duration: force ? 380 : (moving ? 260 : 320),
      essential: true,
      easing: (t) => 1 - Math.pow(1 - t, 2)
    };

    if (navMode === 'heading') {
      if (targetBearing !== null && targetBearing !== undefined) {
        easeOpts.bearing = targetBearing;
      }
      easeOpts.offset = [0, navYOffsetPx()];
    } else {
      easeOpts.bearing = 0;
      easeOpts.offset = [0, 0];
    }

    try { if (typeof map.stop === 'function') map.stop(); } catch (_) {}
    map.easeTo(easeOpts);
    lastMyLocCenterTs = nowTs;
    lastCenteredMyLocation = { lat: lastMyLocation.lat, lng: lastMyLocation.lng };
  } catch (err) {
    console.warn('applyNavCameraAndBearing failed', err);
  }
}

function scheduleApplyNavBearing(){
  try {
    if (!map) return;
    if (__cm_nav_bearing_raf) return;
    __cm_nav_bearing_raf = requestAnimationFrame(() => {
      __cm_nav_bearing_raf = null;
      applyNavCameraAndBearing({ force: false, nowTs: Date.now(), accuracyM: lastMyLocationAccM });
    });
  } catch (_) {}
}
