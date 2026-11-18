export const naverSdkMock = `
  window.naver = { maps: {
    LatLng: class { constructor(lat, lng) { this.lat = lat; this.lng = lng; } },
    Point: class { constructor(x, y) { this.x = x; this.y = y; } },
    LatLngBounds: class { constructor(southwest, northeast) { this.southwest = southwest; this.northeast = northeast; } },
    Map: class {
      constructor(element, options) {
        this.element = element; this.listeners = new Set(); this.isReady = window.weddingMapInitialization === 'constructor';
        // The real SDK sets a relative position on its map container.
        element.style.position = 'relative'; element.style.overflow = 'hidden';
        element.dataset.center = options.center.lat + ',' + options.center.lng; element.dataset.zoom = options.zoom; element.dataset.zoomControl = options.zoomControl; element.dataset.initialWidth = element.clientWidth; element.dataset.initialHeight = element.clientHeight; delete element.dataset.bounds;
        if (!window.weddingMapInitialization || window.weddingMapInitialization === 'init') this.initTimer = setTimeout(() => { this.isReady = true; this.emit('init'); }, 20);
      }
      emit(event) {
        window.weddingMapEvents = [...(window.weddingMapEvents || []), event];
        for (const handle of [...this.listeners]) if (handle.event === event) { this.listeners.delete(handle); handle.listener(); }
      }
      fitBounds(bounds) { this.element.dataset.bounds = JSON.stringify(bounds); if (window.weddingMapInitialization === 'fit-bounds-idle') this.emit('idle'); }
      destroy() { clearTimeout(this.initTimer); this.listeners.clear(); }
    },
    Marker: class {
      constructor(options) { const pin = document.createElement('span'); pin.dataset.markerTitle = options.title; pin.dataset.position = options.position.lat + ',' + options.position.lng; if (options.icon?.content) pin.append(options.icon.content); else pin.textContent = options.title; options.map.element.append(pin); }
      setMap() {}
    },
    Event: {
      once(map, event, listener) { const handle = { map, event, listener }; map.listeners.add(handle); return handle; },
      removeListener(handle) { handle.map.listeners.delete(handle); }, clearInstanceListeners(map) { map.listeners.clear(); }
    },
    Service: { Status: { OK: 200 }, geocode(options, callback) { window.weddingGeocodeQueries = [...(window.weddingGeocodeQueries || []), options.query]; setTimeout(() => callback(200, { v2: { addresses: window.weddingGeocodeResults?.[options.query] ?? [{ x: '126.9780', y: '37.5665' }] } }), 20); } }
  } };
`;
