import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ZMIN, ZMAX, clamp, defaultView, easeAngle, rotationFor, zoomForKm, followStep, releaseVelocity, easeToward,
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

test('zoomForKm zooms in on short hops and out on long ones, never past 1.4x', () => {
  assert.equal(zoomForKm(300), 1.4);
  assert.equal(zoomForKm(9000), 1);
  near(zoomForKm(4250), 1.2);
  for (let km = 0; km < 20000; km += 250) assert.ok(zoomForKm(km) >= 1 && zoomForKm(km) <= 1.4);
});

test('followStep converges on the target', () => {
  const v = defaultView();
  for (let i = 0; i < 600; i++) followStep(v, { lon: -122, lat: 37, km: 3000 }, 1 / 60);
  near(v.rot[0], 122, 0.01);
  near(v.rot[1], -37, 0.01);
  near(v.followZoom, zoomForKm(3000), 0.01);
});

test('releaseVelocity: a slow release stops dead, a real flick keeps its momentum', () => {
  assert.deepEqual(releaseVelocity([5, -3]), [0, 0]);
  assert.deepEqual(releaseVelocity([0, 0]), [0, 0]);
  assert.deepEqual(releaseVelocity([60, 10]), [60, 10]);
  assert.deepEqual(releaseVelocity([-40, 0]), [-40, 0]);
  assert.deepEqual(releaseVelocity([10, 10], 5), [10, 10]);
});

test('easeToward snaps onto the target once close, so motion actually stops', () => {
  assert.equal(easeToward(1.4, 1, 0, 0.8), 1.4);
  const mid = easeToward(1.4, 1, 0.016, 0.8);
  assert.ok(mid < 1.4 && mid > 1);
  assert.equal(easeToward(1.0004, 1, 0.016, 0.8), 1);
  assert.equal(easeToward(1, 1, 0.016, 0.8), 1);
});

test('easeAngle and followStep reach rest exactly', () => {
  assert.equal(easeAngle(19.998, 20, 0.016, 0.5), 20);
  const v = defaultView();
  for (let i = 0; i < 2000; i++) followStep(v, { lon: -122, lat: 37, km: 3000 }, 1 / 60);
  const settled = [v.rot[0], v.rot[1], v.followZoom];
  followStep(v, { lon: -122, lat: 37, km: 3000 }, 1 / 60);
  assert.deepEqual([v.rot[0], v.rot[1], v.followZoom], settled);
});
