/**
 * Interpolation utilities ported from DovesLapTimer.cpp
 *
 * C++ mapping:
 *   DovesLapTimer::catmullRom()              -> catmullRom()
 *   DovesLapTimer::interpolateWeight()       -> interpolateWeight()
 *   DovesLapTimer::interpolateCrossingPoint() -> interpolateCrossingPoint()
 */

import { pointLineSegmentDistance } from './geo-math.js';
import { pointOnSideOfLine } from './crossing-detection.js';

/**
 * Catmull-Rom spline interpolation between four control points.
 *
 * C++ signature: double catmullRom(double p0, double p1, double p2, double p3, double t)
 */
export function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;

  const a = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3;
  const b = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3;
  const c = -0.5 * p0 + 0.5 * p2;
  const d = p1;

  return a * t3 + b * t2 + c * t + d;
}

/**
 * Computes interpolation weight based on distances and speeds.
 *
 * C++ signature: double interpolateWeight(double distA, double distB, float speedA, float speedB)
 */
export function interpolateWeight(distA, distB, speedA, speedB) {
  const minSpeed = 0.001;

  if (speedA < minSpeed || speedB < minSpeed) {
    const totalDist = distA + distB;
    if (totalDist < 1e-9) {
      return 0.5;
    }
    return distA / totalDist;
  }

  const weightedDistA = distA / speedA;
  const weightedDistB = distB / speedB;

  const weightedSum = weightedDistA + weightedDistB;
  if (weightedSum < 1e-9) {
    return 0.5;
  }

  return weightedDistA / weightedSum;
}

/**
 * Calculates the crossing point's lat, lng, time, and odometer from buffered GPS points.
 *
 * Finds the first pair of consecutive buffer points on opposite sides of the line,
 * then interpolates the crossing point using either linear or Catmull-Rom method.
 *
 * Returns { crossingLat, crossingLng, crossingTime, crossingOdometer } or null if invalid.
 *
 * C++ signature: void interpolateCrossingPoint(double& crossingLat, double& crossingLng,
 *                  unsigned long& crossingTime, double& crossingOdometer,
 *                  double pointALat, double pointALng, double pointBLat, double pointBLng)
 *
 * NOTE: In C++ this reads from class member buffer. In JS we pass the buffer explicitly.
 */
export function interpolateCrossingPoint(buffer, bufferIndex, bufferFull, bufferSize, pointALat, pointALng, pointBLat, pointBLng, forceLinear, crossingThresholdMeters) {
  const numPoints = bufferFull ? bufferSize : bufferIndex;

  // Find first pair of consecutive points on opposite sides of the line
  let crossingIndexA = -1;
  let crossingIndexB = -1;
  let crossingSumDistances = Infinity;

  for (let i = 0; i < numPoints - 1; i++) {
    const distA = pointLineSegmentDistance(
      buffer[i].lat, buffer[i].lng,
      pointALat, pointALng, pointBLat, pointBLng
    );
    const distB = pointLineSegmentDistance(
      buffer[i + 1].lat, buffer[i + 1].lng,
      pointALat, pointALng, pointBLat, pointBLng
    );

    const sideA = pointOnSideOfLine(
      buffer[i].lat, buffer[i].lng,
      pointALat, pointALng, pointBLat, pointBLng
    );
    const sideB = pointOnSideOfLine(
      buffer[i + 1].lat, buffer[i + 1].lng,
      pointALat, pointALng, pointBLat, pointBLng
    );

    // First pair on opposite sides = the crossing pair
    if (sideA !== sideB) {
      crossingIndexA = i;
      crossingIndexB = i + 1;
      crossingSumDistances = distA + distB;
      break;
    }
  }

  // Validate: crossing pair must exist and be close enough
  if (crossingSumDistances >= crossingThresholdMeters || crossingIndexA === -1 || crossingIndexB === -1) {
    return null; // Invalid crossing
  }

  // Compute interpolation factor (t)
  const distA = pointLineSegmentDistance(
    buffer[crossingIndexA].lat, buffer[crossingIndexA].lng,
    pointALat, pointALng, pointBLat, pointBLng
  );
  const distB = pointLineSegmentDistance(
    buffer[crossingIndexB].lat, buffer[crossingIndexB].lng,
    pointALat, pointALng, pointBLat, pointBLng
  );
  const t = interpolateWeight(distA, distB, buffer[crossingIndexA].speedKmh, buffer[crossingIndexB].speedKmh);

  // Time and odometer always linear (monotonic values)
  const deltaOdometer = buffer[crossingIndexB].odometer - buffer[crossingIndexA].odometer;
  const deltaTime = buffer[crossingIndexB].time - buffer[crossingIndexA].time;
  const crossingOdometer = buffer[crossingIndexA].odometer + t * deltaOdometer;
  const crossingTime = Math.round(buffer[crossingIndexA].time + t * deltaTime);

  let crossingLat, crossingLng;

  if (forceLinear) {
    // Linear interpolation for position
    const deltaLat = buffer[crossingIndexB].lat - buffer[crossingIndexA].lat;
    const deltaLon = buffer[crossingIndexB].lng - buffer[crossingIndexA].lng;
    crossingLat = buffer[crossingIndexA].lat + t * deltaLat;
    crossingLng = buffer[crossingIndexA].lng + t * deltaLon;
  } else {
    // Catmull-Rom spline for position
    const canUseCatmullRom = (crossingIndexA >= 1) && (crossingIndexB <= numPoints - 2);

    if (!canUseCatmullRom) {
      // Fall back to linear
      const deltaLat = buffer[crossingIndexB].lat - buffer[crossingIndexA].lat;
      const deltaLon = buffer[crossingIndexB].lng - buffer[crossingIndexA].lng;
      crossingLat = buffer[crossingIndexA].lat + t * deltaLat;
      crossingLng = buffer[crossingIndexA].lng + t * deltaLon;
    } else {
      const i0 = crossingIndexA - 1;
      const i1 = crossingIndexA;
      const i2 = crossingIndexB;
      const i3 = crossingIndexB + 1;

      crossingLat = catmullRom(buffer[i0].lat, buffer[i1].lat, buffer[i2].lat, buffer[i3].lat, t);
      crossingLng = catmullRom(buffer[i0].lng, buffer[i1].lng, buffer[i2].lng, buffer[i3].lng, t);
    }
  }

  return { crossingLat, crossingLng, crossingTime, crossingOdometer };
}
