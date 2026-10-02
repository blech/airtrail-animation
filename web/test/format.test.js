import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, formatClock, formatKm, iataOf, formatFlightLines, flightBlurb } from '../src/format.js';

test('formatDate', () => {
  assert.equal(formatDate('2026-06-27'), '27 Jun 2026');
  assert.equal(formatDate('2010-01-05'), '5 Jan 2010');
});

test('formatClock is UTC', () => {
  assert.equal(formatClock(Date.UTC(2019, 11, 26, 23, 59) / 1000), '26 Dec 2019');
  assert.equal(formatClock(0), '1 Jan 1970');
});

test('formatKm groups thousands', () => {
  assert.equal(formatKm(0), '0 km');
  assert.equal(formatKm(999.4), '999 km');
  assert.equal(formatKm(123456.7), '123,457 km');
});

test('iataOf falls back to ICAO', () => {
  assert.equal(iataOf({ iata: 'SFO', icao: 'KSFO' }), 'SFO');
  assert.equal(iataOf({ iata: null, icao: 'KSFO' }), 'KSFO');
});

const FLIGHT = {
  flightNumber: 'VS20', date: '2026-06-27', airline: 'Virgin Atlantic',
  from: { iata: 'SFO', icao: 'KSFO' }, to: { iata: 'LHR', icao: 'EGLL' },
  aircraft: { name: 'Boeing 787-9', icao: 'B789' }, km: 8950.4, gcKm: 8610.2,
};

test('formatFlightLines: two lines with flown and great-circle distance', () => {
  assert.deepEqual(formatFlightLines(FLIGHT), [
    'VS20 · 27 Jun 2026 · SFO → LHR',
    'Boeing 787-9 · 8,950 km flown (8,610 km great circle)',
  ]);
  assert.deepEqual(formatFlightLines({ ...FLIGHT, aircraft: null }), [
    'VS20 · 27 Jun 2026 · SFO → LHR',
    '8,950 km flown (8,610 km great circle)',
  ]);
});

test('flightBlurb: flight number title, airline · aircraft subtitle', () => {
  assert.deepEqual(flightBlurb(FLIGHT), { title: 'VS20', subtitle: 'Virgin Atlantic · Boeing 787-9' });
  assert.deepEqual(flightBlurb({ ...FLIGHT, airline: null }), { title: 'VS20', subtitle: 'Boeing 787-9' });
  assert.deepEqual(flightBlurb({ ...FLIGHT, airline: null, aircraft: null }), { title: 'VS20', subtitle: '' });
});
