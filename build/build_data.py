#!/usr/bin/env python3
"""Reduce an AirTrail export to the privacy-clean flights.json used by the web page."""
import argparse
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

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
