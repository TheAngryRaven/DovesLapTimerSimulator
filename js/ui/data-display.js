/**
 * Data Display - updates the timing data panel in the DOM.
 *
 * Supports two modes:
 *   1. Multi-course (during detection) - shows summary for each course
 *   2. Single-course (after detection) - shows full timing data for the active course
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

  // ─── DETECTION STATUS ─────────────────────────────────────────────

  /** Update the course detection status display */
  setDetectionStatus(trackName, state, detectedCourseName) {
    this._setText('trackName', trackName || '--');
    this._setText('detectionState', this._formatDetectionState(state));
    this._setText('detectedCourse', detectedCourseName || '--');
  }

  // ─── MULTI-COURSE DISPLAY ─────────────────────────────────────────

  /** Update the multi-course panels during detection phase */
  updateMultiCourse(courseManager, simInfo = {}) {
    const container = this._els['coursePanels'];
    if (!container) return;

    const courses = courseManager.getAllCourses();
    const activeCourseIndex = courseManager.getActiveCourseIndex();

    // Build or update course panels
    while (container.children.length > courses.length) {
      container.removeChild(container.lastChild);
    }

    courses.forEach((ct, index) => {
      let panel = container.children[index];

      if (!panel) {
        panel = document.createElement('div');
        panel.className = 'course-panel';
        container.appendChild(panel);
      }

      // Update classes
      panel.className = 'course-panel';
      if (index === activeCourseIndex) {
        panel.classList.add('active');
      } else if (courseManager.isDetectionComplete() && index !== activeCourseIndex) {
        panel.classList.add('inactive');
      }

      if (!ct.timer || !ct.active) {
        panel.innerHTML = `<div class="course-name">${ct.name}</div><div class="course-data">--</div>`;
        return;
      }

      const timer = ct.timer;
      panel.innerHTML = `
        <div class="course-name">${ct.name} <span class="course-length">${ct.lengthFt} ft</span></div>
        <div class="course-data">
          <span>Laps: ${timer.getLaps()}</span>
          <span>Last: ${this._formatTime(timer.getLastLapTime())}</span>
          <span>Best: ${this._formatTime(timer.getBestLapTime())}</span>
        </div>
      `;
    });

    // Also update speed/tick in the status area
    if (simInfo.speedKmh !== undefined) {
      this._setText('speed', simInfo.speedKmh.toFixed(1) + ' km/h');
    }
    if (simInfo.tickCount !== undefined) {
      this._setText('tickCount', simInfo.tickCount.toString());
    }
  }

  /** Clear the multi-course panels */
  clearMultiCourse() {
    const container = this._els['coursePanels'];
    if (container) {
      container.innerHTML = '';
    }
  }

  // ─── SINGLE-COURSE DISPLAY ────────────────────────────────────────

  /** Update all displayed data from a single lap timer (after detection) */
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

  _formatDetectionState(state) {
    switch (state) {
      case 'idle': return 'Idle';
      case 'waiting_for_speed': return 'Waiting for speed...';
      case 'waypoint_set': return 'Waypoint set - driving...';
      case 'detected': return 'Detected!';
      default: return state || '--';
    }
  }

  /** Safely set text content */
  _setText(key, value) {
    if (this._els[key]) {
      this._els[key].textContent = value;
    }
  }
}
