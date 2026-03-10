/**
 * Session Logger - records simulated GPS data in .dove CSV format.
 *
 * Matches the DovesDataLogger CSV format exactly:
 *   timestamp,sats,hdop,lat,lng,speed_mph,altitude_m,heading_deg,h_acc_m,rpm,accel_x,accel_y,accel_z
 *
 * Fields we don't have are faked to look realistic:
 *   - sats: 12 (good lock)
 *   - hdop: 0.8 (good accuracy)
 *   - altitude_m: 0.0 (per project spec, altitude is bunk)
 *   - heading_deg: calculated from last few points
 *   - h_acc_m: 1.5 (reasonable for good GPS)
 *   - rpm: 420 (funny number to flag this as a sim log)
 *   - accel_x/y/z: 0.0 (no IMU)
 *
 * C++ back-port: This module does NOT get ported back.
 *   The real logger is in gps_functions.ino and writes to SD card.
 */

const CSV_HEADER = 'timestamp,sats,hdop,lat,lng,speed_mph,altitude_m,heading_deg,h_acc_m,rpm,accel_x,accel_y,accel_z';

// Funny number RPM to mark sim logs
const SIM_RPM = 420;

export class SessionLogger {
  constructor() {
    this._rows = [];
    this._recording = false;
    this._startWallTime = 0;

    // Heading calculation from recent positions
    this._prevLat = null;
    this._prevLng = null;
    this._heading = 0.0;
  }

  /** Start recording a new session */
  startRecording() {
    this._rows = [];
    this._recording = true;
    this._startWallTime = Date.now();
    this._prevLat = null;
    this._prevLng = null;
    this._heading = 0.0;
  }

  /** Stop recording */
  stopRecording() {
    this._recording = false;
  }

  /** Check if currently recording */
  isRecording() {
    return this._recording;
  }

  /** Get number of recorded samples */
  getSampleCount() {
    return this._rows.length;
  }

  /**
   * Log a single GPS sample.
   *
   * @param {number} lat - Latitude in decimal degrees
   * @param {number} lng - Longitude in decimal degrees
   * @param {number} speedKmh - Speed in km/h (will be converted to mph)
   */
  logSample(lat, lng, speedKmh) {
    if (!this._recording) return;

    const timestamp = Date.now();
    const speedMph = speedKmh * 0.621371;

    // Calculate heading from position delta
    this._updateHeading(lat, lng);

    this._rows.push(this._buildCsvRow(timestamp, lat, lng, speedMph, this._heading));

    this._prevLat = lat;
    this._prevLng = lng;
  }

  /**
   * Calculate heading (0-360 degrees) from previous position to current.
   * Uses atan2 on the delta - same approach GPS modules use for headMot.
   */
  _updateHeading(lat, lng) {
    if (this._prevLat === null || this._prevLng === null) return;

    const dLat = lat - this._prevLat;
    const dLng = lng - this._prevLng;

    // Skip if no movement (avoid jitter when stationary)
    if (Math.abs(dLat) < 1e-9 && Math.abs(dLng) < 1e-9) return;

    // atan2 gives angle from north, clockwise positive
    const rad = Math.atan2(dLng * Math.cos(lat * Math.PI / 180), dLat);
    let deg = rad * (180 / Math.PI);
    if (deg < 0) deg += 360;

    this._heading = deg;
  }

  /**
   * Build a single CSV row matching the .dove format.
   *
   * Format: timestamp,sats,hdop,lat,lng,speed_mph,altitude_m,heading_deg,h_acc_m,rpm,accel_x,accel_y,accel_z
   */
  _buildCsvRow(timestamp, lat, lng, speedMph, heading) {
    return [
      timestamp,            // Unix timestamp in milliseconds
      12,                   // sats (realistic good lock)
      '0.8',               // hdop (good accuracy)
      lat.toFixed(8),       // lat (8 decimals, racing precision)
      lng.toFixed(8),       // lng
      speedMph.toFixed(2),  // speed_mph
      '0.00',              // altitude_m (bunk)
      heading.toFixed(2),   // heading_deg (calculated from movement)
      '1.50',              // h_acc_m (reasonable for good GPS)
      SIM_RPM,             // rpm (420 = sim flag)
      '0.000',             // accel_x
      '0.000',             // accel_y
      '0.000',             // accel_z
    ].join(',');
  }

  /**
   * Build the full CSV file content (header + all rows).
   */
  buildCsvContent() {
    return CSV_HEADER + '\n' + this._rows.join('\n') + '\n';
  }

  /**
   * Generate the filename in DovesDataLogger format:
   *   {location}_{track}_{direction}_{YYYY}_{MMDD}_{HHmmss}.dove
   *
   * Since we're a simulator, we use "SIM" for location/track/direction.
   */
  buildFilename() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');

    return `simulator_${yyyy}_${mm}${dd}_${hh}${min}${ss}.dove`;
  }

  /**
   * Trigger a browser download of the .dove file.
   */
  downloadFile() {
    if (this._rows.length === 0) return;

    const content = this.buildCsvContent();
    const filename = this.buildFilename();

    const blob = new Blob([content], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  }
}
