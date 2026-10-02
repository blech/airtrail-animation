const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function formatClock(unixSeconds) {
  const d = new Date(unixSeconds * 1000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatKm(n) {
  return `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} km`;
}

export function iataOf(airport) {
  return airport.iata || airport.icao;
}

export function formatFlight(f) {
  const parts = [f.flightNumber, formatDate(f.date), `${iataOf(f.from)} → ${iataOf(f.to)}`];
  if (f.aircraft && f.aircraft.name) parts.push(f.aircraft.name);
  return parts.join(' · ');
}
