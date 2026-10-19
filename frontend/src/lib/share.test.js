import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeShare, decodeShare } from './share.js';
import { describeFreshness } from './time.js';
import { SITE_OPTIONS } from './constants.js';

const session = {
  build: {
    Processor: { name: 'AMD Ryzen 5 5600 AM4', price: 14200, url: 'https://shop.test/cpu' },
    Motherboard: { name: 'Gigabyte B450M ৳ DS3H', price: 8000, url: 'https://shop.test/mb' },
    RAM: null,
  },
  intent: { budget_bdt: 60000, use_case: 'gaming', _applied_site: 'startech' },
  notes: ['Storage was downgraded to 512GB.'],
  explanation: 'Balanced build.',
};

// Test payloads are ASCII, so plain btoa is enough (and works under the browser lint globals).
const toBase64Url = (obj) =>
  btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

test('share payload round-trips parts, budget, site and notes (including non-ASCII names)', () => {
  const decoded = decodeShare(encodeShare(session));

  assert.equal(decoded.build.Processor.name, 'AMD Ryzen 5 5600 AM4');
  assert.equal(decoded.build.Motherboard.name, 'Gigabyte B450M ৳ DS3H');
  assert.equal(decoded.build.RAM, null);
  assert.equal(decoded.intent.budget_bdt, 60000);
  assert.equal(decoded.intent.use_case, 'gaming');
  assert.equal(decoded.site, 'startech');
  assert.deepEqual(decoded.notes, ['Storage was downgraded to 512GB.']);
});

test('every store in the dropdown survives a share link', () => {
  for (const site of SITE_OPTIONS.map((o) => o.value)) {
    const decoded = decodeShare(encodeShare({ ...session, intent: { ...session.intent, _applied_site: site } }));
    assert.equal(decoded.site, site);
    assert.equal(decoded.intent._applied_site, site);
  }
});

test('a decoded link carries a full blueprint so a follow-up refine stays coherent', () => {
  const { intent } = decodeShare(encodeShare(session));
  const strategy = intent.component_strategy;

  assert.equal(Object.keys(strategy).length, 12);
  assert.equal(strategy.Processor.required, true);
  assert.equal(strategy.Motherboard.required, true);
  assert.equal(strategy.RAM.required, false);
  assert.equal(strategy['Graphics Card'].required, false);
  assert.equal(intent.no_gpu, true);
  assert.equal(strategy.Processor.weight, 1);
  assert.deepEqual(strategy.Processor.required_keywords, []);
});

test('decodeShare rejects garbage, wrong versions, and empty builds', () => {
  assert.equal(decodeShare('not base64 !!!'), null);
  assert.equal(decodeShare(''), null);
  assert.equal(decodeShare(toBase64Url({ v: 99, p: { Processor: ['x', 1, ''] } })), null);
  assert.equal(decodeShare(toBase64Url({ v: 1, p: {} })), null);
});

test('decodeShare only keeps http(s) part links', () => {
  const decoded = decodeShare(toBase64Url({
    v: 1,
    p: {
      Processor: ['CPU', 100, 'javascript:alert(1)'],
      Motherboard: ['Board', 200, 'https://shop.test/board'],
      RAM: ['Memory', 300, 'data:text/html;base64,AAAA'],
    },
  }));

  assert.equal(decoded.build.Processor.url, null);
  assert.equal(decoded.build.Motherboard.url, 'https://shop.test/board');
  assert.equal(decoded.build.RAM.url, null);
});

test('decodeShare drops unknown categories, bad prices and oversized text', () => {
  const decoded = decodeShare(toBase64Url({
    v: 1,
    p: {
      Processor: ['CPU', 100, ''],
      Toaster: ['Not a part', 5, ''],
      RAM: ['RAM', -10, ''],
      Storage: ['S'.repeat(5000), 50, ''],
    },
    u: 'drop table',
    b: 'lots',
  }));

  assert.equal(decoded.build.Processor.name, 'CPU');
  assert.equal(decoded.build.Toaster, undefined);
  assert.equal(decoded.build.RAM, null);
  assert.equal(decoded.build.Storage.name.length, 300);
  assert.equal(decoded.intent.use_case, 'general');
  assert.equal(decoded.intent.budget_bdt, 0);
});

test('decodeShare refuses oversized payloads', () => {
  assert.equal(decodeShare('A'.repeat(25000)), null);
});

test('describeFreshness reads SQLite UTC timestamps and flags stale listings', () => {
  const now = Date.parse('2026-10-10T12:00:00Z');

  assert.deepEqual(describeFreshness('2026-10-10 11:30:00', now), { label: 'Updated just now', stale: false });
  assert.deepEqual(describeFreshness('2026-10-10 06:00:00', now), { label: 'Updated 6h ago', stale: false });
  assert.deepEqual(describeFreshness('2026-10-05 12:00:00', now), { label: 'Updated 5d ago', stale: true });
  assert.equal(describeFreshness(null, now), null);
  assert.equal(describeFreshness('not a date', now), null);
});
