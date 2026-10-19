import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from './fixtures/miniCatalog.js';
import { createEngine, build } from './engineHarness.js';
import { applyIntentOverrides } from '../engine/intentOverrides.js';
import { executeCrossCheck, crossCheckSite, consistentPins, crossCheckIntent } from '../engine/crossCheck.js';
import { applyLockCascade } from '../engine/lockCascade.js';

// The mini catalog is a StarTech slice; relabelled, it stands in for another store's stock.
const asSite = (site, keep = () => true) => catalog
  .filter((r) => r.site === 'startech' && keep(r))
  .map((r) => ({ ...r, site, url: r.url.replace('https://www.startech.com.bd/', `https://www.${site}.test/`) }));

const depsFor = (eng) => ({
  ...eng,
  intentOverrideApplier: applyIntentOverrides,
  intentExtractor: { extract: async () => { throw new Error('no AI in a cross-check'); } },
  explanationGenerator: { generate: async () => { throw new Error('no explanation in a cross-check'); } },
});

const quiet = async (fn) => {
  const real = [console.log, console.warn, console.error];
  if (!process.env.ENGINE_LOGS) { console.log = () => {}; console.warn = () => {}; console.error = () => {}; }
  try { return await fn(); } finally { [console.log, console.warn, console.error] = real; }
};

// A real StarTech build to cross-check, as the browser would send it (no specs).
const reference = await build({ budget: 80000 });
const sent = Object.fromEntries(Object.entries(reference.build)
  .filter(([, p]) => p)
  .map(([c, p]) => [c, { name: p.name, price: p.price, url: p.url }]));

test('lock cascade: a board stays only with its CPU, memory with its board, the PSU with CPU and GPU', () => {
  const all = ['Processor', 'Motherboard', 'RAM', 'Graphics Card', 'PSU', 'Storage'];
  assert.deepEqual([...applyLockCascade(new Set(all.filter((c) => c !== 'Processor')))].sort(), ['Graphics Card', 'Storage']);
  assert.deepEqual([...applyLockCascade(new Set(all.filter((c) => c !== 'Motherboard')))].sort(), ['Graphics Card', 'PSU', 'Processor', 'Storage']);
  assert.ok(!applyLockCascade(new Set(all.filter((c) => c !== 'Graphics Card'))).has('PSU'));
  assert.ok(applyLockCascade(new Set(all.filter((c) => c !== 'Graphics Card')), { noGpu: true }).has('PSU'));
});

test('a store with the same stock gets every part as an exact match, without running the engine', async () => {
  const eng = createEngine([...catalog, ...asSite('ryans')]);
  const states = [];
  const result = await quiet(() => executeCrossCheck({ build: sent, intent: reference.intent, site: 'startech' }, depsFor(eng), {
    onProgress: (site, state) => { if (site === 'ryans') states.push(state); },
  }));
  const ryans = result.results.find((r) => r.site === 'ryans');

  assert.equal(ryans.status, 'ok');
  assert.equal(ryans.delta, 0);
  assert.equal(ryans.counts.exact, Object.keys(sent).length);
  for (const part of Object.values(ryans.build)) if (part) assert.ok(part.url.startsWith('https://www.ryans.test/'));
  assert.deepEqual(states, ['queued', 'matching', 'done']);
  assert.equal(ryans.intent._applied_site, 'ryans');
  assert.equal(result.reference.total, reference.total);
});

test('a store without the CPU gets a substitute, and the board and memory are picked again for it', async () => {
  const cpu = sent.Processor.name;
  const eng = createEngine([...catalog, ...asSite('ryans', (r) => r.name !== cpu)]);
  const ryans = await quiet(() => crossCheckSite({
    site: 'ryans', reference: eng.specInference && Object.fromEntries(Object.entries(sent).map(([c, p]) => [c, { ...p, specs: eng.specInference.inferSpecs(c, p.name) }])),
    referenceTotal: reference.total, intent: crossCheckIntent(reference.intent, sent, reference.total), budget: 80000,
  }, depsFor(eng)));

  assert.notEqual(ryans.status, 'unavailable', ryans.error);
  assert.ok(ryans.build.Processor);
  assert.notEqual(ryans.build.Processor.name, cpu);
  assert.ok(['equivalent', 'substitute'].includes(ryans.matches.Processor));
  assert.ok(eng.compatibilityChecker.isSocketCompatible(ryans.build.Processor, ryans.build.Motherboard));
  assert.ok(!ryans.warnings.some((w) => /INCOMPATIBLE/.test(w)));
});

test('consistentPins drops a board whose CPU was not matched', () => {
  const eng = createEngine();
  const part = (c, name) => ({ part: { name, price: 1000, specs: eng.specInference.inferSpecs(c, name) }, match: 'exact' });
  const pins = consistentPins({
    Motherboard: part('Motherboard', 'MSI PRO B760M-E DDR4'),
    RAM: part('RAM', 'Netac Basic 16GB DDR4 3200MHz'),
    Storage: part('Storage', 'Lexar NM620 512GB NVMe SSD'),
  }, { noGpu: false, intent: { use_case: 'gaming', budget_bdt: 80000 } }, depsFor(eng));
  assert.deepEqual(Object.keys(pins), ['Storage']);
});

test('a store missing an optional part is partial; one with no boards is unavailable; the rest still report', async () => {
  const eng = createEngine([
    ...catalog.filter((r) => r.site === 'startech'),
    ...asSite('ryans', (r) => r.category !== 'monitor'),
    ...asSite('techland', (r) => r.category !== 'motherboard'),
  ]);
  const result = await quiet(() => executeCrossCheck({ build: sent, intent: reference.intent, site: 'startech' }, depsFor(eng)));
  const by = Object.fromEntries(result.results.map((r) => [r.site, r]));

  assert.ok(sent.Monitor, 'the reference build should have a monitor');
  assert.equal(by.ryans.status, 'partial');
  assert.equal(by.ryans.matches.Monitor, 'missing');
  assert.equal(by.techland.status, 'unavailable');
  assert.match(by.techland.error, /^TechLand BD has no (processor|motherboard) in stock/);
  assert.equal(by.computermania.status, 'unavailable');
  assert.match(by.computermania.error, /laptops and accessories/);
  assert.ok(!result.results.some((r) => r.site === 'startech'));
});

test('crossCheckIntent wants exactly the parts the build has, with a budget that covers it', () => {
  const intent = crossCheckIntent({ budget_bdt: 50000, use_case: 'gaming', component_strategy: {} }, { Processor: {}, RAM: {} }, 62000);
  assert.equal(intent.budget_bdt, 62000);
  assert.equal(intent.component_strategy.Processor.required, true);
  assert.equal(intent.component_strategy.Monitor.required, false);
  assert.equal(intent.no_gpu, true);
  assert.equal(intent.preferred_site, null);
});
