/**
 * GPS Simulator - pretends we have GPS lock and feeds DovesLapTimer at 25Hz.
 *
 * Reads the draggable marker position, calculates speed from position deltas,
 * and calls lapTimer.updateCurrentTime() + lapTimer.loop() each tick.
 *
 * C++ notes for back-port:
 *   - This replaces the real GPS hardware + Adafruit_GPS library
 *   - In C++ the GPS provides: lat, lng, altitude, speed (knots), time since midnight
 *   - Speed in the real system comes from the GPS module, not calculated from position
 *   - Time comes from GPS time (milliseconds since midnight), not system clock
 */

import { haversine } from '../lib/geo-math.js';

const TICK_RATE_HZ = 25;
const TICK_INTERVAL_MS = 1000 / TICK_RATE_HZ; // 40ms

export class GpsSimulator {
  /**
   * @param {DovesLapTimer} lapTimer - The lap timer instance to feed
   * @param {function} getPosition - Returns { lat, lng } of current marker position
   * @param {function} onTick - Callback after each tick with current state
   */
  constructor(lapTimer, getPosition, onTick = null) {
    this._lapTimer = lapTimer;
    this._getPosition = getPosition;
    this._onTick = onTick;

    this._intervalId = null;
    this._running = false;

    // Simulated GPS time (milliseconds since midnight)
    this._simTime = 0;

    // Previous position for speed calculation
    this._prevLat = null;
    this._prevLng = null;
    this._tickCount = 0;
  }

  /** Start the 25Hz simulation loop */
  start() {
    if (this._running) return;
    this._running = true;

    // Initialize time to something reasonable (e.g., 12:00:00 noon)
    this._simTime = 12 * 3600 * 1000; // noon in ms since midnight
    this._prevLat = null;
    this._prevLng = null;
    this._tickCount = 0;

    this._intervalId = setInterval(() => this._tick(), TICK_INTERVAL_MS);
  }

  /** Stop the simulation loop */
  stop() {
    if (!this._running) return;
    this._running = false;

    if (this._intervalId !== null) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
  }

  /** Check if running */
  isRunning() {
    return this._running;
  }

  /** Single simulation tick */
  _tick() {
    const pos = this._getPosition();
    if (!pos) return;

    const { lat, lng } = pos;

    // Advance simulated GPS time
    this._simTime += TICK_INTERVAL_MS;

    // Calculate speed from position delta
    let speedKnots = 0;
    if (this._prevLat !== null && this._prevLng !== null) {
      const distMeters = haversine(this._prevLat, this._prevLng, lat, lng);
      // distance per tick -> m/s -> knots
      const metersPerSecond = distMeters / (TICK_INTERVAL_MS / 1000);
      speedKnots = metersPerSecond / 0.514444; // 1 knot = 0.514444 m/s
    }

    this._prevLat = lat;
    this._prevLng = lng;

    // Feed the lap timer (altitude = 0 as specified)
    this._lapTimer.updateCurrentTime(this._simTime);
    this._lapTimer.loop(lat, lng, 0, speedKnots);

    this._tickCount++;

    // Notify UI
    if (this._onTick) {
      this._onTick({
        tickCount: this._tickCount,
        simTime: this._simTime,
        lat,
        lng,
        speedKnots,
        speedKmh: speedKnots * 1.852,
      });
    }
  }
}
