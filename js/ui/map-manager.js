/**
 * Map Manager - Leaflet map setup, crossing lines, draggable marker.
 *
 * Responsible for:
 *   - Initializing the Leaflet map
 *   - Drawing start/finish and sector lines
 *   - Managing the draggable "driver" marker
 *   - Centering the map on the start/finish line
 */

export class MapManager {
  /**
   * @param {string} containerId - DOM element ID for the map
   */
  constructor(containerId) {
    this._containerId = containerId;
    this._map = null;
    this._driverMarker = null;

    // Line layers
    this._startFinishLine = null;
    this._sector2Line = null;
    this._sector3Line = null;

    // Driver trail
    this._trail = null;
    this._trailPoints = [];
  }

  /** Initialize the Leaflet map */
  init(centerLat, centerLng, zoom = 18) {
    this._map = L.map(this._containerId).setView([centerLat, centerLng], zoom);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 22,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(this._map);

    return this;
  }

  /** Get the Leaflet map instance */
  getMap() {
    return this._map;
  }

  // ─── DRIVER MARKER ───────────────────────────────────────────────────

  /** Create the draggable driver marker at a given position */
  createDriverMarker(lat, lng) {
    if (this._driverMarker) {
      this._driverMarker.remove();
    }

    this._driverMarker = L.marker([lat, lng], {
      draggable: true,
      icon: this._createDriverIcon(),
      zIndexOffset: 1000,
    }).addTo(this._map);

    return this._driverMarker;
  }

  /** Get current driver marker position as { lat, lng } */
  getDriverPosition() {
    if (!this._driverMarker) return null;
    const latlng = this._driverMarker.getLatLng();
    return { lat: latlng.lat, lng: latlng.lng };
  }

  /** Create a custom icon for the driver */
  _createDriverIcon() {
    return L.divIcon({
      className: 'driver-icon',
      html: '<div class="driver-dot"></div>',
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });
  }

  // ─── DRIVER TRAIL ─────────────────────────────────────────────────────

  /** Add the current driver position to the trail */
  addTrailPoint(lat, lng) {
    this._trailPoints.push([lat, lng]);

    if (!this._trail) {
      this._trail = L.polyline(this._trailPoints, {
        color: '#e94560',
        weight: 2,
        opacity: 0.6,
      }).addTo(this._map);
    } else {
      this._trail.setLatLngs(this._trailPoints);
    }
  }

  /** Clear the trail */
  clearTrail() {
    this._trailPoints = [];
    if (this._trail) {
      this._trail.remove();
      this._trail = null;
    }
  }

  // ─── CROSSING LINES ──────────────────────────────────────────────────

  /** Draw or update the start/finish line */
  setStartFinishLine(pointA, pointB) {
    if (this._startFinishLine) {
      this._startFinishLine.remove();
    }
    this._startFinishLine = L.polyline(
      [[pointA.lat, pointA.lng], [pointB.lat, pointB.lng]],
      { color: '#ff0000', weight: 4, dashArray: null, opacity: 0.9 }
    ).addTo(this._map);
    this._startFinishLine.bindTooltip('Start/Finish', { permanent: false });
  }

  /** Draw or update sector 2 line */
  setSector2Line(pointA, pointB) {
    if (this._sector2Line) {
      this._sector2Line.remove();
    }
    this._sector2Line = L.polyline(
      [[pointA.lat, pointA.lng], [pointB.lat, pointB.lng]],
      { color: '#00ccff', weight: 3, dashArray: '8, 4', opacity: 0.8 }
    ).addTo(this._map);
    this._sector2Line.bindTooltip('Sector 2', { permanent: false });
  }

  /** Draw or update sector 3 line */
  setSector3Line(pointA, pointB) {
    if (this._sector3Line) {
      this._sector3Line.remove();
    }
    this._sector3Line = L.polyline(
      [[pointA.lat, pointA.lng], [pointB.lat, pointB.lng]],
      { color: '#ffcc00', weight: 3, dashArray: '8, 4', opacity: 0.8 }
    ).addTo(this._map);
    this._sector3Line.bindTooltip('Sector 3', { permanent: false });
  }

  /** Center map on a point */
  centerOn(lat, lng, zoom) {
    if (zoom !== undefined) {
      this._map.setView([lat, lng], zoom);
    } else {
      this._map.panTo([lat, lng]);
    }
  }

  /** Invalidate map size (call after layout changes) */
  invalidateSize() {
    if (this._map) {
      this._map.invalidateSize();
    }
  }
}
