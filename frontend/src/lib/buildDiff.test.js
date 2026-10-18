import test from 'node:test';
import assert from 'node:assert/strict';
import { diffBuilds, formatDelta } from './buildDiff.js';

const part = (name, price) => ({ name, price });
const ORDER = ['Processor', 'PSU', 'Monitor', 'UPS'];

test('diffBuilds: only parts whose name changed are listed, the rest are kept', () => {
  const before = { Processor: part('Ryzen 5', 17500), PSU: part('Antec 650W', 5399), Monitor: part('Dahua 27', 35499) };
  const after = { Processor: part('Ryzen 5', 17500), PSU: part('Cooler Master 850W', 8800), Monitor: part('ViewSonic 24', 21299) };
  const { changed, kept, totalDelta } = diffBuilds(before, after, ORDER);

  assert.deepEqual(kept, ['Processor']);
  assert.deepEqual(changed.map((c) => [c.category, c.delta]), [['PSU', 3401], ['Monitor', -14200]]);
  assert.equal(totalDelta, 3401 - 14200);
});

test('diffBuilds: a kept part whose price moved is still kept', () => {
  const { changed, kept } = diffBuilds({ PSU: part('Antec 650W', 5399) }, { PSU: part('Antec 650W', 5599) }, ORDER);
  assert.deepEqual(changed, []);
  assert.deepEqual(kept, ['PSU']);
});

test('diffBuilds: added and removed parts count as changes', () => {
  const { changed } = diffBuilds({ Monitor: part('Dahua 27', 35499) }, { UPS: part('APC 650VA', 6000) }, ORDER);
  const byCategory = Object.fromEntries(changed.map((c) => [c.category, c]));
  assert.equal(byCategory.Monitor.after, null);
  assert.equal(byCategory.Monitor.delta, -35499);
  assert.equal(byCategory.UPS.before, null);
  assert.equal(byCategory.UPS.delta, 6000);
});

test('diffBuilds: empty on both sides is skipped; missing inputs do not throw', () => {
  assert.deepEqual(diffBuilds({ UPS: null }, { UPS: null }, ORDER).changed, []);
  assert.deepEqual(diffBuilds(null, undefined).changed, []);
});

test('formatDelta: signed amounts and no change', () => {
  assert.equal(formatDelta(3401), '+৳3,401');
  assert.equal(formatDelta(-14200), '−৳14,200');
  assert.equal(formatDelta(0), 'same price');
});
