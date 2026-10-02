import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, formatClock, formatKm, iataOf, formatFlight } from '../src/format.js';

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

test('formatFlight with and without aircraft', () => {
  const f = {
    flightNumber: 'VS20', date: '2026-06-27',
    from: { iata: 'SFO', icao: 'KSFO' }, to: { iata: 'LHR', icao: 'EGLL' },
    aircraft: { name: 'Boeing 787-9', icao: 'B789' },
  };
  assert.equal(formatFlight(f), 'VS20 · 27 Jun 2026 · SFO → LHR · Boeing 787-9');
  assert.equal(formatFlight({ ...f, aircraft: null }), 'VS20 · 27 Jun 2026 · SFO → LHR');
});
