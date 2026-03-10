/**
 * DovesLapTimer - JavaScript port of the C++ GPS lap timing library.
 *
 * This is a faithful 1:1 port. Every method maps directly to the C++ class.
 * The utility functions (haversine, etc.) are imported from separate modules
 * but in C++ they are class methods.
 *
 * C++ file: src/DovesLapTimer.h + src/DovesLapTimer.cpp
 */

import {
  CROSSING_LINE_SIDE_NONE,
  CROSSING_POINT_BUFFER_SIZE,
  DEFAULT_CROSSING_THRESHOLD_METERS,
} from './constants.js';

import { haversine, haversine3D, pointLineSegmentDistance } from './geo-math.js';
import { insideLineThreshold, pointOnSideOfLine } from './crossing-detection.js';
import { interpolateCrossingPoint } from './interpolation.js';

export class DovesLapTimer {
  /**
   * C++ constructor: DovesLapTimer(double crossingThresholdMeters = 7, Stream *debugSerial = NULL)
   *
   * debugCallback: optional function(msg) for debug output (replaces Stream* in C++)
   */
  constructor(crossingThresholdMeters = DEFAULT_CROSSING_THRESHOLD_METERS, debugCallback = null) {
    this.crossingThresholdMeters = crossingThresholdMeters;
    this._debugCallback = debugCallback;

    // Buffer size (C++: compile-time constant based on RAM)
    this._bufferSize = CROSSING_POINT_BUFFER_SIZE;

    // Initialize all state
    this.forceLinear = true;
    this._initLineConfig();
    this._resetState();
    this._initBuffer();
  }

  // ─── STATE INITIALIZATION ─────────────────────────────────────────────

  /**
   * Initialize line coordinates and config flags.
   * Called ONLY from the constructor. reset() must NOT touch these.
   * (Matches C++ behavior: reset() doesn't zero line coordinates.)
   */
  _initLineConfig() {
    this.startFinishPointALat = 0;
    this.startFinishPointALng = 0;
    this.startFinishPointBLat = 0;
    this.startFinishPointBLng = 0;

    this.sector2PointALat = 0;
    this.sector2PointALng = 0;
    this.sector2PointBLat = 0;
    this.sector2PointBLng = 0;

    this.sector3PointALat = 0;
    this.sector3PointALng = 0;
    this.sector3PointBLat = 0;
    this.sector3PointBLng = 0;

    this.sector2LineConfigured = false;
    this.sector3LineConfigured = false;
  }

  /**
   * Reset all timing/position/buffer state.
   * Does NOT touch line coordinates or sector config flags.
   * (Matches C++ reset() exactly.)
   */
  _resetState() {
    this.millisecondsSinceMidnight = 0;

    // Timing
    this.raceStarted = false;
    this.crossing = false;
    this.currentLapStartTime = 0;
    this.lastLapTime = 0;
    this.bestLapTime = 0;
    this.currentLapOdometerStart = 0.0;
    this.lastLapDistance = 0.0;
    this.bestLapDistance = 0.0;
    this.currentSpeedkmh = 0.0;
    this.bestLapNumber = 0;
    this.laps = 0;
    this.crossingStartedLineSide = CROSSING_LINE_SIDE_NONE;

    // Sector timing state
    this.currentSector = 0;
    this.currentSectorStartTime = 0;
    this.crossingSector2 = false;
    this.crossingSector3 = false;

    // Current lap sector times
    this.currentLapSector1Time = 0;
    this.currentLapSector2Time = 0;
    this.currentLapSector3Time = 0;

    // Best sector times
    this.bestSector1Time = 0;
    this.bestSector2Time = 0;
    this.bestSector3Time = 0;

    // Best sector lap numbers
    this.bestSector1LapNumber = 0;
    this.bestSector2LapNumber = 0;
    this.bestSector3LapNumber = 0;

    // Distance / position tracking
    this.totalDistanceTraveled = 0;
    this.positionPrevAlt = 0.0;
    this.positionPrevLat = 0.0;
    this.positionPrevLng = 0.0;
    this.firstPositionReceived = false;

    // Previous GPS fix (Catmull-Rom control point)
    this.prevFixLat = 0;
    this.prevFixLng = 0;
    this.prevFixTime = 0;
    this.prevFixOdometer = 0;
    this.prevFixSpeedKmh = 0;
    this.hasPrevFix = false;
  }

  /** Initialize / reset the crossing point buffer */
  _initBuffer() {
    this.crossingPointBuffer = new Array(this._bufferSize);
    for (let i = 0; i < this._bufferSize; i++) {
      this.crossingPointBuffer[i] = { lat: 0, lng: 0, time: 0, odometer: 0, speedKmh: 0 };
    }
    this.crossingPointBufferIndex = 0;
    this.crossingPointBufferFull = false;
  }

  // ─── DEBUG ─────────────────────────────────────────────────────────────

  /** C++ mapping: debug_print / debug_println via Stream* */
  _debug(...args) {
    if (this._debugCallback) {
      this._debugCallback(args.join(''));
    }
  }

  // ─── MAIN LOOP ────────────────────────────────────────────────────────

  /**
   * Main update function. Call every GPS fix.
   *
   * C++ signature: int loop(double currentLat, double currentLng,
   *                          float currentAltitudeMeters, float currentSpeedKnots)
   *
   * Returns 0 if near any crossing line, -1 otherwise.
   */
  loop(currentLat, currentLng, currentAltitudeMeters, currentSpeedKnots) {
    // Update odometer
    if (this.firstPositionReceived) {
      const dist = haversine3D(
        this.positionPrevLat, this.positionPrevLng, this.positionPrevAlt,
        currentLat, currentLng, currentAltitudeMeters
      );
      this.totalDistanceTraveled += dist;
    } else {
      this.firstPositionReceived = true;
    }

    this.positionPrevLat = currentLat;
    this.positionPrevLng = currentLng;
    this.positionPrevAlt = currentAltitudeMeters;

    // Update current speed (knots -> km/h)
    this.currentSpeedkmh = currentSpeedKnots * 1.852;

    // Check crossing lines (mutual exclusion - shared buffer)
    let nearAnyLine = false;

    // Check start/finish - skip if sector crossing active
    if (this.crossing || (!this.crossingSector2 && !this.crossingSector3)) {
      if (this._checkStartFinish(currentLat, currentLng)) {
        nearAnyLine = true;
      }
    }

    // Check sector lines if configured and not crossing start/finish
    if (this.areSectorLinesConfigured() && !this.crossing) {
      // Sector 2
      if (this.sector2LineConfigured && !this.crossingSector2 && !this.crossingSector3) {
        if (this._checkSectorLine(currentLat, currentLng,
          this.sector2PointALat, this.sector2PointALng,
          this.sector2PointBLat, this.sector2PointBLng,
          'crossingSector2', 2)) {
          nearAnyLine = true;
        }
      } else if (this.crossingSector2) {
        if (this._checkSectorLine(currentLat, currentLng,
          this.sector2PointALat, this.sector2PointALng,
          this.sector2PointBLat, this.sector2PointBLng,
          'crossingSector2', 2)) {
          nearAnyLine = true;
        }
      }

      // Sector 3
      if (this.sector3LineConfigured && !this.crossingSector2 && !this.crossingSector3) {
        if (this._checkSectorLine(currentLat, currentLng,
          this.sector3PointALat, this.sector3PointALng,
          this.sector3PointBLat, this.sector3PointBLng,
          'crossingSector3', 3)) {
          nearAnyLine = true;
        }
      } else if (this.crossingSector3) {
        if (this._checkSectorLine(currentLat, currentLng,
          this.sector3PointALat, this.sector3PointALng,
          this.sector3PointBLat, this.sector3PointBLng,
          'crossingSector3', 3)) {
          nearAnyLine = true;
        }
      }
    }

    // Save current fix as previous for Catmull-Rom
    this.prevFixLat = currentLat;
    this.prevFixLng = currentLng;
    this.prevFixTime = this.millisecondsSinceMidnight;
    this.prevFixOdometer = this.totalDistanceTraveled;
    this.prevFixSpeedKmh = this.currentSpeedkmh;
    this.hasPrevFix = true;

    return nearAnyLine ? 0 : -1;
  }

  // ─── CROSSING CHECK: START/FINISH ─────────────────────────────────────

  /**
   * C++ signature: bool checkStartFinish(double currentLat, double currentLng)
   */
  _checkStartFinish(currentLat, currentLng) {
    let distToLine = Infinity;

    if (this.crossing || insideLineThreshold(currentLat, currentLng,
      this.startFinishPointALat, this.startFinishPointALng,
      this.startFinishPointBLat, this.startFinishPointBLng,
      this.crossingThresholdMeters)) {
      distToLine = pointLineSegmentDistance(currentLat, currentLng,
        this.startFinishPointALat, this.startFinishPointALng,
        this.startFinishPointBLat, this.startFinishPointBLng);
    }

    if (this.crossing) {
      if (distToLine > this.crossingThresholdMeters + 1) {
        // Exited threshold - interpolate crossing
        this._debug('probably crossed, lets calculate');
        this.crossing = false;
        this.crossingStartedLineSide = CROSSING_LINE_SIDE_NONE;

        const result = interpolateCrossingPoint(
          this.crossingPointBuffer, this.crossingPointBufferIndex,
          this.crossingPointBufferFull, this._bufferSize,
          this.startFinishPointALat, this.startFinishPointALng,
          this.startFinishPointBLat, this.startFinishPointBLng,
          this.forceLinear, this.crossingThresholdMeters
        );

        if (result && result.crossingTime !== 0) {
          this._debug(`crossingLat: ${result.crossingLat.toFixed(6)}`);
          this._debug(`crossingLng: ${result.crossingLng.toFixed(6)}`);
          this._debug(`crossingTime: ${result.crossingTime}`);

          if (this.raceStarted) {
            this.laps++;
            const lapTime = result.crossingTime - this.currentLapStartTime;
            const lapDistance = result.crossingOdometer - this.currentLapOdometerStart;

            this.currentLapStartTime = result.crossingTime;
            this.currentLapOdometerStart = result.crossingOdometer;

            this._debug(`Lap Finish Time: ${lapTime} : ${(lapTime / 1000).toFixed(3)}`);

            this.lastLapTime = lapTime;
            this.lastLapDistance = lapDistance;

            if (this.bestLapTime <= 0 || this.lastLapTime < this.bestLapTime) {
              this.bestLapTime = this.lastLapTime;
              this.bestLapDistance = this.lastLapDistance;
              this.bestLapNumber = this.laps;
            }

            this._handleLineCrossing(result.crossingTime, 0);
          } else {
            this.currentLapStartTime = result.crossingTime;
            this.currentLapOdometerStart = result.crossingOdometer;
            this.raceStarted = true;
            this._debug('Race Started');

            this._handleLineCrossing(result.crossingTime, 0);
          }
        }

        // Reset buffer
        this._resetBuffer();
      } else {
        // Still in threshold - buffer this point
        this._bufferPoint(currentLat, currentLng);
      }
    } else {
      if (distToLine < this.crossingThresholdMeters) {
        this._debug('we are possibly crossing');
        this.crossing = true;

        // Insert previous fix as pre-crossing control point
        if (this.hasPrevFix) {
          this._bufferPrevFix();
        }

        // Capture current point
        this._bufferPoint(currentLat, currentLng);
      }
    }

    return this.crossing || distToLine < this.crossingThresholdMeters;
  }

  // ─── CROSSING CHECK: SECTOR LINE ──────────────────────────────────────

  /**
   * C++ signature: bool checkSectorLine(double currentLat, double currentLng,
   *   double pointALat, double pointALng, double pointBLat, double pointBLng,
   *   bool& crossingFlag, int sectorNumber)
   *
   * NOTE: crossingFlag is a string key (e.g., 'crossingSector2') since JS has no references.
   */
  _checkSectorLine(currentLat, currentLng, pointALat, pointALng, pointBLat, pointBLng, crossingFlagKey, sectorNumber) {
    let distToLine = Infinity;
    const crossingFlag = this[crossingFlagKey];

    if (crossingFlag || insideLineThreshold(currentLat, currentLng,
      pointALat, pointALng, pointBLat, pointBLng, this.crossingThresholdMeters)) {
      distToLine = pointLineSegmentDistance(currentLat, currentLng,
        pointALat, pointALng, pointBLat, pointBLng);
    }

    if (crossingFlag) {
      if (distToLine > this.crossingThresholdMeters + 1) {
        this._debug(`Sector ${sectorNumber} crossed, calculating...`);
        this[crossingFlagKey] = false;

        const result = interpolateCrossingPoint(
          this.crossingPointBuffer, this.crossingPointBufferIndex,
          this.crossingPointBufferFull, this._bufferSize,
          pointALat, pointALng, pointBLat, pointBLng,
          this.forceLinear, this.crossingThresholdMeters
        );

        if (result && result.crossingTime !== 0 && this.raceStarted) {
          this._debug(`Sector ${sectorNumber} crossingTime: ${result.crossingTime}`);
          this._handleLineCrossing(result.crossingTime, sectorNumber);
        }

        this._resetBuffer();
      } else {
        this._bufferPoint(currentLat, currentLng);
      }
    } else {
      if (distToLine < this.crossingThresholdMeters) {
        this._debug(`Entering Sector ${sectorNumber} crossing zone`);
        this[crossingFlagKey] = true;

        if (this.hasPrevFix) {
          this._bufferPrevFix();
        }

        this._bufferPoint(currentLat, currentLng);
      }
    }

    return this[crossingFlagKey] || distToLine < this.crossingThresholdMeters;
  }

  // ─── BUFFER HELPERS ───────────────────────────────────────────────────

  /** Add current GPS position to the crossing point buffer */
  _bufferPoint(lat, lng) {
    this.crossingPointBuffer[this.crossingPointBufferIndex] = {
      lat: lat,
      lng: lng,
      time: this.millisecondsSinceMidnight,
      odometer: this.totalDistanceTraveled,
      speedKmh: this.currentSpeedkmh,
    };
    this.crossingPointBufferIndex = (this.crossingPointBufferIndex + 1) % this._bufferSize;
    if (this.crossingPointBufferIndex === 0) {
      this.crossingPointBufferFull = true;
    }
  }

  /** Insert the previous GPS fix into the buffer (Catmull-Rom p0 control point) */
  _bufferPrevFix() {
    this.crossingPointBuffer[this.crossingPointBufferIndex] = {
      lat: this.prevFixLat,
      lng: this.prevFixLng,
      time: this.prevFixTime,
      odometer: this.prevFixOdometer,
      speedKmh: this.prevFixSpeedKmh,
    };
    this.crossingPointBufferIndex = (this.crossingPointBufferIndex + 1) % this._bufferSize;
  }

  /** Reset the crossing point buffer */
  _resetBuffer() {
    this.crossingPointBufferIndex = 0;
    this.crossingPointBufferFull = false;
    for (let i = 0; i < this._bufferSize; i++) {
      this.crossingPointBuffer[i] = { lat: 0, lng: 0, time: 0, odometer: 0, speedKmh: 0 };
    }
  }

  // ─── SECTOR TIMING ────────────────────────────────────────────────────

  /**
   * C++ signature: void handleLineCrossing(unsigned long crossingTime, int sectorNumber)
   */
  _handleLineCrossing(crossingTime, sectorNumber) {
    if (!this.areSectorLinesConfigured()) {
      return;
    }

    if (sectorNumber === 0) {
      // Start/finish line
      if (this.raceStarted && this.currentSector === 3) {
        this.currentLapSector3Time = crossingTime - this.currentSectorStartTime;
        this._debug(`Sector 3 Time: ${this.currentLapSector3Time}`);
        this._updateBestSectors();
      }

      this.currentSector = 1;
      this.currentSectorStartTime = crossingTime;
      this.currentLapSector1Time = 0;
      this.currentLapSector2Time = 0;
      this.currentLapSector3Time = 0;
      this._debug('Starting Sector 1');

    } else if (sectorNumber === 2) {
      if (this.currentSector === 1) {
        this.currentLapSector1Time = crossingTime - this.currentSectorStartTime;
        this.currentSector = 2;
        this.currentSectorStartTime = crossingTime;
        this._debug(`Sector 1 Time: ${this.currentLapSector1Time} : ${(this.currentLapSector1Time / 1000).toFixed(3)}`);
      } else {
        this._debug(`WARNING: Sector 2 crossed out of order (current sector: ${this.currentSector})`);
        this.currentSector = 0;
      }

    } else if (sectorNumber === 3) {
      if (this.currentSector === 2) {
        this.currentLapSector2Time = crossingTime - this.currentSectorStartTime;
        this.currentSector = 3;
        this.currentSectorStartTime = crossingTime;
        this._debug(`Sector 2 Time: ${this.currentLapSector2Time} : ${(this.currentLapSector2Time / 1000).toFixed(3)}`);
      } else {
        this._debug(`WARNING: Sector 3 crossed out of order (current sector: ${this.currentSector})`);
        this.currentSector = 0;
      }
    }
  }

  /**
   * C++ signature: void updateBestSectors()
   */
  _updateBestSectors() {
    if (this.currentLapSector1Time === 0 || this.currentLapSector2Time === 0 || this.currentLapSector3Time === 0) {
      return;
    }

    if (this.bestSector1Time === 0 || this.currentLapSector1Time < this.bestSector1Time) {
      this.bestSector1Time = this.currentLapSector1Time;
      this.bestSector1LapNumber = this.laps;
    }
    if (this.bestSector2Time === 0 || this.currentLapSector2Time < this.bestSector2Time) {
      this.bestSector2Time = this.currentLapSector2Time;
      this.bestSector2LapNumber = this.laps;
    }
    if (this.bestSector3Time === 0 || this.currentLapSector3Time < this.bestSector3Time) {
      this.bestSector3Time = this.currentLapSector3Time;
      this.bestSector3LapNumber = this.laps;
    }
  }

  // ─── PUBLIC API: SETUP ────────────────────────────────────────────────

  reset() {
    this._resetState();
    this._initBuffer();
  }

  setStartFinishLine(pointALat, pointALng, pointBLat, pointBLng) {
    this.startFinishPointALat = pointALat;
    this.startFinishPointALng = pointALng;
    this.startFinishPointBLat = pointBLat;
    this.startFinishPointBLng = pointBLng;
  }

  setSector2Line(pointALat, pointALng, pointBLat, pointBLng) {
    this.sector2PointALat = pointALat;
    this.sector2PointALng = pointALng;
    this.sector2PointBLat = pointBLat;
    this.sector2PointBLng = pointBLng;
    this.sector2LineConfigured = true;
  }

  setSector3Line(pointALat, pointALng, pointBLat, pointBLng) {
    this.sector3PointALat = pointALat;
    this.sector3PointALng = pointALng;
    this.sector3PointBLat = pointBLat;
    this.sector3PointBLng = pointBLng;
    this.sector3LineConfigured = true;
  }

  updateCurrentTime(currentTimeMilliseconds) {
    this.millisecondsSinceMidnight = currentTimeMilliseconds;
  }

  forceLinearInterpolation() {
    this.forceLinear = true;
  }

  forceCatmullRomInterpolation() {
    this.forceLinear = false;
  }

  // ─── PUBLIC API: GETTERS ──────────────────────────────────────────────

  getRaceStarted() { return this.raceStarted; }
  getCrossing() { return this.crossing; }
  getCurrentLapStartTime() { return this.currentLapStartTime; }

  getCurrentLapTime() {
    return (this.currentLapStartTime <= 0 || !this.raceStarted)
      ? 0
      : this.millisecondsSinceMidnight - this.currentLapStartTime;
  }

  getLastLapTime() { return this.lastLapTime; }
  getBestLapTime() { return this.bestLapTime; }
  getCurrentLapOdometerStart() { return this.currentLapOdometerStart; }

  getCurrentLapDistance() {
    return (this.currentLapOdometerStart === 0 || !this.raceStarted)
      ? 0
      : this.totalDistanceTraveled - this.currentLapOdometerStart;
  }

  getLastLapDistance() { return this.lastLapDistance; }
  getBestLapDistance() { return this.bestLapDistance; }
  getTotalDistanceTraveled() { return this.totalDistanceTraveled; }
  getBestLapNumber() { return this.bestLapNumber; }
  getLaps() { return this.laps; }

  getPaceDifference() {
    const currentLapDistance = (this.currentLapOdometerStart === 0 || !this.raceStarted)
      ? 0
      : this.totalDistanceTraveled - this.currentLapOdometerStart;
    const currentLapTime = this.millisecondsSinceMidnight - this.currentLapStartTime;

    if (currentLapDistance === 0 || this.bestLapDistance === 0) {
      return 0.0;
    }

    const currentLapPace = currentLapTime / currentLapDistance;
    const bestLapPace = this.bestLapTime / this.bestLapDistance;
    return currentLapPace - bestLapPace;
  }

  // Sector getters
  getBestSector1Time() { return this.bestSector1Time; }
  getBestSector2Time() { return this.bestSector2Time; }
  getBestSector3Time() { return this.bestSector3Time; }
  getCurrentLapSector1Time() { return this.currentLapSector1Time; }
  getCurrentLapSector2Time() { return this.currentLapSector2Time; }
  getCurrentLapSector3Time() { return this.currentLapSector3Time; }

  getOptimalLapTime() {
    if (this.bestSector1Time === 0 || this.bestSector2Time === 0 || this.bestSector3Time === 0) {
      return 0;
    }
    return this.bestSector1Time + this.bestSector2Time + this.bestSector3Time;
  }

  getBestSector1LapNumber() { return this.bestSector1LapNumber; }
  getBestSector2LapNumber() { return this.bestSector2LapNumber; }
  getBestSector3LapNumber() { return this.bestSector3LapNumber; }
  getCurrentSector() { return this.currentSector; }
  areSectorLinesConfigured() { return this.sector2LineConfigured && this.sector3LineConfigured; }
}
