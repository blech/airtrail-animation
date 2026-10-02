import { THEMES, THEME_ORDER, resolveTheme } from './themes.js';
import { defaultView, followStep } from './camera.js';
import { loadFlights, loadLand } from './data.js';
import { airportStats, computeStats } from './stats.js';
import { buildSchedule, locate } from './clock.js';
import { formatFlight } from './format.js';
import { GlobeRenderer } from './render.js';
import { attachInteraction, applyInertia } from './interaction.js';
import { bindUi } from './ui.js';

const STORAGE_KEY = 'flightglobe.theme';

function readStored() {
  try { return window.localStorage.getItem(STORAGE_KEY); } catch { return null; }
}
function writeStored(v) {
  try { window.localStorage.setItem(STORAGE_KEY, v); } catch { /* storage unavailable: ignore */ }
}

function applyTheme(id, renderer) {
  const t = THEMES[id];
  renderer.setTheme(t);
  const root = document.documentElement.style;
  root.setProperty('--bg', t.bg);
  root.setProperty('--fg', t.ui.fg);
  root.setProperty('--muted', t.ui.muted);
  root.setProperty('--panel', t.ui.panel);
  root.setProperty('--accent', t.ui.accent);
}

async function main() {
  const canvas = document.getElementById('globe');
  const [land, flights] = await Promise.all([loadLand(), loadFlights()]);
  const renderer = new GlobeRenderer(canvas, land);
  const view = defaultView();

  const select = document.getElementById('theme');
  for (const id of THEME_ORDER) {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = THEMES[id].label;
    select.appendChild(o);
  }
  let themeId = resolveTheme(window.location.search, readStored());
  select.value = themeId;
  applyTheme(themeId, renderer);
  select.addEventListener('change', () => {
    themeId = select.value;
    applyTheme(themeId, renderer);
    writeStored(themeId);
  });

  const schedule = buildSchedule(flights);
  const cum = computeStats(flights);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state = {
    playing: !reduced,
    speed: 1,
    playhead: reduced ? schedule.total : 0,
    follow: true,
    ended: reduced,
  };
  let loc = locate(schedule, state.playhead);
  const IDLE_SPIN_DEG_PER_S = 4;

  const tooltip = document.getElementById('tooltip');
  let hover = -1;

  function showTooltip(idx, x, y) {
    hover = idx;
    if (idx < 0) { tooltip.hidden = true; return; }
    tooltip.textContent = formatFlight(flights[idx]);
    tooltip.hidden = false;
    const w = tooltip.offsetWidth;
    tooltip.style.left = `${Math.min(window.innerWidth - w - 8, Math.max(8, x + 12))}px`;
    tooltip.style.top = `${Math.max(8, y - 36)}px`;
  }

  attachInteraction(canvas, view, {
    degPerPx: () => 57.2958 / (renderer.baseRadius() * view.zoom * view.followZoom),
    onUserMove() { state.follow = false; showTooltip(-1, 0, 0); },
    onTap(x, y) { showTooltip(renderer.hitTest(x, y, flights, loc.completed), x, y); },
    onHover(x, y) { showTooltip(renderer.hitTest(x, y, flights, loc.completed), x, y); },
    onReset() { Object.assign(view, defaultView()); state.follow = true; },
  });

  const ui = bindUi({
    state, schedule, flights, cum,
    getLoc: () => loc,
    setFollow: (on) => { state.follow = on; },
  });

  window.addEventListener('resize', () => renderer.resize());
  renderer.resize();

  function followTarget(l) {
    const i = l.active ? l.active.i : l.completed - 1;
    if (i < 0) return null;
    const f = flights[i];
    return { lon: f.mid[0], lat: f.mid[1], km: f.km };
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    if (state.playing) {
      state.playhead += dt * state.speed;
      if (state.playhead >= schedule.total) {
        state.playhead = schedule.total;
        state.playing = false;
      }
    }
    state.ended = state.playhead >= schedule.total;
    loc = locate(schedule, state.playhead);

    applyInertia(view, dt);
    if (state.follow && !view.dragging && !state.ended) {
      const target = followTarget(loc);
      if (target) followStep(view, target, dt);
    } else if (state.ended && !view.dragging && Math.abs(view.vel[0]) < 0.05) {
      view.rot[0] += IDLE_SPIN_DEG_PER_S * dt;
      view.followZoom += (1 - view.followZoom) * (1 - Math.exp(-dt / 0.8));
    } else if (!state.follow) {
      view.followZoom += (1 - view.followZoom) * (1 - Math.exp(-dt / 0.3));
    }

    const airports = airportStats(flights, loc.completed, loc.active ? loc.active.i : -1);
    renderer.draw(view, flights, { completed: loc.completed, active: loc.active, airports, hover });
    ui.update();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((err) => {
  document.body.textContent = `Could not start: ${err.message}`;
  console.error(err);
});
