/**
 * App - main entry point. Wires together:
 *   - CourseManager (multiple DovesLapTimer instances + CourseDetector)
 *   - GpsSimulator (feeds CourseManager at 25Hz via duck typing)
 *   - MapManager (Leaflet map + marker + multi-course lines)
 *   - DataDisplay (timing data panel + detection status + course panels)
 *   - Controls (buttons + track JSON input)
 *   - SessionLogger (.dove CSV export)
 */

import { CourseManager } from './lib/course-manager.js';
import { GpsSimulator } from './sim/gps-simulator.js';
import { MapManager } from './ui/map-manager.js';
import { DataDisplay } from './ui/data-display.js';
import { Controls } from './ui/controls.js';
import { SessionLogger } from './sim/session-logger.js';
import { DEFAULT_TRACK_JSON, getTrackCenter } from './sim/track-data-json.js';
import {
  DETECT_STATE_WAYPOINT_SET,
  DETECT_STATE_DETECTED,
  DETECT_STATE_CANDIDATES_READY,
} from './lib/course-detector.js';

// ─── STATE ────────────────────────────────────────────────────────────

let courseManager = null;
let simulator = null;
let mapManager = null;
let dataDisplay = null;
let controls = null;
let sessionLogger = null;

// Current track JSON
let trackJson = DEFAULT_TRACK_JSON;

// Display update throttle
const DISPLAY_UPDATE_INTERVAL_MS = 100; // 10Hz
let lastDisplayUpdate = 0;

// Track detection state changes for map updates
let waypointDrawn = false;
let detectionHandled = false;
let lapAnythingHandled = false;

// ─── INITIALIZATION ──────────────────────────────────────────────────

function initCourseManager() {
  courseManager = new CourseManager(trackJson, 7.0, (msg) => {
    console.log('[CourseManager]', msg);
  });
}

function initMap() {
  const center = getTrackCenter(trackJson);

  mapManager = new MapManager('map');
  mapManager.init(center.lat, center.lng, 17);

  // Draw all course lines
  drawAllCourseLines();

  // Place driver marker slightly south of first course's start/finish
  mapManager.createDriverMarker(center.lat - 0.0002, center.lng);
}

function drawAllCourseLines() {
  mapManager.removeAllCourseLines();
  mapManager.drawAllCourseLines(trackJson.courses);
}

function initDataDisplay() {
  dataDisplay = new DataDisplay({
    // Detection
    trackName: 'val-track-name',
    detectionState: 'val-detection-state',
    detectedCourse: 'val-detected-course',
    timingMode: 'val-timing-mode',
    direction: 'val-direction',
    coursePanels: 'course-panels',

    // Timing
    currentLapTime: 'val-current-lap',
    lastLapTime: 'val-last-lap',
    bestLapTime: 'val-best-lap',
    lapCount: 'val-lap-count',
    bestLapNumber: 'val-best-lap-num',
    raceStarted: 'val-race-started',
    currentSector: 'val-current-sector',
    paceDifference: 'val-pace-diff',

    // Sectors
    sector1Time: 'val-sector1',
    sector2Time: 'val-sector2',
    sector3Time: 'val-sector3',
    bestSector1: 'val-best-s1',
    bestSector2: 'val-best-s2',
    bestSector3: 'val-best-s3',
    optimalLap: 'val-optimal-lap',

    // Distance
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
  controls.setTrackJson(trackJson);
}

function initSimulator() {
  simulator = new GpsSimulator(
    courseManager,
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

    if (sessionLogger.getSampleCount() > 0) {
      sessionLogger.downloadFile();
    }
  }
}

function handleReset() {
  if (simulator.isRunning()) {
    simulator.stop();
  }
  courseManager.reset();
  mapManager.clearTrail();
  mapManager.removeWaypointMarker();
  waypointDrawn = false;
  detectionHandled = false;
  lapAnythingHandled = false;

  // Redraw all course lines (they may have been pruned)
  drawAllCourseLines();

  // Reset displays
  updateDetectionDisplay('--');
  dataDisplay.clearMultiCourse();
  resetTimingDisplay();
}

function handleTrackDataChange(newTrackJson) {
  const wasRunning = simulator.isRunning();
  if (wasRunning) simulator.stop();

  // Update track JSON and rebuild everything
  trackJson = newTrackJson;
  initCourseManager();

  // Rebuild simulator with new course manager
  simulator = new GpsSimulator(
    courseManager,
    () => mapManager.getDriverPosition(),
    handleSimTick
  );

  // Redraw map
  drawAllCourseLines();
  const center = getTrackCenter(trackJson);
  mapManager.centerOn(center.lat, center.lng);
  mapManager.clearTrail();
  mapManager.removeWaypointMarker();

  // Reset state
  waypointDrawn = false;
  detectionHandled = false;
  lapAnythingHandled = false;
  updateDetectionDisplay('--');
  dataDisplay.clearMultiCourse();
  resetTimingDisplay();
}

function handleSimTick(simInfo) {
  // Log every sample to session logger
  sessionLogger.logSample(simInfo.lat, simInfo.lng, simInfo.speedKmh);

  // Add trail point
  mapManager.addTrailPoint(simInfo.lat, simInfo.lng);

  // Handle detection state changes (map updates)
  handleDetectionMapUpdates();

  // Throttle display updates
  const now = performance.now();
  if (now - lastDisplayUpdate < DISPLAY_UPDATE_INTERVAL_MS) return;
  lastDisplayUpdate = now;

  // Update detection status
  const detector = courseManager.getDetector();
  const detectorState = detector ? detector.getState() : 'idle';
  updateDetectionDisplay(detectorState);

  // Update multi-course panels (always, shows all courses during detection)
  dataDisplay.updateMultiCourse(courseManager, simInfo);

  // Update single-course timing display
  if (courseManager.isLapAnythingActive()) {
    // Lap Anything mode — use waypoint lap timer
    const lapTimer = courseManager.getLapAnythingTimer();
    if (lapTimer) {
      dataDisplay.update(lapTimer, simInfo);
      dataDisplay.setCrossingIndicator(lapTimer.getCrossing());
    }
  } else if (courseManager.isDetectionComplete()) {
    const activeTimer = courseManager.getActiveTimer();
    if (activeTimer) {
      dataDisplay.update(activeTimer, simInfo);
      dataDisplay.setCrossingIndicator(activeTimer.getCrossing());
    }
  } else {
    // Before detection, show timing from the first course (they all get same data)
    const allCourses = courseManager.getAllCourses();
    if (allCourses.length > 0 && allCourses[0].timer) {
      dataDisplay.update(allCourses[0].timer, simInfo);
      dataDisplay.setCrossingIndicator(allCourses[0].timer.getCrossing());
    }
  }
}

// ─── DETECTION MAP UPDATES ───────────────────────────────────────────

function handleDetectionMapUpdates() {
  const detector = courseManager.getDetector();

  // No detector means no courses loaded (Lap Anything from start)
  if (!detector) {
    if (courseManager.isLapAnythingActive() && !lapAnythingHandled) {
      lapAnythingHandled = true;
      // Show waypoint marker from Lap Anything timer
      const lapTimer = courseManager.getLapAnythingTimer();
      if (lapTimer) {
        const wp = lapTimer.getWaypoint();
        if (wp) {
          mapManager.setWaypointMarker(wp.lat, wp.lng);
        }
      }
    }
    return;
  }

  const state = detector.getState();

  // Draw waypoint blip when first set
  if ((state === DETECT_STATE_WAYPOINT_SET || state === DETECT_STATE_CANDIDATES_READY) && !waypointDrawn) {
    const wp = detector.getWaypoint();
    if (wp) {
      mapManager.setWaypointMarker(wp.lat, wp.lng);
      waypointDrawn = true;
    }
  }

  // Handle Lap Anything activation (detection failed)
  if (courseManager.isLapAnythingActive() && !lapAnythingHandled) {
    lapAnythingHandled = true;

    // Remove all course lines from map
    const allCourses = courseManager.getAllCourses();
    for (let i = 0; i < allCourses.length; i++) {
      mapManager.removeCourseLines(i);
    }

    // Keep waypoint marker (Lap Anything uses it)
    // Update waypoint from Lap Anything timer if it has one
    const lapTimer = courseManager.getLapAnythingTimer();
    if (lapTimer) {
      const wp = lapTimer.getWaypoint();
      if (wp) {
        mapManager.setWaypointMarker(wp.lat, wp.lng);
      }
    }
    return;
  }

  // Handle detection complete - prune courses, clean up map
  if (state === DETECT_STATE_DETECTED && !detectionHandled) {
    detectionHandled = true;

    // Remove non-active course lines from map
    const activeIndex = courseManager.getActiveCourseIndex();
    const allCourses = courseManager.getAllCourses();
    for (let i = 0; i < allCourses.length; i++) {
      if (i !== activeIndex) {
        mapManager.removeCourseLines(i);
      }
    }

    // Remove waypoint
    mapManager.removeWaypointMarker();

    // Prune inactive timers to free memory
    courseManager.pruneInactiveCourses();
  }
}

// ─── DISPLAY HELPERS ─────────────────────────────────────────────────

function updateDetectionDisplay(state) {
  dataDisplay.setDetectionStatus(
    courseManager.getTrackName(),
    state,
    courseManager.getActiveCourseName(),
    courseManager.isLapAnythingActive()
  );
}

function resetTimingDisplay() {
  const allCourses = courseManager.getAllCourses();
  if (allCourses.length > 0 && allCourses[0].timer) {
    dataDisplay.update(allCourses[0].timer, { speedKmh: 0, tickCount: 0 });
  }
  dataDisplay.setCrossingIndicator(false);
}

// ─── BOOT ────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initCourseManager();
  initMap();
  initDataDisplay();
  initControls();
  initSimulator();

  // Initial display state
  updateDetectionDisplay('--');
  resetTimingDisplay();
});
