import test from 'node:test';
import assert from 'node:assert/strict';
import { createCrossCheckHandler } from '../routes/build.js';
import { registerLane, createJob, getJobStatus } from '../utils/queueManager.js';
import { fakeRes } from './helpers.js';

const BUILD = {
  Processor: { name: 'AMD Ryzen 5 5600 AM4', price: 12200, url: 'https://shop.test/cpu' },
  Motherboard: { name: 'MSI B450M-A PRO MAX', price: 8000, url: 'https://shop.test/mb' },
  RAM: { name: 'Netac Basic 16GB DDR4 3200MHz', price: 11900, url: 'https://shop.test/ram' },
  PSU: { name: 'MSI MAG A650BN 650W', price: 6000, url: 'https://shop.test/psu' },
};

const until = async (check, ms = 1000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const value = check();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('timed out');
};

// One lane for every test in this file: the handler enqueues into 'crossCheck'.
const received = [];
let release = null;
registerLane('crossCheck', {
  concurrency: 1,
  run: async (payload, { onProgress }) => {
    received.push(payload);
    onProgress('ryans', 'matching');
    if (release) await new Promise((r) => { release = r; });
    onProgress('ryans', 'done');
    return { ok: true };
  },
});

test('cross-check route rejects an unknown store and a build without its core parts', () => {
  const handler = createCrossCheckHandler();

  const bad = fakeRes();
  handler({ body: { build: BUILD, site: 'https://example.com' } }, bad);
  assert.equal(bad.statusCode, 400);

  const partial = fakeRes();
  handler({ body: { build: { Processor: BUILD.Processor }, site: 'startech' } }, partial);
  assert.equal(partial.statusCode, 400);
  assert.match(partial.body.error, /Motherboard, RAM, PSU/);
});

test('cross-check route cleans the build before queueing it: no specs, bad prices or unknown parts', async () => {
  const handler = createCrossCheckHandler();
  const res = fakeRes();
  handler({
    body: {
      site: 'startech',
      build: {
        ...BUILD,
        Processor: { ...BUILD.Processor, specs: { socket: 'FAKE' } },
        Storage: { name: 'SSD', price: 'free' },
        Toaster: { name: 'Toaster', price: 1 },
      },
      intent: { budget_bdt: 'lots', component_strategy: {} },
    },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.ok(res.body.jobId);
  const payload = await until(() => received.at(-1));
  assert.deepEqual(Object.keys(payload.build).sort(), ['Motherboard', 'PSU', 'Processor', 'RAM']);
  assert.equal(payload.build.Processor.specs, undefined);
  assert.equal(payload.intent, null);
  await until(() => getJobStatus(res.body.jobId).status === 'completed');
});

test('a lane job runs without any AI worker and reports per-store progress', async () => {
  release = () => {};
  const { jobId } = createJob({ build: BUILD, intent: null, site: 'startech' }, { lane: 'crossCheck' });

  const running = await until(() => {
    const status = getJobStatus(jobId);
    return status.status === 'processing' && status.progress?.ryans === 'matching' && status;
  });
  assert.deepEqual(running.progress, { ryans: 'matching' });

  release();
  const done = await until(() => getJobStatus(jobId).status === 'completed' && getJobStatus(jobId));
  assert.deepEqual(done.result, { ok: true });
  assert.equal(done.progress.ryans, 'done');
  release = null;
});
