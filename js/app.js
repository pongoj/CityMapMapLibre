const APP_VERSION = "6.10.23";

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

document.addEventListener("DOMContentLoaded", async () => {
  window.addEventListener("online", checkForUpdateOnline);
  if (window.CMUI) {
    window.CMUI.initStatusBar(APP_VERSION);
    window.CMUI.updateLocationSourceBadge("?", NaN);
    window.CMUI.updateNorthBadge(NaN, null);
  }
  registerSW();
  checkForUpdateOnline();

  await checkGeolocationPermissionOnStartup();

  try {
    map = window.createCityMap();
  } catch (err) {
    alert(err && err.message ? err.message : "Nem sikerült inicializálni a térképet.");
    return;
  }

  startCompassIfPossible();

  map.on("dragstart", (e) => { if (e && e.originalEvent) myLocFollowEnabled = false; });
  map.on("zoomstart", (e) => { if (e && e.originalEvent) myLocFollowEnabled = false; });
  map.on("moveend", () => { updateMyLocFabVisibility(); if (window.CMUI && typeof _getNorthBadgeHeadingDeg === 'function') window.CMUI.updateNorthBadge(_getNorthBadgeHeadingDeg(), map); });
  map.on("zoomend", () => { updateMyLocFabVisibility(); if (window.CMUI && typeof _getNorthBadgeHeadingDeg === 'function') window.CMUI.updateNorthBadge(_getNorthBadgeHeadingDeg(), map); });
  map.on("rotate", () => { if (window.CMUI && typeof _getNorthBadgeHeadingDeg === 'function') window.CMUI.updateNorthBadge(_getNorthBadgeHeadingDeg(), map); });

  await DB.init();
  await DB.backfillMarkerMeta();
  await DB.cleanInvalidPhotos();

  await fillLookups();
  initEditorUiBindings();

  const btnMyLocFab = document.getElementById("btnMyLocFab");
  if (btnMyLocFab) {
    btnMyLocFab.addEventListener("click", async () => {
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
