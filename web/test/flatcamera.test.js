import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultFlatView, panFor, centreOf, flatZoomForKm, flatFollowStep, clampPan,
} from '../src/flatcamera.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

test('default flat view is centred and unzoomed', () => {
  const v = defaultFlatView();
  assert.deepEqual(v.rot, [0, 0]);
  assert.equal(v.zoom, 1);
  assert.equal(v.followZoom, 1);
});

test('panFor and centreOf are inverses', () => {
  const xy = [0.7, -0.4];
  const c = centreOf(panFor(xy));
  near(c[0], xy[0]);
  near(c[1], xy[1]);
});

test('flat follow zoom: close on short hops, whole world on long hauls', () => {
  assert.equal(flatZoomForKm(200), 2.5);
  assert.equal(flatZoomForKm(500), 2.5);
  assert.equal(flatZoomForKm(12000), 1);
  const mid = flatZoomForKm(4250);
  assert.ok(mid > 1 && mid < 2.5);
});

test('flatFollowStep eases toward the target pan without wrapping', () => {
  const v = defaultFlatView();
  v.rot = [-170, 0];
  flatFollowStep(v, [170, 10], 500, 0.1);
  assert.ok(v.rot[0] > -170 && v.rot[0] < 170, 'moves straight across, not round the back');
  assert.ok(v.rot[1] > 0 && v.rot[1] < 10);
  for (let i = 0; i < 200; i++) flatFollowStep(v, [170, 10], 500, 0.1);
  assert.deepEqual(v.rot, [170, 10]);
});

test('clampPan keeps the centre over the map', () => {
  const v = defaultFlatView();
  v.rot = [500, -500];
  clampPan(v, 180, 70);
  assert.deepEqual(v.rot, [180, -70]);
});
