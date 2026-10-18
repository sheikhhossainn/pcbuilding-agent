// Follow-up patch eval: does a real model turn a refine message into the right patch, and does
// the engine's scope come out exactly right? Runs the PRODUCTION path (real prompt, real
// extractPatch, normalizePatch, applyPatch) against a fixed 100k gaming build.
//
//   AI_PRIMARY_MODEL=gpt-oss:20b AI_FALLBACK_MODEL=gpt-oss:20b node tests/eval/patchEval.mjs
//
// Both env vars are set to one model so a failure is not hidden by a fallback.
// Needs OLLAMA_API_KEY (backend/.env). Spends real API quota: one call per case.

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import OpenAI from 'openai';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '..', '..', '.env'), quiet: true });

const args = process.argv.slice(2);
const CONCURRENCY = Number(args.includes('--concurrency') ? args[args.indexOf('--concurrency') + 1] : 3);
const VERBOSE = args.includes('--verbose');
const MODEL = process.env.AI_PRIMARY_MODEL || 'gpt-oss:120b';

const { createIntentExtractor } = await import('../../ai/intentExtractor.js');
const { INTENT_PROMPT } = await import('../../ai/intentPrompt.js');
const { applyPatch, PATCH_CATEGORIES } = await import('../../engine/followUpPatch.js');

const client = new OpenAI({
  apiKey: process.env.OLLAMA_API_KEY,
  baseURL: process.env.AI_BASE_URL || 'https://ollama.com/v1',
  timeout: Number(process.env.EVAL_TIMEOUT_MS || 60000),
  maxRetries: 0,
});
const extractor = createIntentExtractor({ groqClient: client, systemPrompt: INTENT_PROMPT });

const realLog = console.log;
console.log = () => {}; console.warn = () => {}; console.error = () => {};

// ─── the build being refined ───
const part = (name, price, specs = {}) => ({ name, price, specs });
const PREV_BUILD = {
  Processor: part('AMD Ryzen 5 7600X Processor', 28500),
  Motherboard: part('MSI PRO B650M-P AM5 Motherboard', 13500),
  RAM: part('G.Skill Ripjaws 16GB DDR5 5600MHz', 8800),
  Storage: part('WD Blue SN580 500GB NVMe', 5200),
  'Graphics Card': part('Gigabyte GeForce RTX 4060 8GB', 38000),
  PSU: part('Antec B Series 650W 80+ Bronze', 5399, { wattage: 650 }),
  Casing: part('Gamdias Argus E3 Elite Casing', 4200),
  'CPU Cooler': part('Deepcool AK400 CPU Cooler', 2600),
  Monitor: part('Dahua DHI-LM27-E341A 27" QHD', 35499),
  Mouse: part('Logitech G102 Mouse', 1900),
  Keyboard: part('Redragon K552 Keyboard', 3200),
};
const strat = (weight, required = true) => ({
  weight, required, required_keywords: [], exclude_keywords: [], structured_reqs: {},
});
const PREV_INTENT = {
  budget_bdt: 100000, use_case: 'gaming', no_gpu: false, preferred_site: null,
  preferred_cpu_brand: null, preferred_gpu_brand: null,
  component_strategy: Object.fromEntries(PATCH_CATEGORIES.map((c) => [c, strat(c === 'UPS' ? 0 : 1.5, c !== 'UPS')])),
};

// ─── cases ───
// expect: changing (exact set the engine will re-search), plus optional checks on the patch.
const only = (...cats) => cats.sort();
const CASES = [
  {
    m: 'find a monitor around 20k and use the saved budget from the monitor to get a more powerful PSU',
    e: { changing: only('Monitor', 'PSU'), budget: null, target: { Monitor: [17000, 23000] }, absorb: ['PSU'] },
  },
  { m: 'raise the budget to 150k for a better gpu', e: { changing: only('Graphics Card', 'PSU'), budget: 150000 } },
  { m: 'my budget is now 1.2 lakh', e: { budget: 120000, noOps: true } },
  { m: 'I dont need a monitor, I have my own', e: { changing: only('Monitor'), removed: ['Monitor'] } },
  { m: 'switch to an intel cpu', e: { changing: only('Motherboard', 'PSU', 'Processor', 'RAM'), cpuBrand: 'intel' } },
  { m: '2tb ssd please', e: { changing: only('Storage'), spec: { Storage: ['min_tb', 2] } } },
  { m: 'add a ups', e: { changing: only('UPS'), added: ['UPS'] } },
  { m: 'monitor with 144hz, around 25k', e: { changing: only('Monitor'), budget: null, target: { Monitor: [21000, 29000] }, spec: { Monitor: ['min_hz', 144] } } },
  { m: 'I want a stronger psu', e: { changing: only('PSU'), budget: null } },
  { m: 'ami ekta bhalo gpu chai', e: { changing: only('Graphics Card', 'PSU'), budget: null } },
  { m: 'cheaper case, put the difference into the cpu', e: { changing: only('Casing', 'Motherboard', 'PSU', 'Processor', 'RAM'), absorb: ['Processor'], budget: null } },
  { m: 'nvidia gpu only', e: { changing: only('Graphics Card', 'PSU'), gpuBrand: 'nvidia' } },
  { m: 'actually make it an office pc', e: { changing: 'all', useCase: 'office' } },
  { m: 'remove the gpu, I will use integrated graphics', e: { changing: only('Graphics Card', 'PSU'), noGpu: true } },
  { m: 'rtx 4070 or better', e: { changing: only('Graphics Card', 'PSU'), budget: null } },
  { m: 'i want radeon', e: { changing: only('Graphics Card', 'PSU'), gpuBrand: 'amd', budget: null } },
  { m: 'the monitor should be 27 inch ips', e: { changing: only('Monitor'), budget: null } },
  { m: 'no ups needed', e: { changing: 'none-ok', budget: null } },
  { m: 'more ram, 32gb', e: { changing: only('RAM'), spec: { RAM: ['min_gb', 32] }, budget: null } },
  { m: 'get me a better monitor', e: { changing: only('Monitor'), budget: null, direction: { Monitor: 'up' } } },
  { m: 'faster storage please', e: { changing: only('Storage'), budget: null, direction: { Storage: 'up' } } },
  { m: 'upgrade the ram', e: { changing: only('RAM'), budget: null, direction: { RAM: 'up' } } },
  { m: 'a quieter, better cpu cooler', e: { changing: only('CPU Cooler'), budget: null, direction: { 'CPU Cooler': 'up' } } },
  { m: 'something more modest for the monitor', e: { changing: only('Monitor'), budget: null, direction: { Monitor: 'down' } } },
  { m: 'I want a higher quality psu', e: { changing: only('PSU'), budget: null, direction: { PSU: 'up' } } },
  { m: 'start over, office pc for 40k', e: { restart: true } },
  { m: 'make it better', e: { clarify: true } },
  { m: 'what is the weather today', e: { clarify: true } },
];

// ─── scoring ───
function score(c, patch, plan) {
  const e = c.e;
  const fails = [];
  const fail = (msg) => fails.push(msg);

  if (e.restart) { if (!patch.restart) fail('restart not detected'); return fails; }
  if (e.clarify) { if (!patch.clarify && patch.ops.length) fail(`expected a question, got ops ${patch.ops.map((o) => o.category)}`); return fails; }

  if (e.changing === 'none-ok') {
    if (plan.changing.size > 1) fail(`scope [${[...plan.changing]}] is more than one part`);
  } else if (e.changing === 'all') {
    if (plan.changing.size !== PATCH_CATEGORIES.length) fail(`scope is ${plan.changing.size} parts, expected all`);
  } else if (e.changing) {
    const got = [...plan.changing].sort();
    if (JSON.stringify(got) !== JSON.stringify(e.changing)) fail(`scope [${got}] != [${e.changing}]`);
  }
  if ('budget' in e) {
    const got = plan.intent.budget_bdt === PREV_INTENT.budget_bdt ? null : plan.intent.budget_bdt;
    if (got !== e.budget) fail(`budget ${got} != ${e.budget}`);
  }
  if (e.noOps && patch.ops.length) fail(`unexpected ops ${patch.ops.map((o) => o.category)}`);
  for (const [cat, [lo, hi]] of Object.entries(e.target || {})) {
    const t = plan.targets[cat]?.target;
    if (!(t >= lo && t <= hi)) fail(`${cat} target ${t} not in ${lo}-${hi}`);
  }
  for (const [cat, dir] of Object.entries(e.direction || {})) {
    const op = patch.ops.find((o) => o.category === cat);
    const explicit = Object.keys(op?.structured_reqs || {}).length > 0 || op?.price_target;
    if (!op || (op.direction !== dir && !explicit)) fail(`${cat} direction ${op?.direction} != ${dir}`);
  }
  for (const cat of e.absorb || []) if (!plan.absorbers.includes(cat)) fail(`${cat} should absorb savings`);
  for (const cat of e.removed || []) if (plan.intent.component_strategy[cat].required) fail(`${cat} not removed`);
  for (const cat of e.added || []) if (!plan.intent.component_strategy[cat].required) fail(`${cat} not added`);
  for (const [cat, [key, val]] of Object.entries(e.spec || {})) {
    if (plan.intent.component_strategy[cat].structured_reqs[key] !== val) fail(`${cat}.${key} != ${val}`);
  }
  if (e.cpuBrand && plan.intent.preferred_cpu_brand !== e.cpuBrand) fail(`cpu brand ${plan.intent.preferred_cpu_brand}`);
  if (e.gpuBrand && plan.intent.preferred_gpu_brand !== e.gpuBrand) fail(`gpu brand ${plan.intent.preferred_gpu_brand}`);
  if (e.useCase && plan.intent.use_case !== e.useCase) fail(`use case ${plan.intent.use_case}`);
  if ('noGpu' in e && plan.intent.no_gpu !== e.noGpu) fail(`no_gpu ${plan.intent.no_gpu}`);
  return fails;
}

async function runCase(c) {
  const started = Date.now();
  try {
    const patch = await extractor.extractPatch(c.m, JSON.parse(JSON.stringify(PREV_INTENT)), PREV_BUILD);
    const plan = patch.restart || patch.clarify && !patch.ops.length ? null : applyPatch(PREV_INTENT, patch, PREV_BUILD, c.m);
    const fails = c.e.restart || c.e.clarify ? score(c, patch, plan) : plan ? score(c, patch, plan) : ['no usable patch'];
    return { c, patch, plan, fails, ms: Date.now() - started };
  } catch (error) {
    return { c, fails: [`error: ${error.message}`], ms: Date.now() - started };
  }
}

const results = [];
const queue = [...CASES];
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) results.push(await runCase(queue.shift()));
}));

results.sort((a, b) => CASES.indexOf(a.c) - CASES.indexOf(b.c));
console.log = realLog;
console.log(`model: ${MODEL}\n`);
for (const r of results) {
  console.log(`${r.fails.length ? '✖' : '✔'} ${r.c.m}  (${r.ms}ms)`);
  for (const f of r.fails) console.log(`    - ${f}`);
  if (VERBOSE || r.fails.length) {
    if (r.patch) console.log(`    patch: ${JSON.stringify(r.patch)}`);
    if (r.plan) console.log(`    scope: [${[...r.plan.changing]}] targets: ${JSON.stringify(r.plan.targets)} absorb: [${r.plan.absorbers}]`);
  }
}
const passed = results.filter((r) => !r.fails.length).length;
console.log(`\n${passed}/${results.length} cases pass`);
