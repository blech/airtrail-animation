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
