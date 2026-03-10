/**
 * WaypointLapTimer - universal fallback lap timer that works without predefined course lines.
 *
 * Algorithm:
 *   1. Wait for speed >= 20 mph, drop a waypoint
 *   2. Drive away (min distance traveled)
 *   3. On return to waypoint proximity, buffer approach points
 *   4. On exit from proximity, use closest-approach point's time for lap split
 *   5. Repeat for subsequent laps
 *
 * Duck-typed to match DovesLapTimer's public API so the display/logger can use either.
 *
 * This module gets ported back to C++.
 *
 * C++ mapping:
 *   Will become WaypointLapTimer class in its own .h/.cpp
 *   Circular buffer of fixed size, no dynamic allocation.
 */

import { haversine } from './geo-math.js';
import {
  COURSE_DETECT_SPEED_THRESHOLD_MPH,
  WAYPOINT_LAP_MIN_DISTANCE_METERS,
  WAYPOINT_LAP_PROXIMITY_METERS,
  WAYPOINT_LAP_BUFFER_SIZE,
} from './constants.js';

// States
const STATE_IDLE = 'idle';
const STATE_WAITING_FOR_SPEED = 'waiting_for_speed';
const STATE_DRIVING = 'driving';
const STATE_IN_PROXIMITY = 'in_proximity';

export class WaypointLapTimer {
  constructor(debugCallback = null) {
    this._debugCallback = debugCallback;
    this._bufferSize = WAYPOINT_LAP_BUFFER_SIZE;
    this._resetState();
  }

  // ─── STATE ───────────────────────────────────────────────────────

  _resetState() {
    this._state = STATE_IDLE;
    this.millisecondsSinceMidnight = 0;

    // Waypoint
    this._waypointLat = 0;
    this._waypointLng = 0;
    this._waypointOdometer = 0;

    // Odometer / position
    this.totalDistanceTraveled = 0;
    this._positionPrevLat = 0;
    this._positionPrevLng = 0;
    this._firstPositionReceived = false;
    this.currentSpeedkmh = 0;

    // Timing
    this._raceStarted = false;
    this._crossing = false;
    this._currentLapStartTime = 0;
    this._lastLapTime = 0;
    this._bestLapTime = 0;
    this._currentLapOdometerStart = 0;
    this._lastLapDistance = 0;
    this._bestLapDistance = 0;
    this._bestLapNumber = 0;
    this._laps = 0;

    // Proximity buffer
    this._proximityBuffer = new Array(this._bufferSize);
    for (let i = 0; i < this._bufferSize; i++) {
      this._proximityBuffer[i] = { lat: 0, lng: 0, time: 0, odometer: 0, distToWaypoint: Infinity };
    }
    this._proximityBufferIndex = 0;
    this._proximityBufferCount = 0;
    this._closestDist = Infinity;
    this._closestTime = 0;
    this._closestOdometer = 0;
  }

  // ─── DUCK-TYPED INTERFACE (matches DovesLapTimer) ────────────────

  updateCurrentTime(currentTimeMilliseconds) {
    this.millisecondsSinceMidnight = currentTimeMilliseconds;
  }

  loop(currentLat, currentLng, currentAltitudeMeters, currentSpeedKnots) {
    // Update odometer
    if (this._firstPositionReceived) {
      const dist = haversine(this._positionPrevLat, this._positionPrevLng, currentLat, currentLng);
      this.totalDistanceTraveled += dist;
    } else {
      this._firstPositionReceived = true;
    }

    this._positionPrevLat = currentLat;
    this._positionPrevLng = currentLng;
    this.currentSpeedkmh = currentSpeedKnots * 1.852;

    // State machine
    if (this._state === STATE_IDLE) {
      this._state = STATE_WAITING_FOR_SPEED;
    }

    if (this._state === STATE_WAITING_FOR_SPEED) {
      this._checkSpeed(currentLat, currentLng);
    }

    if (this._state === STATE_DRIVING) {
      this._checkProximity(currentLat, currentLng);
    }

    if (this._state === STATE_IN_PROXIMITY) {
      this._bufferProximityPoint(currentLat, currentLng);
    }

    return -1;
  }

  reset() {
    this._resetState();
  }

  // ─── STATE MACHINE ──────────────────────────────────────────────

  _checkSpeed(lat, lng) {
    const speedMph = this.currentSpeedkmh * 0.621371;

    if (speedMph >= COURSE_DETECT_SPEED_THRESHOLD_MPH) {
      this._waypointLat = lat;
      this._waypointLng = lng;
      this._waypointOdometer = this.totalDistanceTraveled;
      this._state = STATE_DRIVING;
      this._debug('Waypoint set (Lap Anything mode)');
    }
  }

  _checkProximity(lat, lng) {
    const distSinceWaypoint = this.totalDistanceTraveled - this._waypointOdometer;

    if (distSinceWaypoint < WAYPOINT_LAP_MIN_DISTANCE_METERS) {
      return;
    }

    const distToWp = haversine(lat, lng, this._waypointLat, this._waypointLng);

    if (distToWp < WAYPOINT_LAP_PROXIMITY_METERS) {
      this._state = STATE_IN_PROXIMITY;
      this._crossing = true;
      this._clearProximityBuffer();
      this._bufferProximityPoint(lat, lng);
      this._debug('Entered waypoint proximity');
    }
  }

  _bufferProximityPoint(lat, lng) {
    const distToWp = haversine(lat, lng, this._waypointLat, this._waypointLng);

    // Check if we've exited proximity
    if (distToWp >= WAYPOINT_LAP_PROXIMITY_METERS) {
      this._state = STATE_DRIVING;
      this._crossing = false;
      this._processProximityBuffer();
      return;
    }

    // Buffer this point
    const idx = this._proximityBufferIndex % this._bufferSize;
    this._proximityBuffer[idx] = {
      lat: lat,
      lng: lng,
      time: this.millisecondsSinceMidnight,
      odometer: this.totalDistanceTraveled,
      distToWaypoint: distToWp,
    };
    this._proximityBufferIndex++;
    if (this._proximityBufferCount < this._bufferSize) {
      this._proximityBufferCount++;
    }

    // Track closest
    if (distToWp < this._closestDist) {
      this._closestDist = distToWp;
      this._closestTime = this.millisecondsSinceMidnight;
      this._closestOdometer = this.totalDistanceTraveled;
    }
  }

  _clearProximityBuffer() {
    this._proximityBufferIndex = 0;
    this._proximityBufferCount = 0;
    this._closestDist = Infinity;
    this._closestTime = 0;
    this._closestOdometer = 0;
  }

  _processProximityBuffer() {
    if (this._closestTime === 0) {
      this._debug('No valid closest point found');
      return;
    }

    const crossingTime = this._closestTime;
    const crossingOdometer = this._closestOdometer;

    if (this._raceStarted) {
      this._laps++;
      const lapTime = crossingTime - this._currentLapStartTime;
      const lapDistance = crossingOdometer - this._currentLapOdometerStart;

      this._lastLapTime = lapTime;
      this._lastLapDistance = lapDistance;
      this._currentLapStartTime = crossingTime;
      this._currentLapOdometerStart = crossingOdometer;

      if (this._bestLapTime <= 0 || lapTime < this._bestLapTime) {
        this._bestLapTime = lapTime;
        this._bestLapDistance = lapDistance;
        this._bestLapNumber = this._laps;
      }

      this._debug(`Lap ${this._laps}: ${(lapTime / 1000).toFixed(3)}s`);
    } else {
      this._raceStarted = true;
      this._currentLapStartTime = crossingTime;
      this._currentLapOdometerStart = crossingOdometer;
      this._debug('Race started (Lap Anything mode)');
    }

    // Update waypoint to closest-approach position for next lap
    this._waypointOdometer = crossingOdometer;
  }

  // ─── GETTERS (duck-typed to match DovesLapTimer) ────────────────

  getRaceStarted() { return this._raceStarted; }
  getCrossing() { return this._crossing; }
  getLaps() { return this._laps; }

  getLastLapTime() { return this._lastLapTime; }
  getBestLapTime() { return this._bestLapTime; }

  getCurrentLapTime() {
    return (this._currentLapStartTime <= 0 || !this._raceStarted)
      ? 0
      : this.millisecondsSinceMidnight - this._currentLapStartTime;
  }

  getCurrentLapDistance() {
    return (this._currentLapOdometerStart === 0 || !this._raceStarted)
      ? 0
      : this.totalDistanceTraveled - this._currentLapOdometerStart;
  }

  getTotalDistanceTraveled() { return this.totalDistanceTraveled; }
  getBestLapNumber() { return this._bestLapNumber; }

  // Direction - not applicable in Lap Anything mode
  getDirection() { return 'unknown'; }
  isDirectionResolved() { return false; }

  // Sectors - not supported in Lap Anything mode
  getCurrentSector() { return 0; }
  areSectorLinesConfigured() { return false; }
  getCurrentLapSector1Time() { return 0; }
  getCurrentLapSector2Time() { return 0; }
  getCurrentLapSector3Time() { return 0; }
  getBestSector1Time() { return 0; }
  getBestSector2Time() { return 0; }
  getBestSector3Time() { return 0; }
  getOptimalLapTime() { return 0; }
  getBestSector1LapNumber() { return 0; }
  getBestSector2LapNumber() { return 0; }
  getBestSector3LapNumber() { return 0; }

  getPaceDifference() {
    const currentLapDistance = this.getCurrentLapDistance();
    const currentLapTime = this.getCurrentLapTime();

    if (currentLapDistance === 0 || this._bestLapDistance === 0) {
      return 0.0;
    }

    const currentPace = currentLapTime / currentLapDistance;
    const bestPace = this._bestLapTime / this._bestLapDistance;
    return currentPace - bestPace;
  }

  getWaypoint() {
    if (this._state === STATE_IDLE || this._state === STATE_WAITING_FOR_SPEED) {
      return null;
    }
    return { lat: this._waypointLat, lng: this._waypointLng };
  }

  // ─── DEBUG ──────────────────────────────────────────────────────

  _debug(...args) {
    if (this._debugCallback) {
      this._debugCallback(args.join(''));
    }
  }
}
