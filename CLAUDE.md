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
2. The map shows Orlando Kart Center with start/finish + 2 sector lines
3. Drag the red dot around the map
4. Click "Start" to begin the 25Hz GPS simulation
5. Drag the marker across the lines to trigger crossings
6. Watch timing data update in the sidebar
7. Click "Stop" to pause, "Reset" to clear all data
8. Edit track data coordinates and click "Apply" to change lines

## Directory Structure

```
DovesSchizoTest/
├── index.html                    # Single-page app entry
├── css/
│   └── styles.css                # All styling
├── js/
│   ├── app.js                    # Main entry - wires everything together
│   ├── lib/                      # *** THE LIBRARY PORT ***
│   │   ├── constants.js          # #defines and constants
│   │   ├── geo-math.js           # haversine, haversine3D, pointLineSegmentDistance
│   │   ├── crossing-detection.js # isObtuseTriangle, insideLineThreshold, pointOnSideOfLine
│   │   ├── interpolation.js      # catmullRom, interpolateWeight, interpolateCrossingPoint
│   │   └── DovesLapTimer.js      # Main class - faithful port of the C++ class
│   ├── sim/
│   │   ├── gps-simulator.js      # 25Hz loop that feeds DovesLapTimer
│   │   └── track-data.js         # Default track coordinates, parsing helpers
│   └── ui/
│       ├── map-manager.js        # Leaflet map, lines, draggable marker
│       ├── data-display.js       # DOM updates for timing data panel
│       └── controls.js           # Button handlers, track data inputs
└── CLAUDE.md                     # This file
```

## C++ Port-Back Notes

### File Mapping (JS -> C++)

| JS Module | C++ Equivalent |
|-----------|----------------|
| `js/lib/constants.js` | `#define` macros + class constants in `DovesLapTimer.h` |
| `js/lib/geo-math.js` | Class methods: `haversine()`, `haversine3D()`, `pointLineSegmentDistance()` |
| `js/lib/crossing-detection.js` | Class methods: `isObtuseTriangle()`, `insideLineThreshold()`, `pointOnSideOfLine()` |
| `js/lib/interpolation.js` | Private methods: `catmullRom()`, `interpolateWeight()`, `interpolateCrossingPoint()` |
| `js/lib/DovesLapTimer.js` | `DovesLapTimer` class in `.h`/`.cpp` |

### Key Differences From C++

1. **No Stream* debug** - JS uses a callback function instead of `Stream*`. Port back: restore `Stream* _serial` and `debug_print/debug_println` macros.

2. **`crossingThresholdMeters` as parameter** - In C++ it's a class member accessed directly. In JS the standalone utility functions (`insideLineThreshold`) take it as a parameter. Port back: these become class methods with direct member access again.

3. **Crossing flag by string key** - `_checkSectorLine` uses `this[crossingFlagKey]` because JS has no pass-by-reference for booleans. Port back: restore `bool& crossingFlag` parameter.

4. **Buffer is Array of objects** - C++ uses a struct array with `memset` for clearing. Port back: restore `crossingPointBufferEntry crossingPointBuffer[size]` and `memset`.

5. **No altitude** - Simulator passes altitude=0 always. The `haversine3D` function exists and works, but the sim doesn't use real altitude. Port back: reconnect to GPS altitude when you trust it.

6. **Time is simulated** - JS sim uses a fake clock starting at noon. Port back: reconnect to `getGpsTimeInMilliseconds()` from real GPS.

7. **Speed is calculated from position deltas** - Real GPS provides speed directly via `gps->speed` (knots). Port back: use GPS-reported speed.

8. **`Math.round()` on crossing time** - JS doesn't have `unsigned long` implicit truncation. Port back: C++ `unsigned long` assignment handles this naturally.

### When Adding New Features

- Add new state to `_initState()` in `DovesLapTimer.js` - maps to class member declarations in `.h`
- Add new methods to `DovesLapTimer.js` class - maps to methods in `.h`/`.cpp`
- If a method is pure math/geometry, consider putting it in `geo-math.js` or `crossing-detection.js` instead
- Keep the sim layer (`js/sim/`) separate from the library (`js/lib/`) - only `js/lib/` gets ported back
- **ONLY `js/lib/` gets ported back to C++. Everything else is test infrastructure.**

### Upcoming Features (Why This Exists)

1. **Course Detection** - Auto-detect which track/course the driver is on
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
