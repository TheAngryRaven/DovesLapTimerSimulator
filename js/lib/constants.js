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
