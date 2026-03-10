/**
 * Track data in JSON format - matches the DovesDataLogger SD card format.
 *
 * This is the same JSON structure stored on the device's SD card at /TRACKS/*.json
 * Users can paste their track JSON directly from those files.
 *
 * Does NOT get ported back to C++ - this is sim/test infrastructure.
 */

// Orlando Kart Center - default track with all course layouts
export const DEFAULT_TRACK_JSON = {
  longName: 'Orlando Kart Center',
  shortName: 'OKC',
  defaultCourse: 'Normal',
  courses: [
    {
      name: 'Normal',
      lengthFt: 3383,
      start_a_lat: 28.4127081705638,
      start_a_lng: -81.3797326641803,
      start_b_lat: 28.4127303867932,
      start_b_lng: -81.3795704875378,
      sector_2_a_lat: 28.4119049886871,
      sector_2_a_lng: -81.3790708193926,
      sector_2_b_lat: 28.4118316342961,
      sector_2_b_lng: -81.3791856652217,
      sector_3_a_lat: 28.4115010664104,
      sector_3_a_lng: -81.3799856475317,
      sector_3_b_lat: 28.4115084390461,
      sector_3_b_lng: -81.3798064021136,
    },
    {
      name: 'Pro',
      lengthFt: 3828,
      start_a_lat: 28.4127081705638,
      start_a_lng: -81.3797326641803,
      start_b_lat: 28.4127303867932,
      start_b_lng: -81.3795704875378,
      sector_2_a_lat: 28.4119049886871,
      sector_2_a_lng: -81.3790708193926,
      sector_2_b_lat: 28.4118316342961,
      sector_2_b_lng: -81.3791856652217,
      sector_3_a_lat: 28.4115010664104,
      sector_3_a_lng: -81.3799856475317,
      sector_3_b_lat: 28.4115084390461,
      sector_3_b_lng: -81.3798064021136,
    },
    {
      name: 'Short',
      lengthFt: 2338,
      start_a_lat: 28.411993499165,
      start_a_lng: -81.3799588509719,
      start_b_lat: 28.4119938453891,
      start_b_lng: -81.379864836741,
    },
    {
      name: 'Ten2one',
      lengthFt: 2603,
      start_a_lat: 28.4119841399534,
      start_a_lng: -81.3799676299095,
      start_b_lat: 28.4119765649198,
      start_b_lng: -81.3798238636838,
    },
    {
      name: 'xShort',
      lengthFt: 1865,
      start_a_lat: 28.411993499165,
      start_a_lng: -81.3799588509719,
      start_b_lat: 28.4119938453891,
      start_b_lng: -81.379864836741,
    },
  ],
};

/**
 * Parse and validate a track JSON string.
 * Returns the parsed object, or null if invalid.
 */
export function parseTrackJson(jsonString) {
  try {
    const data = JSON.parse(jsonString);
    if (!data.courses || !Array.isArray(data.courses) || data.courses.length === 0) {
      return null;
    }
    // Validate each course has at minimum start line coordinates
    for (const course of data.courses) {
      if (course.start_a_lat === undefined || course.start_a_lng === undefined ||
          course.start_b_lat === undefined || course.start_b_lng === undefined) {
        return null;
      }
      if (course.lengthFt === undefined || course.lengthFt <= 0) {
        return null;
      }
      if (!course.name) {
        return null;
      }
    }
    return data;
  } catch (e) {
    return null;
  }
}

/**
 * Get the midpoint of the first course's start/finish line (for map centering).
 */
export function getTrackCenter(trackJson) {
  const first = trackJson.courses[0];
  return {
    lat: (first.start_a_lat + first.start_b_lat) / 2,
    lng: (first.start_a_lng + first.start_b_lng) / 2,
  };
}
