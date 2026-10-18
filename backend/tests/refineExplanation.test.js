import test from 'node:test';
import assert from 'node:assert/strict';

import { describeRefine } from '../engine/refineExplanation.js';
import { createPartRepository } from '../utils/partRepository.js';
import { createSpecInference } from '../utils/specInference.js';
import { createCacheManager } from '../utils/cacheManager.js';
import { part } from './helpers.js';
import { buildFacts } from '../ai/explanationGenerator.js';

const before = () => ({
  Processor: part('Processor', 'AMD Ryzen 5 5600 Processor AM4', 12200),
  Motherboard: part('Motherboard', 'MSI B550M-P AMD AM4 Motherboard DDR4', 14100),
  RAM: part('RAM', 'Netac 16GB DDR4 3200MHz Desktop RAM', 11500),
  PSU: part('PSU', '1STPLAYER ACK Bronze 850W 80+ Bronze Power Supply', 7000),
  Monitor: part('Monitor', 'GIGABYTE GS27Q 27 inch QHD 165Hz Gaming Monitor', 37500),
  Mouse: part('Mouse', 'Meetion BTM032R Wireless Mouse', 2100),
});

const refined = (prev) => ({
  ...prev,
  PSU: part('PSU', 'DeepCool PN1000M 1000W 80+ Gold Full Modular Power Supply', 17499),
  Monitor: part('Monitor', 'Dahua LM25-E241A 24.5 inch 320Hz IPS FHD Monitor', 20000),
});

const followUp = () => ({
  ops: [{ category: 'Monitor', direction: null }, { category: 'PSU', direction: 'up' }],
  targets: { Monitor: { target: 20000, tolerance: 0.15 } },
  absorbers: ['PSU'],
});

test('describeRefine: says what was kept, what changed, why, and the price of each change', () => {
  const prev = before();
  const text = describeRefine({
    build: refined(prev), previousBuild: prev, locked: ['Processor', 'Motherboard', 'RAM', 'Mouse'],
    followUp: followUp(), total: 150000 - 4001, budget: 150000,
  });
  assert.match(text, /changed 2 parts and kept the other 4 exactly as they were/);
  assert.match(text, /monitor is now the Dahua LM25-E241A.* at 20,000 BDT \(−17,500 BDT\), to land near your 20,000 BDT target/);
  assert.match(text, /PSU is now the DeepCool PN1000M.* \(\+10,499 BDT\), to put the money freed up elsewhere into it/);
  assert.match(text, /Estimated peak draw is about \d+W.* headroom over that draw/);
  assert.match(text, /under your 150,000 BDT budget/);
});

test('describeRefine: parts the user did not name are explained as following from the change', () => {
  const prev = before();
  const next = { ...prev, Processor: part('Processor', 'Intel Core i5-12400F Processor LGA1700', 17000),
    Motherboard: part('Motherboard', 'ASUS PRIME H610M-K LGA1700 DDR4 Motherboard', 9000) };
  const text = describeRefine({
    build: next, previousBuild: prev, locked: ['RAM', 'PSU', 'Monitor', 'Mouse'],
    followUp: { ops: [{ category: 'Processor', direction: 'up' }], targets: {}, absorbers: [] },
    total: 100000, budget: 100000,
  });
  assert.match(text, /processor is now the Intel Core i5-12400F.*as the step up you asked for/);
  assert.match(text, /motherboard is now.*so it still works with the new processor/);
  assert.ok(text.indexOf('processor is now') < text.indexOf('motherboard is now'), 'asked-for change should come first');
});

test('describeRefine: removed and added parts, and an unchanged build', () => {
  const prev = before();
  const removed = describeRefine({
    build: { ...prev, Monitor: null }, previousBuild: prev, locked: ['Processor', 'Motherboard', 'RAM', 'PSU', 'Mouse'],
    followUp: { ops: [{ category: 'Monitor', action: 'remove' }], targets: {}, absorbers: [] }, total: 50000, budget: 100000,
  });
  assert.match(removed, /monitor is removed \(GIGABYTE GS27Q/);

  const added = describeRefine({
    build: { ...prev, UPS: part('UPS', 'APC 650VA UPS', 6000) }, previousBuild: prev, locked: Object.keys(prev),
    followUp: { ops: [{ category: 'UPS', action: 'add' }], targets: {}, absorbers: [] }, total: 90000, budget: 100000,
  });
  assert.match(added, /added the APC 650VA UPS for 6,000 BDT/);

  const same = describeRefine({
    build: prev, previousBuild: prev, locked: Object.keys(prev), followUp: { ops: [], targets: {}, absorbers: [] },
    total: 80000, budget: 100000,
  });
  assert.match(same, /Nothing in your build needed to change/);
});

test('describeRefine: every number in the text comes from the parts, their prices or the verified facts', () => {
  const prev = before();
  const next = refined(prev);
  const total = 140000;
  const budget = 150000;
  const text = describeRefine({
    build: next, previousBuild: prev, locked: ['Processor', 'Motherboard', 'RAM', 'Mouse'],
    followUp: followUp(), total, budget,
  });

  const digits = (value) => String(value).match(/\d+(?:\.\d+)?/g) || [];
  const allowed = new Set();
  for (const p of Object.values(next)) { digits(p.name).forEach((d) => allowed.add(d)); allowed.add(String(p.price)); }
  allowed.add(String(Math.abs(next.PSU.price - prev.PSU.price)));
  allowed.add(String(Math.abs(next.Monitor.price - prev.Monitor.price)));
  allowed.add('20000'); // the user's named target
  allowed.add(String(total)); allowed.add(String(budget)); allowed.add(String(budget - total));
  buildFacts(next).forEach((f) => digits(f).forEach((d) => allowed.add(d)));
  ['1', '2', '3', '4', '5', '6'].forEach((d) => allowed.add(d)); // counts of parts

  for (const token of text.match(/\d[\d,]*(?:\.\d+)?/g)) {
    const plain = token.replace(/,/g, '');
    assert.ok(allowed.has(plain), `"${token}" in the explanation is not from the build: ${text}`);
  }
  assert.doesNotMatch(text, /FPS|benchmark/i);
});

test('checkAvailabilityMany: one query for many urls; unknown urls and errors give no entry', async () => {
  const calls = [];
  const rows = [
    { url: 'u1', in_stock: 1, price: 100 },
    { url: 'u2', in_stock: 0, price: 250 },
  ];
  const db = {
    async execute({ sql, args }) {
      calls.push({ sql, args });
      if (args.includes('boom')) throw new Error('db down');
      return { rows: rows.filter((r) => args.includes(r.url)) };
    },
  };
  const repo = createPartRepository({ db, specInference: createSpecInference(), cache: createCacheManager() });

  const found = await repo.checkAvailabilityMany(['u1', 'u2', 'u3', 'u1', '', null]);
  assert.equal(calls.length, 1, 'should be a single query');
  assert.match(calls[0].sql, /WHERE url IN \(\?,\?,\?\)/);
  assert.deepEqual([...found.keys()].sort(), ['u1', 'u2']);
  assert.deepEqual(found.get('u1'), { in_stock: true, price: 100 });
  assert.equal(found.get('u2').in_stock, false);
  assert.equal(found.get('u3'), undefined);

  assert.equal((await repo.checkAvailabilityMany([])).size, 0);
  assert.equal(calls.length, 1, 'no query for an empty list');
  assert.equal((await repo.checkAvailabilityMany(['boom'])).size, 0);
});
