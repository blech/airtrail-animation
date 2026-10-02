import { trackSlice, distPointSegment } from './geo.js';

const CRUISE_M = 11000;
const LIFT = 0.025;          // fraction of radius at cruise altitude
const RECENT_FLIGHTS = 4;    // how many recently completed flights fade from strong to settled
const lerp = (a, b, f) => a + (b - a) * f;

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

  trackOf(f, gc) { return gc ? f.gcTrack : f.track; }

  lineOf(f, gc) { return gc ? f.gcLine : f.line; }

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
      this.path(this.lineOf(flights[i], frame.gc));
      ctx.strokeStyle = rgba(a);
      ctx.lineWidth = age < RECENT_FLIGHTS ? 1.3 : 1;
      ctx.stroke();
    }

    if (frame.hover >= 0 && frame.hover < frame.completed) {
      ctx.beginPath();
      this.path(this.lineOf(flights[frame.hover], frame.gc));
      ctx.strokeStyle = rgba(1);
      ctx.lineWidth = 2.4;
      ctx.stroke();
    }

    if (frame.active) {
      const f = flights[frame.active.i];
      const fr = frame.active.f;
      const track = this.trackOf(f, frame.gc);
      this.strokeLifted(trackSlice(track, 0, fr), rgba(t.activeAlpha * 0.7), 1.6);
      const comet = trackSlice(track, Math.max(0, fr - 0.08), fr);
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

  drawAirports(airports, labels, ring) {
    const { ctx, theme: t } = this;
    ctx.font = '11px -apple-system, system-ui, sans-serif';
    ctx.textBaseline = 'alphabetic';
    const label = (a, s) => {
      ctx.fillStyle = t.ui.fg;
      ctx.fillText(a.iata || a.icao, s[0] + 7, s[1] - 7);
    };
    if (airports) {
      for (const { airport, n } of airports.values()) {
        const s = this.liftScreen(airport.lon, airport.lat, 0);
        if (!s) continue;
        ctx.fillStyle = t.dot;
        ctx.beginPath();
        ctx.arc(s[0], s[1], 1.8 + 0.9 * Math.sqrt(n), 0, Math.PI * 2);
        ctx.fill();
        if (labels.has(airport.icao)) label(airport, s);
      }
    }
    if (ring) {
      const s = this.liftScreen(ring.lon, ring.lat, 0);
      if (s) {
        ctx.strokeStyle = t.dot;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(s[0], s[1], 4.5, 0, Math.PI * 2);
        ctx.stroke();
        if (labels.has(ring.icao)) label(ring, s);
      }
    }
  }

  hitTest(x, y, flights, completed, gc, maxPx = 6) {
    let best = -1;
    let bestD = maxPx;
    for (let i = 0; i < completed; i++) {
      const pts = this.trackOf(flights[i], gc);
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

    if (flights && flights.length) {
      this.drawFlights(flights, frame);
      this.drawAirports(frame.airports, frame.labels || new Set(), frame.ring || null);
    }
  }
}
