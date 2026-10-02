import test from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, DEFAULT_THEME, THEME_ORDER, resolveTheme } from '../src/themes.js';

test('three themes with the fields the renderer needs', () => {
  assert.deepEqual(THEME_ORDER, ['paper', 'night', 'natural']);
  for (const id of THEME_ORDER) {
    const t = THEMES[id];
    assert.equal(t.id, id);
    for (const k of ['label', 'bg', 'ocean', 'land', 'coast', 'trail', 'dot']) assert.ok(t[k], `${id}.${k}`);
    assert.match(t.trail, /^\d+,\d+,\d+$/);
    assert.ok(t.settledAlpha > 0 && t.settledAlpha < 1);
    assert.ok(t.activeAlpha > t.settledAlpha && t.activeAlpha <= 1);
    for (const k of ['fg', 'muted', 'panel', 'accent']) assert.ok(t.ui[k], `${id}.ui.${k}`);
  }
  assert.equal(DEFAULT_THEME, 'paper');
});

test('resolveTheme precedence: query, stored, default', () => {
  assert.equal(resolveTheme('?theme=night', 'natural'), 'night');
  assert.equal(resolveTheme('', 'natural'), 'natural');
  assert.equal(resolveTheme('', null), 'paper');
  assert.equal(resolveTheme('?x=1', undefined), 'paper');
});

test('resolveTheme ignores unknown and hostile values', () => {
  for (const bad of ['constructor', '__proto__', 'toString', 'NIGHT', '', 'nope']) {
    assert.equal(resolveTheme(`?theme=${bad}`, null), 'paper', bad);
    assert.equal(resolveTheme('', bad), 'paper', bad);
  }
  assert.equal(resolveTheme('?theme=nope', 'night'), 'night');
});
