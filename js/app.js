/**
 * App - main entry point. Wires together:
 *   - DovesLapTimer (the library)
 *   - GpsSimulator (feeds the library at 25Hz)
 *   - MapManager (Leaflet map + marker)
 *   - DataDisplay (timing data panel)
 *   - Controls (buttons + track data inputs)
 */

import { DovesLapTimer } from './lib/DovesLapTimer.js';
import { GpsSimulator } from './sim/gps-simulator.js';
import { MapManager } from './ui/map-manager.js';
import { DataDisplay } from './ui/data-display.js';
import { Controls } from './ui/controls.js';
import { SessionLogger } from './sim/session-logger.js';
import { DEFAULT_START_FINISH, DEFAULT_SECTOR_2, DEFAULT_SECTOR_3, getLineMidpoint } from './sim/track-data.js';

// ─── STATE ────────────────────────────────────────────────────────────

let lapTimer = null;
let simulator = null;
let mapManager = null;
let dataDisplay = null;
let controls = null;
let sessionLogger = null;

// Current track configuration
let trackConfig = {
  startFinish: DEFAULT_START_FINISH,
  sector2: DEFAULT_SECTOR_2,
  sector3: DEFAULT_SECTOR_3,
};

// Display update throttle (don't update DOM every tick - 25Hz is too fast)
const DISPLAY_UPDATE_INTERVAL_MS = 100; // 10Hz display refresh
let lastDisplayUpdate = 0;

// ─── INITIALIZATION ──────────────────────────────────────────────────

function initLapTimer() {
  lapTimer = new DovesLapTimer(7.0, (msg) => {
    console.log('[LapTimer]', msg);
  });

  applyTrackConfig();
  lapTimer.forceLinearInterpolation();
  lapTimer.reset();
}

function applyTrackConfig() {
  const sf = trackConfig.startFinish;
  const s2 = trackConfig.sector2;
  const s3 = trackConfig.sector3;

  lapTimer.setStartFinishLine(sf.pointA.lat, sf.pointA.lng, sf.pointB.lat, sf.pointB.lng);
  lapTimer.setSector2Line(s2.pointA.lat, s2.pointA.lng, s2.pointB.lat, s2.pointB.lng);
  lapTimer.setSector3Line(s3.pointA.lat, s3.pointA.lng, s3.pointB.lat, s3.pointB.lng);
}

function initMap() {
  const center = getLineMidpoint(trackConfig.startFinish);

  mapManager = new MapManager('map');
  mapManager.init(center.lat, center.lng, 17);

  // Draw lines
  drawTrackLines();

  // Place driver marker slightly south of start/finish (avoid immediate crossing trigger)
  mapManager.createDriverMarker(center.lat - 0.0002, center.lng);
}

function drawTrackLines() {
  const sf = trackConfig.startFinish;
  const s2 = trackConfig.sector2;
  const s3 = trackConfig.sector3;

  mapManager.setStartFinishLine(sf.pointA, sf.pointB);
  mapManager.setSector2Line(s2.pointA, s2.pointB);
  mapManager.setSector3Line(s3.pointA, s3.pointB);
}

function initDataDisplay() {
  dataDisplay = new DataDisplay({
    currentLapTime: 'val-current-lap',
    lastLapTime: 'val-last-lap',
    bestLapTime: 'val-best-lap',
    lapCount: 'val-lap-count',
    bestLapNumber: 'val-best-lap-num',
    raceStarted: 'val-race-started',
    currentSector: 'val-current-sector',
    paceDifference: 'val-pace-diff',
    sector1Time: 'val-sector1',
    sector2Time: 'val-sector2',
    sector3Time: 'val-sector3',
    bestSector1: 'val-best-s1',
    bestSector2: 'val-best-s2',
    bestSector3: 'val-best-s3',
    optimalLap: 'val-optimal-lap',
    currentLapDist: 'val-current-dist',
    totalDist: 'val-total-dist',
    speed: 'val-speed',
    tickCount: 'val-tick-count',
    crossingIndicator: 'crossing-indicator',
  });
}

function initControls() {
  controls = new Controls({
    onStart: handleStart,
    onStop: handleStop,
    onReset: handleReset,
    onTrackDataChange: handleTrackDataChange,
  });

  controls.init();
  controls.setTrackInputs(trackConfig.startFinish, trackConfig.sector2, trackConfig.sector3);
}

function initSimulator() {
  simulator = new GpsSimulator(
    lapTimer,
    () => mapManager.getDriverPosition(),
    handleSimTick
  );
  sessionLogger = new SessionLogger();
}

// ─── EVENT HANDLERS ──────────────────────────────────────────────────

function handleStart() {
  if (!simulator.isRunning()) {
    sessionLogger.startRecording();
    simulator.start();
  }
}

function handleStop() {
  if (simulator.isRunning()) {
    simulator.stop();
    sessionLogger.stopRecording();

    // Auto-download the .dove log file
    if (sessionLogger.getSampleCount() > 0) {
      sessionLogger.downloadFile();
    }
  }
}

function handleReset() {
  if (simulator.isRunning()) {
    simulator.stop();
  }
  lapTimer.reset();
  mapManager.clearTrail();
  // Force a display update to clear values
  dataDisplay.update(lapTimer, { speedKmh: 0, tickCount: 0 });
  dataDisplay.setCrossingIndicator(false);
}

function handleTrackDataChange(data) {
  // Stop sim if running
  const wasRunning = simulator.isRunning();
  if (wasRunning) simulator.stop();

  // Update track config with valid values
  if (data.startFinish) trackConfig.startFinish = data.startFinish;
  if (data.sector2) trackConfig.sector2 = data.sector2;
  if (data.sector3) trackConfig.sector3 = data.sector3;

  // Re-apply to lap timer
  applyTrackConfig();
  lapTimer.reset();

  // Redraw lines on map
  drawTrackLines();

  // Center map on new start/finish
  const center = getLineMidpoint(trackConfig.startFinish);
  mapManager.centerOn(center.lat, center.lng);

  // Reset display
  dataDisplay.update(lapTimer, { speedKmh: 0, tickCount: 0 });
  dataDisplay.setCrossingIndicator(false);
}

function handleSimTick(simInfo) {
  // Log every sample (25Hz) to the session logger
  sessionLogger.logSample(simInfo.lat, simInfo.lng, simInfo.speedKmh);

  // Add trail point
  mapManager.addTrailPoint(simInfo.lat, simInfo.lng);

  // Throttle display updates
  const now = performance.now();
  if (now - lastDisplayUpdate < DISPLAY_UPDATE_INTERVAL_MS) return;
  lastDisplayUpdate = now;

  dataDisplay.update(lapTimer, simInfo);
  dataDisplay.setCrossingIndicator(lapTimer.getCrossing());
}

// ─── BOOT ────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initLapTimer();
  initMap();
  initDataDisplay();
  initControls();
  initSimulator();

  // Initial display state
  dataDisplay.update(lapTimer, { speedKmh: 0, tickCount: 0 });
});
