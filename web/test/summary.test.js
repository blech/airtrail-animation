import test from 'node:test';
import assert from 'node:assert/strict';
import { summarise, yearsOf, flagEmoji } from '../summary/summary-logic.js';

const ap = (icao, country, lon, lat) => ({ icao, country, lon, lat });
const SFO = ap('KSFO', 'US', -122.37, 37.62), LHR = ap('EGLL', 'GB', -0.45, 51.47), JFK = ap('KJFK', 'US', -73.78, 40.64);
const fl = (date, from, to, airline) => ({ date, from, to, airline, track: [[from.lon, from.lat], [to.lon, to.lat]] });
const F = [fl('2019-05-01', SFO, LHR, 'BA'), fl('2018-01-01', JFK, SFO, 'UA'), fl('2019-06-01', LHR, SFO, 'BA')];

test('yearsOf is distinct and newest first', () => assert.deepEqual(yearsOf(F), ['2019', '2018']));
test('all-time totals', () => {
  const s = summarise(F);
  assert.equal(s.flights, 3);
  assert.equal(s.airports.length, 3);
  assert.deepEqual(s.countries, ['US', 'GB']); // first-visit order by date: JFK/SFO first
  assert.equal(s.routes.length, 2);            // SFO-LHR flown both ways is one arc
  assert.equal(s.routes.find((r) => r.n === 2).n, 2);
  assert.deepEqual(s.airlines, [{ name: 'BA', n: 2 }, { name: 'UA', n: 1 }]);
  assert.ok(s.km > 20000);
});
test('year filter', () => {
  const s = summarise(F, '2018');
  assert.equal(s.flights, 1);
  assert.deepEqual(s.countries, ['US']);
});
test('empty period', () => assert.equal(summarise(F, '2001').flights, 0));
test('flagEmoji', () => { assert.equal(flagEmoji('GB'), '🇬🇧'); assert.equal(flagEmoji('x'), ''); });
