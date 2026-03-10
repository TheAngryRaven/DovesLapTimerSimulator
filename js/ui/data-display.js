/**
 * Data Display - updates the timing data panel in the DOM.
 *
 * Reads from the DovesLapTimer instance and updates HTML elements.
 * All formatting is done here.
 */

export class DataDisplay {
  /**
   * @param {object} elements - Map of DOM element IDs to reference
   */
  constructor(elements) {
    this._els = {};
    for (const [key, id] of Object.entries(elements)) {
      this._els[key] = document.getElementById(id);
    }
  }

  /** Update all displayed data from the lap timer */
  update(lapTimer, simInfo = {}) {
    this._setText('currentLapTime', this._formatTime(lapTimer.getCurrentLapTime()));
    this._setText('lastLapTime', this._formatTime(lapTimer.getLastLapTime()));
    this._setText('bestLapTime', this._formatTime(lapTimer.getBestLapTime()));
    this._setText('lapCount', lapTimer.getLaps().toString());
    this._setText('bestLapNumber', lapTimer.getBestLapNumber().toString());
    this._setText('raceStarted', lapTimer.getRaceStarted() ? 'YES' : 'NO');
    this._setText('currentSector', this._formatSector(lapTimer.getCurrentSector()));
    this._setText('paceDifference', this._formatPace(lapTimer.getPaceDifference()));

    // Sector times
    this._setText('sector1Time', this._formatTime(lapTimer.getCurrentLapSector1Time()));
    this._setText('sector2Time', this._formatTime(lapTimer.getCurrentLapSector2Time()));
    this._setText('sector3Time', this._formatTime(lapTimer.getCurrentLapSector3Time()));
    this._setText('bestSector1', this._formatTime(lapTimer.getBestSector1Time()));
    this._setText('bestSector2', this._formatTime(lapTimer.getBestSector2Time()));
    this._setText('bestSector3', this._formatTime(lapTimer.getBestSector3Time()));
    this._setText('optimalLap', this._formatTime(lapTimer.getOptimalLapTime()));

    // Distance
    this._setText('currentLapDist', this._formatDistance(lapTimer.getCurrentLapDistance()));
    this._setText('totalDist', this._formatDistance(lapTimer.getTotalDistanceTraveled()));

    // Sim info
    if (simInfo.speedKmh !== undefined) {
      this._setText('speed', simInfo.speedKmh.toFixed(1) + ' km/h');
    }
    if (simInfo.tickCount !== undefined) {
      this._setText('tickCount', simInfo.tickCount.toString());
    }
  }

  /** Set crossing indicator state */
  setCrossingIndicator(isCrossing) {
    const el = this._els['crossingIndicator'];
    if (el) {
      el.classList.toggle('active', isCrossing);
      el.textContent = isCrossing ? 'CROSSING' : '';
    }
  }

  // ─── FORMATTERS ───────────────────────────────────────────────────────

  _formatTime(ms) {
    if (!ms || ms <= 0) return '--:--.---';
    const totalSeconds = ms / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toFixed(3).padStart(6, '0')}`;
  }

  _formatSector(sector) {
    if (sector === 0) return '-';
    return `S${sector}`;
  }

  _formatPace(pace) {
    if (pace === 0) return '--.---';
    const sign = pace > 0 ? '+' : '';
    return sign + pace.toFixed(3);
  }

  _formatDistance(meters) {
    if (!meters || meters <= 0) return '0 m';
    if (meters < 1000) return meters.toFixed(0) + ' m';
    return (meters / 1000).toFixed(2) + ' km';
  }

  /** Safely set text content */
  _setText(key, value) {
    if (this._els[key]) {
      this._els[key].textContent = value;
    }
  }
}
