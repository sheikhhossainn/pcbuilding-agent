// Offline stress harness for the recommendation engine.
//
// Runs the REAL orchestrator, allocator, selector, repository and compatibility checker against a
// snapshot of the live catalog (see snapshot.mjs). Only the LLM (intent + explanation) and the
// database transport are stubbed, so every failure here is an engine failure, not infrastructure.
//
// Usage: node tests/stress/harness.mjs <catalog.json> [--json out.json] [--quick]

import fs from 'fs';
import { executeBuild } from '../../engine/buildOrchestrator.js';
import { createCompatibilityChecker } from '../../engine/compatibilityChecker.js';
import { createBudgetAllocator } from '../../engine/budgetAllocator.js';
import { createPartSelector } from '../../engine/partSelector.js';
import { createPartRepository } from '../../utils/partRepository.js';
import { createSpecInference } from '../../utils/specInference.js';
import { createCacheManager } from '../../utils/cacheManager.js';
import { applyIntentOverrides } from '../../engine/intentOverrides.js';
import { BUDGET } from '../../config/budget.js';

// ─── args ───
const args = process.argv.slice(2);
const catalogPath = args.find((a) => !a.startsWith('--'));
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const QUICK = args.includes('--quick');
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const VERBOSE = args.includes('--verbose');
if (!catalogPath) throw new Error('usage: node harness.mjs <catalog.json> [--json out.json] [--quick]');

// Engine is chatty; the harness prints its own report.
const realLog = console.log;
const realWarn = console.warn;
const realErr = console.error;
const mute = () => { if (VERBOSE) return; console.log = () => {}; console.warn = () => {}; console.error = () => {}; };
const unmute = () => { console.log = realLog; console.warn = realWarn; console.error = realErr; };

// ─── fake DB over the snapshot ───
const rows = JSON.parse(fs.readFileSync(catalogPath, 'utf8')).map((r, i) => ({ ...r, id: String(i), last_updated: null }));
const outOfStock = new Set(); // urls knocked out by chaos scenarios

const fakeDb = {
  async execute({ sql, args: a }) {
    if (sql.startsWith('SELECT * FROM components WHERE site')) {
      const [site, category] = a;
      let i = 2;
      const min = sql.includes('price >= ?') ? a[i++] : null;
      const max = sql.includes('price <= ?') ? a[i++] : null;
      const limit = a[i];
      const dir = sql.includes('ASC') ? 1 : -1;
      const out = rows
        .filter((r) => r.site === site && r.category === category && r.in_stock && !outOfStock.has(r.url)
          && (min === null || r.price >= min) && (max === null || r.price <= max))
        .sort((x, y) => dir * (x.price - y.price) || x.name.localeCompare(y.name))
        .slice(0, limit);
      return { rows: out };
    }
    if (sql.startsWith('SELECT name, specs FROM components WHERE category')) {
      const site = sql.includes('AND site = ?') ? a[1] : null;
      return {
        rows: rows.filter((r) => r.category === a[0] && r.in_stock && !outOfStock.has(r.url) && (!site || r.site === site)),
      };
    }
    if (sql.startsWith('SELECT in_stock, price FROM components WHERE url')) {
      const r = rows.find((x) => x.url === a[0]);
      return { rows: r ? [{ in_stock: outOfStock.has(r.url) ? 0 : r.in_stock, price: r.price }] : [] };
    }
    throw new Error(`fakeDb: unhandled SQL ${sql}`);
  },
};

// ─── real engine wiring ───
const specInference = createSpecInference();
const compatibilityChecker = createCompatibilityChecker();
const cache = createCacheManager({ redisClient: null, useRedis: false });
const partRepository = createPartRepository({ db: fakeDb, specInference, cache });
const budgetAllocator = createBudgetAllocator({ partRepository, compatChecker: compatibilityChecker });
const partSelector = createPartSelector({ partRepository, compatChecker: compatibilityChecker });

const CATEGORIES = [
  'Processor', 'Motherboard', 'RAM', 'Storage', 'Graphics Card', 'PSU',
  'Casing', 'CPU Cooler', 'Monitor', 'Mouse', 'Keyboard', 'UPS',
];

// What a well-behaved LLM returns for a spec (weights follow the prompt's intent).
function makeIntent(spec) {
  const { budget, use = 'gaming', noGpu = false, cpuBrand = null, gpuBrand = null,
    ramGb = null, storageTb = null, ddr = null, peripherals = true, cooler = false, ups = false,
    monitorHz = null, extra = {} } = spec;

  const w = {
    gaming: { Processor: 2.5, Motherboard: 1.5, RAM: 1.5, 'Graphics Card': 5, Storage: 1.5, PSU: 1.5, Casing: 1, Monitor: 2 },
    editing: { Processor: 4, Motherboard: 2, RAM: 3, 'Graphics Card': 3, Storage: 2.5, PSU: 1.5, Casing: 1, Monitor: 2 },
    office: { Processor: 3, Motherboard: 2, RAM: 2, 'Graphics Card': 0, Storage: 2.5, PSU: 1, Casing: 1, Monitor: 2 },
    general: { Processor: 3, Motherboard: 2, RAM: 2, 'Graphics Card': 2, Storage: 2, PSU: 1.5, Casing: 1, Monitor: 1.5 },
  }[use];

  const strategy = {};
  for (const c of CATEGORIES) {
    strategy[c] = { weight: 0, required: false, required_keywords: [], exclude_keywords: [], structured_reqs: {} };
  }
  for (const c of ['Processor', 'Motherboard', 'RAM', 'Storage', 'PSU', 'Casing']) {
    strategy[c] = { ...strategy[c], weight: w[c], required: true };
  }
  if (!noGpu && w['Graphics Card'] > 0) strategy['Graphics Card'] = { ...strategy['Graphics Card'], weight: w['Graphics Card'], required: true };
  if (peripherals) {
    strategy.Monitor = { ...strategy.Monitor, weight: w.Monitor, required: true };
    strategy.Mouse = { ...strategy.Mouse, weight: 0.3, required: true };
    strategy.Keyboard = { ...strategy.Keyboard, weight: 0.3, required: true };
  }
  if (cooler) strategy['CPU Cooler'] = { ...strategy['CPU Cooler'], weight: 1, required: true };
  if (ups) strategy.UPS = { ...strategy.UPS, weight: 0.8, required: true };

  if (ramGb) strategy.RAM.structured_reqs.min_gb = ramGb;
  if (storageTb) strategy.Storage.structured_reqs.min_tb = storageTb;
  if (monitorHz) strategy.Monitor.structured_reqs.min_hz = monitorHz;
  if (ddr) { strategy.RAM.required_keywords.push(ddr); strategy.Motherboard.required_keywords.push(ddr); }

  return {
    budget_bdt: budget,
    use_case: use,
    no_gpu: noGpu,
    preferred_site: null,
    preferred_cpu_brand: cpuBrand,
    preferred_gpu_brand: gpuBrand,
    component_strategy: strategy,
    ...extra,
  };
}

function depsFor(intent) {
  return {
    intentExtractor: { extract: async () => JSON.parse(JSON.stringify(intent)) },
    explanationGenerator: { generate: async () => 'ok' },
    compatibilityChecker,
    budgetAllocator,
    partSelector,
    partRepository,
    specInference,
    intentOverrideApplier: applyIntentOverrides,
  };
}

async function runBuild(spec, site, message, extraPayload = {}) {
  const intent = makeIntent(spec);
  mute();
  try {
    const result = await executeBuild({ message, site, ...extraPayload }, depsFor(intent));
    return { ok: true, result };
  } catch (error) {
    return { ok: false, error };
  } finally {
    unmute();
  }
}

// ─── invariants ───
const violations = []; // { invariant, severity, scenario, detail }
const stats = { runs: 0, ok: 0, buildErrors: {}, crashes: 0 };
const runLog = []; // { label, budget, use, site, ok, code, total }
const v = (invariant, severity, scenario, detail) => violations.push({ invariant, severity, scenario, detail });

const parts = (build) => Object.entries(build).filter(([, p]) => p);

function check(label, spec, site, message, run) {
  stats.runs++;
  if (ONLY === 'FOLLOWUP' || ONLY === 'CHAOS') {
    realLog(`=== ${label}`);
    if (run.ok) {
      for (const [c, p] of parts(run.result.build)) realLog(`  ${c.padEnd(14)} ${String(p.price).padStart(7)}  ${p.name}`);
      realLog(`  total ${run.result.total} / budget ${spec.budget}`);
      for (const w of run.result.warnings) realLog('  ! ' + w);
    } else realLog('  ERROR ' + (run.error.code || '') + ' ' + run.error.message);
  }
  runLog.push({ label, budget: spec.budget, use: spec.use, site, ok: run.ok, code: run.ok ? null : (run.error.code || 'CRASH'), message: run.ok ? null : run.error.message, total: run.ok ? run.result.total : null });
  if (!run.ok) {
    const code = run.error.code;
    if (code) {
      stats.buildErrors[code] = (stats.buildErrors[code] || 0) + 1;
      // Reasonable refusals are fine; but a refusal at a healthy budget is a recommendation failure.
      if (!label.startsWith('CHAOS') && ['INVENTORY_INSUFFICIENT', 'BUDGET_FLOOR_EXCEEDED'].includes(code) && (spec.budget >= 50000 || (spec.budget >= 40000 && !spec.gpuBrand && !spec.noGpu && !['gaming', 'editing'].includes(spec.use)))) {
        v('refusal-at-healthy-budget', 'high', label, `${code}: ${run.error.message}`);
      }
    } else {
      stats.crashes++;
      v('unclassified-exception', 'high', label, run.error.message);
    }
    return;
  }
  stats.ok++;
  const { build, total, warnings, intent, power } = run.result;
  const ceiling = spec.budget + Math.min(spec.budget * BUDGET.CEILING_OVERSPEND_PERCENTAGE, BUDGET.CEILING_OVERSPEND_MAX_BDT);
  const sum = parts(build).reduce((s, [, p]) => s + p.price, 0);

  if (sum !== total) v('total-matches-sum', 'high', label, `total ${total} != sum ${sum}`);
  if (total > ceiling) v('over-ceiling', 'high', label, `${total} > ${ceiling}`);

  for (const c of ['Processor', 'Motherboard', 'RAM', 'PSU']) if (!build[c]) v('missing-core-part', 'high', label, c);
  if (!build.Storage && makeIntent(spec).component_strategy.Storage.required) v('missing-storage', 'medium', label, 'no storage');
  if (!build.Casing && makeIntent(spec).component_strategy.Casing.required) v('missing-casing', 'low', label, 'no casing');

  const names = parts(build).map(([, p]) => p.url);
  if (new Set(names).size !== names.length) v('duplicate-part', 'high', label, 'same listing used twice');

  const cpu = build.Processor;
  const mb = build.Motherboard;
  const ram = build.RAM;
  const gpu = build['Graphics Card'];
  const psu = build.PSU;

  if (cpu && mb) {
    const cs = cpu.specs?.socket;
    const ms = mb.specs?.socket;
    if (cs && ms && cs !== 'UNKNOWN' && ms !== 'UNKNOWN' && cs !== ms) v('socket-mismatch', 'critical', label, `${cpu.name} / ${mb.name}`);
    if (!compatibilityChecker.isSocketCompatible(cpu, mb)) v('socket-chipset-incompatible', 'critical', label, `${cpu.name} / ${mb.name}`);
    if (cs === 'UNKNOWN' || ms === 'UNKNOWN') v('unverified-socket', 'medium', label, `${cpu.name} (${cs}) / ${mb.name} (${ms})`);
  }
  if (mb && ram) {
    const mt = mb.specs?.ram_type;
    const rt = ram.specs?.ram_type;
    if (mt && rt && mt !== 'UNKNOWN' && rt !== 'UNKNOWN' && mt !== rt) v('ram-type-mismatch', 'critical', label, `${mb.name} (${mt}) / ${ram.name} (${rt})`);
    if (mt === 'UNKNOWN' || rt === 'UNKNOWN' || !mt || !rt) v('unverified-ram-type', 'medium', label, `${mb.name} (${mt}) / ${ram.name} (${rt})`);
  }
  if (cpu && ram) {
    const ct = cpu.specs?.ram_type;
    const rt = ram.specs?.ram_type;
    if (ct && rt && ct !== 'UNKNOWN' && rt !== 'UNKNOWN' && ct !== rt && cpu.specs.socket !== 'LGA1700') {
      v('cpu-ram-type-mismatch', 'critical', label, `${cpu.name} (${ct}) / ${ram.name} (${rt})`);
    }
  }

  // DDR request honored
  if (spec.ddr && ram && ram.specs?.ram_type !== spec.ddr && !warnings.some((w) => /ddr/i.test(w))) {
    v('ddr-request-ignored', 'high', label, `wanted ${spec.ddr}, got ${ram.name} (${ram.specs?.ram_type})`);
  }
  if (spec.ddr && mb && mb.specs?.ram_type !== spec.ddr && mb.specs?.ram_type !== 'UNKNOWN' && !warnings.some((w) => /ddr/i.test(w))) {
    v('ddr-request-ignored-board', 'high', label, `wanted ${spec.ddr}, got ${mb.name} (${mb.specs?.ram_type})`);
  }

  // Brand preferences
  const degradedBrand = warnings.some((w) => /brand preference/i.test(w));
  if (spec.cpuBrand && cpu && cpu.specs?.brand !== spec.cpuBrand && !degradedBrand) v('cpu-brand-ignored', 'high', label, `${spec.cpuBrand} -> ${cpu.name}`);
  if (spec.gpuBrand && gpu && gpu.specs?.gpu_brand !== spec.gpuBrand && !degradedBrand) v('gpu-brand-ignored', 'high', label, `${spec.gpuBrand} -> ${gpu.name}`);
  if (spec.gpuBrand && !gpu && !spec.noGpu && spec.budget >= 60000) v('gpu-missing-when-requested', 'high', label, `${spec.gpuBrand} requested, none selected`);

  // No-GPU builds
  if (spec.noGpu) {
    if (gpu) v('gpu-despite-no-gpu', 'high', label, gpu.name);
    if (cpu && !compatibilityChecker.cpuHasIntegratedGraphics(cpu)) v('no-igpu-on-no-gpu-build', 'critical', label, cpu.name);
  }

  // Gaming/editing builds should get a GPU at sane budgets
  if (!spec.noGpu && ['gaming', 'editing'].includes(spec.use) && spec.budget >= 50000 && !gpu) {
    v('no-gpu-on-gaming-build', 'high', label, 'gaming/editing build without GPU');
  }

  // Power
  if (psu && cpu) {
    const need = budgetAllocator.computeTargetPsuWattage(cpu, gpu, spec.use, spec.budget);
    const have = psu.specs?.wattage || 0;
    if (have < need) v('psu-below-target', have < need * 0.85 ? 'critical' : 'medium', label, `${psu.name} ${have}W < ${need}W for ${cpu.name}${gpu ? ' + ' + gpu.name : ''}`);
    if (power && power.loadPct > 90) v('psu-overloaded', 'high', label, `load ${power.loadPct}%`);
  }

  // Cooler for hot CPUs
  if (cpu && (cpu.specs?.tdp || 65) >= 105 && !build['CPU Cooler']) v('hot-cpu-no-cooler', 'medium', label, `${cpu.name} tdp ${cpu.specs.tdp}`);

  // Balance
  if (cpu && gpu && !compatibilityChecker.isCpuBalanced(cpu, gpu)) v('cpu-gpu-imbalance', 'medium', label, `${cpu.name} + ${gpu.name} (${gpu.price})`);
  if (gpu && !compatibilityChecker.isGpuAdequateForUseCase(gpu, spec.use)) v('gpu-inadequate', 'medium', label, `${gpu.name} for ${spec.use}`);

  // Modern parts
  if (cpu && !compatibilityChecker.isCpuModern(cpu, spec.budget)) v('ancient-cpu', 'medium', label, `${cpu.name} at ${spec.budget}`);

  // Spec requests
  if (spec.ramGb && ram) {
    const m = ram.name.toLowerCase().match(/(\d+)\s*gb/);
    const gb = m ? parseInt(m[1], 10) : 0;
    if (gb < spec.ramGb && !warnings.some((w) => /RAM/.test(w))) v('ram-request-unmet-silent', 'medium', label, `${spec.ramGb}GB wanted: ${ram.name}`);
  }
  if (spec.storageTb && build.Storage) {
    const n = build.Storage.name.toLowerCase();
    const tb = n.match(/(\d+(?:\.\d+)?)\s*tb/);
    const gb = n.match(/(\d+)\s*gb/);
    const cap = tb ? parseFloat(tb[1]) * 1000 : gb ? parseInt(gb[1], 10) : 0;
    if (cap < spec.storageTb * 1000 * 0.9 && !warnings.some((w) => /storage/i.test(w))) v('storage-request-unmet-silent', 'medium', label, `${spec.storageTb}TB wanted: ${build.Storage.name}`);
  }
  if (spec.monitorHz && build.Monitor) {
    const hz = build.Monitor.name.toLowerCase().match(/(\d{2,3})\s*hz/);
    if (hz && parseInt(hz[1], 10) < spec.monitorHz && !warnings.some((w) => /refresh|hz/i.test(w))) v('hz-request-unmet-silent', 'low', label, `${spec.monitorHz}Hz wanted: ${build.Monitor.name}`);
  }

  // Peripherals
  if (spec.peripherals !== false && site !== 'computermania') {
    for (const c of ['Monitor', 'Mouse', 'Keyboard']) {
      if (!build[c] && !warnings.some((w) => w.includes(c))) v('peripheral-missing-silently', 'medium', label, c);
    }
  }
  for (const c of ['Mouse', 'Keyboard']) {
    if (build[c] && /combo/i.test(build[c].name)) v('peripheral-combo', 'low', label, build[c].name);
  }

  // Spend efficiency: unused budget is a recommendation quality problem.
  const spent = total / spec.budget;
  if (spent < 0.9 && spec.budget >= 40000) v('underspend', spent < 0.8 ? 'medium' : 'low', label, `spent ${(spent * 100).toFixed(1)}% (${total}/${spec.budget})`);

  // Gaming allocation sanity: GPU should be the largest single ticket for gaming at decent budgets.
  if (spec.use === 'gaming' && gpu && spec.budget >= 70000 && !spec.noGpu) {
    const biggest = Math.max(...parts(build).map(([, p]) => p.price));
    if (gpu.price < biggest * 0.6) v('gaming-gpu-starved', 'low', label, `gpu ${gpu.price} vs largest part ${biggest}`);
  }

  // Warnings
  for (const w of warnings) if (/INCOMPATIBLE/.test(w)) v('engine-reports-incompatible', 'critical', label, w);
  // Intent leakage of internal mutation
  if (!intent || typeof intent !== 'object') v('missing-intent', 'high', label, 'no intent returned');
}

// ─── scenario grid ───
const budgets = QUICK
  ? [25000, 45000, 70000, 120000, 250000]
  : [20000, 22000, 25000, 30000, 35000, 40000, 45000, 50000, 60000, 70000, 80000, 100000, 120000, 150000, 200000, 250000, 350000, 500000];
const sites = ['startech', 'techland'];
const uses = ['gaming', 'editing', 'office', 'general'];
const brands = [null, 'amd', 'intel'];

const scenarios = [];
for (const site of sites) {
  for (const budget of budgets) {
    for (const use of uses) {
      scenarios.push({ site, spec: { budget, use } });
      for (const cpuBrand of ['amd', 'intel']) scenarios.push({ site, spec: { budget, use, cpuBrand } });
      if (['gaming', 'editing', 'general'].includes(use)) {
        for (const gpuBrand of ['nvidia', 'amd']) scenarios.push({ site, spec: { budget, use, gpuBrand } });
      }
      scenarios.push({ site, spec: { budget, use, noGpu: true } });
      scenarios.push({ site, spec: { budget, use, ddr: 'DDR4' } });
      if (budget >= 50000) scenarios.push({ site, spec: { budget, use, ddr: 'DDR5' } });
      scenarios.push({ site, spec: { budget, use, ramGb: 32 } });
      scenarios.push({ site, spec: { budget, use, storageTb: 2 } });
      scenarios.push({ site, spec: { budget, use, peripherals: false } });
      scenarios.push({ site, spec: { budget, use, cooler: true, ups: true } });
      scenarios.push({ site, spec: { budget, use, monitorHz: 144 } });
      for (const cpuBrand of brands.slice(1)) for (const gpuBrand of ['nvidia', 'amd']) {
        if (use === 'gaming') scenarios.push({ site, spec: { budget, use, cpuBrand, gpuBrand } });
      }
    }
  }
}

const label = (s) => `${s.site} ${s.spec.budget} ${s.spec.use}${s.spec.cpuBrand ? ' cpu:' + s.spec.cpuBrand : ''}${s.spec.gpuBrand ? ' gpu:' + s.spec.gpuBrand : ''}${s.spec.noGpu ? ' no-gpu' : ''}${s.spec.ddr ? ' ' + s.spec.ddr : ''}${s.spec.ramGb ? ' ' + s.spec.ramGb + 'GB' : ''}${s.spec.storageTb ? ' ' + s.spec.storageTb + 'TB' : ''}${s.spec.peripherals === false ? ' no-periph' : ''}${s.spec.cooler ? ' cooler+ups' : ''}${s.spec.monitorHz ? ' ' + s.spec.monitorHz + 'Hz' : ''}`;

const msgFor = (s) => {
  const p = [`${s.spec.use} pc ${s.spec.budget / 1000}k`];
  if (s.spec.cpuBrand) p.push(s.spec.cpuBrand);
  if (s.spec.gpuBrand) p.push(s.spec.gpuBrand === 'nvidia' ? 'nvidia gpu' : 'radeon gpu');
  if (s.spec.noGpu) p.push('no gpu');
  if (s.spec.ddr) p.push(s.spec.ddr);
  if (s.spec.ramGb) p.push(`${s.spec.ramGb}gb ram`);
  if (s.spec.storageTb) p.push(`${s.spec.storageTb}tb ssd`);
  if (s.spec.monitorHz) p.push(`${s.spec.monitorHz}hz monitor`);
  return p.join(', ');
};

if (ONLY) { for (let i = scenarios.length - 1; ONLY !== 'FOLLOWUP' && ONLY !== 'CHAOS' && i >= 0; i--) if (!label(scenarios[i]).includes(ONLY)) scenarios.splice(i, 1); if (ONLY === 'FOLLOWUP' || ONLY === 'CHAOS') scenarios.length = 0; for (let i = -1; i >= 0; i--) if (!label(scenarios[i]).includes(ONLY)) scenarios.splice(i, 1); }
const t0 = Date.now();
let n = 0;
const sampleBuilds = [];
for (const s of scenarios) {
  const run = await runBuild(s.spec, s.site, msgFor(s));
  check(label(s), s.spec, s.site, msgFor(s), run);
  if (ONLY) {
    realLog(`=== ${label(s)}`);
    if (run.ok) {
      for (const [c, p] of parts(run.result.build)) realLog(`  ${c.padEnd(14)} ${String(p.price).padStart(7)}  ${p.name}`);
      realLog(`  total ${run.result.total} / budget ${s.spec.budget}`);
      for (const w of run.result.warnings) realLog('  ! ' + w);
    } else realLog('  ERROR ' + (run.error.code || '') + ' ' + run.error.message);
  }
  if (run.ok && n++ % 40 === 0) sampleBuilds.push({ label: label(s), total: run.result.total, build: Object.fromEntries(parts(run.result.build).map(([c, p]) => [c, `${p.name} (${p.price})`])) });
}

// ─── determinism ───
for (const s of ONLY ? [] : scenarios.filter((_, i) => i % 25 === 0)) {
  const a = await runBuild(s.spec, s.site, msgFor(s));
  const b = await runBuild(s.spec, s.site, msgFor(s));
  const sig = (r) => (r.ok ? JSON.stringify(Object.entries(r.result.build).map(([c, p]) => [c, p?.url])) : 'ERR:' + r.error.code);
  if (sig(a) !== sig(b)) v('non-deterministic', 'medium', label(s), 'same input produced different builds');
}

// ─── chaos: stock-outs and bad input ───
async function chaos() {
  // 1. knock out the cheapest 60% of CPUs on a site
  for (const site of sites) {
    const cpus = rows.filter((r) => r.site === site && r.category === 'cpu').sort((a, b) => a.price - b.price);
    for (const r of cpus.slice(0, Math.floor(cpus.length * 0.6))) outOfStock.add(r.url);
    await cache.clear();
    for (const budget of [50000, 100000]) {
      const spec = { budget, use: 'gaming' };
      const run = await runBuild(spec, site, `gaming ${budget / 1000}k`);
      check(`CHAOS cpu-stockout ${site} ${budget}`, spec, site, '', run);
    }
    outOfStock.clear();
    await cache.clear();
  }

  // 2. input validation edge cases (must produce BuildErrors, never crashes)
  const edge = [
    ['empty message', { message: '', site: 'startech' }, 'INVALID_MESSAGE'],
    ['huge message', { message: 'x'.repeat(2500), site: 'startech' }, 'INVALID_MESSAGE'],
    ['bad site', { message: 'gaming 80k', site: 'amazon' }, 'INVALID_SITE'],
  ];
  for (const [name, payload, code] of edge) {
    mute();
    try {
      await executeBuild(payload, depsFor(makeIntent({ budget: 80000 })));
      v('edge-no-error', 'high', `EDGE ${name}`, 'accepted invalid input');
    } catch (e) {
      if (e.code !== code) v('edge-wrong-error', 'high', `EDGE ${name}`, `${e.code || e.message}`);
    } finally { unmute(); }
  }
  for (const [name, budget] of [['null budget', null], ['zero budget', 0], ['negative', -5000], ['below min', 15000], ['NaN', NaN], ['string', '80k']]) {
    const intent = makeIntent({ budget: 80000 });
    intent.budget_bdt = budget;
    mute();
    try {
      await executeBuild({ message: 'build me a pc', site: 'startech' }, { ...depsFor(intent), intentExtractor: { extract: async () => intent } });
      v('edge-no-error', 'high', `EDGE budget ${name}`, 'accepted invalid budget');
    } catch (e) {
      if (!e.code) v('edge-crash', 'high', `EDGE budget ${name}`, e.message);
    } finally { unmute(); }
  }
}
if (!ONLY || ONLY === 'CHAOS') await chaos();

// ─── follow-ups (locking) ───
async function followUps() {
  const base = { budget: 100000, use: 'gaming' };
  for (const site of sites) {
    const first = await runBuild(base, site, 'gaming pc 100k');
    if (!first.ok) { v('followup-base-failed', 'high', `FOLLOWUP ${site}`, first.error.message); continue; }
    const prevBuild = JSON.parse(JSON.stringify(first.result.build));
    const prevIntent = JSON.parse(JSON.stringify(first.result.intent));

    const changes = [
      ['budget up 150k', { ...base, budget: 150000 }],
      ['budget down 70k', { ...base, budget: 70000 }],
      ['switch to intel', { ...base, cpuBrand: 'intel' }],
      ['switch to amd', { ...base, cpuBrand: 'amd' }],
      ['switch to nvidia', { ...base, gpuBrand: 'nvidia' }],
      ['switch to DDR5', { ...base, ddr: 'DDR5' }],
      ['switch to DDR4', { ...base, ddr: 'DDR4' }],
      ['no gpu', { ...base, noGpu: true }],
      ['32gb ram', { ...base, ramGb: 32 }],
      ['2tb storage', { ...base, storageTb: 2 }],
    ];
    for (const [name, spec] of changes) {
      const run = await runBuild(spec, site, `${name} for gaming`, {
        previousBuild: JSON.parse(JSON.stringify(prevBuild)),
        previousIntent: JSON.parse(JSON.stringify(prevIntent)),
      });
      check(`FOLLOWUP ${site} ${name}`, spec, site, '', run);
    }

    // user removed monitor by hand
    mute();
    try {
      const r = await executeBuild(
        { message: 'same build', site, previousBuild: JSON.parse(JSON.stringify(prevBuild)), previousIntent: JSON.parse(JSON.stringify(prevIntent)), removedCategories: ['Monitor', 'Graphics Card'] },
        depsFor(makeIntent(base))
      );
      if (r.build.Monitor) v('removed-part-returned', 'high', `FOLLOWUP ${site} removed monitor`, r.build.Monitor.name);
      if (r.build['Graphics Card']) v('removed-part-returned', 'high', `FOLLOWUP ${site} removed gpu`, r.build['Graphics Card'].name);
    } catch (e) {
      v('followup-crash', 'high', `FOLLOWUP ${site} removal`, e.message);
    } finally { unmute(); }
  }
}
if (!ONLY || ONLY === 'FOLLOWUP') await followUps();

// ─── report ───
const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
const groups = new Map();
for (const x of violations) {
  const key = `${x.severity}|${x.invariant}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(x);
}
const ordered = [...groups.entries()].sort(([a], [b]) => sevOrder[a.split('|')[0]] - sevOrder[b.split('|')[0]] || a.localeCompare(b));

realLog(`\nStress run: ${stats.runs} builds in ${((Date.now() - t0) / 1000).toFixed(1)}s | ok ${stats.ok} | engine refusals ${JSON.stringify(stats.buildErrors)} | crashes ${stats.crashes}`);
realLog(`Violations: ${violations.length} across ${ordered.length} invariants\n`);
for (const [key, list] of ordered) {
  const [sev, inv] = key.split('|');
  realLog(`[${sev.toUpperCase()}] ${inv}: ${list.length}`);
  for (const x of list.slice(0, 3)) realLog(`    - ${x.scenario}: ${x.detail}`);
}

// Success rate by budget (plain builds only) so regressions at any tier are obvious.
{
  const plain = runLog.filter((r) => /^(startech|techland) \d+ \w+$/.test(r.label));
  const byBudget = new Map();
  for (const r of plain) {
    if (!byBudget.has(r.budget)) byBudget.set(r.budget, { ok: 0, n: 0 });
    const e = byBudget.get(r.budget); e.n++; if (r.ok) e.ok++;
  }
  realLog('Plain-request success by budget: ' + [...byBudget].map(([b, e]) => `${b / 1000}k:${e.ok}/${e.n}`).join('  '));
}

if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ stats, violations, sampleBuilds, runLog }, null, 1));
process.exit(0);
