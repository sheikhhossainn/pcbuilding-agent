import test from 'node:test';
import assert from 'node:assert/strict';
import { pollJob } from './pollJob.js';

const sequence = (...steps) => {
  let i = 0;
  return async () => {
    const step = steps[Math.min(i++, steps.length - 1)];
    if (step instanceof Error) throw step;
    return step;
  };
};

test('pollJob reports every update and resolves with the finished job', async () => {
  const seen = [];
  const final = await pollJob(sequence(
    { status: 'queued' },
    { status: 'processing', progress: { ryans: 'matching' } },
    { status: 'completed', result: { ok: true } },
  ), { onUpdate: (d) => seen.push(d.status), intervalMs: 1 });

  assert.deepEqual(seen, ['queued', 'processing', 'completed']);
  assert.deepEqual(final.result, { ok: true });
});

test('pollJob keeps going through a network blip', async () => {
  const final = await pollJob(sequence(new Error('offline'), { status: 'failed', error: 'nope' }), { intervalMs: 1 });
  assert.equal(final.error, 'nope');
});

test('pollJob ends an expired job as failed', async () => {
  const gone = Object.assign(new Error('404'), { response: { status: 404 } });
  const final = await pollJob(sequence(gone), { intervalMs: 1 });
  assert.equal(final.status, 'failed');
  assert.match(final.error, /expired/);
});

test('pollJob stops quietly when aborted', async () => {
  const controller = new AbortController();
  let calls = 0;
  const running = pollJob(async () => { calls += 1; return { status: 'processing' }; }, { signal: controller.signal, intervalMs: 1 });
  await new Promise((r) => setTimeout(r, 20));
  controller.abort();
  assert.equal(await running, null);
  const after = calls;
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(calls, after);
});
