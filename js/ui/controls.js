/**
 * Controls - handles Start/Stop buttons and track data input fields.
 *
 * Wires up DOM event listeners and delegates to callbacks.
 */

export class Controls {
  /**
   * @param {object} callbacks - { onStart, onStop, onReset, onTrackDataChange }
   */
  constructor(callbacks) {
    this._callbacks = callbacks;
    this._running = false;
  }

  /** Bind all UI controls to their DOM elements */
  init() {
    // Start/Stop button
    const startStopBtn = document.getElementById('btn-start-stop');
    if (startStopBtn) {
      startStopBtn.addEventListener('click', () => this._toggleStartStop());
    }

    // Reset button
    const resetBtn = document.getElementById('btn-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (this._callbacks.onReset) {
          this._callbacks.onReset();
        }
        this._setRunning(false);
      });
    }

    // Track data apply button
    const applyTrackBtn = document.getElementById('btn-apply-track');
    if (applyTrackBtn) {
      applyTrackBtn.addEventListener('click', () => this._applyTrackData());
    }
  }

  /** Set initial values in the track data input fields */
  setTrackInputs(startFinish, sector2, sector3) {
    this._setInputValue('input-start-finish', this._lineToString(startFinish));
    this._setInputValue('input-sector-2', this._lineToString(sector2));
    this._setInputValue('input-sector-3', this._lineToString(sector3));
  }

  /** Get track data from input fields. Returns null per field if invalid. */
  getTrackInputs() {
    return {
      startFinish: this._parseLineInput('input-start-finish'),
      sector2: this._parseLineInput('input-sector-2'),
      sector3: this._parseLineInput('input-sector-3'),
    };
  }

  /** Toggle start/stop */
  _toggleStartStop() {
    if (this._running) {
      this._setRunning(false);
      if (this._callbacks.onStop) this._callbacks.onStop();
    } else {
      this._setRunning(true);
      if (this._callbacks.onStart) this._callbacks.onStart();
    }
  }

  /** Update running state and button text */
  _setRunning(running) {
    this._running = running;
    const btn = document.getElementById('btn-start-stop');
    if (btn) {
      btn.textContent = running ? 'Stop' : 'Start';
      btn.classList.toggle('running', running);
    }
  }

  /** Read and apply track data from inputs */
  _applyTrackData() {
    const data = this.getTrackInputs();
    if (this._callbacks.onTrackDataChange) {
      this._callbacks.onTrackDataChange(data);
    }
  }

  // ─── HELPERS ──────────────────────────────────────────────────────────

  _setInputValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value;
  }

  _parseLineInput(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    const parts = el.value.split(',').map(s => parseFloat(s.trim()));
    if (parts.length !== 4 || parts.some(isNaN)) return null;
    return {
      pointA: { lat: parts[0], lng: parts[1] },
      pointB: { lat: parts[2], lng: parts[3] },
    };
  }

  _lineToString(line) {
    return `${line.pointA.lat}, ${line.pointA.lng}, ${line.pointB.lat}, ${line.pointB.lng}`;
  }
}
