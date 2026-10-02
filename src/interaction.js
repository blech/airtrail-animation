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
