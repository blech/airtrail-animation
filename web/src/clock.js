export const GAP_S = 0.15;

export function flightSeconds(durationS) {
  const hours = Math.max(0, durationS) / 3600;
  return Math.min(5, Math.max(1, 0.9 + 0.31 * hours));
}

export function buildSchedule(flights) {
  const segments = [];
  let t = 0;
  flights.forEach((f, i) => {
    const dur = flightSeconds(f.arr - f.dep);
    segments.push({ i, start: t, dur, dep: f.dep, arr: f.arr });
    t += dur + GAP_S;
  });
  return { segments, total: Math.max(0, t - GAP_S) };
}

export function locate(schedule, p) {
  const { segments, total } = schedule;
  if (p >= total) return { completed: segments.length, active: null };
  const pp = Math.max(0, p);
  for (const s of segments) {
    if (pp < s.start) return { completed: s.i, active: null };
    if (pp < s.start + s.dur) return { completed: s.i, active: { i: s.i, f: (pp - s.start) / s.dur } };
  }
  return { completed: segments.length, active: null };
}

export function calendarForPlayhead(schedule, p) {
  const { segments } = schedule;
  if (!segments.length) return 0;
  const { completed, active } = locate(schedule, p);
  if (active) {
    const s = segments[active.i];
    return s.dep + active.f * (s.arr - s.dep);
  }
  if (completed === 0) return segments[0].dep;
  return segments[completed - 1].arr;
}

export function playheadForCalendar(schedule, T) {
  const { segments } = schedule;
  let found = null;
  for (const s of segments) {
    if (s.dep <= T) found = s; else break;
  }
  if (!found) return 0;
  const span = found.arr - found.dep;
  const f = span > 0 ? Math.min(1, Math.max(0, (T - found.dep) / span)) : 1;
  return found.start + f * found.dur;
}

export function calendarRange(schedule) {
  const { segments } = schedule;
  if (!segments.length) return [0, 0];
  return [segments[0].dep, segments[segments.length - 1].arr];
}

export function stepTarget(schedule, p, dir) {
  const { segments, total } = schedule;
  if (dir > 0) {
    for (const s of segments) if (s.start > p + 1e-6) return s.start;
    return total;
  }
  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i].start < p - 0.3) return segments[i].start;
  }
  return 0;
}

// Jan 1 year labels on the calendar axis as fractions [0,1], thinned so neighbours are >= minGapFrac apart.
export function yearTicks(T0, T1, minGapFrac) {
  const span = T1 - T0;
  if (!(span > 0)) return [];
  const out = [];
  const y1 = new Date(T1 * 1000).getUTCFullYear();
  for (let y = new Date(T0 * 1000).getUTCFullYear(); y <= y1; y++) {
    const at = Date.UTC(y, 0, 1) / 1000;
    if (at < T0 || at > T1) continue;
    const f = (at - T0) / span;
    if (!out.length || f - out[out.length - 1].f >= minGapFrac - 1e-9) out.push({ year: y, f });
  }
  return out;
}
