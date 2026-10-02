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
