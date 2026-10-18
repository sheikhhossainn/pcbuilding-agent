import test from 'node:test';
import assert from 'node:assert/strict';
import { isBuildStateNote, keepLastingNotes } from './staleNotes.js';

const UNSPENT = '12,000 BDT of your budget is unspent because the parts you kept were left as they are. Ask for a specific upgrade to use it.';
const PRICE = 'You asked for a Monitor around 20,000 BDT; the closest that fit the rest of your budget was Acer 24" at 17,500 BDT.';
const MISSING = 'Could not find a suitable **Monitor** matching your request at startech within budget. It may be out of stock.';
const LASTING = 'Monitor, mouse, and keyboard are not tracked in ComputerMania catalog and were omitted from this build.';

test('isBuildStateNote: recognises the notes that describe one particular build', () => {
  assert.ok(isBuildStateNote(UNSPENT));
  assert.ok(isBuildStateNote(PRICE));
  assert.ok(isBuildStateNote(MISSING));
  assert.ok(!isBuildStateNote(LASTING));
  assert.ok(!isBuildStateNote(null));
});

test('keepLastingNotes: drops the stale ones and keeps the rest in order', () => {
  assert.deepEqual(keepLastingNotes([UNSPENT, LASTING, PRICE]), [LASTING]);
  assert.deepEqual(keepLastingNotes(undefined), []);
});
