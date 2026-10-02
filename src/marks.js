import { currentIndex } from './stats.js';

// How airports are marked with their city colour (?marks=...):
//   current - rings on the two airports of the current flight (default)
//   all     - rings on every airport reached so far
//   dots    - the airport dots themselves take the city colour
export const MARKS = ['current', 'all', 'dots'];
export const DEFAULT_MARKS = 'current';

export function resolveMarks(search) {
  const q = new URLSearchParams(search || '').get('marks');
  return MARKS.includes(q) ? q : DEFAULT_MARKS;
}

// The airports that get a ring this frame. The destination of a flight in the air is always ringed
// (it has no dot until the flight lands).
export function ringAirports(mode, flights, loc, airports) {
  const out = new Map();
  const add = (a) => out.set(a.icao, a);
  if (mode === 'all') for (const { airport } of airports.values()) add(airport);
  const cur = currentIndex(loc, flights.length);
  if (cur >= 0) {
    const f = flights[cur];
    if (mode === 'current') { add(f.from); add(f.to); } else if (loc.active) add(f.to);
  }
  return [...out.values()];
}

// The "Show city colours" checkbox: checked = coloured dots, unchecked = the default rings.
export const marksFromToggle = (checked) => (checked ? 'dots' : DEFAULT_MARKS);
export const coloursOn = (mode) => mode === 'dots';
