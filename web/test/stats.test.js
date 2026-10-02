import test from 'node:test';
import assert from 'node:assert/strict';
import { computeStats, airportStats, currentIndex, airportLabels } from '../src/stats.js';

const ap = (icao, lon, lat) => ({ icao, iata: icao.slice(1), lon, lat });
const SFO = ap('KSFO', -122.37, 37.62);
const LHR = ap('EGLL', -0.45, 51.47);
const BOS = ap('KBOS', -71.0, 42.36);
const fl = (from, to) => ({ from, to, track: [[from.lon, from.lat, 0, 0], [to.lon, to.lat, 0, 10]] });
const FLIGHTS = [fl(SFO, LHR), fl(LHR, SFO), fl(SFO, BOS)];

test('computeStats is cumulative with a zero row first', () => {
  const s = computeStats(FLIGHTS);
  assert.equal(s.length, 4);
  assert.deepEqual(s[0], { flights: 0, km: 0, airports: 0 });
  assert.deepEqual([s[1].flights, s[1].airports], [1, 2]);
  assert.deepEqual([s[2].flights, s[2].airports], [2, 2]);
  assert.deepEqual([s[3].flights, s[3].airports], [3, 3]);
  assert.ok(s[1].km > 8500 && s[1].km < 8700);
  assert.ok(s[3].km > s[2].km && s[2].km > s[1].km);
});

test('computeStats of nothing', () => {
  assert.deepEqual(computeStats([]), [{ flights: 0, km: 0, airports: 0 }]);
});

test('airportStats counts movements for completed flights', () => {
  const m = airportStats(FLIGHTS, 2, -1);
  assert.equal(m.size, 2);
  assert.equal(m.get('KSFO').n, 2);
  assert.equal(m.get('EGLL').n, 2);
});

test('airportStats adds only the origin of an active flight', () => {
  const m = airportStats(FLIGHTS, 2, 2);
  assert.equal(m.get('KSFO').n, 3);
  assert.ok(!m.has('KBOS'));
  assert.equal(airportStats(FLIGHTS, 0, 0).get('KSFO').n, 1);
  assert.equal(airportStats(FLIGHTS, 0, -1).size, 0);
});

test('currentIndex: the flight in the air, else the one that just landed, else -1', () => {
  assert.equal(currentIndex({ completed: 0, active: { i: 0, f: 0.3 } }, 3), 0);
  assert.equal(currentIndex({ completed: 2, active: { i: 2, f: 0.9 } }, 3), 2);
  assert.equal(currentIndex({ completed: 2, active: null }, 3), 1); // gap after flight 1
  assert.equal(currentIndex({ completed: 0, active: null }, 3), -1); // before the first
  assert.equal(currentIndex({ completed: 3, active: null }, 3), -1); // full state
  assert.equal(currentIndex({ completed: 0, active: null }, 0), -1);
});

test('airportLabels: the current flight\'s two airports, before it has reached its destination too', () => {
  const inAir = { completed: 2, active: { i: 2, f: 0.5 } };
  const l = airportLabels(FLIGHTS, inAir, airportStats(FLIGHTS, 2, 2), -1);
  assert.deepEqual([...l.labels].sort(), ['KBOS', 'KSFO']);
  const l2 = airportLabels(FLIGHTS, { completed: 2, active: null }, airportStats(FLIGHTS, 2, -1), -1);
  assert.deepEqual([...l2.labels].sort(), ['EGLL', 'KSFO']); // flight 1: LHR -> SFO, just landed
});

test('airportLabels: full state falls back to the busiest airports, hover adds its two', () => {
  const full = { completed: 3, active: null };
  const m = airportStats(FLIGHTS, 3, -1);
  const l = airportLabels(FLIGHTS, full, m, -1);
  assert.deepEqual([...l.labels].sort(), ['EGLL', 'KBOS', 'KSFO']);
  const hovered = airportLabels(FLIGHTS, { completed: 0, active: null }, airportStats(FLIGHTS, 0, -1), 2);
  assert.deepEqual([...hovered.labels].sort(), ['KBOS', 'KSFO']);
});
