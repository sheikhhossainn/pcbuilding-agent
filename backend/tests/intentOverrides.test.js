import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBudgetFromMessage, applyIntentOverrides } from '../engine/intentOverrides.js';

const CASES = [
  // plain
  ['gaming pc budget 80k', 80000],
  ['80k bdt gaming pc', 80000],
  ['budget: 85,000 tk', 85000],
  ['pc for 45000 taka', 45000],
  ['tk 65000 build', 65000],
  ['৳75000 office pc', 75000],
  ['around 80 thousand', 80000],
  // Bangladeshi units
  ['I want a PC around 1.2 lakh', 120000],
  ['budget 1 lakh', 100000],
  ['I have 1.5 lac', 150000],
  ['1 lakh 20 thousand', 120000],
  // model numbers and specs must never become money
  ['i9 14900k and rtx 4090 build', null],
  ['ryzen 7 7800x3d 144hz 1440p', null],
  ['i5 12400f build', null],
  ['ddr5 6000mhz kit', null],
  ['5000mah', null],
  // ...even when a real budget sits next to them
  ['my budget is 90000 for a pc with i7-13700k', 90000],
  ['i5-13600k 5k budget 60k', 60000],
  ['gaming pc with 4k monitor under 60k', 60000],
  ['rtx 4070 ti super 16gb 200k', 200000],
  ['psu 850w 1tb nvme 120k bdt', 120000],
  ['7200 rpm 2tb hdd 65k', 65000],
  ['intel core i5 12400f with rtx 3060, 100000', 100000],
  ['ddr5 6000mhz 32gb ram, budget 150k', 150000],
];

for (const [message, expected] of CASES) {
  test(`budget from "${message}" is ${expected}`, () => {
    assert.equal(parseBudgetFromMessage(message), expected);
  });
}

test('a K-suffixed CPU never overrides the LLM budget', () => {
  const intent = { budget_bdt: 150000, component_strategy: {}, use_case: 'gaming' };
  applyIntentOverrides(intent, 'gaming pc with an i9 14900k');
  assert.equal(intent.budget_bdt, 150000);
});

test('"no dedicated graphics" phrasing switches the GPU off', () => {
  const strategy = { 'Graphics Card': { required: true, weight: 4 } };
  const intent = { budget_bdt: 60000, component_strategy: strategy };
  applyIntentOverrides(intent, 'office pc, no dedicated graphics card please');
  assert.equal(intent.no_gpu, true);
  assert.equal(strategy['Graphics Card'].required, false);
});
