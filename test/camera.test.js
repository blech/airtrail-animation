import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ZMIN, ZMAX, clamp, defaultView, easeAngle, rotationFor, zoomForKm, followStep,
} from '../src/camera.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

test('clamp and zoom limits', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
  assert.equal(ZMIN, 0.8);
  assert.equal(ZMAX, 4);
});

test('defaultView returns a fresh object each time', () => {
  const a = defaultView();
  a.rot[0] = 5;
  assert.notEqual(defaultView().rot[0], 5);
  assert.equal(defaultView().zoom, 1);
});

test('easeAngle: no motion at dt 0, converges, takes the short way round', () => {
  assert.equal(easeAngle(10, 50, 0, 0.5), 10);
  near(easeAngle(10, 20, 100, 0.1), 20, 1e-6);
  const v = easeAngle(170, -170, 1, 1); // short way is +20 degrees, i.e. past 170
  assert.ok(v > 170 && v < 190, String(v));
});

test('rotationFor centres a point and limits tilt', () => {
  assert.deepEqual(rotationFor(-122, 37), [122, -37]);
  assert.equal(rotationFor(0, 89)[1], -70);
  assert.equal(rotationFor(0, -89)[1], 70);
});

test('zoomForKm zooms in on short hops and out on long ones', () => {
  assert.equal(zoomForKm(300), 1.8);
  assert.equal(zoomForKm(9000), 1);
  near(zoomForKm(3000), 1.5);
});

test('followStep converges on the target', () => {
  const v = defaultView();
  for (let i = 0; i < 600; i++) followStep(v, { lon: -122, lat: 37, km: 3000 }, 1 / 60);
  near(v.rot[0], 122, 0.01);
  near(v.rot[1], -37, 0.01);
  near(v.followZoom, 1.5, 0.01);
});
