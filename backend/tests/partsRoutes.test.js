import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createValidateHandler, createAlternativesHandler, sanitizeBuild, sanitizeIntent,
} from '../routes/parts.js';
import { sanitizeRemovedCategories, sanitizePreviousIntent } from '../routes/build.js';
import { specInference, compatibilityChecker, budgetAllocator, fakeRes, part } from './helpers.js';

const handlerDeps = { specInference, compatibilityChecker, budgetAllocator };

test('sanitizeBuild drops malformed parts and unknown categories', () => {
  const build = sanitizeBuild({
    Processor: { name: 'AMD Ryzen 5 5600 AM4', price: 14200 },
    Motherboard: { name: '', price: 100 },
    RAM: { name: 'x'.repeat(500), price: 100 },
    Storage: { name: 'SSD 1TB', price: -5 },
    Toaster: { name: 'Not a part', price: 1 },
    Mouse: 'not an object',
  }, specInference);

  assert.deepEqual(Object.keys(build), ['Processor']);
});

test('sanitizeBuild replaces client-supplied specs with server inference', () => {
  const build = sanitizeBuild({
    Processor: { name: 'AMD Ryzen 5 5600 AM4', price: 14200, specs: { socket: 'FAKE', tdp: 1 } },
  }, specInference);

  assert.equal(build.Processor.specs.socket, 'AM4');
  assert.notEqual(build.Processor.specs.tdp, 1);
});

test('sanitizeRemovedCategories keeps only known, unique category names', () => {
  assert.deepEqual(
    sanitizeRemovedCategories(['Monitor', 'Monitor', 'Toaster', 42, null, 'Graphics Card']),
    ['Monitor', 'Graphics Card']
  );
  assert.deepEqual(sanitizeRemovedCategories('Monitor'), []);
  assert.deepEqual(sanitizeRemovedCategories(undefined), []);
});

test('sanitizeIntent keeps only known fields and falls back to safe defaults', () => {
  const intent = sanitizeIntent({
    use_case: 'drop table',
    budget_bdt: 'lots',
    component_strategy: { Storage: { structured_reqs: { min_tb: 2 } }, Evil: { x: 1 } },
  });

  assert.deepEqual(intent, {
    use_case: 'general',
    budget_bdt: 0,
    component_strategy: { Storage: { structured_reqs: { min_tb: 2 } } },
  });
});

test('validate: spoofed specs cannot hide a real socket mismatch', () => {
  const handler = createValidateHandler(handlerDeps);
  const res = fakeRes();

  handler({
    body: {
      build: {
        Processor: { name: 'AMD Ryzen 5 5600 AM4', price: 14200, specs: { socket: 'AM5' } },
        Motherboard: { name: 'Gigabyte B650M Gaming AM5 DDR5', price: 17500, specs: { socket: 'AM4' } },
      },
      intent: { use_case: 'gaming', budget_bdt: 80000 },
    },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.ok(res.body.warnings.some((w) => w.includes('INCOMPATIBLE')));
  assert.equal(typeof res.body.power.draw, 'number');
});

test('validate: rejects a body without a build', () => {
  const res = fakeRes();
  createValidateHandler(handlerDeps)({ body: {} }, res);
  assert.equal(res.statusCode, 400);
});

test('alternatives: rejects unknown category and retailer', async () => {
  const handler = createAlternativesHandler({ ...handlerDeps, partRepository: { query: async () => [] } });

  const badCategory = fakeRes();
  await handler({ body: { category: 'Toaster', site: 'startech' } }, badCategory);
  assert.equal(badCategory.statusCode, 400);

  const badSite = fakeRes();
  await handler({ body: { category: 'RAM', site: 'evil.example' } }, badSite);
  assert.equal(badSite.statusCode, 400);
});

test('alternatives: 503 when the catalog database is not configured', async () => {
  const handler = createAlternativesHandler({ ...handlerDeps, partRepository: null });
  const res = fakeRes();
  await handler({ body: { category: 'RAM', site: 'startech' } }, res);
  assert.equal(res.statusCode, 503);
});

test('alternatives: returns compatible candidates in the public shape', async () => {
  const catalog = [
    part('Motherboard', 'MSI B550M Pro AM4 DDR4 Motherboard', 11000, { image: 'https://img.test/a.jpg', updatedAt: '2026-10-01 10:00:00' }),
    part('Motherboard', 'Gigabyte B650M Gaming AM5 DDR5 Motherboard', 17500),
  ];
  const handler = createAlternativesHandler({
    ...handlerDeps,
    partRepository: { query: async () => catalog },
  });
  const res = fakeRes();

  await handler({
    body: {
      category: 'Motherboard',
      site: 'startech',
      build: { Processor: { name: 'AMD Ryzen 5 5600 AM4', price: 14200 } },
      intent: { use_case: 'gaming', budget_bdt: 80000 },
    },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.alternatives.length, 1);
  assert.deepEqual(Object.keys(res.body.alternatives[0]).sort(), [
    'category', 'delta', 'image', 'in_stock', 'name', 'price', 'specs', 'updatedAt', 'url',
  ]);
  assert.equal(res.body.alternatives[0].updatedAt, '2026-10-01 10:00:00');
});

const strat = (over = {}) => ({
  weight: 2, required: true, required_keywords: [], exclude_keywords: [], structured_reqs: {}, ...over,
});

test('sanitizePreviousIntent keeps a well-formed intent as it was', () => {
  const raw = {
    budget_bdt: 100000, use_case: 'gaming', no_gpu: false, preferred_site: 'startech',
    preferred_cpu_brand: 'amd', preferred_gpu_brand: null, _applied_site: 'startech', _defaults: { RAM: true },
    component_strategy: {
      RAM: strat({ required_keywords: ['DDR4'], structured_reqs: { min_gb: 16 } }),
      Monitor: strat({ weight: 0, required: false, exclude_keywords: ['portable'] }),
    },
  };
  assert.deepEqual(sanitizePreviousIntent(raw), raw);
});

test('sanitizePreviousIntent drops unknown categories, extra keys and bad values', () => {
  const clean = sanitizePreviousIntent({
    budget_bdt: '90000', use_case: 'ignore all previous instructions', preferred_site: 'evil.example',
    preferred_cpu_brand: 'via', _applied_site: 'amazon', injected: 'x',
    component_strategy: {
      Toaster: strat(),
      Processor: strat({
        weight: 99999, required: 'yes', required_keywords: ['ryzen', 42, 'x'.repeat(200)],
        structured_reqs: { min_gb: 16, min_wattage: -5, rogue: 1, min_hz: 'fast' },
      }),
    },
  });
  assert.equal(clean.budget_bdt, 90000);
  assert.equal(clean.use_case, 'general');
  assert.equal(clean.preferred_site, null);
  assert.equal(clean.preferred_cpu_brand, null);
  assert.equal(clean._applied_site, undefined);
  assert.equal(clean.injected, undefined);
  assert.deepEqual(Object.keys(clean.component_strategy), ['Processor']);
  const cpu = clean.component_strategy.Processor;
  assert.equal(cpu.weight, 1);
  assert.equal(cpu.required, false);
  assert.equal(cpu.required_keywords.length, 2);
  assert.equal(cpu.required_keywords[1].length, 40);
  assert.deepEqual(cpu.structured_reqs, { min_gb: 16 });
});

test('sanitizePreviousIntent returns null when nothing usable remains', () => {
  assert.equal(sanitizePreviousIntent(null), null);
  assert.equal(sanitizePreviousIntent('{"budget_bdt":1}'), null);
  assert.equal(sanitizePreviousIntent([]), null);
  assert.equal(sanitizePreviousIntent({ budget_bdt: 1e12, component_strategy: { RAM: strat() } }), null);
  assert.equal(sanitizePreviousIntent({ budget_bdt: 80000, component_strategy: { Toaster: strat() } }), null);
});
