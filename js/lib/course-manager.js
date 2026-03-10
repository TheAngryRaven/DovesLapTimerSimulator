/**
 * CourseManager - orchestrates multiple DovesLapTimer instances + CourseDetector.
 *
 * Feeds ALL course timers the same GPS data simultaneously.
 * Once the CourseDetector identifies candidates, validates via raceStarted sanity check.
 * Falls back to WaypointLapTimer ("Lap Anything") if detection fails.
 *
 * Implements the same updateCurrentTime() / loop() interface as DovesLapTimer,
 * so the GpsSimulator can feed it via duck typing.
 *
 * This module gets ported back to C++.
 *
 * C++ mapping:
 *   Will become CourseManager class owning an array of DovesLapTimer instances,
 *   a CourseDetector, and optionally a WaypointLapTimer.
 *   Fixed-size array on Arduino (no dynamic allocation).
 */

import { DovesLapTimer } from './DovesLapTimer.js';
import { CourseDetector, DETECT_STATE_CANDIDATES_READY } from './course-detector.js';
import { WaypointLapTimer } from './waypoint-lap-timer.js';
import { DEFAULT_CROSSING_THRESHOLD_METERS, COURSE_DETECT_MAX_REJECTIONS } from './constants.js';

export class CourseManager {
  /**
   * @param {object} trackJson - Parsed track JSON with courses array
   * @param {number} crossingThreshold - Crossing detection threshold in meters
   * @param {function} debugCallback - Optional debug output function
   */
  constructor(trackJson, crossingThreshold = DEFAULT_CROSSING_THRESHOLD_METERS, debugCallback = null) {
    this._trackData = trackJson;
    this._crossingThreshold = crossingThreshold;
    this._debugCallback = debugCallback;

    this._courseTimers = [];
    this._detector = null;
    this._activeCourseIndex = -1;
    this._detectionComplete = false;

    // Lap Anything — always running alongside course timers so it has
    // accumulated data (odometer, waypoint, raceStarted) when activated
    this._lapAnythingTimer = null;
    this._lapAnythingActive = false;
    this._detectionRejectionCount = 0;

    this._initCourses();
  }

  // ─── INITIALIZATION ─────────────────────────────────────────────────

  /** Create a DovesLapTimer for each course and initialize the detector */
  _initCourses() {
    const courses = this._trackData.courses || [];

    this._courseTimers = courses.map((course, index) => {
      const timer = new DovesLapTimer(this._crossingThreshold, this._debugCallback);
      timer.forceLinearInterpolation();

      // Configure start/finish line
      timer.setStartFinishLine(
        course.start_a_lat, course.start_a_lng,
        course.start_b_lat, course.start_b_lng
      );

      // Configure sector lines if present
      if (course.sector_2_a_lat !== undefined && course.sector_2_b_lat !== undefined) {
        timer.setSector2Line(
          course.sector_2_a_lat, course.sector_2_a_lng,
          course.sector_2_b_lat, course.sector_2_b_lng
        );
      }

      if (course.sector_3_a_lat !== undefined && course.sector_3_b_lat !== undefined) {
        timer.setSector3Line(
          course.sector_3_a_lat, course.sector_3_a_lng,
          course.sector_3_b_lat, course.sector_3_b_lng
        );
      }

      timer.reset();

      return {
        name: course.name,
        lengthFt: course.lengthFt,
        timer: timer,
        active: true,
      };
    });

    // Create the detector with course names and lengths
    if (courses.length > 0) {
      this._detector = new CourseDetector(
        courses.map(c => ({ name: c.name, lengthFt: c.lengthFt }))
      );
    } else {
      this._detector = null;
    }

    this._activeCourseIndex = -1;
    this._detectionComplete = false;
    this._detectionRejectionCount = 0;
    this._lapAnythingActive = false;

    // Always create WaypointLapTimer — it runs alongside course timers
    // so it has accumulated data (odometer, waypoint, laps) when/if activated.
    // On C++ this is a fixed-size member, not dynamic allocation.
    this._lapAnythingTimer = new WaypointLapTimer(this._debugCallback);

    // If no courses loaded, activate Lap Anything immediately
    if (courses.length === 0) {
      this._activateLapAnything();
    }
  }

  // ─── DUCK-TYPED FEED INTERFACE ──────────────────────────────────────
  // These match DovesLapTimer's API so GpsSimulator can feed either one.

  /** Update time on ALL active timers (and Lap Anything if active) */
  updateCurrentTime(ms) {
    for (const ct of this._courseTimers) {
      if (ct.active) {
        ct.timer.updateCurrentTime(ms);
      }
    }

    if (this._lapAnythingTimer) {
      this._lapAnythingTimer.updateCurrentTime(ms);
    }
  }

  /** Feed GPS data to ALL active timers, the detector, and Lap Anything */
  loop(lat, lng, alt, speedKnots) {
    // Feed all active course timers
    for (const ct of this._courseTimers) {
      if (ct.active) {
        ct.timer.loop(lat, lng, alt, speedKnots);
      }
    }

    // Feed Lap Anything timer if active
    if (this._lapAnythingTimer) {
      this._lapAnythingTimer.loop(lat, lng, alt, speedKnots);
    }

    // Feed the detector (needs speed in km/h and odometer from any active timer)
    if (!this._detectionComplete && this._detector && this._courseTimers.length > 0) {
      const speedKmh = speedKnots * 1.852;
      const firstActive = this._courseTimers.find(ct => ct.active);
      const odometer = firstActive ? firstActive.timer.getTotalDistanceTraveled() : 0;

      const result = this._detector.update(lat, lng, speedKmh, odometer);

      // Handle candidates_ready state — validate via raceStarted sanity check
      if (result.state === DETECT_STATE_CANDIDATES_READY) {
        this._handleCandidatesReady(result.rankedMatches);
      }
    }
  }

  // ─── CANDIDATE VALIDATION ──────────────────────────────────────────

  /**
   * Walk ranked candidates, accept the first one where raceStarted === true.
   * If none qualify, reject all and increment rejection counter.
   */
  _handleCandidatesReady(rankedMatches) {
    for (const candidate of rankedMatches) {
      const ct = this._courseTimers[candidate.index];
      if (ct && ct.active && ct.timer.getRaceStarted()) {
        // Sanity check passed — accept this candidate
        this._detector.acceptCandidate(candidate.index);
        this._activeCourseIndex = candidate.index;
        this._detectionComplete = true;
        this._debug(`Course detected (validated): ${ct.name}`);
        return;
      }
    }

    // No candidate had raceStarted — reject all
    this._detector.rejectAllCandidates();
    this._detectionRejectionCount++;
    this._debug(`Detection rejected (${this._detectionRejectionCount}/${COURSE_DETECT_MAX_REJECTIONS}) — no candidate has raceStarted`);

    // After max rejections, fall back to Lap Anything
    if (this._detectionRejectionCount >= COURSE_DETECT_MAX_REJECTIONS) {
      this._debug('Max detection rejections reached — activating Lap Anything');
      this._activateLapAnything();
    }
  }

  // ─── LAP ANYTHING ──────────────────────────────────────────────────

  _activateLapAnything() {
    this._lapAnythingActive = true;
    this._detectionComplete = true;
    // Timer already exists and has been accumulating data — no creation needed
  }

  // ─── COURSE MANAGEMENT ──────────────────────────────────────────────

  /** Remove non-detected course timers to free memory */
  pruneInactiveCourses() {
    if (!this._detectionComplete || this._activeCourseIndex < 0) return;

    for (let i = 0; i < this._courseTimers.length; i++) {
      if (i !== this._activeCourseIndex) {
        this._courseTimers[i].active = false;
        this._courseTimers[i].timer = null; // Free memory
      }
    }
  }

  /** Reset everything - all timers and detector */
  reset() {
    // Re-init from scratch (some timers may have been pruned)
    this._initCourses();
  }

  // ─── GETTERS ────────────────────────────────────────────────────────

  /** Track metadata */
  getTrackName() {
    return this._trackData.longName || this._trackData.shortName || 'Unknown';
  }

  getShortName() {
    return this._trackData.shortName || '';
  }

  /** Detection state */
  isDetectionComplete() {
    return this._detectionComplete;
  }

  getActiveCourseIndex() {
    return this._activeCourseIndex;
  }

  getDetector() {
    return this._detector;
  }

  /** Get the active (detected) course's timer, or null */
  getActiveTimer() {
    if (this._activeCourseIndex < 0) return null;
    const ct = this._courseTimers[this._activeCourseIndex];
    return ct && ct.active ? ct.timer : null;
  }

  /** Get the active course name, or null */
  getActiveCourseName() {
    if (this._lapAnythingActive) return 'Lap Anything';
    if (this._activeCourseIndex < 0) return null;
    return this._courseTimers[this._activeCourseIndex].name;
  }

  /** Get all course entries (for UI multi-course display) */
  getAllCourses() {
    return this._courseTimers;
  }

  /** Get the raw track JSON data */
  getTrackData() {
    return this._trackData;
  }

  /** Get the number of courses */
  getCourseCount() {
    return this._courseTimers.length;
  }

  /** Lap Anything getters */
  isLapAnythingActive() {
    return this._lapAnythingActive;
  }

  getLapAnythingTimer() {
    return this._lapAnythingTimer;
  }

  /** Get detection rejection count */
  getDetectionRejectionCount() {
    return this._detectionRejectionCount;
  }

  // ─── DEBUG ──────────────────────────────────────────────────────────

  _debug(msg) {
    if (this._debugCallback) {
      this._debugCallback(msg);
    }
  }
}
