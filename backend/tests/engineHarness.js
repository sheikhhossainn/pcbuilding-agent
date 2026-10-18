// Shared wiring for the engine tests: the REAL orchestrator, allocator, selector, repository and
// compatibility checker over an in-memory slice of the live catalog. Only the LLM and the DB
// transport are stubbed, so a failure in a test built on this is an engine failure.
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

export const CATEGORIES = [
  'Processor', 'Motherboard', 'RAM', 'Storage', 'Graphics Card', 'PSU',
  'Casing', 'CPU Cooler', 'Monitor', 'Mouse', 'Keyboard', 'UPS',
];

// ─── engine wiring over an in-memory catalog ───
export function createEngine(rows = catalog) {
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
      if (sql.startsWith('SELECT url, in_stock, price FROM components WHERE url IN')) {
        return { rows: rows.filter((r) => args.includes(r.url)).map((r) => ({ url: r.url, in_stock: r.in_stock, price: r.price })) };
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

export const engine = createEngine();

export function makeIntent({ budget, use = 'gaming', noGpu = false, cpuBrand = null, gpuBrand = null, ddr = null, peripherals = true }) {
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

export async function build(spec, { site = 'startech', message = 'build me a pc', extra = {}, eng = engine, patch = null, patchError = null, ctx = {} } = {}) {
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
  // ENGINE_LOGS=1 shows the engine's own log while debugging a failing scenario.
  if (!process.env.ENGINE_LOGS) { console.log = () => {}; console.warn = () => {}; console.error = () => {}; }
  try {
    return await executeBuild({ message, site, ...extra }, deps, ctx);
  } finally {
    [console.log, console.warn, console.error] = realLog;
  }
}

