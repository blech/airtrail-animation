import { trackLengthKm, midpoint } from './geo.js';

export async function loadFlights(url = 'data/flights.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url}: ${res.status}`);
  const { flights } = await res.json();
  for (const f of flights) {
    f.line = { type: 'LineString', coordinates: f.track.map((p) => [p[0], p[1]]) };
    f.km = trackLengthKm(f.track);
    f.mid = midpoint([f.from.lon, f.from.lat], [f.to.lon, f.to.lat]);
  }
  return flights;
}

export async function loadLand(url = 'vendor/land-110m.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url}: ${res.status}`);
  const topo = await res.json();
  return window.topojson.feature(topo, topo.objects.land);
}
