export const ZMIN = 0.8;
export const ZMAX = 4;

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function defaultView() {
  return { rot: [100, -30], zoom: 1, followZoom: 1, vel: [0, 0], dragging: false };
}

const wrap180 = (d) => ((d + 540) % 360) - 180;

export function easeAngle(cur, target, dt, tau) {
  const diff = wrap180(target - cur);
  if (Math.abs(diff) < 0.005) return target; // close enough: land exactly (same direction mod 360) so the globe is truly still
  const k = 1 - Math.exp(-dt / tau);
  return cur + diff * k;
}

export function easeToward(cur, target, dt, tau, eps = 0.001) {
  if (Math.abs(target - cur) < eps) return target;
  return cur + (target - cur) * (1 - Math.exp(-dt / tau));
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
  view.followZoom = easeToward(view.followZoom, zoomForKm(target.km), dt, 0.8);
}

const MIN_FLICK_DEG_PER_S = 25;

// Momentum only carries after a real flick; a slow, deliberate drag stops dead where it was released.
export function releaseVelocity(vel, minSpeed = MIN_FLICK_DEG_PER_S) {
  return Math.hypot(vel[0], vel[1]) >= minSpeed ? [vel[0], vel[1]] : [0, 0];
}
