// Intent-extraction eval: how well does a model turn real user messages into a build blueprint?
//
// Runs the PRODUCTION path (real prompt, real extractor, normalisation, then the deterministic
// overrides) and scores the result against expectations. One model per process, because the
// extractor reads its model names from the environment at import time:
//
//   AI_PRIMARY_MODEL=gemma4:31b AI_FALLBACK_MODEL=gemma4:31b \
//     node tests/eval/intentEval.mjs --out results/gemma4.json
//
// Both env vars are set to the same model so a failure is not hidden by a fallback model.
// Needs OLLAMA_API_KEY (backend/.env). Spends real API quota: ~40 calls per model.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import OpenAI from 'openai';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '..', '..', '.env'), quiet: true });

const args = process.argv.slice(2);
const outPath = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
const CONCURRENCY = Number(args.includes('--concurrency') ? args[args.indexOf('--concurrency') + 1] : 3);
const MODEL = process.env.AI_PRIMARY_MODEL || 'gpt-oss:120b';

const { createIntentExtractor } = await import('../../ai/intentExtractor.js');
const { INTENT_PROMPT } = await import('../../ai/intentPrompt.js');
const { applyIntentOverrides } = await import('../../engine/intentOverrides.js');

const client = new OpenAI({
  apiKey: process.env.OLLAMA_API_KEY,
  baseURL: process.env.AI_BASE_URL || 'https://ollama.com/v1',
  // A hung model must fail a case, not stall the whole run.
  timeout: Number(process.env.EVAL_TIMEOUT_MS || 60000),
  maxRetries: 0,
});
const extractor = createIntentExtractor({ groqClient: client, systemPrompt: INTENT_PROMPT });

// The extractor logs every call; keep the report readable.
const realLog = console.log;
console.log = () => {}; console.warn = () => {}; console.error = () => {};

// ─── cases ───
// expect keys: budget | budgetRange, use (string or array), noGpu, cpu, gpu, site, ddr,
// ramGb, storageTb, hz, gpuRequired, upsRequired, notRequired: [categories]
const FRESH = [
  { m: 'gaming pc under 80k', e: { budget: 80000, use: 'gaming', gpuRequired: true } },
  { m: 'I need an office pc for around 35,000 taka', e: { budget: 35000, use: ['office', 'general'] } },
  { m: 'video editing workstation, 1.5 lakh budget, 32gb ram', e: { budget: 150000, use: 'editing', ramGb: 32 } },
  { m: 'budget 60k, intel cpu and nvidia gpu for gaming', e: { budget: 60000, use: 'gaming', cpu: 'intel', gpu: 'nvidia' } },
  { m: 'amd ryzen build with a radeon card, 100k', e: { budget: 100000, cpu: 'amd', gpu: 'amd' } },
  { m: 'pc without gpu for programming, 50k, 16gb ram, 1tb ssd', e: { budget: 50000, noGpu: true, ramGb: 16, storageTb: 1 } },
  { m: 'gaming pc 120k ddr5 144hz monitor', e: { budget: 120000, use: 'gaming', ddr: 'DDR5', hz: 144 } },
  { m: 'I already have a monitor, mouse and keyboard. 70k gaming build', e: { budget: 70000, use: 'gaming', notRequired: ['Monitor', 'Mouse', 'Keyboard'] } },
  { m: 'cheap desktop for browsing and ms office, 45k', e: { budget: 45000, use: ['office', 'general'] } },
  { m: '4k editing pc with an i9 14900k and rtx 4070, budget 3 lakh', e: { budget: 300000, use: 'editing', cpu: 'intel', gpu: 'nvidia' } },
  { m: 'ami ekta gaming pc banate chai, budget 70 hajar taka', e: { budget: 70000, use: 'gaming' } },
  { m: 'budget 90000 bdt, ddr4 only, 16gb', e: { budget: 90000, ddr: 'DDR4', ramGb: 16 } },
  { m: 'cheap pc for my mother to watch youtube, 25k', e: { budget: 25000, use: ['office', 'general'] } },
  { m: 'streaming and gaming pc 2 lakh, 2tb nvme', e: { budget: 200000, use: 'gaming', storageTb: 2 } },
  { m: 'pc for cad and 3d rendering, 130k, 64gb ram', e: { budget: 130000, use: ['editing', 'general'], ramGb: 64 } },
  { m: 'light gaming pc, somewhere between 40k and 50k', e: { budgetRange: [40000, 50000], use: 'gaming' } },
  { m: 'gaming pc, nvidia only, around 1 lakh 10 thousand', e: { budget: 110000, use: 'gaming', gpu: 'nvidia' } },
  { m: 'no gpu, apu build for office work 30k', e: { budget: 30000, noGpu: true } },
  { m: 'i5 12400f with rtx 3060 gaming 85000 tk', e: { budget: 85000, use: 'gaming', cpu: 'intel', gpu: 'nvidia' } },
  { m: 'need a ups too, 75k gaming pc', e: { budget: 75000, use: 'gaming', upsRequired: true } },
  { m: 'ryzen 5 5600 + rx 6600, 65k', e: { budget: 65000, cpu: 'amd', gpu: 'amd' } },
  { m: 'machine learning box with nvidia gpu, 2.5 lakh, 64gb ram', e: { budget: 250000, use: ['editing', 'general'], gpu: 'nvidia', ramGb: 64 } },
  { m: 'office pc 28k with 8gb ram and 256gb ssd', e: { budget: 28000, use: ['office', 'general'] } },
  { m: 'gaming pc under 1 lakh with a 1440p 165hz monitor', e: { budget: 100000, use: 'gaming', hz: 165 } },
  { m: 'I want to build a pc, budget fifty thousand taka, for gaming', e: { budget: 50000, use: 'gaming' } },
  { m: 'bhai 60k te best gaming pc den', e: { budget: 60000, use: 'gaming' } },
  { m: 'gaming pc budget 80k from startech', e: { budget: 80000, use: 'gaming', site: 'startech' } },
  { m: 'techland theke office pc lagbe, 40k', e: { budget: 40000, use: ['office', 'general'], site: 'techland' } },
  { m: 'gaming pc, 1 lakh, i7 13700k, 32gb ddr5', e: { budget: 100000, use: 'gaming', cpu: 'intel', ddr: 'DDR5', ramGb: 32 } },
  { m: 'I want a pc with 16gb rtx 4060 ti for gaming, 1.4 lakh', e: { budget: 140000, use: 'gaming', gpu: 'nvidia' } },
];

// A realistic previous blueprint for follow-ups (what the production pipeline hands back).
const CATS = ['Processor', 'Motherboard', 'RAM', 'Storage', 'Graphics Card', 'PSU', 'Casing', 'CPU Cooler', 'Monitor', 'Mouse', 'Keyboard', 'UPS'];
const W = { Processor: 2.5, Motherboard: 1.5, RAM: 1.5, Storage: 1.5, 'Graphics Card': 5, PSU: 1.5, Casing: 1, Monitor: 2, Mouse: 0.3, Keyboard: 0.3 };
function baseIntent() {
  const component_strategy = {};
  for (const c of CATS) {
    component_strategy[c] = {
      weight: W[c] ?? 0, required: c in W,
      required_keywords: [], exclude_keywords: c === 'Mouse' || c === 'Keyboard' ? ['combo'] : [],
      structured_reqs: c === 'RAM' ? { min_gb: 16 } : c === 'Storage' ? { min_tb: 1 } : {},
    };
  }
  return {
    budget_bdt: 100000, use_case: 'gaming', no_gpu: false, preferred_site: 'startech',
    preferred_cpu_brand: null, preferred_gpu_brand: null, component_strategy,
  };
}
const PREV_BUILD = {
  Processor: { name: 'AMD Ryzen 5 5600 Processor', price: 12200 },
  Motherboard: { name: 'Asus PRIME B550M-K ARGB AMD AM4 mATX Motherboard', price: 12800 },
  RAM: { name: 'Netac Basic 16GB DDR4 2666MHz Desktop RAM', price: 11500 },
  Storage: { name: 'AITC KINGSMAN KM600 ULTRA 512GB PCIe Gen3 M.2 NVMe SSD', price: 11900 },
  'Graphics Card': { name: 'AFOX Geforce GTX 1660Ti 6GB GDDR6 ATX Dual Fan Graphics Card', price: 33000 },
  PSU: { name: 'T-Wolf PHANTOM P650 ATX 650W Power Supply', price: 2950 },
};

// `touched` = categories the user's message legitimately changes; everything else must be
// copied unchanged.
const FOLLOW = [
  { m: 'make it an intel build', touched: ['Processor', 'Motherboard', 'RAM'], e: { cpu: 'intel', budget: 100000 } },
  { m: 'increase the budget to 150k', touched: [], e: { budget: 150000 } },
  { m: 'actually no gpu, use integrated graphics', touched: ['Graphics Card', 'Processor'], e: { noGpu: true, budget: 100000 } },
  { m: 'add a ups', touched: ['UPS'], e: { upsRequired: true, budget: 100000 } },
  { m: 'I want 32gb ram', touched: ['RAM'], e: { ramGb: 32, budget: 100000 } },
  { m: 'switch to ddr5', touched: ['Motherboard', 'RAM', 'Processor'], e: { ddr: 'DDR5', budget: 100000 } },
  { m: 'remove the monitor, I have one', touched: ['Monitor'], e: { notRequired: ['Monitor'], budget: 100000 } },
  { m: 'change storage to 2tb', touched: ['Storage'], e: { storageTb: 2, budget: 100000 } },
];

// ─── scoring ───
const checks = [];
function score(intent, e, label) {
  const cs = intent.component_strategy || {};
  const out = [];
  const add = (name, ok, got) => out.push({ name, ok: Boolean(ok), got });

  if (e.budget !== undefined) add('budget', intent.budget_bdt === e.budget, intent.budget_bdt);
  if (e.budgetRange) add('budget', intent.budget_bdt >= e.budgetRange[0] && intent.budget_bdt <= e.budgetRange[1], intent.budget_bdt);
  if (e.use) add('use_case', [].concat(e.use).includes(intent.use_case), intent.use_case);
  if (e.noGpu !== undefined) add('no_gpu', intent.no_gpu === e.noGpu && cs['Graphics Card']?.required === false, `${intent.no_gpu}/${cs['Graphics Card']?.required}`);
  if (e.gpuRequired) add('gpu_required', cs['Graphics Card']?.required === true, cs['Graphics Card']?.required);
  if (e.cpu) add('cpu_brand', intent.preferred_cpu_brand === e.cpu, intent.preferred_cpu_brand);
  if (e.gpu) add('gpu_brand', intent.preferred_gpu_brand === e.gpu, intent.preferred_gpu_brand);
  if (e.site) add('site', intent.preferred_site === e.site, intent.preferred_site);
  if (e.ddr) {
    const has = (c) => (cs[c]?.required_keywords || []).some((k) => k.toLowerCase() === e.ddr.toLowerCase());
    add('ddr', has('RAM') || has('Motherboard'), [cs.RAM?.required_keywords, cs.Motherboard?.required_keywords]);
  }
  if (e.ramGb) add('ram_gb', cs.RAM?.structured_reqs?.min_gb >= e.ramGb, cs.RAM?.structured_reqs?.min_gb);
  if (e.storageTb) add('storage_tb', cs.Storage?.structured_reqs?.min_tb >= e.storageTb, cs.Storage?.structured_reqs?.min_tb);
  if (e.hz) add('monitor_hz', cs.Monitor?.structured_reqs?.min_hz >= e.hz, cs.Monitor?.structured_reqs?.min_hz);
  if (e.upsRequired) add('ups', cs.UPS?.required === true, cs.UPS?.required);
  for (const c of e.notRequired || []) add(`${c}_off`, cs[c]?.required === false, cs[c]?.required);
  return out.map((o) => ({ ...o, case: label }));
}

const sameStrategy = (a = {}, b = {}) =>
  a.required === b.required && a.weight === b.weight
  && JSON.stringify([...(a.required_keywords || [])].sort()) === JSON.stringify([...(b.required_keywords || [])].sort())
  && JSON.stringify([...(a.exclude_keywords || [])].sort()) === JSON.stringify([...(b.exclude_keywords || [])].sort())
  && JSON.stringify(a.structured_reqs || {}) === JSON.stringify(b.structured_reqs || {});

// ─── runner ───
async function run(c) {
  const followUp = Boolean(c.touched);
  const prev = followUp ? baseIntent() : null;
  const started = Date.now();
  try {
    const intent = await extractor.extract(c.m, prev ? JSON.parse(JSON.stringify(prev)) : null, followUp ? JSON.parse(JSON.stringify(PREV_BUILD)) : null);
    const ms = Date.now() - started;
    applyIntentOverrides(intent, c.m);
    const results = score(intent, c.e, c.m);

    let preserved = null;
    if (followUp) {
      const drift = CATS.filter((cat) => !c.touched.includes(cat) && !sameStrategy(prev.component_strategy[cat], intent.component_strategy[cat]));
      preserved = { ok: drift.length === 0, drift };
      results.push({ name: 'followup_preserved', ok: preserved.ok, got: drift.join(',') || 'clean', case: c.m });
    }
    return { case: c.m, followUp, ms, call: 'ok', results };
  } catch (error) {
    return { case: c.m, followUp, ms: Date.now() - started, call: 'fail', error: String(error.message || error).slice(0, 160), results: [] };
  }
}

const queue = [...FRESH, ...FOLLOW];
const done = [];
const total = queue.length;
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) {
    const c = queue.shift();
    const r = await run(c);
    done.push(r);
    process.stderr.write(`[${MODEL}] ${done.length}/${total} ${r.call} ${r.ms}ms ${c.m.slice(0, 40)}\n`);
  }
}));

console.log = realLog;
const all = done.flatMap((d) => d.results);
const ok = all.filter((r) => r.ok).length;
const lat = done.filter((d) => d.call === 'ok').map((d) => d.ms).sort((a, b) => a - b);
const pct = (p) => (lat.length ? lat[Math.min(lat.length - 1, Math.floor(lat.length * p))] : null);
const summary = {
  model: MODEL,
  cases: done.length,
  callFailures: done.filter((d) => d.call === 'fail').length,
  checks: all.length,
  checksPassed: ok,
  accuracy: all.length ? +(ok / all.length * 100).toFixed(1) : 0,
  followupPreserved: (() => {
    const f = all.filter((r) => r.name === 'followup_preserved');
    return f.length ? `${f.filter((r) => r.ok).length}/${f.length}` : 'n/a';
  })(),
  p50ms: pct(0.5),
  p95ms: pct(0.95),
};
const byCheck = {};
for (const r of all) {
  byCheck[r.name] = byCheck[r.name] || { ok: 0, n: 0 };
  byCheck[r.name].n++;
  if (r.ok) byCheck[r.name].ok++;
}
const report = { summary, byCheck, failures: all.filter((r) => !r.ok), callErrors: done.filter((d) => d.call === 'fail').map((d) => ({ case: d.case, error: d.error })) };

realLog(JSON.stringify(summary));
if (outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 1));
}
process.exit(0);
