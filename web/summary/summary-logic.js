import { trackLengthKm } from '../src/geo.js';

// Distinct years present in the data, newest first.
export function yearsOf(flights) {
  return [...new Set(flights.map((f) => f.date.slice(0, 4)))].sort().reverse();
}

// Everything the summary card shows for one period ('all' or a 4-digit year).
export function summarise(flights, period = 'all') {
  const sel = flights
    .filter((f) => period === 'all' || f.date.startsWith(period))
    .sort((a, b) => a.date.localeCompare(b.date));

  const airports = new Map();
  const countries = [];
  const routes = new Map();
  const airlines = new Map();
  let km = 0;

  for (const f of sel) {
    km += trackLengthKm(f.track);
    for (const a of [f.from, f.to]) {
      airports.set(a.icao, a);
      if (a.country && !countries.includes(a.country)) countries.push(a.country); // first-visit order
    }
    const key = [f.from.icao, f.to.icao].sort().join(':');
    const r = routes.get(key) || { from: f.from, to: f.to, n: 0 };
    r.n += 1;
    routes.set(key, r);
    if (f.airline) airlines.set(f.airline, (airlines.get(f.airline) || 0) + 1);
  }

  return {
    flights: sel.length,
    airports: [...airports.values()],
    countries,
    km,
    routes: [...routes.values()],
    airlines: [...airlines].map(([name, n]) => ({ name, n }))
      .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)),
  };
}

// Regional-indicator pair; renders as a flag on most platforms, else as the letters.
export function flagEmoji(code) {
  return /^[A-Z]{2}$/.test(code)
    ? String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
    : '';
}
