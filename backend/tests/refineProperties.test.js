// Randomised refine scenarios over the real engine: whatever the user asks for, parts they did not
// name (and that do not depend on one they did) stay exactly as they were, and the result is a
// working build. The generator is seeded, so a failure names the scenario and can be replayed.
// To hunt for new failures: PROP_SEED=7 PROP_SCENARIOS=200 npm run test:props
import test from 'node:test';
import assert from 'node:assert/strict';

import { engine, build } from './engineHarness.js';
import { applyPatch, normalizePatch, dependencyClosure } from '../engine/followUpPatch.js';
import { BUDGET } from '../config/budget.js';

const mulberry32 = (seed) => () => {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const BUDGETS = [80000, 100000, 150000, 250000];
const USES = ['gaming', 'general', 'editing'];

// What a user could say about one part, with the op the model would return for it.
const REQUESTS = {
  Monitor: [
    { say: 'find a monitor around 20k', op: { category: 'Monitor', price_target: 20000 } },
    { say: 'a better monitor', op: { category: 'Monitor', direction: 'up' } },
    { say: 'a cheaper monitor', op: { category: 'Monitor', direction: 'down' } },
  ],
  PSU: [
    { say: 'a stronger PSU', op: { category: 'PSU', direction: 'up' } },
    { say: 'a cheaper power supply', op: { category: 'PSU', direction: 'down' } },
  ],
  'Graphics Card': [
    { say: 'a better graphics card', op: { category: 'Graphics Card', direction: 'up' } },
    { say: 'a cheaper graphics card', op: { category: 'Graphics Card', direction: 'down' } },
  ],
  RAM: [{ say: 'more RAM', op: { category: 'RAM', direction: 'up' } }],
  Storage: [
    { say: 'faster storage', op: { category: 'Storage', direction: 'up' } },
    { say: 'a 1tb ssd', op: { category: 'Storage', structured_reqs: { min_tb: 1 } } },
  ],
  Casing: [{ say: 'a better casing', op: { category: 'Casing', direction: 'up' } }],
  Keyboard: [{ say: 'a better keyboard', op: { category: 'Keyboard', direction: 'up' } }],
  Mouse: [{ say: 'a cheaper mouse', op: { category: 'Mouse', direction: 'down' } }],
};

function scenario(rand) {
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const names = Object.keys(REQUESTS);
  const first = pick(names);
  const chosen = [first];
  if (rand() < 0.5) {
    const second = pick(names.filter((n) => n !== first));
    chosen.push(second);
  }
  const requests = chosen.map((c) => ({ ...pick(REQUESTS[c]) }));
  const absorb = requests.length === 2 && rand() < 0.5;
  const ops = requests.map((r, i) => ({ ...r.op, ...(absorb && i === 1 ? { absorb_savings: true } : {}) }));
  const message = requests.map((r) => r.say).join(' and ') + (absorb ? ', and use the saved money for the second' : '');
  return { spec: { budget: pick(BUDGETS), use: pick(USES) }, ops, message };
}

const ceilingOf = (budget) => budget + Math.min(budget * BUDGET.CEILING_OVERSPEND_PERCENTAGE, BUDGET.CEILING_OVERSPEND_MAX_BDT);
const urlsOf = (b) => Object.fromEntries(Object.entries(b).filter(([, p]) => p).map(([c, p]) => [c, p.url]));

const SCENARIOS = Number(process.env.PROP_SCENARIOS) || 40;

test(`refine properties: ${SCENARIOS} random follow-ups never touch parts they did not ask about`, async (t) => {
  const rand = mulberry32(Number(process.env.PROP_SEED) || 20261018);
  const cc = engine.compatibilityChecker;
  let refused = 0;
  let replanned = 0;

  for (let n = 0; n < SCENARIOS; n++) {
    const { spec, ops, message } = scenario(rand);
    const label = `#${n} ${spec.use} ${spec.budget / 1000}k "${message}"`;

    const first = await build(spec);
    const patch = { ops };
    const expected = applyPatch(first.intent, normalizePatch(patch), first.build, message).changing;

    let second;
    try {
      second = await build(spec, {
        message,
        patch,
        extra: {
          previousBuild: JSON.parse(JSON.stringify(first.build)),
          previousIntent: JSON.parse(JSON.stringify(first.intent)),
        },
      });
    } catch (error) {
      // A request the catalog cannot satisfy is refused with a classified error, never a crash.
      assert.ok(error.code, `${label}: unclassified error ${error.message}`);
      refused += 1;
      continue;
    }

    // Working build.
    const b = second.build;
    for (const c of ['Processor', 'Motherboard', 'RAM', 'PSU']) assert.ok(b[c], `${label}: missing ${c}`);
    assert.equal(second.total, Object.values(b).filter(Boolean).reduce((s, p) => s + p.price, 0), `${label}: total is not the sum of the parts`);
    assert.ok(second.total <= ceilingOf(second.budget), `${label}: over the ceiling`);
    assert.ok(cc.isSocketCompatible(b.Processor, b.Motherboard), `${label}: socket mismatch`);
    assert.ok(cc.isRamTypeCompatible(b.Motherboard, b.RAM), `${label}: RAM does not fit the board`);
    for (const w of second.warnings) assert.ok(!/INCOMPATIBLE/.test(w), `${label}: ${w}`);

    // Scope: nothing outside what was asked for (plus what depends on it) moved, except for the
    // one part the engine says it released to make room.
    if (second.notes.some((note) => /re-planned from scratch/.test(note))) { replanned += 1; if (process.env.PROP_VERBOSE) process.stderr.write(`REPLAN ${label}: ${second.notes.join(" | ")}
`); continue; }
    const before = urlsOf(first.build);
    const after = urlsOf(b);
    const moved = Object.keys({ ...before, ...after }).filter((c) => before[c] !== after[c]);
    // "To make room for Storage, Processor was picked again as well": a released part takes its dependents with it.
    const released = second.notes
      .map((note) => note.match(/^To make room for .+?, (.+) was picked again as well\./)?.[1])
      .filter(Boolean);
    const allowed = new Set([...expected, ...dependencyClosure(released)]);
    const outside = moved.filter((c) => !allowed.has(c));
    assert.deepEqual(outside, [], `${label}: parts outside the request changed (moved ${moved}; asked for ${[...expected]}, released ${released}; notes ${JSON.stringify(second.notes)})`);
    assert.ok(released.length <= 1, `${label}: released more than one part: ${released}`);
    for (const c of second.scope.locked) assert.equal(after[c], before[c], `${label}: locked ${c} changed`);
  }

  t.diagnostic(`${SCENARIOS} scenarios: ${refused} refused, ${replanned} re-planned from scratch`);
  assert.ok(refused + replanned < SCENARIOS / 2, `too many refused (${refused}) or re-planned (${replanned}) follow-ups`);
});
