const APP_VERSION = "6.10.20";

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
