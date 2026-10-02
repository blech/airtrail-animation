const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
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

// Date line: the flight's own (local departure) date, or the whole span when stopped at the very start/end.
export function dateLabel(flights, cur, showRange) {
  if (!flights.length) return '';
  if (showRange) return `${formatDate(flights[0].date)} – ${formatDate(flights[flights.length - 1].date)}`;
  return formatDate(flights[cur >= 0 ? cur : 0].date);
}
