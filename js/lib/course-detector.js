/**
 * CourseDetector - detects which course layout the driver is on.
 *
 * Algorithm:
 *   1. Wait for speed >= 20 mph (driver is moving)
 *   2. Create a "waypoint" at that position
 *   3. Wait for driver to return near the waypoint (completed ~1 lap)
 *   4. Compare driven distance to each course's lengthFt
 *   5. Build ranked list of candidates within tolerance
 *   6. CourseManager validates candidates via raceStarted sanity check
 *
 * This module gets ported back to C++.
 *
 * C++ mapping:
 *   Will become CourseDetector class in DovesLapTimer.h/.cpp
 *   Uses haversine() for proximity checks (already a class method)
 *   courses[] maps to a struct array with fixed max size
 */

import { haversine } from './geo-math.js';
import {
  COURSE_DETECT_SPEED_THRESHOLD_MPH,
  COURSE_DETECT_WAYPOINT_PROXIMITY_METERS,
  COURSE_DETECT_MIN_DISTANCE_METERS,
  COURSE_DETECT_DISTANCE_TOLERANCE_PCT,
  METERS_TO_FEET,
} from './constants.js';

// Detection states
export const DETECT_STATE_IDLE = 'idle';
export const DETECT_STATE_WAITING_FOR_SPEED = 'waiting_for_speed';
export const DETECT_STATE_WAYPOINT_SET = 'waypoint_set';
export const DETECT_STATE_CANDIDATES_READY = 'candidates_ready';
export const DETECT_STATE_DETECTED = 'detected';

export class CourseDetector {
  /**
   * @param {Array} courses - [{ name: string, lengthFt: number }, ...]
   */
  constructor(courses) {
    this._courses = courses.map(c => ({ name: c.name, lengthFt: c.lengthFt }));
    this.reset();
  }

  // ─── STATE ──────────────────────────────────────────────────────────

  reset() {
    this._state = DETECT_STATE_IDLE;
    this._waypointLat = 0;
    this._waypointLng = 0;
    this._waypointOdometer = 0;
    this._detectedCourseIndex = -1;
    this._rankedMatches = [];
  }

  // ─── MAIN UPDATE ────────────────────────────────────────────────────

  /**
   * Called every GPS tick. Drives the detection state machine.
   *
   * @param {number} lat - Current latitude
   * @param {number} lng - Current longitude
   * @param {number} speedKmh - Current speed in km/h
   * @param {number} totalOdometer - Total distance traveled in meters
   * @returns {{ state: string, detectedIndex: number, rankedMatches: Array }}
   */
  update(lat, lng, speedKmh, totalOdometer) {
    if (this._state === DETECT_STATE_IDLE) {
      this._state = DETECT_STATE_WAITING_FOR_SPEED;
    }

    if (this._state === DETECT_STATE_WAITING_FOR_SPEED) {
      this._checkSpeedThreshold(lat, lng, speedKmh, totalOdometer);
    }

    if (this._state === DETECT_STATE_WAYPOINT_SET) {
      this._checkWaypointProximity(lat, lng, totalOdometer);
    }

    return {
      state: this._state,
      detectedIndex: this._detectedCourseIndex,
      rankedMatches: this._rankedMatches,
    };
  }

  // ─── STATE MACHINE STEPS ────────────────────────────────────────────

  /**
   * Step 1: Wait for speed to reach threshold, then set waypoint.
   */
  _checkSpeedThreshold(lat, lng, speedKmh, totalOdometer) {
    const speedMph = speedKmh * 0.621371;

    if (speedMph >= COURSE_DETECT_SPEED_THRESHOLD_MPH) {
      this._waypointLat = lat;
      this._waypointLng = lng;
      this._waypointOdometer = totalOdometer;
      this._state = DETECT_STATE_WAYPOINT_SET;
    }
  }

  /**
   * Step 2: Check if driver has returned near the waypoint after traveling enough distance.
   */
  _checkWaypointProximity(lat, lng, totalOdometer) {
    const distanceSinceWaypoint = totalOdometer - this._waypointOdometer;

    // Must travel at least minimum distance to avoid immediate re-trigger
    if (distanceSinceWaypoint < COURSE_DETECT_MIN_DISTANCE_METERS) {
      return;
    }

    const distToWaypoint = haversine(lat, lng, this._waypointLat, this._waypointLng);

    if (distToWaypoint < COURSE_DETECT_WAYPOINT_PROXIMITY_METERS) {
      this._matchCourseRanked(distanceSinceWaypoint);
    }
  }

  /**
   * Step 3: Build ranked list of candidates sorted by distance match quality.
   * Does NOT auto-select — CourseManager validates via raceStarted sanity check.
   */
  _matchCourseRanked(distanceMeters) {
    const distanceFt = distanceMeters * METERS_TO_FEET;

    const candidates = [];

    for (let i = 0; i < this._courses.length; i++) {
      const courseLengthFt = this._courses[i].lengthFt;
      if (courseLengthFt <= 0) continue;

      const ratio = Math.abs(distanceFt - courseLengthFt) / courseLengthFt;

      if (ratio <= COURSE_DETECT_DISTANCE_TOLERANCE_PCT) {
        candidates.push({ index: i, ratio: ratio });
      }
    }

    if (candidates.length > 0) {
      // Sort by ratio (best match first)
      candidates.sort((a, b) => a.ratio - b.ratio);
      this._rankedMatches = candidates;
      this._state = DETECT_STATE_CANDIDATES_READY;
    }
    // If no candidates within tolerance, stay in waypoint_set and try again next pass
  }

  // ─── CANDIDATE ACCEPT/REJECT API ───────────────────────────────────

  /**
   * Accept a specific candidate. Called by CourseManager after raceStarted validation.
   * @param {number} index - Course index to accept
   */
  acceptCandidate(index) {
    this._detectedCourseIndex = index;
    this._rankedMatches = [];
    this._state = DETECT_STATE_DETECTED;
  }

  /**
   * Reject all candidates. Returns to waypoint_set to try again on next pass.
   * Called by CourseManager when no candidate has raceStarted === true.
   */
  rejectAllCandidates() {
    this._rankedMatches = [];
    this._state = DETECT_STATE_WAYPOINT_SET;
  }

  // ─── GETTERS ────────────────────────────────────────────────────────

  getState() {
    return this._state;
  }

  getDetectedCourseIndex() {
    return this._detectedCourseIndex;
  }

  getRankedMatches() {
    return this._rankedMatches;
  }

  getWaypoint() {
    if (this._state === DETECT_STATE_IDLE || this._state === DETECT_STATE_WAITING_FOR_SPEED) {
      return null;
    }
    return { lat: this._waypointLat, lng: this._waypointLng };
  }

  isDetected() {
    return this._state === DETECT_STATE_DETECTED;
  }

  getCourses() {
    return this._courses;
  }
}
