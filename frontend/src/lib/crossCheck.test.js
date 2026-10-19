import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canCrossCheck, crossCheckSignature, toCrossCheckBuild, bestStore, crossCheckHeadline, adoptedExplanation,
} from './crossCheck.js';

const part = (name, price) => ({ name, price, url: `https://shop.test/${name}`, specs: { socket: 'AM4' } });
const build = {
  Processor: part('cpu', 12000), Motherboard: part('mb', 8000), RAM: part('ram', 6000), PSU: part('psu', 4000),
  Monitor: null,
};

const result = (site, label, total, counts, status = 'ok') => ({ site, label, total, counts, status });
const data = (results) => ({ reference: { site: 'startech', label: 'StarTech BD', total: 30000 }, results });

test('a build can be cross-checked only with CPU, board, RAM and PSU', () => {
  assert.ok(canCrossCheck(build));
  assert.ok(!canCrossCheck({ ...build, PSU: null }));
  assert.ok(!canCrossCheck(null));
});

test('the payload carries names, prices and links only', () => {
  const sent = toCrossCheckBuild(build);
  assert.deepEqual(Object.keys(sent), ['Processor', 'Motherboard', 'RAM', 'PSU']);
  assert.deepEqual(sent.Processor, { name: 'cpu', price: 12000, url: 'https://shop.test/cpu' });
});

test('results go stale when a part, a price or the store changes', () => {
  const base = crossCheckSignature(build, 'startech');
  assert.equal(base, crossCheckSignature({ ...build }, 'startech'));
  assert.notEqual(base, crossCheckSignature({ ...build, RAM: part('ram', 6500) }, 'startech'));
  assert.notEqual(base, crossCheckSignature(build, 'ryans'));
});

test('the best store is the cheapest that has the whole build', () => {
  const d = data([
    result('ryans', 'Ryans BD', 27000, { exact: 3, equivalent: 1 }, 'partial'),
    result('techland', 'TechLand BD', 28500, { exact: 4 }),
    result('computermania', 'CompMania BD', 0, {}, 'unavailable'),
  ]);
  const { cheapest, saving } = bestStore(d);
  assert.equal(cheapest.site, 'techland');
  assert.equal(saving, 1500);
  assert.match(crossCheckHeadline(d), /TechLand BD has this build for ৳1,500 less, and every part is the same model/);
});

test('the headline says when the user is already at the cheapest store, or nobody else has it all', () => {
  assert.match(
    crossCheckHeadline(data([result('ryans', 'Ryans BD', 31000, { exact: 2, equivalent: 2 })])),
    /StarTech BD is already the cheapest. Next best is Ryans BD, ৳1,000 more/,
  );
  assert.match(crossCheckHeadline(data([result('ryans', 'Ryans BD', 0, {}, 'unavailable')])), /No other store has every part/);
});

test('switching explains how the new build relates to the old one', () => {
  assert.equal(
    adoptedExplanation({ label: 'Ryans BD', counts: { exact: 5, equivalent: 1, substitute: 0, missing: 1 } }),
    'Your build, priced at Ryans BD: 5 parts are the same model, 1 is an equivalent, and 1 is not in stock there.',
  );
});
