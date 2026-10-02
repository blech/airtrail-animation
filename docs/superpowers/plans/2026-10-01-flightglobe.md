# flightglobe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static, self-contained web page showing Paul's flight history as a spinnable orthographic globe with an accumulating time-lapse, from a privacy-clean extract of the AirTrail export.

**Architecture:** A stdlib-only Python script reduces `../airtrails/airtrail.json` to `web/data/flights.json`. The page is plain ES modules plus vendored UMD libraries (`d3-geo`, `topojson-client`) drawing to a Canvas 2D. Pure logic (geometry, playback clock, stats, themes, camera maths, formatting) lives in small DOM-free modules covered by Node's built-in test runner; rendering and UI are thin layers on top, checked by eye.

**Tech Stack:** Python 3 (stdlib, `unittest`), Node 24 (`node:test`), Canvas 2D, d3-geo 3, d3-array 3, topojson-client 3, Natural Earth 110m land (`world-atlas`). No bundler, no runtime CDN.

**Spec:** `docs/superpowers/specs/2026-10-01-flightglobe-design.md`

## Global Constraints

- Static page: opens via any static file server; **no network access at runtime** (all libraries and data vendored under `web/`).
- Python: standard library only; tests with `unittest` (`python3 -m unittest discover -s build -v`).
- JS: ES modules in `web/src/`; tests with `node --test web/test/*.test.js` (no npm dependencies). `package.json` has `"type": "module"`.
- Pure modules (`geo.js`, `clock.js`, `stats.js`, `format.js`, `themes.js`, `camera.js`) must not touch `window`, `document` or `d3`.
- Output `flights.json` must contain **no** passengers, user IDs, seat, seat number, seat class, flight reason, notes, gates, terminals or aircraft registration. Allowed per flight: `id, date, flightNumber, airline, aircraft{name,icao}, from, to, dep, arr, track, approx`.
- Track points are `[lon, lat, altM, t]`: altitude in **metres**, `t` in **Unix seconds**.
- Themes: `paper` (default), `night`, `natural`; no country borders; land is Natural Earth 110m only.
- Playback is flight-sequenced ("logical") time, not calendar time; the timeline is on the calendar axis.
- Honour `prefers-reduced-motion` (open at final state, paused). Layout must work at phone width.
- `localStorage` access must be wrapped in try/catch and the page must work without it.
- End every commit message with the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (pass it as a second `-m`).
- Working directory for all commands: the `flightglobe/` repo root.

## Review Focus

Inputs and conditions the spec implies but that are easy to get wrong; each has a pinning test in the task named in brackets.

1. **Tracks with no timestamps** (2 real flights: MW738, HA169): must still animate, with times synthesised inside the flight window. [Task 3]
2. **Coordinates with no altitude** (2-element points): output must never contain `null`/`NaN` altitude, or the lifted trail breaks. [Task 3]
3. **Antimeridian crossings** (SFO ↔ Japan): simplification must not drop the crossing, and interpolation must not swing through longitude 0. [Tasks 2, 4]
4. **Zero/negative-duration or unsorted flights** (`arr <= dep`, input not in departure order, mixed timestamp formats): no divide-by-zero, no NaN in the clock, output sorted. [Tasks 3, 5]
5. **Bad or hostile `?theme=` / unavailable `localStorage`**: unknown values (including `constructor`, `__proto__`) fall back to Paper; storage that throws must not break the page. [Tasks 7, 8]

---

## File Structure

```
package.json                    # {"type":"module"} + test scripts
.gitignore
README.md
build/
  build_data.py                 # airtrail.json -> web/data/flights.json
  test_build_data.py
web/
  index.html
  style.css
  data/flights.json             # generated, committed
  vendor/                       # d3-array, d3-geo, topojson-client, land-110m.json, README.md
  src/
    geo.js        # pure: haversine, lerpLon, pointAt, trackSlice, trackLengthKm, midpoint, distPointSegment
    clock.js      # pure: schedule, locate, calendar<->playhead, stepTarget
    stats.js      # pure: cumulative stats, airport visit counts
    format.js     # pure: dates, km, flight label
    themes.js     # pure: theme objects + resolveTheme
    camera.js     # pure: easing, follow, zoom helpers, default view
    data.js       # browser: fetch flights + land, derive per-flight fields
    render.js     # browser: GlobeRenderer (canvas drawing + hit test)
    interaction.js# browser: drag / inertia / wheel / pinch / tap
    ui.js         # browser: controls, timeline, readout, keyboard, tooltip
    main.js       # browser: wiring and frame loop
  test/
    geo.test.js clock.test.js stats.test.js format.test.js themes.test.js camera.test.js
```

---

### Task 1: Repo scaffolding

**Files:**
- Create: `package.json`, `.gitignore`, `README.md`

**Interfaces:**
- Produces: `npm test`-style entry points used by every later task (`node --test web/test/*.test.js`, `python3 -m unittest discover -s build -v`).

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "flightglobe",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test web/test/*.test.js && python3 -m unittest discover -s build -v",
    "build:data": "python3 build/build_data.py",
    "serve": "python3 -m http.server 8000 -d web"
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```
__pycache__/
node_modules/
.superpowers/
.DS_Store
```

- [ ] **Step 3: Create `README.md`**

```markdown
# flightglobe

A spinnable, animated globe of a personal flight history. Static page; data is a privacy-reduced extract of an AirTrail export.

    python3 build/build_data.py     # ../airtrails/airtrail.json -> web/data/flights.json
    python3 -m http.server 8000 -d web   # then open http://localhost:8000
    node --test web/test/*.test.js && python3 -m unittest discover -s build -v

Design: `docs/superpowers/specs/`. Plan: `docs/superpowers/plans/`.
```

- [ ] **Step 4: Commit**

```bash
git add package.json .gitignore README.md
git commit -m "chore: scaffold repo" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Extractor geometry (simplify, great circle, altitude profile)

**Files:**
- Create: `build/build_data.py`, `build/test_build_data.py`

**Interfaces:**
- Produces (in `build_data.py`), all pure functions:
  - `unwrap_lons(points) -> list[tuple]` — makes longitudes continuous (point = `(lon, lat, ...)`).
  - `wrap_lon(lon: float) -> float` — to `[-180, 180)`.
  - `simplify(points, tol) -> list` — Douglas–Peucker on unwrapped points, keeps endpoints; planar distance in degrees with longitude scaled by `cos(lat)`.
  - `simplify_to(points, tol, max_points) -> list` — raises `tol` ×1.5 until `len <= max_points`.
  - `haversine_km(a, b) -> float` — `a`, `b` are `(lon, lat, ...)`.
  - `great_circle(a, b, n) -> list[tuple[float, float]]` — `n` evenly spaced `(lon, lat)` points including both ends.
  - `cruise_for_km(km) -> float`, `altitude_profile(frac, cruise) -> float`.

- [ ] **Step 1: Write the failing tests** — create `build/test_build_data.py`:

```python
import json
import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import build_data as bd


class GeometryTests(unittest.TestCase):
    def test_wrap_lon(self):
        self.assertAlmostEqual(bd.wrap_lon(181), -179)
        self.assertAlmostEqual(bd.wrap_lon(-181), 179)
        self.assertAlmostEqual(bd.wrap_lon(10), 10)

    def test_unwrap_makes_longitudes_continuous(self):
        pts = [(179.0, 40.0), (-179.0, 40.0), (-177.0, 40.0)]
        out = bd.unwrap_lons(pts)
        self.assertEqual([round(p[0], 6) for p in out], [179.0, 181.0, 183.0])

    def test_simplify_keeps_endpoints_and_drops_collinear_points(self):
        pts = [(float(i), 0.0, 0, i) for i in range(11)]
        out = bd.simplify(pts, 0.01)
        self.assertEqual(out, [pts[0], pts[-1]])

    def test_simplify_keeps_a_real_corner(self):
        pts = [(0.0, 0.0), (5.0, 0.0), (5.0, 5.0)]
        self.assertEqual(bd.simplify(pts, 0.01), pts)

    def test_simplify_to_respects_max_points(self):
        pts = [(i * 0.1, math.sin(i * 0.7) * 0.5) for i in range(400)]
        out = bd.simplify_to(pts, 0.0001, 60)
        self.assertLessEqual(len(out), 60)
        self.assertEqual(out[0], pts[0])
        self.assertEqual(out[-1], pts[-1])

    def test_antimeridian_track_simplifies_to_its_endpoints(self):
        # straight eastbound line across the antimeridian, lon wrapped as in raw data
        pts = [(bd.wrap_lon(170 + i * 2.0), 40.0, 0, i) for i in range(11)]
        out = bd.simplify_track(pts, 0.01, 100)
        self.assertEqual(len(out), 2)
        self.assertAlmostEqual(out[0][0], 170.0)
        self.assertAlmostEqual(out[1][0], -170.0)
        for p in out:
            self.assertTrue(-180 <= p[0] < 180)

    def test_haversine_sfo_lhr(self):
        d = bd.haversine_km((-122.375, 37.62), (-0.4543, 51.47))
        self.assertTrue(8550 < d < 8680, d)

    def test_great_circle_endpoints_and_count(self):
        pts = bd.great_circle((-122.375, 37.62), (-0.4543, 51.47), 20)
        self.assertEqual(len(pts), 20)
        self.assertAlmostEqual(pts[0][0], -122.375, places=4)
        self.assertAlmostEqual(pts[-1][1], 51.47, places=4)
        # great circle SFO-LHR bulges north of the straight lat interpolation
        self.assertGreater(max(p[1] for p in pts), 60)

    def test_altitude_profile_is_zero_at_ends_and_cruise_in_middle(self):
        self.assertEqual(bd.altitude_profile(0.0, 11000), 0)
        self.assertEqual(bd.altitude_profile(1.0, 11000), 0)
        self.assertEqual(bd.altitude_profile(0.5, 11000), 11000)

    def test_cruise_for_km_scales_then_caps(self):
        self.assertLess(bd.cruise_for_km(100), 5000)
        self.assertEqual(bd.cruise_for_km(8000), bd.CRUISE_M)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run to verify it fails**

Run: `python3 -m unittest discover -s build -v`
Expected: FAIL / ImportError (`build_data` has no such names).

- [ ] **Step 3: Implement** — create `build/build_data.py`:

```python
#!/usr/bin/env python3
"""Reduce an AirTrail export to the privacy-clean flights.json used by the web page."""
import math

TOLERANCE_DEG = 0.03   # ~3 km; sub-pixel at default zoom (1 px ~ 16 km on a 400 px radius globe)
MAX_POINTS = 140
SYNTH_POINTS = 64
CRUISE_M = 11000.0


def wrap_lon(lon):
    return ((lon + 180.0) % 360.0) - 180.0


def unwrap_lons(points):
    """Make longitudes continuous so a track crossing +/-180 does not jump."""
    out = []
    prev = None
    off = 0.0
    for p in points:
        lon = p[0] + off
        if prev is not None:
            while lon - prev > 180:
                off -= 360
                lon -= 360
            while lon - prev < -180:
                off += 360
                lon += 360
        out.append((lon,) + tuple(p[1:]))
        prev = lon
    return out


def _perp(p, a, b):
    k = math.cos(math.radians(p[1]))
    ax, ay = a[0] * k, a[1]
    bx, by = b[0] * k, b[1]
    px, py = p[0] * k, p[1]
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def simplify(points, tol):
    """Douglas-Peucker. Points are tuples whose first two items are lon, lat (already unwrapped)."""
    n = len(points)
    if n < 3:
        return list(points)
    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        i, j = stack.pop()
        dmax, idx = -1.0, None
        for m in range(i + 1, j):
            d = _perp(points[m], points[i], points[j])
            if d > dmax:
                dmax, idx = d, m
        if idx is not None and dmax > tol:
            keep[idx] = True
            stack.append((i, idx))
            stack.append((idx, j))
    return [p for p, k in zip(points, keep) if k]


def simplify_to(points, tol, max_points):
    out = simplify(points, tol)
    while len(out) > max_points:
        tol *= 1.5
        out = simplify(points, tol)
    return out


def simplify_track(points, tol, max_points):
    """Unwrap longitudes, simplify, then wrap longitudes back to [-180, 180)."""
    out = simplify_to(unwrap_lons(points), tol, max_points)
    return [(wrap_lon(p[0]),) + tuple(p[1:]) for p in out]


def haversine_km(a, b):
    la1, la2 = math.radians(a[1]), math.radians(b[1])
    dla = la2 - la1
    dlo = math.radians(b[0] - a[0])
    h = math.sin(dla / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin(dlo / 2) ** 2
    return 2 * 6371.0088 * math.asin(min(1.0, math.sqrt(h)))


def great_circle(a, b, n):
    la1, lo1 = math.radians(a[1]), math.radians(a[0])
    la2, lo2 = math.radians(b[1]), math.radians(b[0])
    d = 2 * math.asin(min(1.0, math.sqrt(
        math.sin((la2 - la1) / 2) ** 2
        + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2)))
    if d < 1e-9:
        return [(a[0], a[1]) for _ in range(n)]
    pts = []
    for i in range(n):
        f = i / (n - 1)
        A = math.sin((1 - f) * d) / math.sin(d)
        B = math.sin(f * d) / math.sin(d)
        x = A * math.cos(la1) * math.cos(lo1) + B * math.cos(la2) * math.cos(lo2)
        y = A * math.cos(la1) * math.sin(lo1) + B * math.cos(la2) * math.sin(lo2)
        z = A * math.sin(la1) + B * math.sin(la2)
        pts.append((math.degrees(math.atan2(y, x)), math.degrees(math.atan2(z, math.hypot(x, y)))))
    return pts


def cruise_for_km(km):
    return min(CRUISE_M, 2500.0 + 9.0 * km)


def altitude_profile(frac, cruise=CRUISE_M):
    """Trapezoid: climb over the first 15%, cruise, descend over the last 15%. Metres."""
    return round(max(0.0, cruise * min(1.0, frac / 0.15, (1.0 - frac) / 0.15)))
```

- [ ] **Step 4: Run to verify it passes**

Run: `python3 -m unittest discover -s build -v`
Expected: all `GeometryTests` PASS.

- [ ] **Step 5: Commit**

```bash
git add build/
git commit -m "feat(build): track geometry helpers with antimeridian-safe simplification" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Extractor flight building, privacy, and real data

**Files:**
- Modify: `build/build_data.py` (append), `build/test_build_data.py` (append)
- Create (generated): `web/data/flights.json`

**Interfaces:**
- Consumes: Task 2 functions.
- Produces:
  - `parse_ts(s: str | None) -> int | None` — ISO-8601 (`Z`, `+00:00`, with/without millis; naive = UTC) → Unix seconds.
  - `build_flight(f: dict) -> dict` — one output flight (no `id` yet).
  - `build_all(export: dict) -> dict` — `{"flights": [...]}` sorted by `dep`, with sequential `id` from 0.
  - `main(argv=None)` — CLI `--input`, `--output`.
  - Output flight shape: `{"id","date","flightNumber","airline","aircraft":{"name","icao"}|None,"from":AP,"to":AP,"dep","arr","track":[[lon,lat,altM,t],…],"approx":bool}` where `AP = {"icao","iata","city","country","lat","lon"}`.

- [ ] **Step 1: Append failing tests** to `build/test_build_data.py` (before the `if __name__` line):

```python
REAL_EXPORT = Path(__file__).resolve().parents[2] / "airtrails" / "airtrail.json"
ALLOWED_TOP = {"id", "date", "flightNumber", "airline", "aircraft", "from", "to", "dep", "arr", "track", "approx"}


def make_airport(icao, lat, lon):
    return {"icao": icao, "iata": icao[1:], "lat": lat, "lon": lon, "municipality": "Town " + icao,
            "country": "US", "tz": "UTC", "name": "Secret Name", "type": "large_airport",
            "continent": "NA", "custom": False}


def make_flight(**over):
    track = [[-122.4, 37.6, 100.0, 1000], [-110.0, 38.0, 9000.0, 4000],
             [-95.0, 39.0, 11000.0, 8000], [-71.0, 42.4, 50.0, 12000]]
    f = {
        "date": "2023-05-01", "flightNumber": "UA123", "aircraftReg": "N12345", "note": "private note",
        "departure": "2023-05-01T10:00:00Z", "arrival": "2023-05-01T14:30:00.000+00:00",
        "takeoffActual": "2023-05-01T10:20:00Z", "landingActual": "2023-05-01T14:10:00Z",
        "departureGate": "B35A", "arrivalGate": "D2", "departureTerminal": "B", "arrivalTerminal": "2",
        "from": make_airport("KSFO", 37.62, -122.37), "to": make_airport("KBOS", 42.36, -71.0),
        "aircraft": {"icao": "B738", "name": "Boeing 737-800", "sourceId": "x"},
        "airline": {"name": "United", "icao": "UAL", "iata": "UA", "iconPath": "p", "sourceId": "s"},
        "passengers": [{"userId": "u123secret", "guestName": None, "seat": "window", "seatNumber": "32F",
                        "seatClass": "economy", "flightReason": "leisure",
                        "user": {"id": "u123secret", "displayName": "Test Person", "username": "testperson"}}],
        "track": {"coordinates": track, "times": [p[3] for p in track], "trackDeg": [1, 2, 3, 4],
                  "sourceName": "x.csv", "sourceFormat": "csv", "groundSpeedKt": [1, 2, 3, 4]},
    }
    f.update(over)
    return f


class ParseTests(unittest.TestCase):
    def test_parse_ts_formats(self):
        self.assertEqual(bd.parse_ts("2019-12-26T22:03:00Z"), 1577397780)
        self.assertEqual(bd.parse_ts("2019-12-26T22:03:00.000+00:00"), 1577397780)
        self.assertEqual(bd.parse_ts("2019-12-26T22:03:00"), 1577397780)  # naive = UTC
        self.assertIsNone(bd.parse_ts(None))


class BuildFlightTests(unittest.TestCase):
    def test_output_has_only_whitelisted_keys_and_no_private_strings(self):
        out = bd.build_flight(make_flight())
        self.assertEqual(set(out) - {"id"}, ALLOWED_TOP - {"id"})
        blob = json.dumps(out)
        for secret in ("Test Person", "testperson", "u123secret", "32F", "N12345", "private note",
                       "B35A", "Secret Name", "economy", "leisure"):
            self.assertNotIn(secret, blob)
        self.assertEqual(out["flightNumber"], "UA123")
        self.assertEqual(out["aircraft"], {"name": "Boeing 737-800", "icao": "B738"})
        self.assertEqual(out["airline"], "United")
        self.assertEqual(set(out["from"]), {"icao", "iata", "city", "country", "lat", "lon"})

    def test_real_track_keeps_recorded_times_and_window(self):
        out = bd.build_flight(make_flight())
        self.assertFalse(out["approx"])
        self.assertEqual(out["dep"], out["track"][0][3])
        self.assertEqual(out["arr"], out["track"][-1][3])
        self.assertEqual(out["track"][0][:2], [-122.4, 37.6])

    def test_missing_times_are_synthesised_inside_window(self):
        f = make_flight()
        f["track"]["times"] = []
        out = bd.build_flight(f)
        ts = [p[3] for p in out["track"]]
        self.assertTrue(out["approx"])
        self.assertEqual(ts[0], out["dep"])
        self.assertEqual(ts[-1], out["arr"])
        self.assertTrue(all(b > a for a, b in zip(ts, ts[1:])), ts)

    def test_missing_altitude_is_filled_never_null(self):
        f = make_flight()
        f["track"]["coordinates"] = [[c[0], c[1]] for c in f["track"]["coordinates"]]
        out = bd.build_flight(f)
        alts = [p[2] for p in out["track"]]
        self.assertTrue(all(isinstance(a, (int, float)) and a == a and a >= 0 for a in alts), alts)
        self.assertEqual(alts[0], 0)
        self.assertEqual(alts[-1], 0)
        self.assertGreater(max(alts), 1000)

    def test_no_track_falls_back_to_great_circle(self):
        out = bd.build_flight(make_flight(track=None))
        self.assertTrue(out["approx"])
        self.assertGreaterEqual(len(out["track"]), 2)
        self.assertAlmostEqual(out["track"][0][0], -122.37, places=3)
        self.assertAlmostEqual(out["track"][-1][1], 42.36, places=3)
        self.assertEqual(out["track"][0][3], out["dep"])
        self.assertEqual(out["track"][-1][3], out["arr"])

    def test_non_positive_window_is_repaired(self):
        f = make_flight(track=None, takeoffActual=None, landingActual=None,
                        departure="2023-05-01T10:00:00Z", arrival="2023-05-01T10:00:00Z")
        out = bd.build_flight(f)
        self.assertGreater(out["arr"], out["dep"])

    def test_uses_takeoff_landing_when_present_else_scheduled(self):
        f = make_flight(track=None)
        out = bd.build_flight(f)
        self.assertEqual(out["dep"], bd.parse_ts("2023-05-01T10:20:00Z"))
        self.assertEqual(out["arr"], bd.parse_ts("2023-05-01T14:10:00Z"))
        f2 = make_flight(track=None, takeoffActual=None, landingActual=None)
        out2 = bd.build_flight(f2)
        self.assertEqual(out2["dep"], bd.parse_ts("2023-05-01T10:00:00Z"))

    def test_antimeridian_track_survives(self):
        track = [[170 + i * 2.0 if 170 + i * 2.0 < 180 else 170 + i * 2.0 - 360, 40.0, 10000.0, 1000 + i * 600]
                 for i in range(11)]
        f = make_flight(track={"coordinates": track, "times": [p[3] for p in track]})
        out = bd.build_flight(f)
        lons = [p[0] for p in out["track"]]
        self.assertTrue(all(-180 <= x < 180 for x in lons))
        self.assertAlmostEqual(lons[0], 170.0)
        self.assertAlmostEqual(lons[-1], -170.0)


class BuildAllTests(unittest.TestCase):
    def test_sorted_by_departure_with_sequential_ids(self):
        a = make_flight(flightNumber="A", takeoffActual="2023-05-03T10:00:00.000+00:00",
                        landingActual="2023-05-03T14:00:00Z", track=None)
        b = make_flight(flightNumber="B", takeoffActual="2021-01-01T10:00:00Z",
                        landingActual="2021-01-01T14:00:00Z", track=None)
        out = bd.build_all({"users": [{"x": 1}], "flights": [a, b]})
        self.assertEqual([f["flightNumber"] for f in out["flights"]], ["B", "A"])
        self.assertEqual([f["id"] for f in out["flights"]], [0, 1])
        self.assertNotIn("users", out)


@unittest.skipUnless(REAL_EXPORT.exists(), "real AirTrail export not present")
class RealExportTests(unittest.TestCase):
    def test_real_export_is_clean_and_complete(self):
        export = json.loads(REAL_EXPORT.read_text())
        out = bd.build_all(export)
        self.assertEqual(len(out["flights"]), len(export["flights"]))
        blob = json.dumps(out)
        self.assertLess(len(blob), 900_000)
        for f in out["flights"]:
            self.assertEqual(set(f), ALLOWED_TOP)
            self.assertGreaterEqual(len(f["track"]), 2)
            self.assertGreater(f["arr"], f["dep"])
            for lon, lat, alt, t in f["track"]:
                self.assertTrue(-180 <= lon < 180 and -90 <= lat <= 90)
                self.assertTrue(alt == alt and alt >= 0)
        deps = [f["dep"] for f in out["flights"]]
        self.assertEqual(deps, sorted(deps))
        for u in export["users"]:
            for key in ("id", "username", "displayName"):
                if u.get(key):
                    self.assertNotIn(str(u[key]), blob)
        for flight in export["flights"]:
            for p in flight.get("passengers", []):
                for key in ("seatNumber", "userId"):
                    if p.get(key) and len(str(p[key])) > 3:
                        self.assertNotIn(str(p[key]), blob)
```

- [ ] **Step 2: Run to verify they fail**

Run: `python3 -m unittest discover -s build -v`
Expected: new tests FAIL (`parse_ts`, `build_flight`, `build_all` missing).

- [ ] **Step 3: Implement** — append to `build/build_data.py`:

```python
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path


def parse_ts(s):
    if not s:
        return None
    dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp())


def _airport(a):
    return {
        "icao": a.get("icao"), "iata": a.get("iata"), "city": a.get("municipality"),
        "country": a.get("country"), "lat": a.get("lat"), "lon": a.get("lon"),
    }


def _window(f):
    """(dep, arr) Unix seconds: actual takeoff/landing if known, else scheduled departure/arrival."""
    dep = parse_ts(f.get("takeoffActual")) or parse_ts(f.get("departure"))
    arr = parse_ts(f.get("landingActual")) or parse_ts(f.get("arrival"))
    return dep, arr


def _repair_window(dep, arr, km):
    if arr is None or arr <= dep:
        arr = dep + max(1800, int(km / 800.0 * 3600))
    return dep, arr


def _cumulative_km(points):
    out = [0.0]
    for a, b in zip(points, points[1:]):
        out.append(out[-1] + haversine_km(a, b))
    return out


def _round_point(lon, lat, alt, t):
    return [round(lon, 4), round(lat, 4), int(round(alt)), int(t)]


def _track_from_coordinates(f, dep, arr):
    t = f["track"]
    coords = t["coordinates"]
    times = t.get("times") or []
    has_times = len(times) == len(coords)
    lonlat = [(c[0], c[1]) for c in coords]
    cum = _cumulative_km(lonlat)
    total = cum[-1] or 1.0
    approx = False
    pts = []
    for i, c in enumerate(coords):
        frac = cum[i] / total
        alt = max(0.0, c[2]) if len(c) > 2 and c[2] is not None else None  # airports below sea level report < 0
        if alt is None:
            alt = altitude_profile(frac, cruise_for_km(total))
            approx = True
        tt = times[i] if has_times else None
        pts.append((c[0], c[1], alt, tt, frac))
    if has_times:
        dep, arr = int(times[0]), int(times[-1])
        if arr <= dep:
            dep, arr = _repair_window(dep, None, total)
            approx = True
    else:
        dep, arr = _repair_window(dep, arr, total)
        pts = [(p[0], p[1], p[2], dep + p[4] * (arr - dep), p[4]) for p in pts]
        approx = True
    pts = [(p[0], p[1], p[2], p[3]) for p in pts]
    pts = simplify_track(pts, TOLERANCE_DEG, MAX_POINTS)
    return [_round_point(*p) for p in pts], dep, arr, approx


def _track_from_great_circle(f, dep, arr):
    a, b = (f["from"]["lon"], f["from"]["lat"]), (f["to"]["lon"], f["to"]["lat"])
    km = haversine_km(a, b)
    dep, arr = _repair_window(dep, arr, km)
    pts = great_circle(a, b, SYNTH_POINTS)
    cruise = cruise_for_km(km)
    out = []
    for i, (lon, lat) in enumerate(pts):
        frac = i / (len(pts) - 1)
        out.append(_round_point(wrap_lon(lon), lat, altitude_profile(frac, cruise), dep + frac * (arr - dep)))
    return out, dep, arr, True


def build_flight(f):
    dep, arr = _window(f)
    if dep is None:
        raise ValueError("flight %s on %s has no departure time" % (f.get("flightNumber"), f.get("date")))
    track = f.get("track")
    if track and len(track.get("coordinates") or []) >= 2:
        pts, dep, arr, approx = _track_from_coordinates(f, dep, arr)
    else:
        pts, dep, arr, approx = _track_from_great_circle(f, dep, arr)
    ac = f.get("aircraft")
    airline = f.get("airline")
    return {
        "date": f.get("date"),
        "flightNumber": f.get("flightNumber"),
        "airline": airline.get("name") if airline else None,
        "aircraft": {"name": ac.get("name"), "icao": ac.get("icao")} if ac else None,
        "from": _airport(f["from"]),
        "to": _airport(f["to"]),
        "dep": dep,
        "arr": arr,
        "track": pts,
        "approx": approx,
    }


def build_all(export):
    flights = [build_flight(f) for f in export["flights"]]
    flights.sort(key=lambda x: (x["dep"], x["arr"]))
    for i, f in enumerate(flights):
        f["id"] = i
    return {"flights": flights}


def main(argv=None):
    root = Path(__file__).resolve().parents[1]
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--input", default=str(root.parent / "airtrails" / "airtrail.json"))
    ap.add_argument("--output", default=str(root / "web" / "data" / "flights.json"))
    args = ap.parse_args(argv)
    export = json.loads(Path(args.input).read_text())
    out = build_all(export)
    text = json.dumps(out, separators=(",", ":"))
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(text)
    pts = sum(len(f["track"]) for f in out["flights"])
    approx = sum(1 for f in out["flights"] if f["approx"])
    print("%d flights, %d track points, %d approximate, %.0f kB -> %s"
          % (len(out["flights"]), pts, approx, len(text) / 1000, args.output))
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

Note: the `import` block in the middle of the file is deliberate for this task's append; move the `argparse/json/sys/datetime/Path` imports to the top of the module when committing (keep `import math` first).

- [ ] **Step 4: Run to verify it passes**

Run: `python3 -m unittest discover -s build -v`
Expected: all tests PASS, including `RealExportTests` (not skipped).

- [ ] **Step 5: Generate the data and sanity-check it**

```bash
python3 build/build_data.py
ls -l web/data/flights.json
python3 - <<'E'
import json
d = json.load(open("web/data/flights.json"))["flights"]
print(d[0]["date"], d[0]["flightNumber"], "->", d[-1]["date"], d[-1]["flightNumber"])
print("approx flights:", [(f["flightNumber"], f["date"]) for f in d if f["approx"]])
print("max alt m:", max(p[2] for f in d for p in f["track"]))
E
```
Expected: `110 flights, …`, file well under 900 kB, first flight 2010-09-22 UAL955 and last 2026-07-11 VIR19; approximate list includes VRD29 (no track), MW738/MHO738 and HA169 (no times) plus any with missing altitude; max altitude ≈ 12 000–13 000 m.

- [ ] **Step 6: Commit**

```bash
git add build/ web/data/flights.json
git commit -m "feat(build): privacy-clean flights.json extractor with tests" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `geo.js` — geometry and track interpolation

**Files:**
- Create: `web/src/geo.js`, `web/test/geo.test.js`

**Interfaces:**
- Produces (all pure; points are `[lon, lat, altM, t]` unless noted):
  - `haversineKm(a, b)` — `a`, `b` are `[lon, lat, …]`.
  - `lerpLon(a, b, f)` — shortest-way interpolation, result in `[-180, 180)`.
  - `pointAt(track, f)` → `[lon, lat, altM]`, `f` is a fraction of recorded time `[0,1]` (clamped).
  - `trackSlice(track, f0, f1)` → array of `[lon, lat, altM]` from `f0` to `f1` including interpolated ends.
  - `trackLengthKm(points)` — sums `haversineKm` between consecutive points.
  - `midpoint(a, b)` → `[lon, lat]` great-circle midpoint.
  - `distPointSegment(p, a, b)` — planar distance, all `[x, y]`.

- [ ] **Step 1: Write the failing tests** — `web/test/geo.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  haversineKm, lerpLon, pointAt, trackSlice, trackLengthKm, midpoint, distPointSegment,
} from '../src/geo.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

test('haversineKm SFO-LHR is about 8600 km', () => {
  const d = haversineKm([-122.375, 37.62], [-0.4543, 51.47]);
  assert.ok(d > 8550 && d < 8680, String(d));
});

test('haversineKm one degree of longitude on the equator', () => {
  near(haversineKm([0, 0], [1, 0]), 111.19, 0.05);
});

test('lerpLon goes the short way across the antimeridian', () => {
  near(Math.abs(lerpLon(179, -179, 0.5)), 180);
  near(lerpLon(10, 20, 0.5), 15);
  near(lerpLon(-170, 170, 0.25), -175);
});

const TRACK = [[0, 0, 0, 0], [10, 0, 1000, 10], [20, 0, 0, 40]];

test('pointAt interpolates by recorded time, not by index', () => {
  assert.deepEqual(pointAt(TRACK, 0), [0, 0, 0]);
  assert.deepEqual(pointAt(TRACK, 1), [20, 0, 0]);
  assert.deepEqual(pointAt(TRACK, 0.25), [10, 0, 1000]);
  const p = pointAt(TRACK, 0.5);
  near(p[0], 13.3333333, 1e-4);
  near(p[2], 666.6666667, 1e-3);
});

test('pointAt clamps and survives a zero-length time span', () => {
  assert.deepEqual(pointAt(TRACK, -1), [0, 0, 0]);
  assert.deepEqual(pointAt(TRACK, 2), [20, 0, 0]);
  const flat = [[5, 6, 7, 100], [8, 9, 10, 100]];
  assert.deepEqual(pointAt(flat, 0.5), [5, 6, 7]);
});

test('pointAt interpolates across the antimeridian without passing longitude 0', () => {
  const t = [[179, 0, 0, 0], [-179, 0, 0, 10]];
  near(Math.abs(pointAt(t, 0.5)[0]), 180);
});

test('trackSlice includes interpolated ends and interior vertices', () => {
  const s = trackSlice(TRACK, 0, 0.5);
  assert.equal(s.length, 3);
  assert.deepEqual(s[0], [0, 0, 0]);
  assert.deepEqual(s[1], [10, 0, 1000]);
  near(s[2][0], 13.3333333, 1e-4);
  assert.equal(trackSlice(TRACK, 0.3, 0.3).length, 1);
  assert.equal(trackSlice(TRACK, 0, 1).length, 3);
});

test('trackLengthKm sums segments', () => {
  near(trackLengthKm([[0, 0], [1, 0], [2, 0]]), 222.39, 0.1);
  assert.equal(trackLengthKm([[0, 0]]), 0);
});

test('midpoint is on the great circle', () => {
  const m = midpoint([0, 0], [90, 0]);
  near(m[0], 45, 1e-9); near(m[1], 0, 1e-9);
  near(Math.abs(midpoint([179, 0], [-179, 0])[0]), 180, 1e-6);
  const north = midpoint([-122, 37], [0, 51]);
  assert.ok(north[1] > 51, 'SFO-LHR midpoint is north of both ends');
});

test('distPointSegment', () => {
  near(distPointSegment([5, 3], [0, 0], [10, 0]), 3);
  near(distPointSegment([-4, 3], [0, 0], [10, 0]), 5);
  near(distPointSegment([1, 1], [2, 2], [2, 2]), Math.SQRT2);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test web/test/geo.test.js`
Expected: FAIL (`Cannot find module '../src/geo.js'`).

- [ ] **Step 3: Implement** — `web/src/geo.js`:

```js
const R_KM = 6371.0088;
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const wrap = (lon) => ((lon + 540) % 360) - 180;

export function haversineKm(a, b) {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function lerpLon(a, b, f) {
  const d = ((b - a + 540) % 360) - 180;
  return wrap(a + d * f);
}

function segmentIndex(track, T) {
  let lo = 0;
  let hi = track.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (track[mid][3] <= T) lo = mid; else hi = mid;
  }
  return lo;
}

function between(a, b, T) {
  const span = b[3] - a[3];
  const u = span > 0 ? Math.min(1, Math.max(0, (T - a[3]) / span)) : 0;
  return [lerpLon(a[0], b[0], u), a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}

export function pointAt(track, f) {
  const t0 = track[0][3];
  const t1 = track[track.length - 1][3];
  const ff = Math.min(1, Math.max(0, f));
  if (track.length === 1 || t1 <= t0) return [track[0][0], track[0][1], track[0][2]];
  const T = t0 + ff * (t1 - t0);
  const i = segmentIndex(track, T);
  return between(track[i], track[i + 1], T);
}

export function trackSlice(track, f0, f1) {
  const start = pointAt(track, f0);
  if (f1 <= f0) return [start];
  const t0 = track[0][3];
  const t1 = track[track.length - 1][3];
  const T0 = t0 + Math.max(0, f0) * (t1 - t0);
  const T1 = t0 + Math.min(1, f1) * (t1 - t0);
  const out = [start];
  for (const p of track) {
    if (p[3] > T0 && p[3] < T1) out.push([p[0], p[1], p[2]]);
  }
  out.push(pointAt(track, f1));
  return out;
}

export function trackLengthKm(points) {
  let km = 0;
  for (let i = 1; i < points.length; i++) km += haversineKm(points[i - 1], points[i]);
  return km;
}

export function midpoint(a, b) {
  const v = (p) => {
    const la = rad(p[1]);
    const lo = rad(p[0]);
    return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  };
  const va = v(a);
  const vb = v(b);
  const s = [va[0] + vb[0], va[1] + vb[1], va[2] + vb[2]];
  const n = Math.hypot(s[0], s[1], s[2]);
  if (n < 1e-9) return [a[0], a[1]];
  return [deg(Math.atan2(s[1], s[0])), deg(Math.asin(s[2] / n))];
}

export function distPointSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test web/test/geo.test.js`
Expected: all PASS. (If the `lerpLon(-170, 170, 0.25)` assertion fails, check the sign convention: -170→170 is a 20° westward step, so 25% of it is -175.)

- [ ] **Step 5: Commit**

```bash
git add web/src/geo.js web/test/geo.test.js
git commit -m "feat(web): geometry and track interpolation helpers" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `clock.js` — flight-sequenced playback clock

**Files:**
- Create: `web/src/clock.js`, `web/test/clock.test.js`

**Interfaces:**
- Consumes: flights with numeric `dep`/`arr`, sorted by `dep`.
- Produces:
  - `GAP_S = 0.15`
  - `flightSeconds(durationS) -> number` — `clamp(0.9 + 0.31·hours, 1, 5)`.
  - `buildSchedule(flights) -> {segments: [{i, start, dur, dep, arr}], total}`.
  - `locate(schedule, p) -> {completed: number, active: {i, f} | null}` — `completed` = flights fully finished; `p` clamped to `[0, total]`.
  - `calendarForPlayhead(schedule, p) -> unix seconds`.
  - `playheadForCalendar(schedule, T) -> seconds`.
  - `calendarRange(schedule) -> [T0, T1]`.
  - `stepTarget(schedule, p, dir) -> seconds` — `dir` is `+1` or `-1`.

- [ ] **Step 1: Write the failing tests** — `web/test/clock.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GAP_S, flightSeconds, buildSchedule, locate, calendarForPlayhead,
  playheadForCalendar, calendarRange, stepTarget,
} from '../src/clock.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);
const H = 3600;
const DAY = 86400;
const FLIGHTS = [
  { dep: 0, arr: 1 * H },              // 1 h
  { dep: 10 * DAY, arr: 10 * DAY + 10 * H }, // 10 h
  { dep: 20 * DAY, arr: 20 * DAY },    // zero duration (bad data)
];

test('flightSeconds scales with duration and clamps', () => {
  near(flightSeconds(1 * H), 1.21);
  near(flightSeconds(10 * H), 4.0);
  assert.equal(flightSeconds(0), 1);
  assert.equal(flightSeconds(-500), 1);
  assert.equal(flightSeconds(40 * H), 5);
});

test('buildSchedule lays flights end to end with gaps', () => {
  const s = buildSchedule(FLIGHTS);
  assert.equal(s.segments.length, 3);
  near(s.segments[0].start, 0);
  near(s.segments[1].start, 1.21 + GAP_S);
  near(s.total, 1.21 + 4.0 + 1.0 + 2 * GAP_S);
  assert.deepEqual(buildSchedule([]), { segments: [], total: 0 });
});

test('locate: active, gap, ended, out of range', () => {
  const s = buildSchedule(FLIGHTS);
  let l = locate(s, 0.5);
  assert.equal(l.completed, 0);
  assert.equal(l.active.i, 0);
  near(l.active.f, 0.5 / 1.21);
  l = locate(s, 1.3); // inside the gap after flight 0
  assert.deepEqual(l, { completed: 1, active: null });
  l = locate(s, s.total);
  assert.deepEqual(l, { completed: 3, active: null });
  assert.deepEqual(locate(s, 999), { completed: 3, active: null });
  assert.equal(locate(s, -5).completed, 0);
  assert.equal(locate(s, -5).active.f, 0);
});

test('calendar mapping round-trips inside a flight', () => {
  const s = buildSchedule(FLIGHTS);
  const p = s.segments[1].start + 2.0;
  const T = calendarForPlayhead(s, p);
  assert.ok(T > 10 * DAY && T < 10 * DAY + 10 * H);
  near(playheadForCalendar(s, T), p, 1e-6);
});

test('calendar mapping is monotone and finite, including gaps and zero-length flights', () => {
  const s = buildSchedule(FLIGHTS);
  let prev = -Infinity;
  for (let p = 0; p <= s.total; p += 0.05) {
    const T = calendarForPlayhead(s, p);
    assert.ok(Number.isFinite(T));
    assert.ok(T >= prev, `calendar went backwards at p=${p}`);
    prev = T;
  }
  const z = playheadForCalendar(s, 20 * DAY);
  assert.ok(Number.isFinite(z));
  near(z, s.segments[2].start + s.segments[2].dur);
});

test('playheadForCalendar clamps before the first and after the last flight', () => {
  const s = buildSchedule(FLIGHTS);
  assert.equal(playheadForCalendar(s, -1e9), 0);
  near(playheadForCalendar(s, 1e12), s.segments[2].start + s.segments[2].dur);
});

test('calendarRange', () => {
  assert.deepEqual(calendarRange(buildSchedule(FLIGHTS)), [0, 20 * DAY]);
});

test('stepTarget moves between flight starts', () => {
  const s = buildSchedule(FLIGHTS);
  const [a, b, c] = s.segments.map((x) => x.start);
  assert.equal(stepTarget(s, 0, +1), b);
  assert.equal(stepTarget(s, b, +1), c);
  assert.equal(stepTarget(s, c, +1), s.total);
  assert.equal(stepTarget(s, c + 0.5, -1), c);   // mid-flight: restart this flight
  assert.equal(stepTarget(s, c + 0.1, -1), b);   // just after start: previous flight
  assert.equal(stepTarget(s, a, -1), 0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test web/test/clock.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `web/src/clock.js`:

```js
export const GAP_S = 0.15;

export function flightSeconds(durationS) {
  const hours = Math.max(0, durationS) / 3600;
  return Math.min(5, Math.max(1, 0.9 + 0.31 * hours));
}

export function buildSchedule(flights) {
  const segments = [];
  let t = 0;
  flights.forEach((f, i) => {
    const dur = flightSeconds(f.arr - f.dep);
    segments.push({ i, start: t, dur, dep: f.dep, arr: f.arr });
    t += dur + GAP_S;
  });
  return { segments, total: Math.max(0, t - GAP_S) };
}

export function locate(schedule, p) {
  const { segments, total } = schedule;
  if (p >= total) return { completed: segments.length, active: null };
  const pp = Math.max(0, p);
  for (const s of segments) {
    if (pp < s.start) return { completed: s.i, active: null };
    if (pp < s.start + s.dur) return { completed: s.i, active: { i: s.i, f: (pp - s.start) / s.dur } };
  }
  return { completed: segments.length, active: null };
}

export function calendarForPlayhead(schedule, p) {
  const { segments } = schedule;
  if (!segments.length) return 0;
  const { completed, active } = locate(schedule, p);
  if (active) {
    const s = segments[active.i];
    return s.dep + active.f * (s.arr - s.dep);
  }
  if (completed === 0) return segments[0].dep;
  return segments[completed - 1].arr;
}

export function playheadForCalendar(schedule, T) {
  const { segments } = schedule;
  let found = null;
  for (const s of segments) {
    if (s.dep <= T) found = s; else break;
  }
  if (!found) return 0;
  const span = found.arr - found.dep;
  const f = span > 0 ? Math.min(1, Math.max(0, (T - found.dep) / span)) : 1;
  return found.start + f * found.dur;
}

export function calendarRange(schedule) {
  const { segments } = schedule;
  if (!segments.length) return [0, 0];
  return [segments[0].dep, segments[segments.length - 1].arr];
}

export function stepTarget(schedule, p, dir) {
  const { segments, total } = schedule;
  if (dir > 0) {
    for (const s of segments) if (s.start > p + 1e-6) return s.start;
    return total;
  }
  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i].start < p - 0.3) return segments[i].start;
  }
  return 0;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test web/test/clock.test.js`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/clock.js web/test/clock.test.js
git commit -m "feat(web): flight-sequenced playback clock" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `stats.js` and `format.js`

**Files:**
- Create: `web/src/stats.js`, `web/src/format.js`, `web/test/stats.test.js`, `web/test/format.test.js`

**Interfaces:**
- Consumes: `trackLengthKm` from `geo.js`.
- Produces:
  - `computeStats(flights) -> [{flights, km, airports}]` — index `k` is the state after `k` flights are completed (length `n+1`, index 0 all zeros).
  - `airportStats(flights, completed, activeIndex) -> Map<icao, {airport, n}>` — `n` counts departures and arrivals in completed flights, plus 1 for the active flight's origin when `activeIndex >= 0`.
  - `formatDate('YYYY-MM-DD') -> '27 Jun 2026'`, `formatClock(unixSeconds) -> '27 Jun 2026'` (UTC), `formatKm(n) -> '12,345 km'`, `iataOf(airport)`, `formatFlight(flight) -> 'VS20 · 27 Jun 2026 · SFO → LHR · Boeing 787-9'`.

- [ ] **Step 1: Write the failing tests**

`web/test/stats.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeStats, airportStats } from '../src/stats.js';

const ap = (icao, lon, lat) => ({ icao, iata: icao.slice(1), lon, lat });
const SFO = ap('KSFO', -122.37, 37.62);
const LHR = ap('EGLL', -0.45, 51.47);
const BOS = ap('KBOS', -71.0, 42.36);
const fl = (from, to) => ({ from, to, track: [[from.lon, from.lat, 0, 0], [to.lon, to.lat, 0, 10]] });
const FLIGHTS = [fl(SFO, LHR), fl(LHR, SFO), fl(SFO, BOS)];

test('computeStats is cumulative with a zero row first', () => {
  const s = computeStats(FLIGHTS);
  assert.equal(s.length, 4);
  assert.deepEqual(s[0], { flights: 0, km: 0, airports: 0 });
  assert.deepEqual([s[1].flights, s[1].airports], [1, 2]);
  assert.deepEqual([s[2].flights, s[2].airports], [2, 2]);
  assert.deepEqual([s[3].flights, s[3].airports], [3, 3]);
  assert.ok(s[1].km > 8500 && s[1].km < 8700);
  assert.ok(s[3].km > s[2].km && s[2].km > s[1].km);
});

test('computeStats of nothing', () => {
  assert.deepEqual(computeStats([]), [{ flights: 0, km: 0, airports: 0 }]);
});

test('airportStats counts movements for completed flights', () => {
  const m = airportStats(FLIGHTS, 2, -1);
  assert.equal(m.size, 2);
  assert.equal(m.get('KSFO').n, 2);
  assert.equal(m.get('EGLL').n, 2);
});

test('airportStats adds only the origin of an active flight', () => {
  const m = airportStats(FLIGHTS, 2, 2);
  assert.equal(m.get('KSFO').n, 3);
  assert.ok(!m.has('KBOS'));
  assert.equal(airportStats(FLIGHTS, 0, 0).get('KSFO').n, 1);
  assert.equal(airportStats(FLIGHTS, 0, -1).size, 0);
});
```

`web/test/format.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, formatClock, formatKm, iataOf, formatFlight } from '../src/format.js';

test('formatDate', () => {
  assert.equal(formatDate('2026-06-27'), '27 Jun 2026');
  assert.equal(formatDate('2010-01-05'), '5 Jan 2010');
});

test('formatClock is UTC', () => {
  assert.equal(formatClock(Date.UTC(2019, 11, 26, 23, 59) / 1000), '26 Dec 2019');
  assert.equal(formatClock(0), '1 Jan 1970');
});

test('formatKm groups thousands', () => {
  assert.equal(formatKm(0), '0 km');
  assert.equal(formatKm(999.4), '999 km');
  assert.equal(formatKm(123456.7), '123,457 km');
});

test('iataOf falls back to ICAO', () => {
  assert.equal(iataOf({ iata: 'SFO', icao: 'KSFO' }), 'SFO');
  assert.equal(iataOf({ iata: null, icao: 'KSFO' }), 'KSFO');
});

test('formatFlight with and without aircraft', () => {
  const f = {
    flightNumber: 'VS20', date: '2026-06-27',
    from: { iata: 'SFO', icao: 'KSFO' }, to: { iata: 'LHR', icao: 'EGLL' },
    aircraft: { name: 'Boeing 787-9', icao: 'B789' },
  };
  assert.equal(formatFlight(f), 'VS20 · 27 Jun 2026 · SFO → LHR · Boeing 787-9');
  assert.equal(formatFlight({ ...f, aircraft: null }), 'VS20 · 27 Jun 2026 · SFO → LHR');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test web/test/stats.test.js web/test/format.test.js`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`web/src/stats.js`:

```js
import { trackLengthKm } from './geo.js';

export function computeStats(flights) {
  const cum = [{ flights: 0, km: 0, airports: 0 }];
  const seen = new Set();
  let km = 0;
  flights.forEach((f, i) => {
    km += trackLengthKm(f.track);
    seen.add(f.from.icao);
    seen.add(f.to.icao);
    cum.push({ flights: i + 1, km, airports: seen.size });
  });
  return cum;
}

export function airportStats(flights, completed, activeIndex) {
  const m = new Map();
  const bump = (a) => {
    const e = m.get(a.icao);
    if (e) e.n += 1; else m.set(a.icao, { airport: a, n: 1 });
  };
  for (let i = 0; i < completed; i++) {
    bump(flights[i].from);
    bump(flights[i].to);
  }
  if (activeIndex >= 0) bump(flights[activeIndex].from);
  return m;
}
```

`web/src/format.js`:

```js
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function formatClock(unixSeconds) {
  const d = new Date(unixSeconds * 1000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatKm(n) {
  return `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} km`;
}

export function iataOf(airport) {
  return airport.iata || airport.icao;
}

export function formatFlight(f) {
  const parts = [f.flightNumber, formatDate(f.date), `${iataOf(f.from)} → ${iataOf(f.to)}`];
  if (f.aircraft && f.aircraft.name) parts.push(f.aircraft.name);
  return parts.join(' · ');
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `node --test web/test/*.test.js`
Expected: geo, clock, stats and format tests all PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/stats.js web/src/format.js web/test/stats.test.js web/test/format.test.js
git commit -m "feat(web): cumulative stats and formatting helpers" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `themes.js` and `camera.js`

**Files:**
- Create: `web/src/themes.js`, `web/src/camera.js`, `web/test/themes.test.js`, `web/test/camera.test.js`

**Interfaces:**
- Produces (`themes.js`):
  - `THEMES: {paper, night, natural}`; each theme has `id, label, bg, ocean, land, coast, trail ('r,g,b'), settledAlpha, activeAlpha, dot, glow (css|null), outline (css|null), ui {fg, muted, panel, accent}`.
  - `DEFAULT_THEME = 'paper'`, `THEME_ORDER = ['paper','night','natural']`.
  - `resolveTheme(search: string, stored: string | null) -> id` — query param `theme` wins, then `stored`, else default; unknown values (including `constructor`, `__proto__`) are ignored.
- Produces (`camera.js`):
  - `ZMIN = 0.8`, `ZMAX = 4`, `clamp(v, lo, hi)`.
  - `defaultView() -> {rot: [100, -30], zoom: 1, followZoom: 1, vel: [0, 0], dragging: false}`.
  - `easeAngle(cur, target, dt, tau)` — moves `cur` toward `target` the short way round; may return values outside ±180.
  - `rotationFor(lon, lat) -> [-lon, clamp(-lat, -70, 70)]`.
  - `zoomForKm(km) -> clamp(2 - km/6000, 1, 1.8)`.
  - `followStep(view, target: {lon, lat, km}, dt)` — mutates `view.rot` and `view.followZoom`.

- [ ] **Step 1: Write the failing tests**

`web/test/themes.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, DEFAULT_THEME, THEME_ORDER, resolveTheme } from '../src/themes.js';

test('three themes with the fields the renderer needs', () => {
  assert.deepEqual(THEME_ORDER, ['paper', 'night', 'natural']);
  for (const id of THEME_ORDER) {
    const t = THEMES[id];
    assert.equal(t.id, id);
    for (const k of ['label', 'bg', 'ocean', 'land', 'coast', 'trail', 'dot']) assert.ok(t[k], `${id}.${k}`);
    assert.match(t.trail, /^\d+,\d+,\d+$/);
    assert.ok(t.settledAlpha > 0 && t.settledAlpha < 1);
    assert.ok(t.activeAlpha > t.settledAlpha && t.activeAlpha <= 1);
    for (const k of ['fg', 'muted', 'panel', 'accent']) assert.ok(t.ui[k], `${id}.ui.${k}`);
  }
  assert.equal(DEFAULT_THEME, 'paper');
});

test('resolveTheme precedence: query, stored, default', () => {
  assert.equal(resolveTheme('?theme=night', 'natural'), 'night');
  assert.equal(resolveTheme('', 'natural'), 'natural');
  assert.equal(resolveTheme('', null), 'paper');
  assert.equal(resolveTheme('?x=1', undefined), 'paper');
});

test('resolveTheme ignores unknown and hostile values', () => {
  for (const bad of ['constructor', '__proto__', 'toString', 'NIGHT', '', 'nope']) {
    assert.equal(resolveTheme(`?theme=${bad}`, null), 'paper', bad);
    assert.equal(resolveTheme('', bad), 'paper', bad);
  }
  assert.equal(resolveTheme('?theme=nope', 'night'), 'night');
});
```

`web/test/camera.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ZMIN, ZMAX, clamp, defaultView, easeAngle, rotationFor, zoomForKm, followStep,
} from '../src/camera.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

test('clamp and zoom limits', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
  assert.equal(ZMIN, 0.8);
  assert.equal(ZMAX, 4);
});

test('defaultView returns a fresh object each time', () => {
  const a = defaultView();
  a.rot[0] = 5;
  assert.notEqual(defaultView().rot[0], 5);
  assert.equal(defaultView().zoom, 1);
});

test('easeAngle: no motion at dt 0, converges, takes the short way round', () => {
  assert.equal(easeAngle(10, 50, 0, 0.5), 10);
  near(easeAngle(10, 20, 100, 0.1), 20, 1e-6);
  const v = easeAngle(170, -170, 1, 1); // short way is +20 degrees, i.e. past 170
  assert.ok(v > 170 && v < 190, String(v));
});

test('rotationFor centres a point and limits tilt', () => {
  assert.deepEqual(rotationFor(-122, 37), [122, -37]);
  assert.equal(rotationFor(0, 89)[1], -70);
  assert.equal(rotationFor(0, -89)[1], 70);
});

test('zoomForKm zooms in on short hops and out on long ones', () => {
  assert.equal(zoomForKm(300), 1.8);
  assert.equal(zoomForKm(9000), 1);
  near(zoomForKm(3000), 1.5);
});

test('followStep converges on the target', () => {
  const v = defaultView();
  for (let i = 0; i < 600; i++) followStep(v, { lon: -122, lat: 37, km: 3000 }, 1 / 60);
  near(v.rot[0], 122, 0.01);
  near(v.rot[1], -37, 0.01);
  near(v.followZoom, 1.5, 0.01);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test web/test/themes.test.js web/test/camera.test.js`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`web/src/themes.js`:

```js
export const THEMES = {
  paper: {
    id: 'paper', label: 'Paper',
    bg: '#f4f2ee', ocean: '#f4f2ee', land: '#d9d6cf', coast: '#bdb9b0',
    trail: '20,20,20', settledAlpha: 0.22, activeAlpha: 0.9, dot: '#111111',
    glow: 'rgba(0,0,0,0.06)', outline: '#c9c5bc',
    ui: { fg: '#1a1a1a', muted: '#777777', panel: 'rgba(244,242,238,0.85)', accent: '#111111' },
  },
  night: {
    id: 'night', label: 'Night',
    bg: '#000000', ocean: '#050505', land: '#262626', coast: '#3b3b3b',
    trail: '255,255,255', settledAlpha: 0.18, activeAlpha: 0.95, dot: '#ffffff',
    glow: null, outline: null,
    ui: { fg: '#eeeeee', muted: '#888888', panel: 'rgba(0,0,0,0.7)', accent: '#ffffff' },
  },
  natural: {
    id: 'natural', label: 'Natural',
    bg: '#0b1620', ocean: '#12263a', land: '#5d7a62', coast: '#7e9a80',
    trail: '255,190,90', settledAlpha: 0.3, activeAlpha: 0.95, dot: '#ffd089',
    glow: 'rgba(120,170,220,0.25)', outline: 'rgba(160,200,240,0.35)',
    ui: { fg: '#e8eef4', muted: '#8fa3b5', panel: 'rgba(11,22,32,0.75)', accent: '#ffd089' },
  },
};

export const DEFAULT_THEME = 'paper';
export const THEME_ORDER = ['paper', 'night', 'natural'];

const valid = (id) => typeof id === 'string' && Object.hasOwn(THEMES, id);

export function resolveTheme(search, stored) {
  const q = new URLSearchParams(search || '').get('theme');
  if (valid(q)) return q;
  if (valid(stored)) return stored;
  return DEFAULT_THEME;
}
```

`web/src/camera.js`:

```js
export const ZMIN = 0.8;
export const ZMAX = 4;

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function defaultView() {
  return { rot: [100, -30], zoom: 1, followZoom: 1, vel: [0, 0], dragging: false };
}

const wrap180 = (d) => ((d + 540) % 360) - 180;

export function easeAngle(cur, target, dt, tau) {
  const k = 1 - Math.exp(-dt / tau);
  return cur + wrap180(target - cur) * k;
}

export function rotationFor(lon, lat) {
  return [-lon, clamp(-lat, -70, 70)];
}

export function zoomForKm(km) {
  return clamp(2 - km / 6000, 1, 1.8);
}

export function followStep(view, target, dt) {
  const [tl, tp] = rotationFor(target.lon, target.lat);
  view.rot[0] = easeAngle(view.rot[0], tl, dt, 0.5);
  view.rot[1] = easeAngle(view.rot[1], tp, dt, 0.5);
  view.followZoom += (zoomForKm(target.km) - view.followZoom) * (1 - Math.exp(-dt / 0.8));
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `node --test web/test/*.test.js`
Expected: all six test files PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/themes.js web/src/camera.js web/test/themes.test.js web/test/camera.test.js
git commit -m "feat(web): themes and camera maths" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Page shell, vendored libraries, and a spinnable themed globe

First visible milestone: land only, drag/zoom, theme switcher, no flights yet.

**Files:**
- Create: `web/index.html`, `web/style.css`, `web/vendor/*`, `web/vendor/README.md`, `web/src/data.js`, `web/src/render.js`, `web/src/interaction.js`, `web/src/main.js`

**Interfaces:**
- Consumes: `themes.js` (`THEMES`, `THEME_ORDER`, `resolveTheme`), `camera.js` (`defaultView`, `clamp`, `ZMIN`, `ZMAX`).
- Produces:
  - `data.js`: `loadFlights() -> Promise<flight[]>` (adds `line` GeoJSON `LineString`, `km`, `mid: [lon, lat]` to each flight), `loadLand() -> Promise<GeoJSON>`.
  - `render.js`: `class GlobeRenderer { constructor(canvas, land); setTheme(theme); resize(); baseRadius(); draw(view, flights, frame) }` — `frame = {completed, active: {i, f} | null, airports: Map | null, hover: number}`. `frame` and `flights` may be `[]`/`null` in this task.
  - `interaction.js`: `attachInteraction(canvas, view, hooks)` with `hooks = {degPerPx(), onUserMove(), onTap(x, y), onHover(x, y), onReset()}`; `applyInertia(view, dt)`.
  - Global `window.d3` (d3-array + d3-geo) and `window.topojson` from vendored scripts.

- [ ] **Step 1: Vendor the libraries and land data**

```bash
mkdir -p web/vendor
curl -fsSL https://cdn.jsdelivr.net/npm/d3-array@3/dist/d3-array.min.js -o web/vendor/d3-array.min.js
curl -fsSL https://cdn.jsdelivr.net/npm/d3-geo@3/dist/d3-geo.min.js -o web/vendor/d3-geo.min.js
curl -fsSL https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js -o web/vendor/topojson-client.min.js
curl -fsSL https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json -o web/vendor/land-110m.json
ls -l web/vendor
head -c 200 web/vendor/d3-geo.min.js; echo; head -c 120 web/vendor/land-110m.json; echo
```
Expected: four non-empty files; `d3-geo.min.js` starts with a `// https://d3js.org/d3-geo/vX.Y.Z` banner; the land file starts with `{"type":"Topology"`.

Create `web/vendor/README.md` recording the versions from those banners:

```markdown
# Vendored third-party files

Loaded as classic scripts (UMD) so the page works from any static server with no network access.

| File | Source | Licence |
|---|---|---|
| d3-array.min.js | https://cdn.jsdelivr.net/npm/d3-array@3 (version in file banner) | ISC |
| d3-geo.min.js | https://cdn.jsdelivr.net/npm/d3-geo@3 (version in file banner) | ISC |
| topojson-client.min.js | https://cdn.jsdelivr.net/npm/topojson-client@3 | ISC |
| land-110m.json | https://cdn.jsdelivr.net/npm/world-atlas@2 (Natural Earth 110m land) | Public domain |

`d3-array` must be loaded before `d3-geo` (d3-geo's UMD build extends the existing global `d3`).
```

- [ ] **Step 2: Create `web/index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Flight Globe</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <canvas id="globe" aria-label="Globe showing flight history"></canvas>

  <div id="readout" aria-live="off">
    <div id="date"></div>
    <div id="stats"></div>
  </div>
  <div id="tooltip" hidden></div>

  <div id="controls">
    <div id="timeline">
      <div id="ticks"></div>
      <div id="years"></div>
      <input id="scrub" type="range" min="0" max="1000" value="0" step="1" aria-label="Timeline">
    </div>
    <div id="buttons">
      <button id="restart" type="button" title="Restart (Home)" aria-label="Restart">⏮</button>
      <button id="play" type="button" title="Play / pause (Space)" aria-label="Play or pause">⏸</button>
      <button id="end" type="button" title="Skip to end (End)" aria-label="Skip to end">⏭</button>
      <button id="speed" type="button" title="Playback speed">1×</button>
      <label class="check"><input id="follow" type="checkbox" checked> Follow</label>
      <select id="theme" aria-label="Theme"></select>
    </div>
  </div>

  <script src="vendor/d3-array.min.js"></script>
  <script src="vendor/d3-geo.min.js"></script>
  <script src="vendor/topojson-client.min.js"></script>
  <script type="module" src="src/main.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create `web/style.css`**

```css
:root {
  --bg: #f4f2ee; --fg: #1a1a1a; --muted: #777; --panel: rgba(244, 242, 238, 0.85); --accent: #111;
}
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; background: var(--bg); color: var(--fg); overflow: hidden;
  font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
#globe { position: fixed; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; cursor: grab; }
#globe:active { cursor: grabbing; }

#readout { position: fixed; top: max(16px, env(safe-area-inset-top)); left: 16px; pointer-events: none; }
#date { font-size: 28px; font-weight: 600; letter-spacing: -0.01em; font-variant-numeric: tabular-nums; }
#stats { color: var(--muted); font-variant-numeric: tabular-nums; }

#tooltip { position: fixed; z-index: 5; pointer-events: none; padding: 6px 10px; border-radius: 8px;
  background: var(--panel); color: var(--fg); box-shadow: 0 2px 12px rgba(0,0,0,.25); white-space: nowrap; }

#controls { position: fixed; left: 0; right: 0; bottom: 0; padding: 12px 16px max(12px, env(safe-area-inset-bottom));
  background: linear-gradient(transparent, var(--panel) 40%); display: flex; flex-direction: column; gap: 8px; }
#timeline { position: relative; height: 40px; }
#ticks { position: absolute; left: 0; right: 0; top: 8px; height: 10px; }
#ticks i { position: absolute; top: 0; width: 1px; height: 10px; background: var(--muted); opacity: .35; }
#ticks i.done { opacity: 1; background: var(--accent); }
#years { position: absolute; left: 0; right: 0; top: 22px; height: 14px; color: var(--muted); font-size: 11px; }
#years span { position: absolute; transform: translateX(-50%); }
#scrub { position: absolute; left: 0; right: 0; top: 0; width: 100%; margin: 0; height: 20px; opacity: .0001; cursor: pointer; }
#buttons { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
button, select { font: inherit; color: var(--fg); background: transparent; border: 1px solid var(--muted);
  border-radius: 8px; padding: 4px 10px; cursor: pointer; }
button:hover, select:hover { border-color: var(--accent); }
.check { display: inline-flex; gap: 4px; align-items: center; color: var(--muted); }
#theme { margin-left: auto; }

@media (max-width: 520px) {
  #date { font-size: 22px; }
  #controls { padding-left: 12px; padding-right: 12px; }
}
```

- [ ] **Step 4: Create `web/src/data.js`**

```js
import { trackLengthKm, midpoint } from './geo.js';

export async function loadFlights(url = 'data/flights.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url}: ${res.status}`);
  const { flights } = await res.json();
  for (const f of flights) {
    f.line = { type: 'LineString', coordinates: f.track.map((p) => [p[0], p[1]]) };
    f.km = trackLengthKm(f.track);
    f.mid = midpoint([f.from.lon, f.from.lat], [f.to.lon, f.to.lat]);
  }
  return flights;
}

export async function loadLand(url = 'vendor/land-110m.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url}: ${res.status}`);
  const topo = await res.json();
  return window.topojson.feature(topo, topo.objects.land);
}
```

- [ ] **Step 5: Create `web/src/render.js`** (land, sphere, glow, outline only for now; flight drawing arrives in Task 9)

```js
export class GlobeRenderer {
  constructor(canvas, land) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.land = land;
    this.theme = null;
    this.w = 1;
    this.h = 1;
    this.proj = window.d3.geoOrthographic().clipAngle(90).precision(0.3);
    this.path = window.d3.geoPath(this.proj, this.ctx);
  }

  setTheme(theme) { this.theme = theme; }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  baseRadius() {
    // leave room at the bottom for the control bar on short screens
    return Math.min(this.w, this.h * 0.86) * 0.42;
  }

  draw(view, flights, frame) {
    const { ctx, theme: t } = this;
    const R = this.baseRadius() * view.zoom * view.followZoom;
    const cx = this.w / 2;
    const cy = this.h * 0.46;
    this.cx = cx;
    this.cy = cy;
    this.R = R;
    this.proj.translate([cx, cy]).scale(R).rotate([view.rot[0], view.rot[1]]);
    this.center = [-view.rot[0], -view.rot[1]];

    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, this.w, this.h);

    if (t.glow) {
      const g = ctx.createRadialGradient(cx, cy, R, cx, cy, R * 1.12);
      g.addColorStop(0, t.glow);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.12, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.beginPath();
    this.path({ type: 'Sphere' });
    ctx.fillStyle = t.ocean;
    ctx.fill();

    ctx.beginPath();
    this.path(this.land);
    ctx.fillStyle = t.land;
    ctx.fill();
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = t.coast;
    ctx.stroke();

    if (t.outline) {
      ctx.beginPath();
      this.path({ type: 'Sphere' });
      ctx.lineWidth = 1;
      ctx.strokeStyle = t.outline;
      ctx.stroke();
    }
  }
}
```

- [ ] **Step 6: Create `web/src/interaction.js`**

```js
import { clamp, ZMIN, ZMAX } from './camera.js';

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const TAP_PX = 6;

export function attachInteraction(canvas, view, hooks) {
  const pointers = new Map();
  let pinch = null;
  let moved = 0;
  let lastMoveAt = 0;

  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, pos(e));
    if (pointers.size === 1) moved = 0;
    view.vel = [0, 0];
    view.dragging = true;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: dist(a, b), zoom: view.zoom };
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = pos(e);
    if (!pointers.has(e.pointerId)) {
      if (e.pointerType === 'mouse') hooks.onHover(p[0], p[1]);
      return;
    }
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, p);
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      view.zoom = clamp((pinch.zoom * dist(a, b)) / pinch.d, ZMIN, ZMAX);
      moved = TAP_PX + 1;
      hooks.onUserMove();
      return;
    }
    const dx = p[0] - prev[0];
    const dy = p[1] - prev[1];
    moved += Math.abs(dx) + Math.abs(dy);
    if (moved < TAP_PX) return;
    const deg = hooks.degPerPx();
    view.rot[0] += dx * deg;
    view.rot[1] = clamp(view.rot[1] - dy * deg, -90, 90);
    const now = performance.now();
    const dt = Math.max(1, now - lastMoveAt) / 1000;
    const inst = [(dx * deg) / dt, (-dy * deg) / dt];
    view.vel = [view.vel[0] * 0.5 + inst[0] * 0.5, view.vel[1] * 0.5 + inst[1] * 0.5];
    lastMoveAt = now;
    hooks.onUserMove();
  });

  const end = (e) => {
    if (!pointers.has(e.pointerId)) return;
    const p = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) {
      view.dragging = false;
      if (moved < TAP_PX) { view.vel = [0, 0]; hooks.onTap(p[0], p[1]); }
      else if (performance.now() - lastMoveAt > 80) view.vel = [0, 0];
    }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    view.zoom = clamp(view.zoom * Math.exp(-e.deltaY * 0.0015), ZMIN, ZMAX);
    hooks.onUserMove();
  }, { passive: false });

  canvas.addEventListener('dblclick', () => hooks.onReset());
}

export function applyInertia(view, dt) {
  if (view.dragging) return;
  if (Math.abs(view.vel[0]) < 0.05 && Math.abs(view.vel[1]) < 0.05) { view.vel = [0, 0]; return; }
  view.rot[0] += view.vel[0] * dt;
  view.rot[1] = clamp(view.rot[1] + view.vel[1] * dt, -90, 90);
  const k = Math.exp(-3 * dt);
  view.vel = [view.vel[0] * k, view.vel[1] * k];
}
```

- [ ] **Step 7: Create `web/src/main.js`** (milestone version: land + theme switcher + drag/zoom)

```js
import { THEMES, THEME_ORDER, resolveTheme } from './themes.js';
import { defaultView } from './camera.js';
import { loadLand } from './data.js';
import { GlobeRenderer } from './render.js';
import { attachInteraction, applyInertia } from './interaction.js';

const STORAGE_KEY = 'flightglobe.theme';

function readStored() {
  try { return window.localStorage.getItem(STORAGE_KEY); } catch { return null; }
}
function writeStored(v) {
  try { window.localStorage.setItem(STORAGE_KEY, v); } catch { /* storage unavailable: ignore */ }
}

function applyTheme(id, renderer) {
  const t = THEMES[id];
  renderer.setTheme(t);
  const root = document.documentElement.style;
  root.setProperty('--bg', t.bg);
  root.setProperty('--fg', t.ui.fg);
  root.setProperty('--muted', t.ui.muted);
  root.setProperty('--panel', t.ui.panel);
  root.setProperty('--accent', t.ui.accent);
}

async function main() {
  const canvas = document.getElementById('globe');
  const land = await loadLand();
  const renderer = new GlobeRenderer(canvas, land);
  const view = defaultView();

  const select = document.getElementById('theme');
  for (const id of THEME_ORDER) {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = THEMES[id].label;
    select.appendChild(o);
  }
  let themeId = resolveTheme(window.location.search, readStored());
  select.value = themeId;
  applyTheme(themeId, renderer);
  select.addEventListener('change', () => {
    themeId = select.value;
    applyTheme(themeId, renderer);
    writeStored(themeId);
  });

  attachInteraction(canvas, view, {
    degPerPx: () => 57.2958 / (renderer.baseRadius() * view.zoom * view.followZoom),
    onUserMove() {},
    onTap() {},
    onHover() {},
    onReset() { Object.assign(view, defaultView()); },
  });

  window.addEventListener('resize', () => renderer.resize());
  renderer.resize();

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    applyInertia(view, dt);
    renderer.draw(view, [], { completed: 0, active: null, airports: null, hover: -1 });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((err) => {
  document.body.textContent = `Could not start: ${err.message}`;
  console.error(err);
});
```

- [ ] **Step 8: Run it and check by eye**

```bash
python3 -m http.server 8000 -d web
```
Open `http://localhost:8000`. Expected:
- A paper-coloured globe with grey land and no borders, centred, full-viewport.
- Drag spins it with a natural grab feel and inertia; wheel/pinch zooms between about 0.8× and 4×; double-click resets.
- The theme dropdown switches Paper / Night / Natural live; reload keeps the choice; `?theme=night` overrides it; `?theme=constructor` falls back to Paper.
- The browser console shows no errors. The bottom bar is visible (controls are inert until Task 11).

Also run: `node --test web/test/*.test.js` — still PASS.

- [ ] **Step 9: Commit**

```bash
git add web/
git commit -m "feat(web): themed, spinnable globe with vendored d3 and land data" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Draw the flights (settled trails, airports, hover highlight) — the "full" state

**Files:**
- Modify: `web/src/render.js`, `web/src/main.js`

**Interfaces:**
- Consumes: `loadFlights()` (flights with `line`, `km`, `mid`), `airportStats` (Task 6), `trackSlice` (Task 4), `distPointSegment` (Task 4), `formatFlight` (Task 6).
- Produces on `GlobeRenderer`: `liftScreen(lon, lat, altM) -> [x, y] | null` (null when on the far side), `hitTest(x, y, flights, completed, maxPx = 6) -> index | -1`, and drawing of: settled trails for `i < frame.completed` (recent ones stronger), the active flight (trail + comet + marker, lifted), airport dots with scaling, labels for the three busiest airports and the hovered flight's two airports, and a hover highlight for `frame.hover`.

- [ ] **Step 1: Add drawing code to `GlobeRenderer`** — in `web/src/render.js` add this import at the top:

```js
import { trackSlice, distPointSegment } from './geo.js';
```

Add these constants above the class:

```js
const CRUISE_M = 11000;
const LIFT = 0.025;          // fraction of radius at cruise altitude
const LABEL_TOP_N = 3;
const RECENT_FLIGHTS = 4;    // how many recently completed flights fade from strong to settled
const lerp = (a, b, f) => a + (b - a) * f;
```

Add these methods inside the class:

```js
  visible(lon, lat) {
    return window.d3.geoDistance([lon, lat], this.center) < Math.PI / 2 - 0.01;
  }

  liftScreen(lon, lat, altM) {
    if (!this.visible(lon, lat)) return null;
    const p = this.proj([lon, lat]);
    const lift = 1 + LIFT * Math.min(1, Math.max(0, (altM || 0) / CRUISE_M));
    return [this.cx + (p[0] - this.cx) * lift, this.cy + (p[1] - this.cy) * lift];
  }

  strokeLifted(points, rgba, width) {
    const { ctx } = this;
    ctx.strokeStyle = rgba;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    let open = false;
    ctx.beginPath();
    for (const p of points) {
      const s = this.liftScreen(p[0], p[1], p[2]);
      if (!s) { open = false; continue; }
      if (open) ctx.lineTo(s[0], s[1]); else { ctx.moveTo(s[0], s[1]); open = true; }
    }
    ctx.stroke();
  }

  drawFlights(flights, frame) {
    const { ctx, theme: t } = this;
    const rgba = (a) => `rgba(${t.trail},${a})`;

    for (let i = 0; i < frame.completed; i++) {
      const age = frame.completed - 1 - i;
      const a = lerp(t.activeAlpha * 0.8, t.settledAlpha, Math.min(1, age / RECENT_FLIGHTS));
      ctx.beginPath();
      this.path(flights[i].line);
      ctx.strokeStyle = rgba(a);
      ctx.lineWidth = age < RECENT_FLIGHTS ? 1.3 : 1;
      ctx.stroke();
    }

    if (frame.hover >= 0 && frame.hover < frame.completed) {
      ctx.beginPath();
      this.path(flights[frame.hover].line);
      ctx.strokeStyle = rgba(1);
      ctx.lineWidth = 2.4;
      ctx.stroke();
    }

    if (frame.active) {
      const f = flights[frame.active.i];
      const fr = frame.active.f;
      this.strokeLifted(trackSlice(f.track, 0, fr), rgba(t.activeAlpha * 0.7), 1.6);
      const comet = trackSlice(f.track, Math.max(0, fr - 0.08), fr);
      this.strokeLifted(comet, rgba(1), 2.6);
      const head = comet[comet.length - 1];
      const ground = this.liftScreen(head[0], head[1], 0);
      const air = this.liftScreen(head[0], head[1], head[2]);
      if (ground) {
        ctx.fillStyle = rgba(0.15);
        ctx.beginPath();
        ctx.arc(ground[0], ground[1], 3, 0, Math.PI * 2);
        ctx.fill();
      }
      if (air) {
        ctx.fillStyle = t.dot;
        ctx.beginPath();
        ctx.arc(air[0], air[1], 3.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawAirports(airports, hoverFlight) {
    if (!airports || !airports.size) return;
    const { ctx, theme: t } = this;
    const ranked = [...airports.values()].sort((a, b) => b.n - a.n);
    const labelled = new Set(ranked.slice(0, LABEL_TOP_N).map((e) => e.airport.icao));
    if (hoverFlight) { labelled.add(hoverFlight.from.icao); labelled.add(hoverFlight.to.icao); }
    ctx.font = '11px -apple-system, system-ui, sans-serif';
    ctx.textBaseline = 'alphabetic';
    for (const { airport, n } of airports.values()) {
      const s = this.liftScreen(airport.lon, airport.lat, 0);
      if (!s) continue;
      ctx.fillStyle = t.dot;
      ctx.beginPath();
      ctx.arc(s[0], s[1], 1.8 + 0.9 * Math.sqrt(n), 0, Math.PI * 2);
      ctx.fill();
      if (labelled.has(airport.icao)) {
        ctx.fillStyle = t.ui.fg;
        ctx.fillText(airport.iata || airport.icao, s[0] + 7, s[1] - 7);
      }
    }
  }

  hitTest(x, y, flights, completed, maxPx = 6) {
    let best = -1;
    let bestD = maxPx;
    for (let i = 0; i < completed; i++) {
      const pts = flights[i].track;
      let prev = null;
      for (const p of pts) {
        const s = this.visible(p[0], p[1]) ? this.proj([p[0], p[1]]) : null;
        if (s && prev) {
          const d = distPointSegment([x, y], prev, s);
          if (d < bestD) { bestD = d; best = i; }
        }
        prev = s;
      }
    }
    return best;
  }
```

In `draw()`, replace the end of the method (after the outline block) with:

```js
    if (flights && flights.length) {
      this.drawFlights(flights, frame);
      const hoverFlight = frame.hover >= 0 ? flights[frame.hover] : null;
      this.drawAirports(frame.airports, hoverFlight);
    }
```

- [ ] **Step 2: Update `web/src/main.js`** to load the flights and show the final state. Change the imports and the body:

```js
import { loadFlights, loadLand } from './data.js';
import { airportStats } from './stats.js';
import { formatFlight } from './format.js';
```

Replace `const land = await loadLand();` with:

```js
  const [land, flights] = await Promise.all([loadLand(), loadFlights()]);
```

Add a hover/tooltip state and wire the hooks (replace the `attachInteraction(...)` call):

```js
  const tooltip = document.getElementById('tooltip');
  let hover = -1;
  const completed = flights.length;        // final state for now; the clock takes over in Task 10
  const airports = airportStats(flights, completed, -1);

  function showTooltip(idx, x, y) {
    hover = idx;
    if (idx < 0) { tooltip.hidden = true; return; }
    tooltip.textContent = formatFlight(flights[idx]);
    tooltip.hidden = false;
    const w = tooltip.offsetWidth;
    tooltip.style.left = `${Math.min(window.innerWidth - w - 8, Math.max(8, x + 12))}px`;
    tooltip.style.top = `${Math.max(8, y - 36)}px`;
  }

  attachInteraction(canvas, view, {
    degPerPx: () => 57.2958 / (renderer.baseRadius() * view.zoom * view.followZoom),
    onUserMove() { showTooltip(-1, 0, 0); },
    onTap(x, y) { showTooltip(renderer.hitTest(x, y, flights, completed), x, y); },
    onHover(x, y) { showTooltip(renderer.hitTest(x, y, flights, completed), x, y); },
    onReset() { Object.assign(view, defaultView()); },
  });
```

And the draw call in `frame()`:

```js
    renderer.draw(view, flights, { completed, active: null, airports, hover });
```

- [ ] **Step 3: Run it and check by eye**

```bash
python3 -m http.server 8000 -d web
```
Open `http://localhost:8000`. Expected:
- All 110 flights drawn as thin overprinted trails: the SFO–Boston and SFO–London corridors visibly darker than one-offs.
- SFO–Japan trails cross the Pacific without a line streaking across the globe.
- Airport dots (bigger for SFO), labels on the three busiest airports only.
- Hovering a trail shows e.g. `VS20 · 27 Jun 2026 · SFO → LHR · Boeing 787-9`, highlights that trail and labels its two airports; tapping works the same on touch.
- Check all three themes. Judge airport label and dot scaling by eye (spec open items) and note any tweak wanted.

Run: `node --test web/test/*.test.js` → still PASS.

- [ ] **Step 4: Commit**

```bash
git add web/
git commit -m "feat(web): draw all flights, airports, hover highlight" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Playback loop, follow camera, final-state idle spin

**Files:**
- Modify: `web/src/main.js`

**Interfaces:**
- Consumes: `buildSchedule`, `locate` (Task 5); `computeStats`, `airportStats` (Task 6); `followStep` (Task 7); `trackSlice`, `trackLengthKm` (Task 4).
- Produces: a mutable `state` object in `main.js`: `{ playing, speed, playhead, follow, ended }`, plus `schedule`, `loc` (current `locate` result). Task 11 binds the UI to exactly these names.

- [ ] **Step 1: Add state and the loop** — in `web/src/main.js` add imports:

```js
import { buildSchedule, locate } from './clock.js';
import { followStep } from './camera.js';
import { computeStats } from './stats.js';
```

Replace the section that sets `completed`/`airports` and the `frame()` loop with:

```js
  const schedule = buildSchedule(flights);
  const cum = computeStats(flights);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state = {
    playing: !reduced,
    speed: 1,
    playhead: reduced ? schedule.total : 0,
    follow: true,
    ended: reduced,
  };
  let loc = locate(schedule, state.playhead);
  const IDLE_SPIN_DEG_PER_S = 4;

  function followTarget(l) {
    const i = l.active ? l.active.i : l.completed - 1;
    if (i < 0) return null;
    const f = flights[i];
    return { lon: f.mid[0], lat: f.mid[1], km: f.km };
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    if (state.playing) {
      state.playhead += dt * state.speed;
      if (state.playhead >= schedule.total) {
        state.playhead = schedule.total;
        state.playing = false;
      }
    }
    state.ended = state.playhead >= schedule.total;
    loc = locate(schedule, state.playhead);

    applyInertia(view, dt);
    if (state.follow && !view.dragging && !state.ended) {
      const target = followTarget(loc);
      if (target) followStep(view, target, dt);
    } else if (state.ended && !view.dragging && Math.abs(view.vel[0]) < 0.05) {
      view.rot[0] += IDLE_SPIN_DEG_PER_S * dt;
      view.followZoom += (1 - view.followZoom) * (1 - Math.exp(-dt / 0.8));
    } else if (!state.follow) {
      view.followZoom += (1 - view.followZoom) * (1 - Math.exp(-dt / 0.3));
    }

    const airports = airportStats(flights, loc.completed, loc.active ? loc.active.i : -1);
    renderer.draw(view, flights, { completed: loc.completed, active: loc.active, airports, hover });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
```

Update the interaction hooks to use `loc.completed` and to drop follow on manual interaction:

```js
  attachInteraction(canvas, view, {
    degPerPx: () => 57.2958 / (renderer.baseRadius() * view.zoom * view.followZoom),
    onUserMove() { state.follow = false; showTooltip(-1, 0, 0); },
    onTap(x, y) { showTooltip(renderer.hitTest(x, y, flights, loc.completed), x, y); },
    onHover(x, y) { showTooltip(renderer.hitTest(x, y, flights, loc.completed), x, y); },
    onReset() { Object.assign(view, defaultView()); state.follow = true; },
  });
```

Note: `state`, `schedule`, `loc` and `cum` must be declared before `attachInteraction` is called (move the `attachInteraction` call below them), and remove the earlier `const completed = …` / `const airports = …` lines. Export the pieces Task 11 needs by keeping them in `main()` scope (Task 11 adds the UI inside the same function).

- [ ] **Step 2: Run it and check by eye**

```bash
python3 -m http.server 8000 -d web
```
Open `http://localhost:8000` (use a browser profile without reduced motion). Expected:
- The globe starts empty and flights accumulate in date order; the first flight is the 2010 SFO–LHR, drawn as a bright comet with a faint shadow dot on the surface below it; short hops last about a second, transatlantics about four.
- The camera eases to each flight's midpoint, zooming in a little on short hops and out on long ones.
- Dragging or scrolling stops the camera following; the globe stays where you put it while flights keep playing.
- Recently finished flights are stronger than old ones, and busy corridors build up.
- At the end the playhead stops, the full picture remains and the globe idles in a slow spin.
- With `prefers-reduced-motion: reduce` it opens straight at the full state.

Run: `node --test web/test/*.test.js` → PASS.

- [ ] **Step 3: Commit**

```bash
git add web/src/main.js
git commit -m "feat(web): flight-sequenced playback with follow camera and idle spin" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Controls, timeline, readout, keyboard

**Files:**
- Create: `web/src/ui.js`
- Modify: `web/src/main.js`

**Interfaces:**
- Consumes: `state`, `schedule`, `loc`, `cum`, `flights` from `main()`; `airportStats` (Task 6); `calendarForPlayhead`, `playheadForCalendar`, `calendarRange`, `stepTarget` (Task 5); `formatClock`, `formatKm` (Task 6); `trackLengthKm`, `trackSlice` (Task 4).
- Produces: `bindUi({ state, schedule, flights, cum, getLoc, setFollow })` returning `{ update() }`; call `update()` once per frame after `loc` is computed.

- [ ] **Step 1: Create `web/src/ui.js`**

```js
import {
  calendarForPlayhead, playheadForCalendar, calendarRange, stepTarget,
} from './clock.js';
import { formatClock, formatKm } from './format.js';
import { trackSlice, trackLengthKm } from './geo.js';
import { airportStats } from './stats.js';

const SPEEDS = [0.5, 1, 2, 4];
const SCRUB_MAX = 1000;

export function bindUi({ state, schedule, flights, cum, getLoc, setFollow }) {
  const $ = (id) => document.getElementById(id);
  const playBtn = $('play');
  const speedBtn = $('speed');
  const scrub = $('scrub');
  const followBox = $('follow');
  const dateEl = $('date');
  const statsEl = $('stats');
  const ticksEl = $('ticks');
  const yearsEl = $('years');

  const [T0, T1] = calendarRange(schedule);
  const span = Math.max(1, T1 - T0);
  const frac = (T) => (T - T0) / span;

  // ticks (one per flight) and year labels, on the true calendar axis
  const ticks = flights.map((f) => {
    const el = document.createElement('i');
    el.style.left = `${frac(f.dep) * 100}%`;
    ticksEl.appendChild(el);
    return el;
  });
  if (flights.length) {
    const y0 = new Date(T0 * 1000).getUTCFullYear();
    const y1 = new Date(T1 * 1000).getUTCFullYear();
    for (let y = y0; y <= y1; y++) {
      const at = y === y0 ? T0 : Date.UTC(y, 0, 1) / 1000;
      const el = document.createElement('span');
      el.textContent = String(y);
      el.style.left = `${Math.min(97, Math.max(2, frac(at) * 100))}%`;
      yearsEl.appendChild(el);
    }
  }

  const syncPlay = () => { playBtn.textContent = state.playing ? '⏸' : '▶'; };
  const jump = (p) => { state.playhead = Math.min(schedule.total, Math.max(0, p)); };

  playBtn.addEventListener('click', (e) => {
    if (!state.playing && state.playhead >= schedule.total) jump(0);
    state.playing = !state.playing;
    syncPlay();
    e.currentTarget.blur();
  });
  $('restart').addEventListener('click', (e) => { jump(0); state.playing = true; syncPlay(); e.currentTarget.blur(); });
  $('end').addEventListener('click', (e) => { jump(schedule.total); state.playing = false; syncPlay(); e.currentTarget.blur(); });
  speedBtn.addEventListener('click', (e) => {
    const i = SPEEDS.indexOf(state.speed);
    state.speed = SPEEDS[(i + 1) % SPEEDS.length];
    speedBtn.textContent = `${state.speed}×`;
    e.currentTarget.blur();
  });
  followBox.addEventListener('change', () => setFollow(followBox.checked));

  let wasPlaying = false;
  scrub.addEventListener('pointerdown', () => { wasPlaying = state.playing; state.playing = false; });
  const endScrub = () => { if (wasPlaying) { state.playing = true; wasPlaying = false; syncPlay(); } };
  scrub.addEventListener('pointerup', endScrub);
  scrub.addEventListener('pointercancel', endScrub);
  scrub.addEventListener('input', () => {
    const T = T0 + (Number(scrub.value) / SCRUB_MAX) * span;
    jump(playheadForCalendar(schedule, T));
    syncPlay();
  });

  document.addEventListener('keydown', (e) => {
    const tag = e.target && e.target.tagName;
    if (tag === 'SELECT' || e.metaKey || e.ctrlKey || e.altKey) return;
    switch (e.key) {
      case ' ':
        e.preventDefault();
        if (!state.playing && state.playhead >= schedule.total) jump(0);
        state.playing = !state.playing;
        break;
      case 'ArrowRight': e.preventDefault(); jump(stepTarget(schedule, state.playhead, +1)); break;
      case 'ArrowLeft': e.preventDefault(); jump(stepTarget(schedule, state.playhead, -1)); break;
      case 'End': e.preventDefault(); jump(schedule.total); state.playing = false; break;
      case 'Home': e.preventDefault(); jump(0); state.playing = true; break;
      default: return;
    }
    syncPlay();
  });

  let lastCompleted = -1;
  function update() {
    const loc = getLoc();
    const T = calendarForPlayhead(schedule, state.playhead);
    dateEl.textContent = flights.length ? formatClock(T) : '';

    let km = cum[loc.completed].km;
    const airports = airportStats(flights, loc.completed, loc.active ? loc.active.i : -1).size;
    if (loc.active) {
      const f = flights[loc.active.i];
      km += trackLengthKm(trackSlice(f.track, 0, loc.active.f));
    }
    const n = loc.completed + (loc.active ? 1 : 0);
    statsEl.textContent = `${n} flight${n === 1 ? '' : 's'} · ${formatKm(km)} · ${airports} airport${airports === 1 ? '' : 's'}`;

    if (document.activeElement !== scrub || !scrub.matches(':active')) {
      scrub.value = String(Math.round(frac(T) * SCRUB_MAX));
    }
    if (loc.completed !== lastCompleted) {
      for (let i = 0; i < ticks.length; i++) ticks[i].classList.toggle('done', i < loc.completed);
      lastCompleted = loc.completed;
    }
    followBox.checked = state.follow;
    syncPlay();
  }

  syncPlay();
  return { update };
}
```

- [ ] **Step 2: Wire it into `web/src/main.js`** — import and call:

```js
import { bindUi } from './ui.js';
```

After `state`, `schedule`, `cum`, `loc` and the interaction hooks exist:

```js
  const ui = bindUi({
    state, schedule, flights, cum,
    getLoc: () => loc,
    setFollow: (on) => { state.follow = on; },
  });
```

Call `ui.update();` once per frame in `frame()` right after `renderer.draw(...)`.

- [ ] **Step 3: Run it and check by eye**

```bash
python3 -m http.server 8000 -d web
```
Open `http://localhost:8000`. Expected:
- Top-left readout shows the date (jumping forward between trips) and a running `N flights · X km · Y airports`; the airport count matches the dots on the globe.
- Bottom bar: ⏮ restarts and plays, ⏸/▶ toggles, ⏭ jumps to the full state instantly and stops; the speed button cycles 0.5× / 1× / 2× / 4×; Follow toggles the camera; the theme dropdown works.
- Timeline: a tick per flight on the real calendar axis (trip clusters, long gaps), year labels, ticks darken as flights complete; dragging the scrubber jumps the globe (including backwards: trails disappear correctly), pauses while dragging and resumes on release if it was playing.
- Keyboard: Space, ←/→ step between flights, End, Home.
- At 375 px width (browser responsive mode) the bar wraps without horizontal scroll and touch drag/pinch work.

Run: `node --test web/test/*.test.js` → PASS.

- [ ] **Step 4: Commit**

```bash
git add web/
git commit -m "feat(web): controls, calendar timeline, readout and keyboard shortcuts" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Polish pass, README, and final verification

**Files:**
- Modify: as findings require (`web/src/render.js`, `web/src/themes.js`, `web/style.css`); `README.md`

- [ ] **Step 1: Visual pass across all three themes** at three states each: empty/start, mid-playback (around the 2013 London trips), and the full state. At each, check against the spec's open items and tune only what looks wrong:
  - Airport label rules (top three plus hovered) and dot scaling — adjust `LABEL_TOP_N`, the radius formula in `drawAirports`, or switch to a fixed size if the scaling looks off.
  - Trail alphas (`settledAlpha`, `activeAlpha`) and `LIFT` per theme; Natural must be tuned until amber trails are legible on blue without looking busy.
  - Night: no glow/outline, the black disc should fade into the page.
  Record each change in the commit message.

- [ ] **Step 2: Robustness checks**, each by hand:
  - Reload with `localStorage` blocked (a private window, or DevTools → Application → block storage): page still loads and the theme dropdown works.
  - `?theme=constructor`, `?theme=__proto__`, `?theme=NIGHT`: all fall back to Paper without errors.
  - Resize the window very small and then back: no exceptions, globe redraws.
  - Scrub across the whole timeline in both directions, then press Space at the end: restarts from the beginning.

- [ ] **Step 3: Run the full test suite**

Run: `node --test web/test/*.test.js && python3 -m unittest discover -s build -v`
Expected: all JS and Python tests PASS (Python real-export test not skipped).

- [ ] **Step 4: Confirm the data file is clean and current**

```bash
python3 build/build_data.py
git status --short web/data/flights.json
grep -c -iE "passenger|seat|testperson|Test Person|userId|aircraftReg|gate|terminal" web/data/flights.json
```
Expected: the script reports 110 flights; `git status` shows no change (the committed file is already current); `grep -c` prints `0`.

- [ ] **Step 5: Confirm there are no runtime network requests**

Open DevTools → Network, hard-reload with throttling set to Offline after the first load (or check the Network panel): every request is to `localhost`; none to a CDN. Expected: only `index.html`, `style.css`, `src/*.js`, `vendor/*`, `data/flights.json`.

- [ ] **Step 6: Update `README.md`** with a short "How it works" (data extract, privacy rules, controls and shortcuts, themes, and how to deploy: copy the `web/` folder to any static host), then commit:

```bash
git add -A
git commit -m "chore: visual polish, robustness checks and README" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage**
- Data extract fields, drops, simplification, no-track fallback, metres/times handling, sorting, privacy test → Tasks 2–3.
- Orthographic projection, drag/inertia/zoom/reset, 110m land, themes with switcher + `localStorage` + `?theme=`, alpha trails, aircraft dot with comet, altitude lift + shadow, airport dots/labels, hover/tap tooltip, sphere outline/glow rules → Tasks 7–9.
- Spec said "settled layer cached offscreen": removed in the spec (re-stroked per frame, see spec correction commit); no task builds a cache.
- Flight-sequenced clock, playhead as pure state, scrub/skip/restart on one draw path, follow camera + zoom + manual-override + re-enable, idle spin → Tasks 5, 7, 10, 11.
- Controls, calendar-axis timeline, readout, keyboard, reduced motion, phone width → Tasks 8, 10, 11.
- Testing section: Python extractor tests (Tasks 2–3), JS pure-function tests (Tasks 4–7), manual visual checks (Tasks 8–12).

**Placeholder scan:** none; every code step contains the code. The two prose-only adjustments are explicit edits with exact replacement instructions (Task 3's import hoist, Task 11's airport count).

**Type/name consistency:** `locate → {completed, active:{i,f}|null}` is used identically in `clock.js`, `main.js`, `ui.js` and `render.js` (`frame.completed`, `frame.active`). `airportStats(flights, completed, activeIndex)` matches its use in Tasks 9–11. `pointAt/trackSlice` take `[lon,lat,altM,t]` points; `trackSlice` returns `[lon,lat,altM]` triples, which `strokeLifted` and the marker code consume. Flight fields `from/to/dep/arr/track/approx/aircraft` match the extractor output; the derived `line/km/mid` come from `data.js`. `state.{playing,speed,playhead,follow,ended}` match between Tasks 10 and 11.

**Review Focus:** all five lines have pinning tests or explicit manual checks (missing times, missing altitude, antimeridian in Tasks 2–4, unsorted/zero-duration in Tasks 3 and 5, hostile theme/storage in Tasks 7–8 and 12).
