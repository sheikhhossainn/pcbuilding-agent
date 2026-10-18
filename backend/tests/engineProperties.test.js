// Property/regression tests: the REAL engine (orchestrator, allocator, selector, repository,
// compatibility checker) over a slice of the live catalog. Only the LLM and the DB transport
// are stubbed, so a failure here is an engine failure.
import test from 'node:test';
import assert from 'node:assert/strict';

import catalog from './fixtures/miniCatalog.js';
import { executeBuild } from '../engine/buildOrchestrator.js';
import { createCompatibilityChecker } from '../engine/compatibilityChecker.js';
import { createBudgetAllocator } from '../engine/budgetAllocator.js';
import { createPartSelector } from '../engine/partSelector.js';
import { createPartRepository } from '../utils/partRepository.js';
import { createSpecInference } from '../utils/specInference.js';
import { createCacheManager } from '../utils/cacheManager.js';
import { applyIntentOverrides } from '../engine/intentOverrides.js';
import { normalizePatch } from '../engine/followUpPatch.js';
import { BUDGET } from '../config/budget.js';

const CATEGORIES = [
  'Processor', 'Motherboard', 'RAM', 'Storage', 'Graphics Card', 'PSU',
  'Casing', 'CPU Cooler', 'Monitor', 'Mouse', 'Keyboard', 'UPS',
];

// ─── engine wiring over an in-memory catalog ───
function createEngine(rows = catalog) {
  const db = {
    async execute({ sql, args }) {
      if (sql.startsWith('SELECT * FROM components WHERE site')) {
        const [site, category] = args;
        let i = 2;
        const min = sql.includes('price >= ?') ? args[i++] : null;
        const max = sql.includes('price <= ?') ? args[i++] : null;
        const dir = sql.includes('ASC') ? 1 : -1;
        return {
          rows: rows
            .filter((r) => r.site === site && r.category === category && r.in_stock
              && (min === null || r.price >= min) && (max === null || r.price <= max))
            .sort((a, b) => dir * (a.price - b.price) || a.name.localeCompare(b.name)),
        };
      }
      if (sql.startsWith('SELECT name, specs FROM components WHERE category')) {
        const site = sql.includes('AND site = ?') ? args[1] : null;
        return { rows: rows.filter((r) => r.category === args[0] && r.in_stock && (!site || r.site === site)) };
      }
      if (sql.startsWith('SELECT in_stock, price FROM components WHERE url')) {
        const r = rows.find((x) => x.url === args[0]);
        return { rows: r ? [{ in_stock: r.in_stock, price: r.price }] : [] };
      }
      throw new Error(`unhandled SQL: ${sql}`);
    },
  };

  const specInference = createSpecInference();
  const compatibilityChecker = createCompatibilityChecker();
  const partRepository = createPartRepository({ db, specInference, cache: createCacheManager() });
  const budgetAllocator = createBudgetAllocator({ partRepository, compatChecker: compatibilityChecker });
  const partSelector = createPartSelector({ partRepository, compatChecker: compatibilityChecker });
  return { specInference, compatibilityChecker, partRepository, budgetAllocator, partSelector };
}

const engine = createEngine();

function makeIntent({ budget, use = 'gaming', noGpu = false, cpuBrand = null, gpuBrand = null, ddr = null, peripherals = true }) {
  const weights = {
    gaming: { Processor: 2.5, Motherboard: 1.5, RAM: 1.5, 'Graphics Card': 5, Storage: 1.5, PSU: 1.5, Casing: 1, Monitor: 2 },
    editing: { Processor: 4, Motherboard: 2, RAM: 3, 'Graphics Card': 3, Storage: 2.5, PSU: 1.5, Casing: 1, Monitor: 2 },
    office: { Processor: 3, Motherboard: 2, RAM: 2, 'Graphics Card': 0, Storage: 2.5, PSU: 1, Casing: 1, Monitor: 2 },
    general: { Processor: 3, Motherboard: 2, RAM: 2, 'Graphics Card': 2, Storage: 2, PSU: 1.5, Casing: 1, Monitor: 1.5 },
  }[use];

  const strategy = Object.fromEntries(CATEGORIES.map((c) => [c, {
    weight: 0, required: false, required_keywords: [], exclude_keywords: [], structured_reqs: {},
  }]));
  for (const c of ['Processor', 'Motherboard', 'RAM', 'Storage', 'PSU', 'Casing']) {
    strategy[c] = { ...strategy[c], weight: weights[c], required: true };
  }
  if (!noGpu && weights['Graphics Card'] > 0) strategy['Graphics Card'] = { ...strategy['Graphics Card'], weight: weights['Graphics Card'], required: true };
  if (peripherals) {
    strategy.Monitor = { ...strategy.Monitor, weight: weights.Monitor, required: true };
    strategy.Mouse = { ...strategy.Mouse, weight: 0.3, required: true };
    strategy.Keyboard = { ...strategy.Keyboard, weight: 0.3, required: true };
  }
  if (ddr) {
    strategy.RAM.required_keywords.push(ddr);
    strategy.Motherboard.required_keywords.push(ddr);
  }
  return {
    budget_bdt: budget, use_case: use, no_gpu: noGpu, preferred_site: null,
    preferred_cpu_brand: cpuBrand, preferred_gpu_brand: gpuBrand, component_strategy: strategy,
  };
}

async function build(spec, { site = 'startech', message = 'build me a pc', extra = {}, eng = engine, patch = null, patchError = null } = {}) {
  const intent = makeIntent(spec);
  const deps = {
    intentExtractor: {
      extract: async () => JSON.parse(JSON.stringify(intent)),
      // A follow-up is read as a patch; without one the full-intent path above is used.
      ...((patch || patchError) && {
        extractPatch: async () => { if (patchError) throw patchError; return normalizePatch(patch); },
      }),
    },
    explanationGenerator: { generate: async () => 'ok' },
    compatibilityChecker: eng.compatibilityChecker,
    budgetAllocator: eng.budgetAllocator,
    partSelector: eng.partSelector,
    partRepository: eng.partRepository,
    specInference: eng.specInference,
    intentOverrideApplier: applyIntentOverrides,
  };
  const realLog = [console.log, console.warn, console.error];
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  try {
    return await executeBuild({ message, site, ...extra }, deps);
  } finally {
    [console.log, console.warn, console.error] = realLog;
  }
}

const parts = (b) => Object.entries(b).filter(([, p]) => p);
const ceilingOf = (budget) => budget + Math.min(budget * BUDGET.CEILING_OVERSPEND_PERCENTAGE, BUDGET.CEILING_OVERSPEND_MAX_BDT);

/** Hard invariants every delivered build must satisfy. */
function assertSound(result, spec, label) {
  const { build: b, total, warnings } = result;
  const cc = engine.compatibilityChecker;

  for (const c of ['Processor', 'Motherboard', 'RAM', 'PSU']) assert.ok(b[c], `${label}: missing ${c}`);

  const sum = parts(b).reduce((s, [, p]) => s + p.price, 0);
  assert.equal(total, sum, `${label}: total does not equal the sum of parts`);
  assert.ok(total <= ceilingOf(spec.budget), `${label}: ${total} is over the ceiling`);

  assert.ok(cc.isSocketCompatible(b.Processor, b.Motherboard), `${label}: socket mismatch ${b.Processor.name} / ${b.Motherboard.name}`);
  assert.ok(cc.isRamTypeCompatible(b.Motherboard, b.RAM), `${label}: RAM mismatch ${b.Motherboard.name} / ${b.RAM.name}`);
  assert.notEqual(b.RAM.specs.ram_type, 'DDR3', `${label}: DDR3 RAM in a modern build (${b.RAM.name})`);
  assert.ok(!/ecc|rdimm|sodimm/i.test(b.RAM.name), `${label}: server/laptop RAM ${b.RAM.name}`);

  if (spec.ddr) {
    assert.ok(
      b.RAM.specs.ram_type === spec.ddr || warnings.some((w) => /ddr/i.test(w)),
      `${label}: asked for ${spec.ddr}, got ${b.RAM.name} without saying so`
    );
  }
  if (spec.cpuBrand) assert.equal(b.Processor.specs.brand, spec.cpuBrand, `${label}: CPU brand ignored`);
  if (spec.noGpu) {
    assert.equal(b['Graphics Card'] ?? null, null, `${label}: GPU in a no-GPU build`);
    assert.ok(cc.cpuHasIntegratedGraphics(b.Processor), `${label}: no-GPU build on a CPU without graphics`);
  }

  const need = engine.budgetAllocator.computeTargetPsuWattage(b.Processor, b['Graphics Card'], spec.use, spec.budget);
  assert.ok((b.PSU.specs.wattage || 0) >= need, `${label}: PSU ${b.PSU.specs.wattage}W below the ${need}W target`);

  if ((b.Processor.specs.tdp || 65) >= 105) assert.ok(b['CPU Cooler'], `${label}: ${b.Processor.name} has no cooler`);
  if (b['Graphics Card']) assert.ok(cc.isGpuAdequateForUseCase(b['Graphics Card'], spec.use), `${label}: unsuitable GPU ${b['Graphics Card'].name}`);

  for (const w of warnings) assert.ok(!/INCOMPATIBLE/.test(w), `${label}: engine reports ${w}`);
  for (const [c, p] of parts(b)) {
    assert.ok(!/portable|stand|mount/i.test(p.name) || !['Monitor'].includes(c), `${label}: ${c} is an accessory (${p.name})`);
  }
}

// ─── the grid ───
const BUDGETS = [45000, 60000, 80000, 100000, 150000, 250000];
const USES = ['gaming', 'editing', 'office', 'general'];

for (const budget of BUDGETS) {
  for (const use of USES) {
    // A gaming/editing PC needs a real GPU: below 60k the honest answer is a refusal that
    // names the minimum price (covered by the "cannot fit" test below).
    if (budget < 60000 && (use === 'gaming' || use === 'editing')) continue;
    test(`sound build: ${use} ${budget / 1000}k`, async () => {
      const spec = { budget, use };
      const result = await build(spec);
      assertSound(result, spec, `${use} ${budget}`);
    });
  }
}

for (const [name, spec] of [
  ['DDR4 requested at 150k', { budget: 150000, use: 'general', ddr: 'DDR4' }],
  ['DDR4 requested at 250k (Core Ultra / AM5 must be skipped)', { budget: 250000, use: 'editing', ddr: 'DDR4' }],
  ['DDR5 requested at 100k', { budget: 100000, use: 'gaming', ddr: 'DDR5' }],
  ['Intel preferred', { budget: 100000, use: 'gaming', cpuBrand: 'intel' }],
  ['AMD preferred', { budget: 100000, use: 'gaming', cpuBrand: 'amd' }],
  ['no dedicated GPU at 80k', { budget: 80000, use: 'office', noGpu: true }],
  ['no dedicated GPU gaming at 80k', { budget: 80000, use: 'gaming', noGpu: true }],
]) {
  test(`sound build: ${name}`, async () => {
    const result = await build(spec);
    assertSound(result, spec, name);
  });
}

// ─── specific regressions ───
test('RAM is never missing when the board forces a pricier memory generation', async () => {
  // At 100-120k the engine used to pick a DDR5 board whose cheapest kit was over RAM's share
  // and then report "Missing: RAM".
  for (const budget of [70000, 80000, 100000, 120000]) {
    const result = await build({ budget, use: 'gaming' });
    assert.ok(result.build.RAM, `no RAM at ${budget}`);
  }
});

test('a build that cannot fit is refused with a clear, classified error (never a crash)', async () => {
  for (const budget of [20000, 25000, 30000]) {
    try {
      const result = await build({ budget, use: 'gaming' });
      assert.ok(result.total <= ceilingOf(budget));
    } catch (error) {
      assert.ok(error.code, `unclassified error at ${budget}: ${error.message}`);
      assert.match(error.message, /BDT/);
    }
  }
});

test('a tight budget leaves out peripherals and says so', async () => {
  const result = await build({ budget: 45000, use: 'office' });
  for (const c of ['Monitor', 'Mouse', 'Keyboard']) {
    if (!result.build[c]) assert.ok(result.warnings.some((w) => w.includes(c)), `${c} dropped silently`);
  }
});

test('RAM capacity honours the default floor (no 4GB sticks above 30k)', async () => {
  const result = await build({ budget: 100000, use: 'gaming' });
  const gb = Number((result.build.RAM.name.match(/(\d+)\s*gb/i) || [])[1] || 0);
  assert.ok(gb >= 8, `only ${gb}GB in ${result.build.RAM.name}`);
});

test('follow-up: raising the budget re-checks the PSU against the new CPU/GPU', async () => {
  const first = await build({ budget: 60000, use: 'gaming' });
  const second = await build({ budget: 150000, use: 'gaming' }, {
    message: 'raise the budget to 150k',
    extra: {
      previousBuild: JSON.parse(JSON.stringify(first.build)),
      previousIntent: JSON.parse(JSON.stringify(first.intent)),
    },
  });
  assertSound(second, { budget: 150000, use: 'gaming' }, 'follow-up 150k');
});

test('follow-up: asking for DDR5 on a DDR4 build re-picks the platform', async () => {
  const first = await build({ budget: 100000, use: 'gaming', ddr: 'DDR4' });
  const second = await build({ budget: 100000, use: 'gaming', ddr: 'DDR5' }, {
    message: 'switch to DDR5',
    extra: {
      previousBuild: JSON.parse(JSON.stringify(first.build)),
      previousIntent: JSON.parse(JSON.stringify(first.intent)),
    },
  });
  assert.ok(second.build.RAM);
  assert.equal(second.build.RAM.specs.ram_type, 'DDR5');
});

test('follow-up: parts that leave no room for the change trigger a clean re-plan', async () => {
  const first = await build({ budget: 100000, use: 'gaming' });
  const second = await build({ budget: 100000, use: 'gaming' }, {
    message: 'I want a 2TB ssd',
    extra: {
      previousBuild: JSON.parse(JSON.stringify(first.build)),
      previousIntent: JSON.parse(JSON.stringify(first.intent)),
    },
  });
  assert.ok(second.build.Storage, 'the changed part must still be present');
  assert.ok(second.total <= ceilingOf(100000));
});

test('follow-up: a part price in the message does not replace the total budget', async () => {
  const first = await build({ budget: 100000, use: 'gaming' });
  // The LLM misreads "monitor around 20k" as the new total.
  const second = await build({ budget: 20000, use: 'gaming' }, {
    message: 'find a monitor around 20k and use the saved money for a stronger PSU',
    extra: {
      previousBuild: JSON.parse(JSON.stringify(first.build)),
      previousIntent: JSON.parse(JSON.stringify(first.intent)),
    },
  });
  assert.equal(second.intent.budget_bdt, 100000);
  assert.ok(second.total > 50000, `total collapsed to ${second.total}`);
});

test('follow-up: kept parts are not upgraded with leftover money, and the leftover is reported', async () => {
  const first = await build({ budget: 100000, use: 'gaming' });
  const dropped = ['Monitor', 'Storage'];
  const second = await build({ budget: 100000, use: 'gaming' }, {
    message: 'remove the monitor and the ssd, I have my own',
    extra: {
      previousBuild: JSON.parse(JSON.stringify({ ...first.build, Monitor: null, Storage: null })),
      previousIntent: JSON.parse(JSON.stringify(first.intent)),
      removedCategories: dropped,
    },
  });
  for (const category of dropped) assert.equal(second.build[category], null);
  for (const [category, part] of parts(first.build)) {
    if (dropped.includes(category)) continue;
    assert.equal(second.build[category]?.url, part.url, `${category} changed although it was kept`);
  }
  assert.ok(100000 - second.total > 2000, 'scenario should leave money unspent');
  assert.ok(second.warnings.some((w) => /unspent/.test(w)), 'leftover budget was not reported');
  assert.ok(second.notes.some((w) => /unspent/.test(w)));
});

const refine = (first, message, patch, spec = { budget: 100000, use: 'gaming' }) => build(spec, {
  message,
  patch,
  extra: {
    previousBuild: JSON.parse(JSON.stringify(first.build)),
    previousIntent: JSON.parse(JSON.stringify(first.intent)),
  },
});

/** A 100k gaming build whose monitor was swapped for a pricey one, with the budget raised to match. */
async function buildWithPriceyMonitor({ min = 35000, max = 36000 } = {}) {
  const first = await build({ budget: 100000, use: 'gaming' });
  const [monitor] = await engine.partRepository.query('startech', 'Monitor', { min, max }, 'price_asc');
  assert.ok(monitor, `fixture should have a ${min}-${max} monitor`);
  const budget = 100000 + monitor.price - first.build.Monitor.price;
  first.build.Monitor = monitor;
  first.intent.budget_bdt = budget;
  first.spec = { budget, use: 'gaming' };
  return first;
}

const urls = (b) => Object.fromEntries(parts(b).map(([c, p]) => [c, p.url]));

test('patch follow-up: "monitor around 20k, saved money to a stronger PSU" re-searches only those two', async () => {
  const first = await buildWithPriceyMonitor();
  const second = await refine(first, 'find a monitor around 20k and use the saved money for a stronger PSU', {
    ops: [
      { category: 'Monitor', price_target: 20000 },
      { category: 'PSU', direction: 'up', absorb_savings: true },
    ],
  }, first.spec);

  assert.deepEqual([...second.scope.changing].sort(), ['Monitor', 'PSU']);
  const before = urls(first.build);
  const after = urls(second.build);
  for (const category of Object.keys(before)) {
    if (category === 'Monitor' || category === 'PSU') continue;
    assert.equal(after[category], before[category], `${category} changed although the message did not touch it`);
  }
  assert.equal(second.intent.budget_bdt, first.spec.budget);

  const monitor = second.build.Monitor;
  assert.ok(monitor.price >= 17000 && monitor.price <= 23000, `monitor ${monitor.price} is not around 20k`);
  assert.ok(second.build.PSU.specs.wattage > first.build.PSU.specs.wattage, 'PSU did not get stronger');
  assert.ok(second.total <= ceilingOf(first.spec.budget));
  assertSound(second, first.spec, 'patch monitor+psu');
});

test('patch follow-up: savings go only to the named part, which is capped', async () => {
  // An 86k OLED swapped for a ~56k panel frees ~30k: enough for a 24k+ PSU if nothing stopped it.
  const first = await buildWithPriceyMonitor({ min: 86000, max: 86000 });
  const second = await refine(first, 'cheaper monitor, rest into the psu', {
    ops: [
      { category: 'Monitor', direction: 'down' },
      { category: 'PSU', direction: 'up', absorb_savings: true },
    ],
  }, first.spec);
  assert.ok(second.build.Monitor.price < first.build.Monitor.price);
  const cap = Math.max(9000, Math.round(first.spec.budget * 0.12));
  assert.ok(second.build.PSU.price <= cap, `PSU ${second.build.PSU.price} ran away with the savings (cap ${cap})`);
  assert.equal(second.build['Graphics Card'].url, first.build['Graphics Card'].url);
  assert.equal(second.build.Processor.url, first.build.Processor.url);
});

test('patch follow-up: a higher budget with a named part spends the extra on that part only', async () => {
  const first = await build({ budget: 100000, use: 'gaming' });
  const second = await refine(first, 'raise the budget to 150k for a better gpu', {
    budget_bdt: 150000,
    ops: [{ category: 'Graphics Card', direction: 'up' }],
  }, { budget: 150000, use: 'gaming' });
  assert.equal(second.intent.budget_bdt, 150000);
  assert.equal(second.build.Processor.url, first.build.Processor.url, 'CPU was redone though only the GPU was named');
  assert.ok(second.build['Graphics Card'].price > first.build['Graphics Card'].price);
  assert.ok(!second.scope.changing.includes('Processor'));
});

test('patch follow-up: an unclear message is a question, not a rebuild', async () => {
  const first = await build({ budget: 100000, use: 'gaming' });
  await assert.rejects(
    refine(first, 'make it better', { ops: [], clarify: 'Better how: faster GPU, more storage, or something else?' }),
    (e) => e.code === 'NEEDS_CLARIFICATION' && /Better how/.test(e.userMessage),
  );
});

test('patch follow-up: if the patch reader fails, the full-intent reader still serves the refine', async () => {
  const first = await build({ budget: 100000, use: 'gaming' });
  const second = await build({ budget: 100000, use: 'gaming' }, {
    message: 'build me a pc',
    patchError: new Error('model down'),
    extra: {
      previousBuild: JSON.parse(JSON.stringify(first.build)),
      previousIntent: JSON.parse(JSON.stringify(first.intent)),
    },
  });
  assertSound(second, { budget: 100000, use: 'gaming' }, 'patch fallback');
});

test('patch follow-up: "start over" ignores the previous build', async () => {
  const first = await build({ budget: 100000, use: 'gaming' });
  const second = await refine(first, 'start over, new build', { restart: true });
  assert.deepEqual(second.scope, null);
});

test('invalid requests are classified build errors', async () => {
  await assert.rejects(build({ budget: 80000 }, { message: '' }), (e) => e.code === 'INVALID_MESSAGE');
  await assert.rejects(build({ budget: 80000 }, { site: 'amazon' }), (e) => e.code === 'INVALID_SITE');
  await assert.rejects(build({ budget: 5000 }), (e) => e.code === 'BUDGET_TOO_LOW');
});

test('the same request always yields the same build', async () => {
  const a = await build({ budget: 100000, use: 'gaming' });
  const b = await build({ budget: 100000, use: 'gaming' });
  assert.deepEqual(parts(a.build).map(([c, p]) => [c, p.url]), parts(b.build).map(([c, p]) => [c, p.url]));
});
