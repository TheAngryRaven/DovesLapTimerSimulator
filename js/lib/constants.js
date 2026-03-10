/**
 * Constants ported from DovesLapTimer.h
 *
 * C++ mapping:
 *   #define CROSSING_LINE_SIDE_NONE   -100
 *   #define CROSSING_LINE_SIDE_A      -1
 *   #define CROSSING_LINE_SIDE_EXACT   0
 *   #define CROSSING_LINE_SIDE_B       1
 */

export const CROSSING_LINE_SIDE_NONE = -100;
export const CROSSING_LINE_SIDE_A = -1;
export const CROSSING_LINE_SIDE_EXACT = 0;
export const CROSSING_LINE_SIDE_B = 1;

// In C++ this is RAM-dependent. JS has no such constraint.
// C++: #if ((RAMEND - RAMSTART) > 3000) -> 100, else 25
export const CROSSING_POINT_BUFFER_SIZE = 100;

// Default crossing threshold in meters
export const DEFAULT_CROSSING_THRESHOLD_METERS = 7.0;

// Earth's radius in meters (C++: const double radiusEarth = 6371.0 * 1000)
export const RADIUS_EARTH_METERS = 6371.0 * 1000;

// ─── COURSE DETECTION CONSTANTS ─────────────────────────────────────

// Speed threshold to create waypoint (mph)
export const COURSE_DETECT_SPEED_THRESHOLD_MPH = 20;

// How close to the waypoint counts as "back around" (meters)
export const COURSE_DETECT_WAYPOINT_PROXIMITY_METERS = 10;

// Minimum distance traveled before waypoint proximity triggers (meters)
// Prevents false trigger right after waypoint is set
export const COURSE_DETECT_MIN_DISTANCE_METERS = 200;

// Distance tolerance for course matching (25% = 0.25)
export const COURSE_DETECT_DISTANCE_TOLERANCE_PCT = 0.25;

// Max detection rejections before falling back to Lap Anything
export const COURSE_DETECT_MAX_REJECTIONS = 3;

// Conversion factor
export const METERS_TO_FEET = 3.28084;

// ─── WAYPOINT LAP TIMER CONSTANTS ───────────────────────────────────

// Minimum distance traveled before waypoint proximity triggers (meters)
// Smaller than course detection (200m) since we just need to prevent
// immediate re-trigger after a crossing, not validate a full lap length.
export const WAYPOINT_LAP_MIN_DISTANCE_METERS = 100;

// Proximity zone for waypoint-based lap timing (meters)
// Larger than course detection proximity (10m) because this needs to trigger
// consistently every lap, not just once. Track width is ~15-20m so 30m gives
// a full track-width of leeway for imprecise driving lines.
export const WAYPOINT_LAP_PROXIMITY_METERS = 30;

// Buffer size for approach points in waypoint lap timer
export const WAYPOINT_LAP_BUFFER_SIZE = 50;
