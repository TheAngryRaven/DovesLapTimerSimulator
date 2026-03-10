/**
 * Geographic math utilities ported from DovesLapTimer.cpp
 *
 * C++ mapping:
 *   DovesLapTimer::haversine()              -> haversine()
 *   DovesLapTimer::haversine3D()            -> haversine3D()
 *   DovesLapTimer::pointLineSegmentDistance() -> pointLineSegmentDistance()
 */

import { RADIUS_EARTH_METERS } from './constants.js';

/**
 * Haversine formula - great-circle distance between two points on Earth.
 * Returns distance in meters.
 *
 * C++ signature: double haversine(double lat1, double lon1, double lat2, double lon2)
 */
export function haversine(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => deg * (Math.PI / 180);

  const lat1Rad = toRad(lat1);
  const lon1Rad = toRad(lon1);
  const lat2Rad = toRad(lat2);
  const lon2Rad = toRad(lon2);

  const deltaLat = lat2Rad - lat1Rad;
  const deltaLon = lon2Rad - lon1Rad;

  const a = Math.pow(Math.sin(deltaLat / 2), 2) +
            Math.cos(lat1Rad) * Math.cos(lat2Rad) *
            Math.pow(Math.sin(deltaLon / 2), 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return RADIUS_EARTH_METERS * c;
}

/**
 * 3D haversine - includes altitude difference.
 *
 * C++ signature: double haversine3D(double prevLat, double prevLng, double prevAlt,
 *                                    double currentLat, double currentLng, double currentAlt)
 */
export function haversine3D(prevLat, prevLng, prevAlt, currentLat, currentLng, currentAlt) {
  const dist = haversine(prevLat, prevLng, currentLat, currentLng);
  const altDiff = currentAlt - prevAlt;
  return Math.sqrt(dist * dist + altDiff * altDiff);
}

/**
 * Shortest distance between a point and a line segment, in meters.
 * Uses haversine for the actual distance calculations.
 *
 * C++ signature: double pointLineSegmentDistance(double pointX, double pointY,
 *                  double startX, double startY, double endX, double endY)
 */
export function pointLineSegmentDistance(pointX, pointY, startX, startY, endX, endY) {
  const segmentLengthSquared = Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2);

  // Degenerate line segment (start == end)
  // C++: if (segmentLengthSquared < 1e-12)
  if (segmentLengthSquared < 1e-12) {
    return haversine(pointX, pointY, startX, startY);
  }

  const projectionScalar =
    ((pointX - startX) * (endX - startX) + (pointY - startY) * (endY - startY)) /
    segmentLengthSquared;

  if (projectionScalar < 0.0) {
    return haversine(pointX, pointY, startX, startY);
  } else if (projectionScalar > 1.0) {
    return haversine(pointX, pointY, endX, endY);
  }

  const projectedX = startX + projectionScalar * (endX - startX);
  const projectedY = startY + projectionScalar * (endY - startY);
  return haversine(pointX, pointY, projectedX, projectedY);
}
