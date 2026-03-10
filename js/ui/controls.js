/**
 * Controls - handles Start/Stop buttons and track data JSON input.
 *
 * Wires up DOM event listeners and delegates to callbacks.
 */

import { parseTrackJson } from '../sim/track-data-json.js';

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

  /** Set the track JSON textarea content */
  setTrackJson(trackJson) {
    const el = document.getElementById('input-track-json');
    if (el) {
      el.value = JSON.stringify(trackJson, null, 2);
    }
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

  /** Read and apply track data from JSON textarea */
  _applyTrackData() {
    const el = document.getElementById('input-track-json');
    if (!el) return;

    const parsed = parseTrackJson(el.value);
    if (!parsed) {
      alert('Invalid track JSON. Needs courses array with name, lengthFt, and start line coordinates.');
      return;
    }

    if (this._callbacks.onTrackDataChange) {
      this._callbacks.onTrackDataChange(parsed);
    }
  }
}
