import { trackLengthKm } from './geo.js';

export function computeStats(flights) {
  const cum = [{ flights: 0, km: 0, airports: 0 }];
  const seen = new Set();
  let km = 0;
  flights.forEach((f, i) => {
    km += trackLengthKm(f.track);
    seen.add(f.from.icao);
    seen.add(f.to.icao);
    cum.push({ flights: i + 1, km, airports: seen.size });
  });
  return cum;
}

export function airportStats(flights, completed, activeIndex) {
  const m = new Map();
  const bump = (a) => {
    const e = m.get(a.icao);
    if (e) e.n += 1; else m.set(a.icao, { airport: a, n: 1 });
  };
  for (let i = 0; i < completed; i++) {
    bump(flights[i].from);
    bump(flights[i].to);
  }
  if (activeIndex >= 0) bump(flights[activeIndex].from);
  return m;
}

// The flight in the air, else the one that just landed (during the gap after it), else -1
// (before the first flight, at the full state, or with no flights).
export function currentIndex(loc, n) {
  if (loc.active) return loc.active.i;
  return loc.completed > 0 && loc.completed < n ? loc.completed - 1 : -1;
}

// Which airports get labels: the current flight's two airports during playback; the busiest few when
// there is no current flight; plus the two airports of a hovered flight.
export function airportLabels(flights, loc, airports, hoverIdx, topN = 3) {
  const labels = new Set();
  const cur = currentIndex(loc, flights.length);
  if (cur >= 0) {
    labels.add(flights[cur].from.icao);
    labels.add(flights[cur].to.icao);
  } else {
    const ranked = [...airports.values()].sort((a, b) => b.n - a.n);
    for (const e of ranked.slice(0, topN)) labels.add(e.airport.icao);
  }
  if (hoverIdx >= 0 && hoverIdx < flights.length) {
    labels.add(flights[hoverIdx].from.icao);
    labels.add(flights[hoverIdx].to.icao);
  }
  return { labels };
}
