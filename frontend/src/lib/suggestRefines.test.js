import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestRefines } from './suggestRefines.js';

const part = (name, price = 1000) => ({ name, price });
const build = () => ({
  Processor: part('Ryzen 5'), 'Graphics Card': part('RTX 3050'), RAM: part('Netac 16GB DDR4'),
  Storage: part('1TB SSD'), PSU: part('650W PSU'), Monitor: part('27 inch monitor'), UPS: null,
});

test('suggestRefines: leftover budget comes first, named after the GPU when there is one', () => {
  const out = suggestRefines(build(), { budget: 100000, total: 90000 });
  assert.match(out[0], /^Use the remaining ৳10,000 on a better GPU$/);
});

test('suggestRefines: no GPU means the CPU gets the leftover; a small leftover is not worth a suggestion', () => {
  const noGpu = { ...build(), 'Graphics Card': null };
  assert.match(suggestRefines(noGpu, { budget: 100000, total: 90000 })[0], /better CPU$/);
  assert.ok(!suggestRefines(build(), { budget: 100000, total: 99000 }).some((s) => /remaining/.test(s)));
});

test('suggestRefines: over budget suggests making it cheaper', () => {
  assert.equal(suggestRefines(build(), { budget: 100000, total: 104000 })[0], 'Make it cheaper');
});

test('suggestRefines: ideas follow what is in the build and are capped at four', () => {
  const out = suggestRefines(build(), { budget: 100000, total: 99000 });
  assert.ok(out.length <= 4);
  assert.deepEqual(out, ['A better monitor', 'A stronger PSU', 'More RAM', 'Faster storage']);

  const sparse = suggestRefines({ Processor: part('Ryzen 5'), RAM: part('Netac 32GB DDR4') }, { budget: 0, total: 0 });
  assert.ok(sparse.includes('Add a monitor') && sparse.includes('Add a UPS'));
  assert.ok(!sparse.includes('More RAM'), '32GB is enough');
  assert.ok(!sparse.includes('A stronger PSU'), 'no PSU to improve');
});

test('suggestRefines: tolerates an empty build', () => {
  assert.deepEqual(suggestRefines({}, {}), ['Add a monitor', 'Add a UPS']);
  assert.deepEqual(suggestRefines(null), ['Add a monitor', 'Add a UPS']);
});
