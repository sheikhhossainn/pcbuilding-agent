/**
 * Cross-check: price one finished build at every other store.
 *
 * For each store: find the same part (or an equivalent one) for every part in the build, keep the
 * matches that still fit together, and let the engine fill in the rest from that store's stock with
 * the build's own intent. No AI call: the intent is the one the build was made with.
 */

import { BUDGET } from '../config/budget.js';
import { VALID_SITES, siteLabel, siteNotice } from '../config/sites.js';
import { compareParts, findCounterpart } from '../utils/productIdentity.js';
import { SWAPPABLE_CATEGORIES } from './alternatives.js';
import { collectBuildWarnings, estimatePower } from './buildValidator.js';
import { executeBuild } from './buildOrchestrator.js';
import { applyLockCascade } from './lockCascade.js';

const MANDATORY = ['Processor', 'Motherboard', 'RAM', 'PSU'];
// Has no figures or store names, so the intent overrides read nothing from it.
const MESSAGE = 'Cross-check this build at another store.';
const FAILED = 'Could not price this build here. Please try again.';

const sum = (build) => Object.values(build).reduce((total, part) => total + (part?.price || 0), 0);
export const budgetCeiling = (budget) =>
  budget + Math.min(budget * BUDGET.CEILING_OVERSPEND_PERCENTAGE, BUDGET.CEILING_OVERSPEND_MAX_BDT);

/**
 * The build's intent, made to describe this build: the parts it has are wanted, the ones it lacks
 * are not, and the budget covers what it costs now (the goal is the same build, not the same budget).
 */
export function crossCheckIntent(intent, reference, referenceTotal) {
  const base = JSON.parse(JSON.stringify(intent || {}));
  const strategy = base.component_strategy || {};
  for (const category of SWAPPABLE_CATEGORIES) {
    const has = Boolean(reference[category]);
    const strat = strategy[category] || {
      weight: 1, required_keywords: [], exclude_keywords: [], structured_reqs: {},
    };
    strat.required = has;
    if (has && !(strat.weight > 0)) strat.weight = 1;
    if (!has) strat.weight = 0;
    strategy[category] = strat;
  }
  return {
    ...base,
    budget_bdt: Math.max(Number(base.budget_bdt) || 0, referenceTotal, BUDGET.MIN_BUDGET_BDT),
    use_case: base.use_case || 'general',
    no_gpu: !reference['Graphics Card'],
    preferred_site: null,
    component_strategy: strategy,
  };
}

/**
 * Matches for every part of the reference at one store, read in parallel, and the categories the
 * store has nothing in at all.
 */
async function matchAtStore(site, reference, deps) {
  const categories = Object.keys(reference);
  const lists = await Promise.all(categories.map((c) => deps.partRepository.listInStock(site, c)));
  const matches = {};
  const empty = [];
  categories.forEach((category, i) => {
    if (!lists[i]?.length) empty.push(category);
    const found = findCounterpart(category, reference[category], lists[i]);
    if (found) matches[category] = { part: { ...found.part }, match: found.match };
  });
  return { matches, empty };
}

// The floor check names the first part a store cannot supply at all.
const unsuppliedCategory = (error) => /^No (.+?) matching your requirements/.exec(error?.userMessage || '')?.[1] || null;
const MAX_DROPPED = 4;

/**
 * The matched parts that can be kept together: a board only with its CPU, memory only with its
 * board, the PSU only with the CPU and graphics card it was sized for, and nothing that fails a
 * compatibility check against the others.
 */
export function consistentPins(matches, { noGpu, intent }, deps) {
  const locks = applyLockCascade(new Set(Object.keys(matches)), { noGpu });
  const part = (c) => (locks.has(c) ? matches[c].part : null);
  const cc = deps.compatibilityChecker;

  if (part('Processor') && part('Motherboard') && !cc.isSocketCompatible(part('Processor'), part('Motherboard'))) {
    locks.delete('Motherboard');
    locks.delete('RAM');
  }
  if (part('Motherboard') && part('RAM') && !cc.isRamTypeCompatible(part('Motherboard'), part('RAM'))) {
    locks.delete('RAM');
  }
  if (part('PSU')) {
    const target = deps.budgetAllocator.computeTargetPsuWattage(
      part('Processor') || {}, part('Graphics Card'), intent.use_case, intent.budget_bdt,
    );
    if ((part('PSU').specs?.wattage || 0) < target) locks.delete('PSU');
  }
  return Object.fromEntries([...locks].map((c) => [c, matches[c].part]));
}

/** How each part of the store's build relates to the reference part in the same slot. */
function labelMatches(reference, build) {
  const labels = {};
  for (const category of SWAPPABLE_CATEGORIES) {
    const ref = reference[category];
    const part = build[category];
    if (ref && !part) labels[category] = 'missing';
    else if (ref && part) labels[category] = compareParts(category, ref, part) || 'substitute';
    else if (part) labels[category] = 'added'; // e.g. a cooler the store's CPU needs
  }
  return labels;
}

const countLabels = (labels) => {
  const counts = { exact: 0, equivalent: 0, substitute: 0, missing: 0, added: 0 };
  for (const label of Object.values(labels)) counts[label] += 1;
  return counts;
};

/**
 * Price the reference build at one store.
 * @returns {Promise<object>} { site, label, status: 'ok'|'partial'|'unavailable', build, total,
 *   delta, overBudget, matches, counts, warnings, notes, power, intent, error? }
 */
export async function crossCheckSite({ site, reference, referenceTotal, intent, budget }, deps, onState = () => {}) {
  const base = { site, label: siteLabel(site) };
  try {
    onState('matching');
    const { matches, empty } = await matchAtStore(site, reference, deps);
    const pinned = consistentPins(matches, { noGpu: intent.no_gpu, intent }, deps);
    // Room for the matched parts at this store's prices, plus the rest at the reference's prices:
    // a store that is dearer should show the same build costing more, not a weaker build.
    const unpinnedTotal = Object.keys(reference).filter((c) => !pinned[c]).reduce((t, c) => t + reference[c].price, 0);
    const storeIntent = { ...intent, budget_bdt: Math.max(intent.budget_bdt, sum(pinned) + unpinnedTotal) };

    let build;
    let warnings;
    let notes = [];
    let power;
    let resultIntent = { ...storeIntent, _applied_site: site };

    if (Object.keys(reference).every((c) => pinned[c])) {
      // Every part has a counterpart that fits: nothing for the engine to do.
      build = Object.fromEntries(SWAPPABLE_CATEGORIES.map((c) => [c, pinned[c] || null]));
      warnings = collectBuildWarnings({ build, intent: storeIntent }, deps);
      power = estimatePower(build, storeIntent, deps);
    } else {
      onState('building');
      const absent = SWAPPABLE_CATEGORIES.filter((c) => !reference[c] && !MANDATORY.includes(c));
      // An optional part the store does not stock is reported missing; it must not sink the whole
      // build. Mandatory parts still do (the store cannot build this PC).
      const optional = (c) => !MANDATORY.includes(c) && reference[c] && !pinned[c];
      const dropped = empty.filter(optional);
      let result;
      for (;;) {
        try {
          result = await executeBuild({
            message: MESSAGE, site, _intent: storeIntent, _pinned: pinned, _skipExplanation: true,
            removedCategories: [...absent, ...dropped],
          }, deps);
          break;
        } catch (error) {
          const category = unsuppliedCategory(error);
          if (!category || !optional(category) || dropped.includes(category) || dropped.length >= MAX_DROPPED) throw error;
          dropped.push(category);
        }
      }
      build = result.build;
      warnings = result.warnings;
      notes = result.notes;
      power = result.power;
      resultIntent = result.intent;
    }

    const labels = labelMatches(reference, build);
    const counts = countLabels(labels);
    const total = sum(build);
    // Switching to this build keeps the user's budget when the build fits it.
    if (total <= budgetCeiling(budget)) resultIntent = { ...resultIntent, budget_bdt: budget };
    onState('done');
    return {
      ...base,
      status: counts.missing > 0 ? 'partial' : 'ok',
      build,
      total,
      delta: total - referenceTotal,
      overBudget: total > budgetCeiling(budget),
      matches: labels,
      counts,
      warnings,
      notes,
      power,
      intent: resultIntent,
    };
  } catch (error) {
    onState('failed');
    // Only messages written for users reach the browser (see queueManager).
    if (!error.userMessage) console.error(`[cross-check] ${site} failed:`, error);
    // A store with a standing notice (no PC parts at all) says just that.
    const category = unsuppliedCategory(error);
    const message = siteNotice(site)
      || (category && `${base.label} has no ${category.toLowerCase()} in stock that works for this build.`)
      || error.userMessage?.replace(/\*\*/g, '')
      || FAILED;
    return { ...base, status: 'unavailable', error: message };
  }
}

/**
 * Cross-check job: the reference build at its own store, then every other store.
 * @param {{ build: object, intent: object|null, site: string }} payload - already sanitised
 * @param {object} deps - engine deps (no AI needed)
 * @param {{ onProgress?: (site: string, state: string) => void }} [ctx]
 */
export async function executeCrossCheck(payload, deps, ctx = {}) {
  const { site } = payload;
  const report = (store, state) => {
    try { ctx.onProgress?.(store, state); } catch { /* progress must never break the job */ }
  };

  // Specs decide compatibility, so they are worked out from the names here, never taken from the browser.
  const reference = {};
  for (const [category, part] of Object.entries(payload.build)) {
    reference[category] = { ...part, specs: deps.specInference.inferSpecs(category, part.name) };
  }

  // Price the reference at today's prices too, so the differences compare like with like.
  const urls = Object.values(reference).map((p) => p.url).filter(Boolean);
  const availability = urls.length && deps.partRepository.checkAvailabilityMany
    ? await deps.partRepository.checkAvailabilityMany(urls)
    : new Map();
  const outOfStock = [];
  const priceChanged = [];
  for (const [category, part] of Object.entries(reference)) {
    const now = part.url ? availability.get(part.url) : null;
    if (!now) continue;
    if (!now.in_stock) outOfStock.push(category);
    if (now.price && now.price !== part.price) {
      priceChanged.push(category);
      part.price = now.price;
    }
  }
  const referenceTotal = sum(reference);
  const budget = Number(payload.intent?.budget_bdt) || referenceTotal;
  const intent = crossCheckIntent(payload.intent, reference, referenceTotal);

  const others = VALID_SITES.filter((s) => s !== site);
  for (const store of others) report(store, 'queued');

  const results = await Promise.all(others.map((store) => crossCheckSite(
    { site: store, reference, referenceTotal, intent, budget }, deps, (state) => report(store, state),
  )));

  return {
    reference: {
      site,
      label: siteLabel(site),
      build: Object.fromEntries(SWAPPABLE_CATEGORIES.map((c) => [c, reference[c] || null])),
      total: referenceTotal,
      overBudget: referenceTotal > budgetCeiling(budget),
      outOfStock,
      priceChanged,
    },
    budget,
    results,
    checkedAt: new Date().toISOString(),
  };
}
