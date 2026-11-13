import { summarise, yearsOf, flagEmoji } from './summary-logic.js';
import { formatKm } from '../src/format.js';

// Needs d3-array, d3-geo and topojson-client loaded as globals (see index.html).
const SVG = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, text) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text !== undefined) n.textContent = text;
  return n;
};
const names = new Intl.DisplayNames(['en'], { type: 'region' });

export async function mountSummary(root, { flightsUrl = '../data/flights.json', landUrl = '../vendor/land-110m.json' } = {}) {
  const [{ flights }, topo] = await Promise.all([
    fetch(flightsUrl).then((r) => r.json()),
    fetch(landUrl).then((r) => r.json()),
  ]);
  const land = window.topojson.feature(topo, topo.objects.land);
  const years = yearsOf(flights);
  let period = 'all';
  let country = null;

  root.classList.add('fs-card');
  root.replaceChildren();
  const tabs = el('div', { class: 'fs-tabs', role: 'tablist' });
  const stats = el('dl', { class: 'fs-stats' });
  const map = document.createElementNS(SVG, 'svg');
  map.setAttribute('viewBox', '0 0 1000 500');
  map.setAttribute('class', 'fs-map');
  map.setAttribute('role', 'img');
  const flagsRow = el('div', { class: 'fs-flags' });
  const airlinesRow = el('ul', { class: 'fs-airlines' });
  root.append(tabs, stats, map, flagsRow, airlinesRow);

  // Equirectangular like a flat atlas; d3 splits arcs at the antimeridian for us.
  const projection = window.d3.geoEquirectangular().fitExtent([[0, 0], [1000, 500]], { type: 'Sphere' });
  const path = window.d3.geoPath(projection);
  const svgPath = (cls, d) => {
    const p = document.createElementNS(SVG, 'path');
    p.setAttribute('class', cls);
    p.setAttribute('d', d);
    return p;
  };

  function render() {
    const s = summarise(flights, period);
    tabs.replaceChildren(...['all', ...years].map((y) => {
      const b = el('button', { type: 'button', role: 'tab', 'aria-selected': String(y === period) }, y === 'all' ? 'All' : y);
      b.addEventListener('click', () => { period = y; country = null; render(); });
      return b;
    }));
    stats.replaceChildren(...[
      ['Flights', s.flights], ['Airports', s.airports.length],
      ['Countries', s.countries.length], ['Distance', formatKm(s.km)],
    ].map(([k, v]) => {
      const d = el('div');
      d.append(el('dt', {}, k), el('dd', {}, String(v)));
      return d;
    }));

    const g = [svgPath('fs-land', path(land))];
    for (const r of s.routes) {
      const line = { type: 'LineString', coordinates: [[r.from.lon, r.from.lat], [r.to.lon, r.to.lat]] };
      const p = svgPath('fs-route', path(line));
      const hot = country && (r.from.country === country || r.to.country === country);
      if (country) p.classList.add(hot ? 'fs-hot' : 'fs-dim');
      g.push(p);
    }
    for (const a of s.airports) {
      const [x, y] = projection([a.lon, a.lat]);
      const c = document.createElementNS(SVG, 'circle');
      c.setAttribute('class', 'fs-airport');
      c.setAttribute('cx', x.toFixed(1)); c.setAttribute('cy', y.toFixed(1)); c.setAttribute('r', '3.2');
      const t = document.createElementNS(SVG, 'title');
      t.textContent = `${a.iata || a.icao} · ${a.city || a.name}`;
      c.append(t);
      g.push(c);
    }
    map.replaceChildren(...g);
    map.setAttribute('aria-label', `Route map: ${s.flights} flights, ${s.airports.length} airports`);

    flagsRow.replaceChildren(...s.countries.map((code) => {
      const b = el('button', { type: 'button', title: names.of(code) || code, 'aria-pressed': String(code === country) }, flagEmoji(code) || code);
      b.addEventListener('click', () => { country = country === code ? null : code; render(); });
      return b;
    }));
    airlinesRow.replaceChildren(...s.airlines.map((a) => el('li', {}, `${a.name} · ${a.n}`)));
  }
  render();
}
