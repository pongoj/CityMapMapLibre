const APP_VERSION = "6.10.19";

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





// panels.js-be kiemelve: filter/status panel state és térképi szűrés segédek

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

// markers.js-be kiemelve: markersById, marker/saját hely layer és ikon helper-ek

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

// markers.js-be kiemelve: popup, feature click és marker/saját hely helper-ek

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
  if (window.CMUI) {
    window.CMUI.initStatusBar(APP_VERSION);
    window.CMUI.updateLocationSourceBadge("?", NaN);
    window.CMUI.updateNorthBadge(NaN, null);
  }
  registerSW();
  checkForUpdateOnline();

  // Induláskor ellenőrizzük, hogy engedélyezve van-e a helymeghatározás.
  // (Ez nem kér engedélyt automatikusan, csak tájékoztat.)
  await checkGeolocationPermissionOnStartup();

  // === MapLibre + PMTiles ===
  try {
    map = window.createCityMap();
  } catch (err) {
    alert(err && err.message ? err.message : "Nem sikerült inicializálni a térképet.");
    return;
  }

  // v5.42.2: térkép forgatás wrapper + iránytű indítás (ha elérhető)
  // v6.x MapLibre: initRotateWrapperIfNeeded() kikapcsolva (CSS rotate wrapper nem kell)
  startCompassIfPossible();


  // v5.40: ha a felhasználó kézzel mozgatja/zoomolja a térképet, kikapcsoljuk a GPS-követést.
  // A "Saját helyem" gomb visszakapcsolja.
  map.on("dragstart", (e) => { if (e && e.originalEvent) myLocFollowEnabled = false; });
  map.on("zoomstart", (e) => { if (e && e.originalEvent) myLocFollowEnabled = false; });
  map.on("moveend", () => { updateMyLocFabVisibility(); if (window.CMUI && typeof _getNorthBadgeHeadingDeg === 'function') window.CMUI.updateNorthBadge(_getNorthBadgeHeadingDeg(), map); });
  map.on("zoomend", () => { updateMyLocFabVisibility(); if (window.CMUI && typeof _getNorthBadgeHeadingDeg === 'function') window.CMUI.updateNorthBadge(_getNorthBadgeHeadingDeg(), map); });
  map.on("rotate", () => { if (window.CMUI && typeof _getNorthBadgeHeadingDeg === 'function') window.CMUI.updateNorthBadge(_getNorthBadgeHeadingDeg(), map); });


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

  initPanelsUiBindings();

});


async function checkForUpdateOnline() {
  if (!navigator.onLine) return;

  try {
    const r = await fetch("./js/app.js", { cache: "no-store" });
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


// panels.js-be kiemelve: filter/settings modal logika
