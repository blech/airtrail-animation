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
  // 1.4x on short hops easing to 1x on long hauls; capped so the globe stays clear of the controls
  return clamp(1.4 - ((km - 500) * 0.4) / 7500, 1, 1.4);
}

export function followStep(view, target, dt) {
  const [tl, tp] = rotationFor(target.lon, target.lat);
  view.rot[0] = easeAngle(view.rot[0], tl, dt, 0.5);
  view.rot[1] = easeAngle(view.rot[1], tp, dt, 0.5);
  view.followZoom += (zoomForKm(target.km) - view.followZoom) * (1 - Math.exp(-dt / 0.8));
}
