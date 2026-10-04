import { distPointSegment } from './geo.js';
import { GlobeRenderer } from './render.js';
import { centreOf } from './flatcamera.js';

const CRUISE_M = 11000;
const AIR_PX = 5;            // screen-space height of the plane dot above its shadow at cruise
const JUMP = 0.25;           // a step longer than this (in projection radii) crosses an interruption

// Same drawing as the globe, on an interrupted Goode homolosine (`projection` is a factory for it, clipped
// at the interruptions: see main-flat.js). Everything is always on the map, so there's
// no far side to hide and no radial lift; the only thing to watch for is lines crossing an interruption.
export class FlatRenderer extends GlobeRenderer {
  constructor(canvas, land, projection) {
    super(canvas, land);
    this.proj = projection().precision(0.3);
    this.path = window.d3.geoPath(this.proj, this.ctx);
    this.unit = projection().scale(1).translate([0, 0]);
    const [[x0, y0], [x1, y1]] = window.d3.geoPath(this.unit).bounds({ type: 'Sphere' });
    this.unitW = x1 - x0;
    this.unitH = y1 - y0;
  }

  // the map area: clear of the header at the top and the control bar at the bottom
  frameBox() {
    const top = Math.min(90, this.h * 0.12);
    const bottom = this.h - Math.min(120, this.h * 0.2);
    return { top, bottom, cx: this.w / 2, cy: (top + bottom) / 2 };
  }

  baseRadius() {
    const { top, bottom } = this.frameBox();
    return Math.min((this.w - 32) / this.unitW, (bottom - top) / this.unitH);
  }

  // pan limits in view.rot units: half the map's extent
  panLimits() { return [(this.unitW / 2) * 57.2958, (this.unitH / 2) * 57.2958]; }

  planar(lon, lat) { return this.unit([lon, lat]); }

  visible() { return true; }

  liftScreen(lon, lat, altM) {
    const p = this.proj([lon, lat]);
    if (!p) return null;
    return [p[0], p[1] - AIR_PX * Math.min(1, Math.max(0, (altM || 0) / CRUISE_M))];
  }

  // stroke via geoPath so the projection's own clipping splits lines at the interruptions
  strokeLifted(points, rgba, width) {
    if (points.length < 2) return;
    const { ctx } = this;
    ctx.strokeStyle = rgba;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    this.path({ type: 'LineString', coordinates: points.map((p) => [p[0], p[1]]) });
    ctx.stroke();
  }

  hitTest(x, y, flights, completed, gc, maxPx = 6) {
    let best = -1;
    let bestD = maxPx;
    const jump = this.R * JUMP;
    for (let i = 0; i < completed; i++) {
      const pts = this.trackOf(flights[i], gc);
      let prev = null;
      for (const p of pts) {
        const s = this.proj([p[0], p[1]]);
        if (s && prev && Math.hypot(s[0] - prev[0], s[1] - prev[1]) < jump) {
          const d = distPointSegment([x, y], prev, s);
          if (d < bestD) { bestD = d; best = i; }
        }
        prev = s;
      }
    }
    return best;
  }

  draw(view, flights, frame) {
    const { ctx, theme: t } = this;
    const R = this.baseRadius() * view.zoom * view.followZoom;
    const { cx, cy } = this.frameBox();
    const c = centreOf(view.rot);
    this.cx = cx;
    this.cy = cy;
    this.R = R;
    this.proj.scale(R).translate([cx - R * c[0], cy - R * c[1]]);

    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, this.w, this.h);

    ctx.save();
    if (t.glow) {
      ctx.shadowColor = t.glow;
      ctx.shadowBlur = 18;
    }
    ctx.beginPath();
    this.path({ type: 'Sphere' });
    ctx.fillStyle = t.ocean;
    ctx.fill();
    ctx.restore();

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

    if (flights && flights.length) {
      this.drawFlights(flights, frame);
      this.drawAirports(frame.airports, frame.labels || new Set(), frame.rings || [], frame.marks);
    }
  }
}
