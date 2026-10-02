import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, formatKm, iataOf, formatFlightLines, flightBlurb, dateLabel } from '../src/format.js';

test('formatDate', () => {
  assert.equal(formatDate('2026-06-27'), '27 Jun 2026');
  assert.equal(formatDate('2010-01-05'), '5 Jan 2010');
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

test('dateLabel: the flight date, or the first-last range at a stopped edge', () => {
  const fs = [{ date: '2010-09-22' }, { date: '2014-05-01' }, { date: '2026-07-11' }];
  assert.equal(dateLabel(fs, 1, false), '1 May 2014');
  assert.equal(dateLabel(fs, -1, false), '22 Sep 2010'); // before anything has flown: first flight's date
  assert.equal(dateLabel(fs, 2, true), '22 Sep 2010 – 11 Jul 2026');
  assert.equal(dateLabel([], -1, true), '');
  assert.equal(dateLabel([{ date: '2020-01-02' }], 0, true), '2 Jan 2020 – 2 Jan 2020');
});
