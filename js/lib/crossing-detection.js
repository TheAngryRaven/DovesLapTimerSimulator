/**
 * Crossing detection utilities ported from DovesLapTimer.cpp
 *
 * C++ mapping:
 *   DovesLapTimer::isObtuseTriangle()     -> isObtuseTriangle()
 *   DovesLapTimer::insideLineThreshold()  -> insideLineThreshold()
 *   DovesLapTimer::pointOnSideOfLine()    -> pointOnSideOfLine()
 */

import { CROSSING_LINE_SIDE_A, CROSSING_LINE_SIDE_B, CROSSING_LINE_SIDE_EXACT } from './constants.js';
import { haversine } from './geo-math.js';

/**
 * Checks if the triangle formed by three GPS points is obtuse.
 *
 * C++ signature: bool isObtuseTriangle(double lat1, double lon1, double lat2, double lon2,
 *                                       double lat3, double lon3)
 */
export function isObtuseTriangle(lat1, lon1, lat2, lon2, lat3, lon3) {
  let a = haversine(lat1, lon1, lat2, lon2);
  let b = haversine(lat1, lon1, lat3, lon3);
  let c = haversine(lat2, lon2, lat3, lon3);

  // Sort ascending
  if (a > b) [a, b] = [b, a];
  if (b > c) [b, c] = [c, b];
  if (a > b) [a, b] = [b, a];

  // "listen... this has been a long debugging session"
  if (a + b <= c) {
    return false; // Impossible triangle
  }

  const discriminant = a * a + b * b - c * c;
  return discriminant < 0; // Obtuse if negative
}

/**
 * Check if a driver is within the hypotenuse-based threshold of a crossing line.
 *
 * Uses crossingLineWidth and crossingThresholdMeters to form a right triangle,
 * then checks if driver-to-endpoint distances are within the hypotenuse.
 *
 * C++ signature: bool insideLineThreshold(double driverLat, double driverLon,
 *                  double crossingPointALat, double crossingPointALon,
 *                  double crossingPointBLat, double crossingPointBLon)
 *
 * NOTE: crossingThresholdMeters is a class member in C++, passed as param here.
 */
export function insideLineThreshold(driverLat, driverLon, crossingPointALat, crossingPointALon, crossingPointBLat, crossingPointBLon, crossingThresholdMeters) {
  const driverLengthA = haversine(driverLat, driverLon, crossingPointALat, crossingPointALon);
  const driverLengthB = haversine(driverLat, driverLon, crossingPointBLat, crossingPointBLon);
  const crossingLineLength = haversine(crossingPointALat, crossingPointALon, crossingPointBLat, crossingPointBLon);

  // C++: double maxLineLength = sqrt(sq(crossingThresholdMeters) + sq(crossingLineLength));
  const maxLineLength = Math.sqrt(
    crossingThresholdMeters * crossingThresholdMeters +
    crossingLineLength * crossingLineLength
  );

  return driverLengthA < maxLineLength && driverLengthB < maxLineLength;
}

/**
 * Determines which side of a line a point is on.
 * Returns CROSSING_LINE_SIDE_A (-1), CROSSING_LINE_SIDE_B (1), or CROSSING_LINE_SIDE_EXACT (0).
 *
 * C++ signature: int pointOnSideOfLine(double driverLat, double driverLng,
 *                  double pointALat, double pointALng, double pointBLat, double pointBLng)
 */
export function pointOnSideOfLine(driverLat, driverLng, pointALat, pointALng, pointBLat, pointBLng) {
  const lineDirectionX = pointBLat - pointALat;
  const lineDirectionY = pointBLng - pointALng;
  const driverToPointAX = driverLat - pointALat;
  const driverToPointAY = driverLng - pointALng;

  const crossProduct = lineDirectionX * driverToPointAY - lineDirectionY * driverToPointAX;

  if (crossProduct > 0) {
    return CROSSING_LINE_SIDE_A;
  } else if (crossProduct < 0) {
    return CROSSING_LINE_SIDE_B;
  } else {
    return CROSSING_LINE_SIDE_EXACT;
  }
}
