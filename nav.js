// Kiemelt navigációs logika (v6.10.12)
// Ez a fájl a korábban egyetlen nagy app.js-ben lévő nav / geolocation / heading / követés
// részt emeli ki külön, hogy a hibakeresés és a további finomhangolás átláthatóbb legyen.

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
const NAV_CAMERA_MIN_INTERVAL_MOVING_MS = 380;
const NAV_CAMERA_MIN_INTERVAL_STATIONARY_MS = 900;
const NAV_CENTER_MIN_MOVE_MOVING_M = 2.0;
const NAV_CENTER_MIN_MOVE_STATIONARY_M = 5.0;
const NAV_BEARING_MIN_DELTA_MOVING_DEG = 6.0;
const NAV_BEARING_MIN_DELTA_NORTH_DEG = 1.5;
const NAV_BEARING_MIN_INTERVAL_MS = 220;
const NAV_SCREEN_DEADBAND_MOVING_PX = 30;
const NAV_SCREEN_DEADBAND_STATIONARY_PX = 40;

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

  // Amíg az automatikus követés aktív, a „Középre” gomb ne villogjon fel.
  // Ekkor a kamera programból követi a saját helyet, tehát a gombnak nincs dolga.
  if (myLocFollowEnabled) {
    btn.style.display = "none";
    return;
  }

  try {
    const p = map.latLngToContainerPoint([lastMyLocation.lat, lastMyLocation.lng]);
    const s = map.getSize();
    const desiredX = s.x / 2;
    const desiredY = s.y / 2 + ((navMode === "heading") ? navYOffsetPx() : 0);
    const dx = p.x - desiredX;
    const dy = p.y - desiredY;
    const dist = Math.hypot(dx, dy);
    const THRESH_PX = (navMode === "heading") ? 34 : 26;
    btn.style.display = dist > THRESH_PX ? "inline-flex" : "none";
  } catch (_) {
    btn.style.display = "inline-flex";
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
let locationSourceIndicator = "?"; // G = GPS-szeru fix (becsles), N = halozati/coarse fix (becsles)
let locationSourceAccuracyM = NaN;

function _updateLocationSourceBadge(){
  try {
    const host = document.getElementById("appVersion");
    if (!host) return;
    let badge = document.getElementById("locSourceBadge");
    if (!badge) {
      badge = document.createElement("span");
      badge.id = "locSourceBadge";
      badge.style.display = "inline-flex";
      badge.style.alignItems = "center";
      badge.style.justifyContent = "center";
      badge.style.minWidth = "18px";
      badge.style.height = "18px";
      badge.style.marginLeft = "6px";
      badge.style.padding = "0 6px";
      badge.style.borderRadius = "999px";
      badge.style.fontWeight = "700";
      badge.style.fontSize = "11px";
      badge.style.lineHeight = "18px";
      badge.style.border = "1px solid rgba(0,0,0,.10)";
      host.appendChild(badge);
    }
    const mode = locationSourceIndicator || "?";
    badge.textContent = mode;
    if (mode === "G") {
      badge.style.background = "#e6f6ea";
      badge.style.color = "#196c2e";
      badge.style.borderColor = "rgba(25,108,46,.18)";
    } else if (mode === "N") {
      badge.style.background = "#fff4e5";
      badge.style.color = "#8a5a00";
      badge.style.borderColor = "rgba(138,90,0,.18)";
    } else {
      badge.style.background = "#eef2f7";
      badge.style.color = "#4b5563";
      badge.style.borderColor = "rgba(75,85,99,.16)";
    }
    const acc = (typeof locationSourceAccuracyM === "number" && isFinite(locationSourceAccuracyM)) ? `, pontossag kb. ±${Math.round(locationSourceAccuracyM)} m` : "";
    badge.title = (mode === "G")
      ? `Helyforras: GPS-szeru fix (becsles${acc})`
      : (mode === "N")
        ? `Helyforras: halozati/coarse fix (becsles${acc})`
        : "Helyforras: ismeretlen (varunk poziciora)";
  } catch (_) {}
}

function _updateNorthBadge(){
  try {
    const host = document.getElementById("appVersion");
    if (!host) return;
    let badge = document.getElementById("northBadge");
    if (!badge) {
      badge = document.createElement("span");
      badge.id = "northBadge";
      badge.style.display = "inline-flex";
      badge.style.alignItems = "center";
      badge.style.gap = "4px";
      badge.style.marginLeft = "6px";
      badge.style.padding = "0 6px";
      badge.style.height = "18px";
      badge.style.borderRadius = "999px";
      badge.style.border = "1px solid rgba(0,0,0,.10)";
      badge.style.background = "#eef2f7";
      badge.style.color = "#334155";
      badge.style.fontSize = "11px";
      badge.style.fontWeight = "700";
      const arrow = document.createElement("span");
      arrow.id = "northBadgeArrow";
      arrow.textContent = "↑";
      arrow.style.display = "inline-block";
      arrow.style.transformOrigin = "50% 50%";
      arrow.style.transition = "transform 120ms linear";
      const label = document.createElement("span");
      label.textContent = "N";
      badge.appendChild(arrow);
      badge.appendChild(label);
      host.appendChild(badge);
    }
    const arrow = document.getElementById("northBadgeArrow");
    const bearing = (map && typeof map.getBearing === "function" && isFinite(map.getBearing())) ? Number(map.getBearing()) : 0;
    if (arrow) arrow.style.transform = `rotate(${-bearing}deg)`;
    badge.title = "Észak iránya a kijelzőhöz képest";
  } catch (_) {}
}

function _classifyLocationSource(coords){
  try {
    const acc = (coords && typeof coords.accuracy === "number" && isFinite(coords.accuracy)) ? Number(coords.accuracy) : NaN;
    const hasHeading = !!(coords && typeof coords.heading === "number" && isFinite(coords.heading));
    const hasSpeed = !!(coords && typeof coords.speed === "number" && isFinite(coords.speed));
    locationSourceAccuracyM = acc;
    // A webes Geolocation API nem mondja meg biztosan a forrast, ez csak gyakorlati becsles.
    // GPS-szerunek vesszuk, ha a fix jo pontossagu, vagy a platform heading/speed adatot is ad.
    const gpsLike = (isFinite(acc) && acc <= 35) || ((hasHeading || hasSpeed) && (!isFinite(acc) || acc <= 60));
    locationSourceIndicator = gpsLike ? "G" : "N";
    _updateLocationSourceBadge();
  } catch (_) {}
}

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
      _classifyLocationSource(pos.coords);

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
        _classifyLocationSource(pos.coords);
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

    // Eszak-felul modban azonnal alljunk vissza 0 bearingre, ne maradjon bent elozo forgatas.
    if (navMode === "north") {
      try { if (map && typeof map.stop === "function") map.stop(); } catch (_) {}
      try { if (map && typeof map.jumpTo === "function") map.jumpTo({ bearing: 0 }); } catch (_) {}
    }

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


// === v6.0.1 MapLibre: nav bearing és kattintás korrekció (Map rotate wrapper helyett) ===
function rotatedClickLatLng(e){ return (e && e.latlng) ? e.latlng : { lat: 0, lng: 0 }; }

let __cm_nav_bearing_raf = null;

function _getNavBearingTarget(){
  if (!map || typeof map.getBearing !== "function") return null;
  if (navMode !== 'heading') return 0;

  const moving = _isMovingForNav();
  if (moving && typeof lastHeadingDeg === 'number' && isFinite(lastHeadingDeg)) {
    // MapLibre bearing: melyik vilagirany legyen felul a kijelzon.
    // Haladasi modban a haladas iranya legyen felul, tehat NEM az inverz, hanem a heading maga.
    return _normDeg(lastHeadingDeg);
  }

  const stableCourse = _recentStableCourse();
  if (typeof stableCourse === 'number' && isFinite(stableCourse)) {
    return _normDeg(stableCourse);
  }

  return null;
}

function applyNavCameraAndBearing({ force = false, nowTs = Date.now(), accuracyM = lastMyLocationAccM } = {}){
  try {
    if (!map || !lastMyLocation || !myLocFollowEnabled) {
      _updateNorthBadge();
      return;
    }

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
    const centerThresholdAccPx = clamp((Number(accuracyM) || 0) * 0.22, 0, moving ? 10 : 16);
    const needCenter = force || pixelDelta >= (centerThresholdPx + centerThresholdAccPx);

    let needBearing = false;
    let bearingTarget = null;
    if (navMode === 'heading') {
      if (targetBearing !== null && targetBearing !== undefined) {
        const d = Math.abs(shortestAngleDelta(currentBearing, targetBearing));
        needBearing = force || d >= (moving ? 5.5 : 8.0);
        bearingTarget = targetBearing;
      }
    } else {
      const d = Math.abs(shortestAngleDelta(currentBearing, 0));
      needBearing = force || d >= 1.0;
      bearingTarget = 0;
    }

    const minInterval = moving ? NAV_CAMERA_MIN_INTERVAL_MOVING_MS : NAV_CAMERA_MIN_INTERVAL_STATIONARY_MS;
    if (!force && (nowTs - lastMyLocCenterTs) < minInterval && !needCenter) {
      _updateNorthBadge();
      return;
    }
    if (!needCenter && !needBearing) {
      _updateNorthBadge();
      return;
    }

    const easeOpts = {
      essential: true,
      easing: (t) => 1 - Math.pow(1 - t, 2)
    };

    if (needCenter || force) {
      easeOpts.center = targetCenter;
      easeOpts.offset = (navMode === 'heading') ? [0, navYOffsetPx()] : [0, 0];
    }

    if (needBearing && bearingTarget !== null && bearingTarget !== undefined) {
      easeOpts.bearing = bearingTarget;
    }

    const bigMove = pixelDelta > (moving ? 90 : 120);
    if (force) {
      easeOpts.duration = 260;
    } else if (needCenter && needBearing) {
      easeOpts.duration = moving ? (bigMove ? 520 : 420) : 520;
    } else if (needCenter) {
      easeOpts.duration = moving ? (bigMove ? 480 : 360) : 460;
    } else {
      easeOpts.duration = moving ? 220 : 260;
    }

    if (typeof map.easeTo === 'function') {
      map.easeTo(easeOpts);
    } else if (typeof map.jumpTo === 'function') {
      map.jumpTo(easeOpts);
    }

    lastMyLocCenterTs = nowTs;
    lastCenteredMyLocation = { lat: lastMyLocation.lat, lng: lastMyLocation.lng };
    _updateNorthBadge();
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
