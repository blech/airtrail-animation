# flightglobe — design

## Purpose

An interactive, spinnable globe of Paul's personal flight history (2010–2026, ~110 flights, 25 airports), animated as an accumulating time-lapse that ends "visually full". Intended to be explored locally and posted publicly as a self-contained static page.

Source of truth: `../airtrails/airtrail.json` (AirTrail export; `flights[]`, each with airports, times, aircraft, airline, passengers, and `track.{coordinates,times,...}`).

### Requirements (agreed)
- Globe with mouse/touch spin and zoom.
- Time-lapse animation that accumulates; the final "full" state is one control away.
- Static page, no server, no CDN dependencies at runtime (libraries vendored).
- Privacy-clean data: keep flight number, airline, aircraft type, airports, times, track. Drop passengers, user IDs, seat, seat class, flight reason, notes, gates, terminals, aircraft registration.
- Style: restrained. Three user-selectable themes: **Paper** (default), **Night**, **Natural**. No country borders.
- Works on a phone.

### Non-goals
Video export, sound, per-flight detail panels, shareable timestamp URLs, true 3D/WebGL, integration into AirTrail (the data extract keeps that door open).

## Architecture

```
flightglobe/
  build/build_data.py     # airtrail.json -> web/data/flights.json
  build/test_build_data.py
  web/index.html
  web/style.css
  web/src/                # ES modules: data, themes, projection/render, clock, camera, ui
  web/vendor/             # d3-geo, d3-array, topojson-client, land-110m.json
  web/data/flights.json   # generated, committed (privacy-reduced)
  docs/superpowers/specs/
```

Rendering is Canvas 2D with `d3-geo` orthographic projection (approach A). Python extractor is standalone and reads the AirTrail export directly; it does not depend on `consolidator/`.

## 1. Data extract (`build_data.py` → `flights.json`)

Per flight keep: `date`, `flightNumber`, `airline` (name), `aircraft` (name, ICAO), `from`/`to` (ICAO, IATA, municipality, country, lat, lon), `dep`/`arr` (takeoffActual/landingActual, falling back to departure/arrival), and `track` as `[lon, lat, altFt, t]` points.

- Simplify tracks with Douglas–Peucker to roughly 40–120 points per flight, tolerance chosen so deviation is sub-pixel at default zoom. Target `flights.json` of a few hundred kB.
- Flights without a track (one at present) fall back to a great-circle arc between airports, timed from dep/arr.
- Altitude unit of `track.coordinates[2]` must be verified against the raw CSVs (`consolidated_2026-09/tracks`, `alt_ft`) before use; normalise to feet.
- Output is sorted by departure time.
- **Test:** asserts the output JSON contains none of the dropped fields at any depth (passengers, seat*, userId, user, note(s), gate, terminal, aircraftReg, reason), and that every flight has ≥2 track points and valid lat/lon.

## 2. Rendering and style

- **Projection:** `d3.geoOrthographic`, default tilt ~30°N, drag-to-rotate with inertia, scroll/pinch zoom ~0.8×–4×, double-click resets.
- **Land:** Natural Earth 110m land only, no borders. Revisit 50m only if it looks coarse.
- **Themes:** each a plain object (ocean, land, coast, trail, dot, glow, UI colours); the renderer holds no hardcoded colours. Switcher in the UI; default Paper; choice remembered in `localStorage` (guarded with try/catch) and overridable by `?theme=paper|night|natural`. Trails use alpha, not fixed colours, so one fade rule works on light and dark.
- **Trails:** current/recent flights at full strength; completed flights settle to thin low-alpha trails that accumulate (busy corridors overprint darker). Settled layer cached on an offscreen canvas, rebuilt on scrub-back or theme change.
- **Aircraft:** dot with short comet tail; no plane icon.
- **Altitude:** in-flight marker and fresh trail lifted outward ~2–3% of radius at cruise with a faint surface shadow; settled trails sit flat. (True altitude would be ~0.2% of radius, i.e. ~1px, hence exaggeration.)
- **Airports:** small dots, size scaled by visit count (to be judged visually; falls back to fixed size if disliked). Label placement TBD by eye once rendering; IATA labels for most-visited and hovered airports are the starting point.
- **Hover/tap:** highlight a trail; tooltip e.g. "VS20 · 27 Jun 2026 · SFO → LHR · Boeing 787-9".
- **Sphere:** thin outline and soft glow in Paper and Natural; none in Night.

## 3. Animation and controls

- **Logical, not chronological, time.** Flights play in date order, each lasting a few seconds scaled gently by real duration (~1.2 s for 1 h, ~4 s for 10 h). Gaps between trips are skipped; the date counter jumps; the timeline shows true calendar spacing. Within a flight the aircraft follows the track at recorded relative timing.
- **Playhead is pure state** (flight index + fraction). Scrub, skip, restart and replay share one draw path. Skip-to-end sets the playhead to the end and renders the full state in one pass.
- **Camera:** eases to each flight's midpoint and zooms out slightly for long flights. Any manual drag/zoom turns Follow off; a button re-enables it. At the end, slow idle spin.
- **Controls (bottom bar):** play/pause, restart, skip to end; speed 0.5/1/2/4×; timeline scrubber with a tick per flight and year labels; Follow toggle; theme switcher. Keyboard: Space play/pause, ←/→ step flights, End skip to end, Home restart.
- **Readout (top corner):** date plus cumulative flights, distance (computed from tracks) and airports.
- **Accessibility/other:** respects `prefers-reduced-motion` (opens at final state, paused). Opens playing otherwise. Layout works at phone width; touch drag/pinch supported.

## Testing

- Python: unit tests for the extractor (privacy assertions, simplification bounds, no-track fallback).
- JS: pure-function unit tests for the clock/playhead mapping, great-circle fallback and distance (run with Node's built-in test runner, no framework dependency).
- Visual: manual check of each theme at start, mid, and end state, and at phone width.

## Open items (decide by eye during build)
- Airport label rules and whether size scaling stays.
- Exact trail alphas and altitude-lift factor per theme.
- Natural theme colour tuning.
