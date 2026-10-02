import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GAP_S, flightSeconds, buildSchedule, locate, calendarForPlayhead,
  playheadForCalendar, calendarRange, stepTarget,
} from '../src/clock.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);
const H = 3600;
const DAY = 86400;
const FLIGHTS = [
  { dep: 0, arr: 1 * H },              // 1 h
  { dep: 10 * DAY, arr: 10 * DAY + 10 * H }, // 10 h
  { dep: 20 * DAY, arr: 20 * DAY },    // zero duration (bad data)
];

test('flightSeconds scales with duration and clamps', () => {
  near(flightSeconds(1 * H), 1.21);
  near(flightSeconds(10 * H), 4.0);
  assert.equal(flightSeconds(0), 1);
  assert.equal(flightSeconds(-500), 1);
  assert.equal(flightSeconds(40 * H), 5);
});

test('buildSchedule lays flights end to end with gaps', () => {
  const s = buildSchedule(FLIGHTS);
  assert.equal(s.segments.length, 3);
  near(s.segments[0].start, 0);
  near(s.segments[1].start, 1.21 + GAP_S);
  near(s.total, 1.21 + 4.0 + 1.0 + 2 * GAP_S);
  assert.deepEqual(buildSchedule([]), { segments: [], total: 0 });
});

test('locate: active, gap, ended, out of range', () => {
  const s = buildSchedule(FLIGHTS);
  let l = locate(s, 0.5);
  assert.equal(l.completed, 0);
  assert.equal(l.active.i, 0);
  near(l.active.f, 0.5 / 1.21);
  l = locate(s, 1.3); // inside the gap after flight 0
  assert.deepEqual(l, { completed: 1, active: null });
  l = locate(s, s.total);
  assert.deepEqual(l, { completed: 3, active: null });
  assert.deepEqual(locate(s, 999), { completed: 3, active: null });
  assert.equal(locate(s, -5).completed, 0);
  assert.equal(locate(s, -5).active.f, 0);
});

test('calendar mapping round-trips inside a flight', () => {
  const s = buildSchedule(FLIGHTS);
  const p = s.segments[1].start + 2.0;
  const T = calendarForPlayhead(s, p);
  assert.ok(T > 10 * DAY && T < 10 * DAY + 10 * H);
  near(playheadForCalendar(s, T), p, 1e-6);
});

test('calendar mapping is monotone and finite, including gaps and zero-length flights', () => {
  const s = buildSchedule(FLIGHTS);
  let prev = -Infinity;
  for (let p = 0; p <= s.total; p += 0.05) {
    const T = calendarForPlayhead(s, p);
    assert.ok(Number.isFinite(T));
    assert.ok(T >= prev, `calendar went backwards at p=${p}`);
    prev = T;
  }
  const z = playheadForCalendar(s, 20 * DAY);
  assert.ok(Number.isFinite(z));
  near(z, s.segments[2].start + s.segments[2].dur);
});

test('playheadForCalendar clamps before the first and after the last flight', () => {
  const s = buildSchedule(FLIGHTS);
  assert.equal(playheadForCalendar(s, -1e9), 0);
  near(playheadForCalendar(s, 1e12), s.segments[2].start + s.segments[2].dur);
});

test('calendarRange', () => {
  assert.deepEqual(calendarRange(buildSchedule(FLIGHTS)), [0, 20 * DAY]);
});

test('stepTarget moves between flight starts', () => {
  const s = buildSchedule(FLIGHTS);
  const [a, b, c] = s.segments.map((x) => x.start);
  assert.equal(stepTarget(s, 0, +1), b);
  assert.equal(stepTarget(s, b, +1), c);
  assert.equal(stepTarget(s, c, +1), s.total);
  assert.equal(stepTarget(s, c + 0.5, -1), c);   // mid-flight: restart this flight
  assert.equal(stepTarget(s, c + 0.1, -1), b);   // just after start: previous flight
  assert.equal(stepTarget(s, a, -1), 0);
});
