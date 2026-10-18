import { formatPrice } from './format.js';

const MAX_SUGGESTIONS = 4;
// Leftover worth suggesting a use for: at least 4% of the budget.
const LEFTOVER_SHARE = 0.04;

const ramGb = (part) => Number((String(part?.name || '').match(/(\d{1,3})\s?gb/i) || [])[1]) || 0;

/**
 * Refine ideas that fit the build on screen, as text the user can send as it is.
 * Most useful first; never more than a handful so the row stays quiet.
 *
 * @param {Object} build - category -> part|null
 * @param {{budget: number, total: number}} money
 * @returns {string[]}
 */
export function suggestRefines(build, { budget = 0, total = 0 } = {}) {
  const out = [];
  const has = (category) => Boolean(build?.[category]);
  const left = budget - total;

  if (budget > 0 && total > budget) {
    out.push('Make it cheaper');
  } else if (budget > 0 && left >= budget * LEFTOVER_SHARE) {
    const target = has('Graphics Card') ? 'GPU' : 'CPU';
    out.push(`Use the remaining ${formatPrice(left)} on a better ${target}`);
  }

  if (has('Monitor')) out.push('A better monitor');
  else out.push('Add a monitor');
  if (has('PSU')) out.push('A stronger PSU');
  if (has('RAM') && ramGb(build.RAM) > 0 && ramGb(build.RAM) < 32) out.push('More RAM');
  if (has('Storage')) out.push('Faster storage');
  if (!has('UPS')) out.push('Add a UPS');

  return [...new Set(out)].slice(0, MAX_SUGGESTIONS);
}
