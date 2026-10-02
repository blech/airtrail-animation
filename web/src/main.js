import { THEMES, THEME_ORDER, resolveTheme } from './themes.js';
import { defaultView } from './camera.js';
import { loadLand } from './data.js';
import { GlobeRenderer } from './render.js';
import { attachInteraction, applyInertia } from './interaction.js';

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
  const land = await loadLand();
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

  attachInteraction(canvas, view, {
    degPerPx: () => 57.2958 / (renderer.baseRadius() * view.zoom * view.followZoom),
    onUserMove() {},
    onTap() {},
    onHover() {},
    onReset() { Object.assign(view, defaultView()); },
  });

  window.addEventListener('resize', () => renderer.resize());
  renderer.resize();

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    applyInertia(view, dt);
    renderer.draw(view, [], { completed: 0, active: null, airports: null, hover: -1 });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((err) => {
  document.body.textContent = `Could not start: ${err.message}`;
  console.error(err);
});
