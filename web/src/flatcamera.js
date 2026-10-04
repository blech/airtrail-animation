import { clamp, easeToward } from './camera.js';

// Flat-map camera. The view keeps the globe's shape ({ rot, zoom, followZoom, vel, dragging }) so the shared
// pointer handling works unchanged, but rot is a pan rather than a rotation: the planar point at the centre
// of the screen, in unit-scale projected coordinates times 180/pi ("degrees" at the equator), with x negated.

const DEG = 180 / Math.PI;

export function defaultFlatView() {
  return { rot: [0, 0], zoom: 1, followZoom: 1, vel: [0, 0], dragging: false };
}

// planar [x, y] of a unit-scale, untranslated projection -> pan
export const panFor = (xy) => [-xy[0] * DEG, xy[1] * DEG];

// screen centre in unit-scale planar coordinates
export const centreOf = (rot) => [-rot[0] / DEG, rot[1] / DEG];

// 2.5x on short hops easing to 1x (whole world) on long hauls
export function flatZoomForKm(km) {
  return clamp(2.5 - ((km - 500) * 1.5) / 7500, 1, 2.5);
}

export function flatFollowStep(view, targetPan, km, dt) {
  view.rot[0] = easeToward(view.rot[0], targetPan[0], dt, 0.5, 0.005);
  view.rot[1] = easeToward(view.rot[1], targetPan[1], dt, 0.5, 0.005);
  view.followZoom = easeToward(view.followZoom, flatZoomForKm(km), dt, 0.8);
}

// keep the screen centre over the map: limits are the map's half-width/height in pan units
export function clampPan(view, halfW, halfH) {
  view.rot[0] = clamp(view.rot[0], -halfW, halfW);
  view.rot[1] = clamp(view.rot[1], -halfH, halfH);
}
