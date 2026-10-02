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

export function formatFlightLines(f) {
  const line1 = [f.flightNumber, formatDate(f.date), `${iataOf(f.from)} → ${iataOf(f.to)}`].join(' · ');
  const distance = `${formatKm(f.km)} flown (${formatKm(f.gcKm)} great circle)`;
  const line2 = f.aircraft && f.aircraft.name ? `${f.aircraft.name} · ${distance}` : distance;
  return [line1, line2];
}

export function flightBlurb(f) {
  const subtitle = [f.airline, f.aircraft && f.aircraft.name].filter(Boolean).join(' · ');
  return { title: f.flightNumber, subtitle };
}
