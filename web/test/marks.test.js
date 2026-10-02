import test from 'node:test';
import assert from 'node:assert/strict';
import { MARKS, DEFAULT_MARKS, resolveMarks, ringAirports, marksFromToggle, coloursOn } from '../src/marks.js';
import { airportStats } from '../src/stats.js';

const ap = (icao) => ({ icao, iata: icao.slice(1), lon: 0, lat: 0, rgb: '112233' });
const SFO = ap('KSFO'); const LHR = ap('EGLL'); const BOS = ap('KBOS');
const FLIGHTS = [
  { from: SFO, to: LHR }, { from: LHR, to: SFO }, { from: SFO, to: BOS },
];
const icaos = (list) => list.map((a) => a.icao).sort();

test('resolveMarks defaults to current and ignores unknown or hostile values', () => {
  assert.deepEqual(MARKS, ['current', 'all', 'dots']);
  assert.equal(DEFAULT_MARKS, 'current');
  assert.equal(resolveMarks(''), 'current');
  assert.equal(resolveMarks('?marks=all'), 'all');
  assert.equal(resolveMarks('?marks=dots'), 'dots');
  for (const bad of ['constructor', '__proto__', 'ALL', 'none', '']) {
    assert.equal(resolveMarks(`?marks=${bad}`), 'current', bad);
  }
});

test("'current': both airports of the flight in the air, and of the one that just landed", () => {
  const air = { completed: 2, active: { i: 2, f: 0.4 } };
  assert.deepEqual(icaos(ringAirports('current', FLIGHTS, air, airportStats(FLIGHTS, 2, 2))), ['KBOS', 'KSFO']);
  const landed = { completed: 2, active: null };
  assert.deepEqual(icaos(ringAirports('current', FLIGHTS, landed, airportStats(FLIGHTS, 2, -1))), ['EGLL', 'KSFO']);
});

test("'current': nothing before the first flight or at the full state", () => {
  assert.deepEqual(ringAirports('current', FLIGHTS, { completed: 0, active: null }, airportStats(FLIGHTS, 0, -1)), []);
  assert.deepEqual(ringAirports('current', FLIGHTS, { completed: 3, active: null }, airportStats(FLIGHTS, 3, -1)), []);
});

test("'all': every airport reached so far, plus the destination still in the air", () => {
  const air = { completed: 2, active: { i: 2, f: 0.4 } };
  assert.deepEqual(icaos(ringAirports('all', FLIGHTS, air, airportStats(FLIGHTS, 2, 2))), ['EGLL', 'KBOS', 'KSFO']);
  const full = { completed: 3, active: null };
  assert.deepEqual(icaos(ringAirports('all', FLIGHTS, full, airportStats(FLIGHTS, 3, -1))), ['EGLL', 'KBOS', 'KSFO']);
});

test("'dots': only the destination not yet reached gets a ring", () => {
  const air = { completed: 2, active: { i: 2, f: 0.4 } };
  assert.deepEqual(icaos(ringAirports('dots', FLIGHTS, air, airportStats(FLIGHTS, 2, 2))), ['KBOS']);
  const landed = { completed: 2, active: null };
  assert.deepEqual(ringAirports('dots', FLIGHTS, landed, airportStats(FLIGHTS, 2, -1)), []);
});

test('no duplicates when an airport is both reached and a current endpoint', () => {
  const air = { completed: 1, active: { i: 1, f: 0.5 } }; // LHR -> SFO, both already visited
  const r = ringAirports('all', FLIGHTS, air, airportStats(FLIGHTS, 1, 1));
  assert.equal(r.length, new Set(r.map((a) => a.icao)).size);
});

test('the city-colours checkbox swaps between the default rings and coloured dots', () => {
  assert.equal(marksFromToggle(true), 'dots');
  assert.equal(marksFromToggle(false), 'current');
  assert.equal(coloursOn('dots'), true);
  assert.equal(coloursOn('current'), false);
  assert.equal(coloursOn('all'), false); // ?marks=all is URL-only; the checkbox starts unchecked
});
