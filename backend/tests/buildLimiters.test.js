import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createBuildLimiters, isRefine } from '../utils/buildLimiters.js';

const strat = { weight: 1, required: true, required_keywords: [], exclude_keywords: [], structured_reqs: {} };
const refineBody = () => ({
  message: 'cheaper monitor',
  previousIntent: { budget_bdt: 100000, component_strategy: { Monitor: strat } },
  previousBuild: { Monitor: { name: 'Acer 24 inch', price: 15000 } },
});
const freshBody = () => ({ message: 'gaming pc 100k' });

/** A tiny app with the real limiters and a handler that only says "ok". */
async function withApp(limits, run) {
  const app = express();
  app.use(express.json());
  const { apiLimiter, refineLimiter } = createBuildLimiters(limits);
  app.post('/api/build', apiLimiter, refineLimiter, (req, res) => res.json({ ok: true }));
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const post = async (body) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/build`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    return res.status;
  };
  try { await run(post); } finally { server.close(); }
}

test('isRefine: needs an intent the engine would accept and a previous build', () => {
  assert.equal(isRefine({ body: refineBody() }), true);
  assert.equal(isRefine({ body: freshBody() }), false);
  assert.equal(isRefine({ body: { ...refineBody(), previousIntent: { budget_bdt: 1e12 } } }), false);
  assert.equal(isRefine({ body: { ...refineBody(), previousBuild: [] } }), false);
  assert.equal(isRefine({ body: { ...refineBody(), previousBuild: null } }), false);
  assert.equal(isRefine({}), false);
});

test('fresh builds stop at their own limit', async () => {
  await withApp({ maxBuilds: 2, maxRefines: 5 }, async (post) => {
    assert.deepEqual([await post(freshBody()), await post(freshBody()), await post(freshBody())], [200, 200, 429]);
  });
});

test('refines have their own limit, and do not use up the fresh-build quota', async () => {
  await withApp({ maxBuilds: 2, maxRefines: 3 }, async (post) => {
    const refines = [];
    for (let i = 0; i < 4; i++) refines.push(await post(refineBody()));
    assert.deepEqual(refines, [200, 200, 200, 429]);
    // Fresh builds are counted separately, so they still have all of their quota.
    assert.deepEqual([await post(freshBody()), await post(freshBody()), await post(freshBody())], [200, 200, 429]);
  });
});

test('a junk previous build does not buy the refine quota', async () => {
  await withApp({ maxBuilds: 1, maxRefines: 50 }, async (post) => {
    const junk = { message: 'x', previousIntent: { budget_bdt: 1e12 }, previousBuild: { Monitor: {} } };
    assert.deepEqual([await post(junk), await post(junk)], [200, 429]);
  });
});

test('requests with the users own API key are not limited', async () => {
  await withApp({ maxBuilds: 1, maxRefines: 1 }, async (post) => {
    const own = (body) => ({ ...body, customKeys: { ollama: 'key' } });
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push(await post(own(freshBody())), await post(own(refineBody())));
    assert.ok(statuses.every((s) => s === 200));
  });
});
