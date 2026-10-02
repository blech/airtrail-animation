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

const CRUISE_M = 11000;

// Climb over the first 15%, cruise, descend over the last 15%. Mirrors build/build_data.py.
export function altitudeProfile(frac, cruiseM = CRUISE_M) {
  return Math.round(Math.max(0, cruiseM * Math.min(1, frac / 0.15, (1 - frac) / 0.15)));
}

export function cruiseForKm(km) {
  return Math.min(CRUISE_M, 2500 + 9 * km);
}

// Synthetic [lon, lat, altM, t] track along the great circle a -> b, timed linearly from dep to arr.
export function greatCircleTrack(a, b, dep, arr, n = 64) {
  const la1 = rad(a[1]);
  const lo1 = rad(a[0]);
  const la2 = rad(b[1]);
  const lo2 = rad(b[0]);
  const d = 2 * Math.asin(Math.min(1, Math.sqrt(
    Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2,
  )));
  const sinD = Math.sin(d);
  const degenerate = Math.abs(sinD) < 1e-9; // identical or antipodal: no unique arc
  const cruise = cruiseForKm(d * R_KM);
  const out = [];
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    let lon = a[0];
    let lat = a[1];
    if (!degenerate) {
      const A = Math.sin((1 - f) * d) / sinD;
      const B = Math.sin(f * d) / sinD;
      const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
      const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
      const z = A * Math.sin(la1) + B * Math.sin(la2);
      lon = deg(Math.atan2(y, x));
      lat = deg(Math.atan2(z, Math.hypot(x, y)));
    }
    out.push([lon, lat, altitudeProfile(f, cruise), dep + f * (arr - dep)]);
  }
  return out;
}
