/**
 * Default track data for the simulator.
 *
 * Each line is defined by two GPS points [A, B].
 * Default: Orlando Kart Center (from the real_track_data_debug example).
 *
 * Lines are meant to be drawn perpendicular-ish to the racing line.
 * Width matters - don't make them too much wider than the track.
 */

// Orlando Kart Center - Start/Finish line (near turn 10, from the C++ example)
export const DEFAULT_START_FINISH = {
  pointA: { lat: 28.41270817056385, lng: -81.37973266418031 },
  pointB: { lat: 28.41273038679321, lng: -81.37957048753776 },
};

// Sector 2 split - Orlando Kart Center Normal layout
export const DEFAULT_SECTOR_2 = {
  pointA: { lat: 28.411904988687116, lng: -81.37907081939261 },
  pointB: { lat: 28.41183163429606, lng: -81.37918566522174 },
};

// Sector 3 split - Orlando Kart Center Normal layout
export const DEFAULT_SECTOR_3 = {
  pointA: { lat: 28.41150106641038, lng: -81.3799856475317 },
  pointB: { lat: 28.411508439046077, lng: -81.37980640211364 },
};

/**
 * Get the center point of a line (for map centering).
 */
export function getLineMidpoint(line) {
  return {
    lat: (line.pointA.lat + line.pointB.lat) / 2,
    lng: (line.pointA.lng + line.pointB.lng) / 2,
  };
}

/**
 * Parse a line definition string "lat1,lng1,lat2,lng2" into a line object.
 * Returns null if invalid.
 */
export function parseLineString(str) {
  const parts = str.split(',').map(s => parseFloat(s.trim()));
  if (parts.length !== 4 || parts.some(isNaN)) {
    return null;
  }
  return {
    pointA: { lat: parts[0], lng: parts[1] },
    pointB: { lat: parts[2], lng: parts[3] },
  };
}

/**
 * Format a line object to string "lat1, lng1, lat2, lng2"
 */
export function lineToString(line) {
  return `${line.pointA.lat}, ${line.pointA.lng}, ${line.pointB.lat}, ${line.pointB.lng}`;
}
