/**
 * Plain-language explanation of what a refine changed, written from the diff itself.
 *
 * A refine used to call the LLM a second time just to narrate the result, which took most of
 * the wait. Everything it said is already known: which parts were kept, which were swapped,
 * what the user asked for and what the swap cost. Nothing here can invent a spec.
 */

import { buildFacts } from '../ai/explanationGenerator.js';
import { describeDifference } from '../utils/partQuality.js';

const money = (n) => `${Math.round(n).toLocaleString('en-BD')} BDT`;
const signed = (n) => `${n > 0 ? '+' : '−'}${money(Math.abs(n))}`;
const shortName = (name) => String(name).replace(/\s+/g, ' ').trim().slice(0, 70);

const LABEL = { 'Graphics Card': 'graphics card', Processor: 'processor', PSU: 'PSU', RAM: 'RAM', UPS: 'UPS' };
const label = (category) => LABEL[category] || category.toLowerCase();

// Which part's change forces a re-pick of another, for the "why" clause.
const FORCED_BY = {
  Motherboard: 'processor', RAM: 'motherboard', PSU: 'processor or graphics card',
};

/** Why a part was swapped, in the user's terms. */
function reasonFor(category, op, target, absorbs, changedCategories) {
  if (absorbs) return 'to put the money freed up elsewhere into it';
  if (target && !target.derived) return `to land near your ${money(target.target)} target`;
  if (op?.direction === 'up') return 'as the step up you asked for';
  if (op?.direction === 'down') return 'as the cheaper option you asked for';
  if (op) return 'to match what you asked for';
  const cause = FORCED_BY[category];
  if (cause && (changedCategories.has('Processor') || changedCategories.has('Motherboard') || changedCategories.has('Graphics Card'))) {
    return `so it still works with the new ${cause}`;
  }
  return null;
}

/**
 * @param {Object} p
 * @param {Object} p.build - the new build, category -> part|null
 * @param {Object} p.previousBuild - the build before the refine
 * @param {string[]} p.locked - categories kept as they were
 * @param {{ops?: Array, targets?: Object, absorbers?: string[]}} p.followUp
 * @param {number} p.total
 * @param {number} p.budget
 * @returns {string}
 */
export function describeRefine({ build, previousBuild, locked, followUp, total, budget }) {
  const ops = Object.fromEntries((followUp?.ops || []).map((o) => [o.category, o]));
  const targets = followUp?.targets || {};
  const absorbers = new Set(followUp?.absorbers || []);

  const opsAsked = (followUp?.ops || []).length > 0;
  const changed = [];
  for (const category of Object.keys(build)) {
    const after = build[category];
    const before = previousBuild?.[category] || null;
    if (!after && !before) continue;
    if (after && before && after.name === before.name) continue;
    changed.push({ category, before, after });
  }
  const changedCategories = new Set(changed.map((c) => c.category));

  const parts = [];
  if (changed.length === 0) {
    parts.push(opsAsked
      ? 'Nothing you asked for fit within your budget, so every part stays as it was.'
      : 'Nothing in your build needed to change for that request, so every part stays as it was.');
  } else {
    const keptCount = locked.length;
    parts.push(`I changed ${changed.length === 1 ? 'one part' : `${changed.length} parts`} and kept ${keptCount === 0 ? 'nothing' : keptCount === 1 ? 'one part' : `the other ${keptCount}`} exactly as ${keptCount === 1 ? 'it was' : 'they were'}.`);

    // The asked-for changes first, then the ones that only follow from them.
    const asked = changed.filter((c) => ops[c.category]);
    const forced = changed.filter((c) => !ops[c.category]);
    for (const { category, before, after } of [...asked, ...forced]) {
      if (!after) {
        parts.push(`The ${label(category)} is removed (${shortName(before.name)}, ${money(before.price)}).`);
        continue;
      }
      if (!before) {
        parts.push(`I added the ${shortName(after.name)} for ${money(after.price)}.`);
        continue;
      }
      const why = reasonFor(category, ops[category], targets[category], absorbers.has(category), changedCategories);
      const delta = after.price - before.price;
      // What actually differs, on the category's own terms (wattage and efficiency for a PSU, ...).
      const what = ops[category] || absorbers.has(category) ? describeDifference(category, before, after).slice(0, 3) : [];
      parts.push(
        `The ${label(category)} is now the ${shortName(after.name)} at ${money(after.price)} (${delta === 0 ? 'same price' : signed(delta)})${why ? `, ${why}` : ''}${what.length ? `: ${what.join(', ')}` : ''}.`
      );
    }
  }

  // Fresh compatibility evidence only for what the change can affect.
  const facts = buildFacts(build);
  // The headroom fact refers back to the draw estimate, so they travel together.
  const draw = facts.find((f) => /^Estimated peak draw/.test(f));
  const headroom = facts.find((f) => /headroom/.test(f));
  if (draw && headroom && (changedCategories.has('PSU') || changedCategories.has('Processor') || changedCategories.has('Graphics Card'))) {
    parts.push(draw, headroom);
  }
  const platform = facts.find((f) => /share the/.test(f));
  if (platform && (changedCategories.has('Processor') || changedCategories.has('Motherboard'))) {
    parts.push(platform);
  }

  if (total && budget) {
    const left = budget - total;
    parts.push(left >= 0
      ? `The build now totals ${money(total)}, ${money(left)} under your ${money(budget)} budget.`
      : `The build now totals ${money(total)}, ${money(-left)} over your ${money(budget)} budget.`);
  }
  return parts.join(' ');
}
