/* === CityMap UI helpers (status badges, attribution compact) === */
(function(){
  if (window.CMUI) return;

  function _ensureHost(){
    return document.getElementById("appVersion");
  }

  function initStatusBar(appVersion){
    const host = _ensureHost();
    if (!host) return;
    host.textContent = "v" + String(appVersion || "0.0.0");
  }

  function updateLocationSourceBadge(mode, accuracyM){
    try {
      const host = _ensureHost();
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
      const val = mode || "?";
      badge.textContent = val;
      if (val === "G") {
        badge.style.background = "#e6f6ea";
        badge.style.color = "#196c2e";
        badge.style.borderColor = "rgba(25,108,46,.18)";
      } else if (val === "N") {
        badge.style.background = "#fff4e5";
        badge.style.color = "#8a5a00";
        badge.style.borderColor = "rgba(138,90,0,.18)";
      } else {
        badge.style.background = "#eef2f7";
        badge.style.color = "#4b5563";
        badge.style.borderColor = "rgba(75,85,99,.16)";
      }
      const acc = (typeof accuracyM === "number" && isFinite(accuracyM)) ? `, pontossag kb. ±${Math.round(accuracyM)} m` : "";
      badge.title = (val === "G")
        ? `Helyforras: GPS-szeru fix (becsles${acc})`
        : (val === "N")
          ? `Helyforras: halozati/coarse fix (becsles${acc})`
          : "Helyforras: ismeretlen (varunk poziciora)";
    } catch (_) {}
  }

  function updateNorthBadge(northHeadingDeg, map){
    try {
      const host = _ensureHost();
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
      let heading = (typeof northHeadingDeg === "number" && isFinite(northHeadingDeg)) ? Number(northHeadingDeg) : NaN;
      if (!isFinite(heading) && map && typeof map.getBearing === "function" && isFinite(map.getBearing())) {
        heading = Number(map.getBearing());
      }
      if (arrow) arrow.style.transform = `rotate(${isFinite(heading) ? -heading : 0}deg)`;
      badge.title = "Észak iránya a kijelzőhöz képest";
    } catch (_) {}
  }

  function ensureCompactAttribution(){
    try {
      const node = document.querySelector('.maplibregl-ctrl-attrib');
      if (!node) return;
      node.classList.add('maplibregl-compact');
      node.classList.remove('maplibregl-compact-show');
    } catch (_) {}
  }

  window.CMUI = {
    initStatusBar,
    updateLocationSourceBadge,
    updateNorthBadge,
    ensureCompactAttribution
  };
})();
