import { trackLengthKm, midpoint, haversineKm, greatCircleTrack } from './geo.js';

export async function loadFlights(url = 'data/flights.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url}: ${res.status}`);
  const { flights } = await res.json();
  for (const f of flights) {
    f.line = { type: 'LineString', coordinates: f.track.map((p) => [p[0], p[1]]) };
    f.km = trackLengthKm(f.track);
    const a = [f.from.lon, f.from.lat];
    const b = [f.to.lon, f.to.lat];
    f.mid = midpoint(a, b);
    // great-circle alternative to the recorded track, same timing; used by the route toggle
    f.gcKm = haversineKm(a, b);
    f.gcTrack = greatCircleTrack(a, b, f.dep, f.arr);
    f.gcLine = { type: 'LineString', coordinates: [a, b] };
  }
  return flights;
}

export async function loadLand(url = 'vendor/land-110m.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url}: ${res.status}`);
  const topo = await res.json();
  return window.topojson.feature(topo, topo.objects.land);
}
