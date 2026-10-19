import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFeedback, SOUNDS, HAPTICS, THROTTLE_MS } from './feedback.js';

function fakeContext() {
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const ctx = {
    state: 'running',
    resumes: 0,
    resume() { ctx.resumes += 1; ctx.state = 'running'; return Promise.resolve(); },
    currentTime: 0,
    destination: {},
    oscillators: 0,
    createGain: () => ({ gain: param(), connect() {} }),
    createOscillator: () => {
      ctx.oscillators += 1;
      return { type: '', frequency: param(), connect() {}, start() {}, stop() {} };
    },
  };
  return ctx;
}

function setup(overrides = {}) {
  let clock = 1000;
  let created = 0;
  const vibrations = [];
  const ctx = fakeContext();
  const fb = createFeedback({
    createContext: () => { created += 1; return ctx; },
    now: () => clock,
    isHidden: () => false,
    vibrate: (p) => vibrations.push(p),
    ...overrides,
  });
  return { fb, ctx, vibrations, created: () => created, tick: (ms) => { clock += ms; } };
}

test('makes no sound and no audio context before a user gesture', () => {
  const { fb, created } = setup();
  assert.equal(fb.play('success'), false);
  assert.equal(created(), 0);
});

test('plays every note of a sound after unlock', () => {
  const { fb, ctx } = setup();
  fb.unlock();
  assert.equal(fb.play('success'), true);
  assert.equal(ctx.oscillators, SOUNDS.success.length);
});

test('throttles sounds that arrive too close together', () => {
  const { fb, tick } = setup();
  fb.unlock();
  assert.equal(fb.play('copy'), true);
  tick(THROTTLE_MS - 1);
  assert.equal(fb.play('copy'), false);
  tick(1);
  assert.equal(fb.play('copy'), true);
});

test('different sounds close together both play; the same one is throttled', () => {
  const { fb } = setup();
  fb.unlock();
  assert.equal(fb.play('swap'), true);
  assert.equal(fb.play('success'), true);
  assert.equal(fb.play('swap'), false);
});

test('a context that was suspended is resumed before the sound plays', async () => {
  const { fb, ctx } = setup();
  fb.unlock();
  ctx.state = 'suspended';
  const before = ctx.oscillators;
  assert.equal(fb.play('success'), true);
  assert.equal(ctx.oscillators, before, 'nothing is scheduled while suspended');
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(ctx.resumes >= 1, true);
  assert.equal(ctx.oscillators, before + SOUNDS.success.length);
});

test('unlock reports whether the context is running, so a refused resume is retried on the next gesture', async () => {
  const { fb, ctx } = setup();
  ctx.resume = () => Promise.resolve(); // browser refuses: state stays suspended
  ctx.state = 'suspended';
  assert.equal(await fb.unlock(), false);
  ctx.resume = () => { ctx.state = 'running'; return Promise.resolve(); };
  assert.equal(await fb.unlock(), true);
});

test('stays silent when muted or when the tab is hidden', () => {
  const muted = setup();
  muted.fb.setPrefs({ sound: false });
  muted.fb.unlock();
  assert.equal(muted.fb.play('swap'), false);
  assert.equal(muted.created(), 0);

  const hidden = setup({ isHidden: () => true });
  hidden.fb.unlock();
  assert.equal(hidden.fb.play('swap'), false);
});

test('turning sound back on after the first gesture creates the context', () => {
  const { fb, created } = setup();
  fb.setPrefs({ sound: false });
  fb.unlock();
  assert.equal(created(), 0);
  fb.setPrefs({ sound: true });
  assert.equal(created(), 1);
  assert.equal(fb.play('remove'), true);
});

test('vibrates even before audio is unlocked, unless haptics are off', () => {
  const on = setup();
  on.fb.play('error');
  assert.deepEqual(on.vibrations, [HAPTICS.error]);

  const off = setup();
  off.fb.setPrefs({ haptics: false });
  off.fb.play('error');
  assert.deepEqual(off.vibrations, []);
});

test('ignores unknown events', () => {
  const { fb, vibrations } = setup();
  fb.unlock();
  assert.equal(fb.play('nope'), false);
  assert.deepEqual(vibrations, []);
});
