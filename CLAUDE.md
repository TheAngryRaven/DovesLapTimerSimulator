# DovesLapTimer - Datalogger Simulator (Test App)

> **IMPORTANT**: Keep this file updated when making changes.

## What Is This

A web-based "datalogger simulator" for testing the DovesLapTimer library.
The core library has been ported from C++ to JavaScript for rapid development.
**This will be ported back to C++ when done.**

The app is NOT a unit test for crossing detection (that's done on real hardware).
It's a **functions test** - verifying the library API works correctly as we add
new features (course detection, automatic laptimes).

## How To Use

1. Open `index.html` in a browser (needs internet for Leaflet tiles)
2. The map shows Orlando Kart Center with all course lines drawn
3. Drag the red dot around the map
4. Click "Start" to begin the 25Hz GPS simulation
5. When speed >= 20mph a blue waypoint blip appears (course detection starts)
6. Complete a lap back past the waypoint - course is auto-detected
7. Non-matching course lines are removed, timing continues for the detected course
8. Click "Stop" to pause (downloads .dove log file), "Reset" to clear all data
9. Paste track JSON and click "Apply" to change tracks

## Directory Structure

```
DovesSchizoTest/
├── index.html                    # Single-page app entry
├── serve.bat                     # Local dev server (python -m http.server)
├── css/
│   └── styles.css                # All styling
├── js/
│   ├── app.js                    # Main entry - wires everything together
│   ├── lib/                      # *** THE LIBRARY PORT ***
│   │   ├── constants.js          # #defines and constants (incl. course detection)
│   │   ├── geo-math.js           # haversine, haversine3D, pointLineSegmentDistance
│   │   ├── crossing-detection.js # isObtuseTriangle, insideLineThreshold, pointOnSideOfLine
│   │   ├── interpolation.js      # catmullRom, interpolateWeight, interpolateCrossingPoint
│   │   ├── DovesLapTimer.js      # Main class - faithful port of the C++ class
│   │   ├── direction-detector.js # Forward/reverse direction detection
│   │   ├── course-detector.js    # Course detection state machine (ranked matching)
│   │   ├── course-manager.js     # Multi-course timer orchestrator + sanity check
│   │   └── waypoint-lap-timer.js # Universal fallback lap timer ("Lap Anything")
│   ├── sim/
│   │   ├── gps-simulator.js      # 25Hz loop that feeds any duck-typed target
│   │   ├── track-data.js         # Legacy track coordinates (still importable)
│   │   ├── track-data-json.js    # Track JSON format, default OKC data, parser
│   │   └── session-logger.js     # .dove CSV file logger & download
│   └── ui/
│       ├── map-manager.js        # Leaflet map, multi-course lines, waypoint marker
│       ├── data-display.js       # DOM updates for timing + detection + course panels
│       └── controls.js           # Button handlers, track JSON textarea
└── CLAUDE.md                     # This file
```

## Course Detection Algorithm

1. Load ALL courses from track JSON, create a DovesLapTimer per course
2. Feed ALL timers the same GPS data simultaneously (25Hz)
3. When speed >= 20 mph: create a "waypoint" at current position (blue blip on map)
4. When driver returns near the waypoint (after traveling >= 200m):
   - Calculate total distance driven since waypoint (meters -> feet)
   - Compare to each course's `lengthFt`
   - Select closest match within 25% tolerance
5. Remove non-selected course timers, continue with detected course
6. First lap timing is preserved since all timers were running from the start

## Track JSON Format

Same format as DovesDataLogger SD card files (`/TRACKS/*.json`):
```json
{
  "longName": "Orlando Kart Center",
  "shortName": "OKC",
  "defaultCourse": "Normal",
  "courses": [
    {
      "name": "Normal",
      "lengthFt": 3383,
      "start_a_lat": 28.4127..., "start_a_lng": -81.3797...,
      "start_b_lat": 28.4127..., "start_b_lng": -81.3795...,
      "sector_2_a_lat": ..., "sector_2_a_lng": ...,
      "sector_2_b_lat": ..., "sector_2_b_lng": ...,
      "sector_3_a_lat": ..., "sector_3_a_lng": ...,
      "sector_3_b_lat": ..., "sector_3_b_lng": ...
    }
  ]
}
```
Sector lines are optional per course. `lengthFt` is required for detection.

## C++ Port-Back Notes

### File Mapping (JS -> C++)

| JS Module | C++ Equivalent |
|-----------|----------------|
| `js/lib/constants.js` | `#define` macros + class constants in `DovesLapTimer.h` |
| `js/lib/geo-math.js` | Class methods: `haversine()`, `haversine3D()`, `pointLineSegmentDistance()` |
| `js/lib/crossing-detection.js` | Class methods: `isObtuseTriangle()`, `insideLineThreshold()`, `pointOnSideOfLine()` |
| `js/lib/interpolation.js` | Private methods: `catmullRom()`, `interpolateWeight()`, `interpolateCrossingPoint()` |
| `js/lib/DovesLapTimer.js` | `DovesLapTimer` class in `.h`/`.cpp` |
| `js/lib/direction-detector.js` | `DirectionDetector` class (embedded or separate `.h`/`.cpp`) |
| `js/lib/course-detector.js` | `CourseDetector` class (new `.h`/`.cpp` or in DovesLapTimer) |
| `js/lib/course-manager.js` | `CourseManager` class owning array of `DovesLapTimer` + `CourseDetector` |
| `js/lib/waypoint-lap-timer.js` | `WaypointLapTimer` class (new `.h`/`.cpp`) |

### Key Differences From C++

1. **No Stream* debug** - JS uses a callback function instead of `Stream*`. Port back: restore `Stream* _serial` and `debug_print/debug_println` macros.

2. **`crossingThresholdMeters` as parameter** - In C++ it's a class member accessed directly. In JS the standalone utility functions (`insideLineThreshold`) take it as a parameter. Port back: these become class methods with direct member access again.

3. **Crossing flag by string key** - `_checkSectorLine` uses `this[crossingFlagKey]` because JS has no pass-by-reference for booleans. Port back: restore `bool& crossingFlag` parameter.

4. **Buffer is Array of objects** - C++ uses a struct array with `memset` for clearing. Port back: restore `crossingPointBufferEntry crossingPointBuffer[size]` and `memset`.

5. **No altitude** - Simulator passes altitude=0 always. The `haversine3D` function exists and works, but the sim doesn't use real altitude. Port back: reconnect to GPS altitude when you trust it.

6. **Time is simulated** - JS sim uses a fake clock starting at noon. Port back: reconnect to `getGpsTimeInMilliseconds()` from real GPS.

7. **Speed is calculated from position deltas** - Real GPS provides speed directly via `gps->speed` (knots). Port back: use GPS-reported speed.

8. **`Math.round()` on crossing time** - JS doesn't have `unsigned long` implicit truncation. Port back: C++ `unsigned long` assignment handles this naturally.

9. **CourseManager owns multiple timers** - JS creates them dynamically. Port back: fixed-size array of `DovesLapTimer` (max 6-8 courses) with `active` flags. Reduce buffer size per timer if RAM is tight.

10. **CourseDetector uses haversine as import** - In C++ it's a class method or can use the existing `DovesLapTimer::haversine()`. Port back: either make it a friend class or duplicate the haversine call.

11. **DirectionDetector owned by DovesLapTimer** - Simple state machine, minimal RAM. Port back: embed as member or small helper class. Reset in `reset()`.

12. **WaypointLapTimer is independent** - Duck-typed to match DovesLapTimer's public API. Port back: separate class with same getter signatures. Circular buffer of fixed size (50 entries). Uses haversine for proximity checks.

13. **CourseDetector ranked matching** - `_matchCourseRanked()` builds sorted candidate list, CourseManager validates via `raceStarted` sanity check. Port back: fixed-size candidate array (max 8), CourseManager walks it.

### When Adding New Features

- Add new state to `_resetState()` in `DovesLapTimer.js` - maps to `reset()` in C++
- Line config goes in `_initLineConfig()` - only called from constructor, NOT from `reset()`
- Add new methods to `DovesLapTimer.js` class - maps to methods in `.h`/`.cpp`
- If a method is pure math/geometry, consider putting it in `geo-math.js` or `crossing-detection.js` instead
- Keep the sim layer (`js/sim/`) separate from the library (`js/lib/`) - only `js/lib/` gets ported back
- **ONLY `js/lib/` gets ported back to C++. Everything else is test infrastructure.**

### Upcoming Features (Why This Exists)

1. **Course Detection** - Auto-detect which track/course the driver is on (IMPLEMENTED)
2. **Automatic Laptimes** - Auto-detect start/finish line without manual configuration

These features will be developed in JS first for rapid iteration, then ported to C++.

## Dependencies

- **Leaflet 1.9.4** - Map rendering (CDN, no install needed)
- **No build step** - Pure ES modules, just open `index.html`
- **No npm/node** - Intentionally zero tooling

## Original C++ Library

- Repo: https://github.com/TheAngryRaven/DovesLapTimer
- Version ported from: 3.1.1
- The JS port is a faithful 1:1 translation of every method

## Related Repos

- **DovesLapTimer**: https://github.com/TheAngryRaven/DovesLapTimer - Core timing library (C++)
- **DovesDataLogger**: https://github.com/TheAngryRaven/DovesDataLogger - Hardware datalogger (Arduino)
