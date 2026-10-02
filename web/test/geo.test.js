import test from 'node:test';
import assert from 'node:assert/strict';
import {
  haversineKm, lerpLon, pointAt, trackSlice, trackLengthKm, midpoint, distPointSegment,
} from '../src/geo.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

test('haversineKm SFO-LHR is about 8600 km', () => {
  const d = haversineKm([-122.375, 37.62], [-0.4543, 51.47]);
  assert.ok(d > 8550 && d < 8680, String(d));
});

test('haversineKm one degree of longitude on the equator', () => {
  near(haversineKm([0, 0], [1, 0]), 111.19, 0.05);
});

test('lerpLon goes the short way across the antimeridian', () => {
  near(Math.abs(lerpLon(179, -179, 0.5)), 180);
  near(lerpLon(10, 20, 0.5), 15);
  near(lerpLon(-170, 170, 0.25), -175);
});

const TRACK = [[0, 0, 0, 0], [10, 0, 1000, 10], [20, 0, 0, 40]];

test('pointAt interpolates by recorded time, not by index', () => {
  assert.deepEqual(pointAt(TRACK, 0), [0, 0, 0]);
  assert.deepEqual(pointAt(TRACK, 1), [20, 0, 0]);
  assert.deepEqual(pointAt(TRACK, 0.25), [10, 0, 1000]);
  const p = pointAt(TRACK, 0.5);
  near(p[0], 13.3333333, 1e-4);
  near(p[2], 666.6666667, 1e-3);
});

test('pointAt clamps and survives a zero-length time span', () => {
  assert.deepEqual(pointAt(TRACK, -1), [0, 0, 0]);
  assert.deepEqual(pointAt(TRACK, 2), [20, 0, 0]);
  const flat = [[5, 6, 7, 100], [8, 9, 10, 100]];
  assert.deepEqual(pointAt(flat, 0.5), [5, 6, 7]);
});

test('pointAt interpolates across the antimeridian without passing longitude 0', () => {
  const t = [[179, 0, 0, 0], [-179, 0, 0, 10]];
  near(Math.abs(pointAt(t, 0.5)[0]), 180);
});

test('trackSlice includes interpolated ends and interior vertices', () => {
  const s = trackSlice(TRACK, 0, 0.5);
  assert.equal(s.length, 3);
  assert.deepEqual(s[0], [0, 0, 0]);
  assert.deepEqual(s[1], [10, 0, 1000]);
  near(s[2][0], 13.3333333, 1e-4);
  assert.equal(trackSlice(TRACK, 0.3, 0.3).length, 1);
  assert.equal(trackSlice(TRACK, 0, 1).length, 3);
});

test('trackLengthKm sums segments', () => {
  near(trackLengthKm([[0, 0], [1, 0], [2, 0]]), 222.39, 0.1);
  assert.equal(trackLengthKm([[0, 0]]), 0);
});

test('midpoint is on the great circle', () => {
  const m = midpoint([0, 0], [90, 0]);
  near(m[0], 45, 1e-9); near(m[1], 0, 1e-9);
  near(Math.abs(midpoint([179, 0], [-179, 0])[0]), 180, 1e-6);
  const north = midpoint([-122, 37], [0, 51]);
  assert.ok(north[1] > 51, 'SFO-LHR midpoint is north of both ends');
});

test('distPointSegment', () => {
  near(distPointSegment([5, 3], [0, 0], [10, 0]), 3);
  near(distPointSegment([-4, 3], [0, 0], [10, 0]), 5);
  near(distPointSegment([1, 1], [2, 2], [2, 2]), Math.SQRT2);
});
