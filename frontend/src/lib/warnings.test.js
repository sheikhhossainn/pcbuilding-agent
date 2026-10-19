import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWarnings } from './warnings.js';

test('parseWarnings consolidates multi-line left-out parts and prunes redundant drops', () => {
  const input = [
    'Dropped required keyword "1440p" for Monitor to find available stock.',
    'Left out the Monitor to stay within your budget. You can add one back with a higher budget.',
    'Left out the Keyboard to stay within your budget. You can add one back with a higher budget.',
    'Left out the Mouse to stay within your budget. You can add one back with a higher budget.',
    'Emergency: Dropped keyword "32GB" from RAM to fit budget ceiling.',
    'Emergency: Relaxed specification "min_gb" on RAM to fit budget ceiling.',
  ];

  const parsed = parseWarnings(input);

  // Left-out categories are extracted cleanly without duplicates
  assert.deepEqual(parsed.leftOutCategories, ['Monitor', 'Keyboard', 'Mouse']);
  assert.equal(parsed.leftOutReason, 'budget');

  // Redundant keyword drop for Monitor (which was omitted) is pruned
  assert.ok(!parsed.adjustments.some((a) => a.includes('1440p')));

  // RAM adjustments are consolidated and cleaned of Emergency/ceiling
  assert.ok(parsed.adjustments.some((a) => a.includes('RAM') && !a.includes('Emergency') && !a.includes('ceiling')));
  assert.ok(!parsed.adjustments.some((a) => a.includes('min_gb')));

  // No incompatibilities
  assert.equal(parsed.incompatibles.length, 0);
});

test('parseWarnings extracts categories from consolidated left-out sentence', () => {
  const input = [
    'Left out Monitor, Keyboard, and Mouse to stay within your budget. You can add them back with a higher budget.',
  ];

  const parsed = parseWarnings(input);
  assert.deepEqual(parsed.leftOutCategories, ['Monitor', 'Keyboard', 'Mouse']);
  assert.equal(parsed.leftOutReason, 'budget');
});

test('parseWarnings isolates INCOMPATIBLE warnings for high-priority rendering', () => {
  const input = [
    '⚠ INCOMPATIBLE: CPU socket (LGA1700) does not match motherboard (AM4).',
    'Left out the UPS to stay within your budget.',
  ];

  const parsed = parseWarnings(input);
  assert.equal(parsed.incompatibles.length, 1);
  assert.ok(parsed.incompatibles[0].includes('INCOMPATIBLE'));
  assert.deepEqual(parsed.leftOutCategories, ['UPS']);
});

test('parseWarnings handles general advisory notes separately', () => {
  const input = [
    '15,000 BDT of your budget is unspent because the parts you kept were left as they are.',
    'PSU (450W) may be insufficient. Recommended: 550W.',
  ];

  const parsed = parseWarnings(input);
  assert.equal(parsed.leftOutCategories.length, 0);
  assert.equal(parsed.adjustments.length, 0);
  assert.equal(parsed.otherNotes.length, 2);
});
