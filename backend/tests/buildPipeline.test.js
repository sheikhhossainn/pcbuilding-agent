import test from 'node:test';
import assert from 'node:assert/strict';
import { executeBuild } from '../engine/buildOrchestrator.js';
import { createJob, getJobStatus, initWorkers } from '../utils/queueManager.js';
import { compatibilityChecker, budgetAllocator, specInference, part } from './helpers.js';

const CATEGORIES = [
  'Processor', 'Motherboard', 'RAM', 'Storage', 'Graphics Card', 'PSU',
  'CPU Cooler', 'Casing', 'Monitor', 'Mouse', 'Keyboard', 'UPS',
];

const CORE = ['Processor', 'Motherboard', 'RAM', 'PSU'];

const makeIntent = (required = CORE) => ({
  budget_bdt: 60000,
  use_case: 'gaming',
  no_gpu: false,
  preferred_site: null,
  preferred_cpu_brand: null,
  preferred_gpu_brand: null,
  component_strategy: Object.fromEntries(
    CATEGORIES.map((c) => [c, {
      weight: 1, required: required.includes(c),
      required_keywords: [], exclude_keywords: [], structured_reqs: {},
    }])
  ),
});

const CATALOG = {
  Processor: part('Processor', 'AMD Ryzen 5 5600 Processor AM4', 14200),
  Motherboard: part('Motherboard', 'Gigabyte B450M DS3H AM4 DDR4 Motherboard', 8000),
  RAM: part('RAM', 'Corsair Vengeance 16GB DDR4 3200MHz', 5200),
  PSU: part('PSU', 'Corsair CV650 650W', 7000),
  Monitor: part('Monitor', 'Gigasonic 21.5" FHD LED Monitor', 6400),
};

function makeDeps({ motherboard = CATALOG.Motherboard, required = CORE, selectCalls = [] } = {}) {
  const parts = { ...CATALOG, Motherboard: motherboard };
  return {
    specInference,
    intentExtractor: { extract: async () => makeIntent(required) },
    intentOverrideApplier: () => {},
    explanationGenerator: { generate: async () => 'Test explanation.' },
    compatibilityChecker,
    budgetAllocator: {
      ...budgetAllocator,
      calculateFloorPrices: async () => ({ minimums: {}, totalFloor: 0, degradations: [] }),
      allocateBudgets: () => Object.fromEntries(CATEGORIES.map((c) => [c, 20000])),
    },
    partRepository: {
      getAvailableSockets: async () => new Set(['AM4', 'AM5']),
      matchesStrategy: () => true,
      query: async () => [],
      checkAvailability: async () => ({ in_stock: true, price: null }),
    },
    partSelector: {
      selectWithFallback: async (_site, category) => {
        selectCalls.push(category);
        return parts[category] || null;
      },
    },
  };
}

test('executeBuild reports each pipeline stage in order', async () => {
  const stages = [];

  await executeBuild({ message: 'gaming pc 60k', site: 'startech' }, makeDeps(), {
    onStage: (s) => stages.push(s),
  });

  assert.deepEqual(stages, ['intent', 'planning', 'selecting', 'optimizing', 'checking', 'explaining']);
});

test('executeBuild returns budget, power, and notes alongside the build', async () => {
  const result = await executeBuild({ message: 'gaming pc 60k', site: 'startech' }, makeDeps());

  assert.equal(result.budget, 60000);
  assert.equal(result.total, 14200 + 8000 + 5200 + 7000);
  assert.equal(result.power.psuWattage, 650);
  assert.ok(result.power.draw > 0);
  assert.deepEqual(result.notes, []);
  assert.deepEqual(result.warnings, []);
});

test('validator warnings are appended after selection notes, and notes exclude them', async () => {
  const mismatched = part('Motherboard', 'Gigabyte B650M Gaming AM5 DDR5 Motherboard', 17500);

  const result = await executeBuild({ message: 'gaming pc 60k', site: 'startech' }, makeDeps({ motherboard: mismatched }));

  assert.ok(result.warnings.some((w) => w.includes('INCOMPATIBLE')));
  assert.ok(result.notes.every((w) => !w.includes('INCOMPATIBLE')));
});

test('parts the user removed stay out of a refine, but mandatory parts are never dropped', async () => {
  const required = [...CORE, 'Monitor'];

  const baseline = await executeBuild({ message: 'gaming pc 60k', site: 'startech' }, makeDeps({ required }));
  assert.ok(baseline.build.Monitor, 'monitor is selected when nothing was removed');

  const result = await executeBuild(
    { message: 'gaming pc 60k', site: 'startech', removedCategories: ['Monitor', 'Processor'] },
    makeDeps({ required })
  );

  assert.equal(result.build.Monitor, null);
  assert.ok(result.build.Processor, 'a PC cannot be built without a CPU, so removal is ignored');
});

test('a locked part that arrived without specs (shared link) gets specs inferred', async () => {
  const selectCalls = [];
  const prevIntent = { ...makeIntent(), _applied_site: 'startech' };
  const prevBuild = {
    Processor: { name: 'AMD Ryzen 5 5600 Processor AM4', price: 14200, url: 'https://shop.test/cpu' },
  };

  const result = await executeBuild(
    { message: 'make it a bit cheaper', site: 'startech', previousIntent: prevIntent, previousBuild: prevBuild },
    makeDeps({ selectCalls })
  );

  assert.equal(result.build.Processor.specs.socket, 'AM4');
  assert.ok(!selectCalls.includes('Processor'), 'the unchanged CPU is locked, not re-selected');
});

test('a throwing onStage hook never breaks a build', async () => {
  const result = await executeBuild({ message: 'gaming pc 60k', site: 'startech' }, makeDeps(), {
    onStage: () => { throw new Error('boom'); },
  });

  assert.ok(result.build.Processor);
});

test('job status exposes the current stage while processing', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let reachedSelecting;
  const selecting = new Promise((resolve) => { reachedSelecting = resolve; });

  initWorkers({
    buildFn: async (_payload, _deps, ctx) => {
      ctx.onStage('selecting');
      reachedSelecting();
      await gate;
      return { build: {}, total: 0, warnings: [] };
    },
    depsFactory: () => ({}),
    groqKeys: ['test-key'],
  });

  const { jobId } = createJob({ message: 'x', customKeys: {} });
  await selecting;

  const during = getJobStatus(jobId);
  assert.equal(during.status, 'processing');
  assert.equal(during.stage, 'selecting');

  release();
  await new Promise((resolve) => setTimeout(resolve, 20));

  const after = getJobStatus(jobId);
  assert.equal(after.status, 'completed');
  assert.equal(after.stage, undefined);
});
