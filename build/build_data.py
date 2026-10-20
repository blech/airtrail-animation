#!/usr/bin/env python3
"""Reduce an AirTrail export to the privacy-clean flights.json used by the web page."""
import argparse
import hashlib
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

TOLERANCE_DEG = 0.03   # ~3 km; sub-pixel at default zoom (1 px ~ 16 km on a 400 px radius globe)
MAX_POINTS = 140
SYNTH_POINTS = 64
CRUISE_M = 11000.0
LUMA_LIMIT = 200      # colours lighter than this (Rec.601, 0-255) are darkened, as Dopplr's city colours were
DARKEN = 0.8

# Airports whose own municipality is not the city we want to show/colour (metro areas, nicer names)
CITY_OVERRIDES = json.loads((Path(__file__).resolve().parent / "city_names.json").read_text())


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


def parse_ts(s):
    if not s:
        return None
    dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp())


def city_rgb(name):
    """Dopplr-style city colour: first six hex digits of md5(UTF-8 name), channels x0.8 (truncated) if too light."""
    h = hashlib.md5(name.encode("utf-8")).hexdigest()[:6]
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    if 0.299 * r + 0.587 * g + 0.114 * b > LUMA_LIMIT:
        r, g, b = int(r * DARKEN), int(g * DARKEN), int(b * DARKEN)
    return "%02x%02x%02x" % (r, g, b)


def _airport(a):
    city = CITY_OVERRIDES.get(a.get("icao")) or a.get("municipality")
    return {
        "icao": a.get("icao"), "iata": a.get("iata"), "city": city, "rgb": city_rgb(city) if city else None,
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


def _fill_altitudes(alts, cum, total):
    """Fill missing (None) altitudes. Gaps between real values are interpolated by distance, gaps at the
    ends take the nearest real value; a track with no altitudes at all gets the trapezoid profile."""
    known = [i for i, a in enumerate(alts) if a is not None]
    if not known:
        cruise = cruise_for_km(total)
        return [altitude_profile(c / total, cruise) for c in cum]
    out = list(alts)
    for i, a in enumerate(alts):
        if a is not None:
            continue
        before = [k for k in known if k < i]
        after = [k for k in known if k > i]
        if not before:
            out[i] = alts[after[0]]
        elif not after:
            out[i] = alts[before[-1]]
        else:
            lo, hi = before[-1], after[0]
            span = cum[hi] - cum[lo]
            u = (cum[i] - cum[lo]) / span if span > 0 else 0.0
            out[i] = alts[lo] + (alts[hi] - alts[lo]) * u
    return out


def _track_from_coordinates(f, dep, arr):
    t = f["track"]
    coords = t["coordinates"]
    times = t.get("times") or []
    has_times = len(times) == len(coords)
    lonlat = [(c[0], c[1]) for c in coords]
    cum = _cumulative_km(lonlat)
    total = cum[-1] or 1.0
    approx = False
    # airports below sea level report < 0
    raw_alts = [max(0.0, c[2]) if len(c) > 2 and c[2] is not None else None for c in coords]
    alts = _fill_altitudes(raw_alts, cum, total)
    if all(a is None for a in raw_alts):
        approx = True
    pts = []
    for i, c in enumerate(coords):
        tt = times[i] if has_times else None
        pts.append((c[0], c[1], alts[i], tt, cum[i] / total))
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
    ap.add_argument("--input", default=str(root.parent / "airtrail" / "airtrail.json"))
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
