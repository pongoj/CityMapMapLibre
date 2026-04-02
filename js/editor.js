// Marker editor, picker, and popup actions
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

function initEditorUiBindings() {
  const fTypeBtn = document.getElementById('fTypeBtn');
  if (fTypeBtn) fTypeBtn.addEventListener('click', (e) => { e.preventDefault(); if (!fTypeBtn.disabled) openPickPanel('type', fTypeBtn); });
  const fStatusBtn = document.getElementById('fStatusBtn');
  if (fStatusBtn) fStatusBtn.addEventListener('click', (e) => { e.preventDefault(); if (!fStatusBtn.disabled) openPickPanel('status', fStatusBtn); });

  document.getElementById("btnCancel")?.addEventListener("click", closeModal);
  document.getElementById("btnSave")?.addEventListener("click", saveMarker);

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

  document.getElementById("btnClear")?.addEventListener("click", async () => {
    if (!confirm("Biztosan törlöd az összes markert?")) return;
    await DB.clearMarkers();
    markersById.clear();
    activeMapFilterIds = null;
    if (activeMarkerPopup) { try { activeMarkerPopup.remove(); } catch (_) {} activeMarkerPopup = null; activePopupMarkerId = null; }
    refreshMarkersSource();
    updateShowAllButtonVisibility();
  });

  if (map) {
    map.on("click", async (e) => {
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
  }

  setupLongPressAddObject();
}

function setupLongPressAddObject(){
  if (!map) return;
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
    const cp = map.mouseEventToContainerPoint(e);
    return map.containerPointToLatLng(cp);
  }

  function trigger(ev){
    if (!ev) return;
    if (moveModeMarkerId) return;

    suppressClickUntil = Date.now() + 800;

    try { if (ev.preventDefault) ev.preventDefault(); } catch(_){}
    try { if (ev.stopPropagation) ev.stopPropagation(); } catch(_){}

    const latlngRaw = eventToLatLng(ev);
    const ll = rotatedClickLatLng({ latlng: latlngRaw, originalEvent: ev });
    openModal(ll);
  }

  function onDown(ev){
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

  container.addEventListener('pointerdown', onDown, {passive:false});
  container.addEventListener('pointermove', onMove, {passive:true});
  container.addEventListener('pointerup', onUp, {passive:true});
  container.addEventListener('pointercancel', onUp, {passive:true});
  container.addEventListener('mousedown', onDown, {passive:true});
  container.addEventListener('mousemove', onMove, {passive:true});
  container.addEventListener('mouseup', onUp, {passive:true});
  container.addEventListener('mouseleave', onUp, {passive:true});
  container.addEventListener('touchstart', onDown, {passive:false});
  container.addEventListener('touchmove', onMove, {passive:true});
  container.addEventListener('touchend', onUp, {passive:true});
  container.addEventListener('touchcancel', onUp, {passive:true});

  container.addEventListener('contextmenu', (e) => {
    if (timer || startPt) {
      try { e.preventDefault(); } catch(_){}
    }
  }, {passive:false});

  map.on('click', (e) => {
    if (Date.now() < suppressClickUntil) {
      try { e.originalEvent && e.originalEvent.preventDefault && e.originalEvent.preventDefault(); } catch(_){}
      return;
    }
  });
}
