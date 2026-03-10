/**
 * DirectionDetector - detects forward vs reverse driving direction.
 *
 * Observes which sector line gets crossed first after raceStarted.
 * If S2 comes first → forward. If S3 comes first → reverse.
 *
 * This module gets ported back to C++.
 *
 * C++ mapping:
 *   Will become DirectionDetector class in DovesLapTimer.h/.cpp
 *   Simple state machine, minimal RAM footprint.
 */

export const DIR_UNKNOWN = 'unknown';
export const DIR_FORWARD = 'forward';
export const DIR_REVERSE = 'reverse';

export class DirectionDetector {
  constructor() {
    this.reset();
  }

  reset() {
    this._direction = DIR_UNKNOWN;
    this._raceSeen = false;
  }

  // ─── MAIN INTERFACE ────────────────────────────────────────────────

  /**
   * Called when any line crossing is detected.
   * @param {number} sectorNumber - 0 = start/finish, 2 = sector 2, 3 = sector 3
   */
  onLineCrossing(sectorNumber) {
    if (sectorNumber === 0) {
      this._raceSeen = true;
      return;
    }

    if (this._direction !== DIR_UNKNOWN) {
      return;
    }

    if (!this._raceSeen) {
      return;
    }

    if (sectorNumber === 2) {
      this._direction = DIR_FORWARD;
    } else if (sectorNumber === 3) {
      this._direction = DIR_REVERSE;
    }
  }

  // ─── GETTERS ─────────────────────────────────────────────────────

  getDirection() {
    return this._direction;
  }

  isForward() {
    return this._direction === DIR_FORWARD;
  }

  isReverse() {
    return this._direction === DIR_REVERSE;
  }

  isResolved() {
    return this._direction !== DIR_UNKNOWN;
  }
}
