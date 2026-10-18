/**
 * Follow-up patches.
 *
 * A refine message ("find a monitor around 20k and use the saved money for a stronger PSU")
 * is read by the LLM as a small list of per-part operations, not as a rewrite of the whole
 * 12-category intent. This module validates that patch and applies it to a clone of the
 * previous intent, so everything the user did not mention stays byte-identical and the set
 * of parts that must be re-searched is known up front.
 *
 * Pure functions only: no LLM, no database.
 */

import { qualityScore, keyAxisFloor } from '../utils/partQuality.js';

export const PATCH_CATEGORIES = [
  'Processor', 'Motherboard', 'RAM', 'Storage', 'Graphics Card', 'PSU',
  'Casing', 'CPU Cooler', 'Monitor', 'Mouse', 'Keyboard', 'UPS',
];

// A PC cannot boot without these, so "remove" never applies to them.
const MANDATORY = new Set(['Processor', 'Motherboard', 'RAM', 'PSU']);

// Parts whose choice constrains another part. Changing the key forces a re-pick of the values.
const DEPENDENTS = {
  Processor: ['Motherboard', 'PSU'],
  Motherboard: ['RAM'],
  'Graphics Card': ['PSU'],
};

const ALIASES = {
  gpu: 'Graphics Card', 'graphics card': 'Graphics Card', graphics: 'Graphics Card', 'video card': 'Graphics Card',
  cpu: 'Processor', processor: 'Processor',
  motherboard: 'Motherboard', mobo: 'Motherboard', board: 'Motherboard',
  ram: 'RAM', memory: 'RAM',
  storage: 'Storage', ssd: 'Storage', hdd: 'Storage', disk: 'Storage',
  psu: 'PSU', 'power supply': 'PSU',
  casing: 'Casing', case: 'Casing',
  'cpu cooler': 'CPU Cooler', 'cpu-cooler': 'CPU Cooler', cooler: 'CPU Cooler',
  monitor: 'Monitor', display: 'Monitor', screen: 'Monitor',
  mouse: 'Mouse', keyboard: 'Keyboard', ups: 'UPS',
};

const ACTIONS = new Set(['change', 'add', 'remove']);
const USE_CASES = ['gaming', 'editing', 'office', 'general'];
const SPEC_KEYS = ['min_gb', 'min_hz', 'min_tb', 'min_wattage'];

const MAX_KEYWORDS = 10;
const MAX_KEYWORD_LENGTH = 40;
const MAX_BUDGET = 5_000_000;
const DEFAULT_TOLERANCE = 0.15;

// Next step up when the user only says "more powerful" and gives no figure.
const PSU_TIERS = [450, 550, 650, 750, 850, 1000, 1200, 1600];
const SCALE_UP = 1.3;
const SCALE_DOWN = 0.7;
// A price worked out from "better"/"cheaper" is a guide, not a promise: the quality bound decides.
const DERIVED_TOLERANCE = 0.3;

export function canonicalCategory(name) {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (PATCH_CATEGORIES.includes(trimmed)) return trimmed;
  return ALIASES[trimmed.toLowerCase()] || null;
}

const positive = (value, max = Infinity) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= max ? n : null;
};

const words = (list) => (Array.isArray(list) ? list : [])
  .filter((w) => typeof w === 'string')
  .map((w) => w.trim().toLowerCase().slice(0, MAX_KEYWORD_LENGTH))
  .filter(Boolean)
  .slice(0, MAX_KEYWORDS);

/**
 * Validate a patch as returned by the model. Anything unusable is dropped rather than
 * trusted; an op for an unknown part is ignored. Returns null when the reply is not an object.
 */
export function normalizePatch(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const seen = new Set();
  const ops = [];
  for (const entry of Array.isArray(raw.ops) ? raw.ops : []) {
    if (!entry || typeof entry !== 'object') continue;
    const category = canonicalCategory(entry.category);
    if (!category || seen.has(category)) continue;
    seen.add(category);

    const structured = {};
    for (const key of SPEC_KEYS) {
      const value = positive(entry.structured_reqs?.[key], 100000);
      if (value !== null) structured[key] = value;
    }
    const tolerance = Number(entry.tolerance);

    ops.push({
      category,
      action: ACTIONS.has(entry.action) ? entry.action : 'change',
      direction: entry.direction === 'up' || entry.direction === 'down' ? entry.direction : null,
      price_target: positive(entry.price_target, MAX_BUDGET),
      tolerance: Number.isFinite(tolerance) && tolerance >= 0.05 && tolerance <= 0.5 ? tolerance : DEFAULT_TOLERANCE,
      absorb_savings: entry.absorb_savings === true,
      required_keywords: words(entry.required_keywords),
      exclude_keywords: words(entry.exclude_keywords),
      drop_keywords: words(entry.drop_keywords),
      structured_reqs: structured,
    });
  }

  const brand = (value, allowed) => {
    if (value === undefined || value === null) return undefined;
    const v = String(value).toLowerCase();
    if (v === 'any' || v === 'none') return null;
    return allowed.includes(v) ? v : undefined;
  };

  const useCase = typeof raw.use_case === 'string' ? raw.use_case.toLowerCase() : null;
  const clarify = typeof raw.clarify === 'string' ? raw.clarify.replace(/\s+/g, ' ').trim().slice(0, 300) : '';

  return {
    ops,
    budget_bdt: positive(raw.budget_bdt, MAX_BUDGET),
    use_case: USE_CASES.includes(useCase) ? useCase : null,
    preferred_cpu_brand: brand(raw.preferred_cpu_brand, ['amd', 'intel']),
    preferred_gpu_brand: brand(raw.preferred_gpu_brand, ['nvidia', 'amd']),
    no_gpu: typeof raw.no_gpu === 'boolean' ? raw.no_gpu : null,
    restart: raw.restart === true,
    clarify: clarify || null,
  };
}

/** True when the patch changes nothing: the model had nothing to apply (or only a question). */
export function isEmptyPatch(patch) {
  return !patch.ops.length
    && patch.budget_bdt === null
    && patch.use_case === null
    && patch.preferred_cpu_brand === undefined
    && patch.preferred_gpu_brand === undefined
    && patch.no_gpu === null;
}

/** `categories` plus every part that depends on one of them, transitively. */
export function dependencyClosure(categories) {
  const out = new Set();
  const visit = (category) => {
    if (out.has(category)) return;
    out.add(category);
    for (const dependent of DEPENDENTS[category] || []) visit(dependent);
  };
  for (const category of categories) visit(category);
  return out;
}

// A brand change must be something the user said. Models sometimes read the brand off the parts
// already in the build ("Ryzen" -> amd) and report it as a change, which would redo CPU, board,
// RAM and PSU for nothing.
const BRAND_WORDS = {
  cpu: { amd: /\b(amd|ryzen|athlon|threadripper)\b/, intel: /\b(intel|core|ultra|pentium|celeron|i[3579])\b/ },
  gpu: { nvidia: /\b(nvidia|geforce|rtx|gtx|gt)\b/, amd: /\b(amd|radeon|rx)\b/ },
};
const mentionsBrand = (message, kind, brand) => {
  if (typeof message !== 'string') return true; // nothing to check against
  const re = BRAND_WORDS[kind][brand];
  return !re || re.test(message.toLowerCase());
};

// "Gets the saved money" must be something the user said. A model that adds absorb_savings on its
// own would let a part quietly spend the whole leftover budget.
const SAVINGS_WORDS = /\b(sav(?:e|ed|es|ing|ings)|left\s?over|leftover|rest|remain(?:ing|s|der)?|extra|spare|freed?|surplus|difference|excess|the money|that money|spend|spent|put it|use it|use that|use this)\b/;
const mentionsSavings = (message) => typeof message !== 'string' || SAVINGS_WORDS.test(message.toLowerCase());

const nextTier = (tiers, current) => tiers.find((t) => t > current) ?? tiers[tiers.length - 1];

/**
 * Apply a normalized patch to a clone of the previous intent.
 *
 * @param {Object} previousIntent
 * @param {Object} patch - from normalizePatch
 * @param {Object} [previousBuild] - parts of the build being refined, used to size "more powerful"
 * @param {string} [message] - the user's words, used to ignore brand changes they never asked for
 * @returns {{
 *   intent: Object,
 *   changing: Set<string>,          parts that must be searched again (closure included)
 *   targets: Object,                { [category]: { target, tolerance } } price the user named
 *   absorbers: string[],            parts that should take the money other changes free up
 *   notes: string[],                things in the patch that could not be honoured
 *   ops: Array,                     the normalized per-part operations, for describing the result
 * }}
 */
export function applyPatch(previousIntent, patch, previousBuild = {}, message) {
  const intent = JSON.parse(JSON.stringify(previousIntent));
  const strategy = intent.component_strategy || (intent.component_strategy = {});
  const direct = new Set();
  const targets = {};
  const absorbers = [];
  const notes = [];

  for (const op of patch.ops) {
    const { category } = op;
    const strat = strategy[category] || (strategy[category] = {
      weight: 1, required: false, required_keywords: [], exclude_keywords: [], structured_reqs: {},
    });
    const current = previousBuild?.[category];

    if (op.action === 'remove') {
      if (MANDATORY.has(category)) {
        notes.push(`${category} is needed for the PC to work, so it was kept.`);
        continue;
      }
      strat.required = false;
      strat.weight = 0;
      direct.add(category);
      continue;
    }

    if (op.action === 'add' && !strat.required) {
      strat.required = true;
      if (!(strat.weight > 0)) strat.weight = 1;
    }

    // Keyword and spec edits are merged into what the earlier request already set.
    const dropped = new Set(op.drop_keywords);
    strat.required_keywords = [...new Set([...(strat.required_keywords || []), ...op.required_keywords])]
      .filter((k) => !dropped.has(k.toLowerCase()));
    strat.exclude_keywords = [...new Set([...(strat.exclude_keywords || []), ...op.exclude_keywords])]
      .filter((k) => !dropped.has(k.toLowerCase()));
    strat.structured_reqs = { ...(strat.structured_reqs || {}), ...op.structured_reqs };

    // "Better" / "stronger" / "cheaper" with no figure: the new part has to beat (or undercut) the one
    // being replaced on that category's own scale (wattage and efficiency for a PSU, resolution and
    // refresh rate for a monitor, ...), and the price is guided from the current one.
    let target = op.price_target;
    let derived = false;
    if (op.direction && current) {
      const score = qualityScore(category, current);
      if (op.direction === 'up') {
        strat.structured_reqs.better_than = score;
        strat.structured_reqs.no_worse_on = keyAxisFloor(category, current);
      }
      else strat.structured_reqs.worse_than = score;

      if (category === 'PSU' && op.direction === 'up' && !Object.keys(op.structured_reqs).length) {
        strat.structured_reqs.min_wattage = nextTier(PSU_TIERS, Number(current.specs?.wattage) || 0);
      }
      if (!target && Number(current.price) > 0) {
        target = Math.round(current.price * (op.direction === 'up' ? SCALE_UP : SCALE_DOWN));
        derived = true;
      }
    }
    if (target) targets[category] = { target, tolerance: derived ? DERIVED_TOLERANCE : op.tolerance, derived };
    if (op.absorb_savings && mentionsSavings(message)) absorbers.push(category);
    direct.add(category);
  }

  // A named price for a part is not the build total. Total-level changes come only from here.
  const prevBudget = Number(previousIntent.budget_bdt) || null;
  const budgetChanged = patch.budget_bdt !== null && patch.budget_bdt !== prevBudget;
  if (budgetChanged) intent.budget_bdt = patch.budget_bdt;

  const brandAsked = (kind, brand) => brand === null || mentionsBrand(message, kind, brand);
  if (patch.preferred_cpu_brand !== undefined && brandAsked('cpu', patch.preferred_cpu_brand)
    && patch.preferred_cpu_brand !== (previousIntent.preferred_cpu_brand ?? null)) {
    intent.preferred_cpu_brand = patch.preferred_cpu_brand;
    direct.add('Processor');
  }
  if (patch.preferred_gpu_brand !== undefined && brandAsked('gpu', patch.preferred_gpu_brand)
    && patch.preferred_gpu_brand !== (previousIntent.preferred_gpu_brand ?? null)) {
    intent.preferred_gpu_brand = patch.preferred_gpu_brand;
    direct.add('Graphics Card');
  }

  if (patch.no_gpu !== null && patch.no_gpu !== Boolean(previousIntent.no_gpu)) {
    intent.no_gpu = patch.no_gpu;
    const gpu = strategy['Graphics Card'] || (strategy['Graphics Card'] = {
      weight: 1, required: false, required_keywords: [], exclude_keywords: [], structured_reqs: {},
    });
    gpu.required = !patch.no_gpu;
    if (patch.no_gpu) gpu.weight = 0;
    else if (!(gpu.weight > 0)) gpu.weight = 1;
    direct.add('Graphics Card');
  }

  const useCaseChanged = patch.use_case !== null && patch.use_case !== previousIntent.use_case;
  if (useCaseChanged) intent.use_case = patch.use_case;

  // Which parts a total-level change touches. With named parts, the extra (or smaller)
  // budget goes to those; with none, the parts whose size depends on the budget are redone.
  let changing;
  if (useCaseChanged) {
    changing = new Set(PATCH_CATEGORIES);
  } else {
    changing = dependencyClosure(direct);
    if (budgetChanged && direct.size === 0) {
      for (const category of dependencyClosure(['Processor', 'Graphics Card', 'Monitor'])) changing.add(category);
    }
  }

  return { intent, changing, targets, absorbers, notes, ops: patch.ops };
}

const baht = (n) => `\u09F3${Math.round(n).toLocaleString('en-BD')}`;
const SPEC_TEXT = {
  min_tb: (v) => `at least ${v}TB`,
  min_gb: (v) => `at least ${v}GB`,
  min_hz: (v) => `at least ${v}Hz`,
  min_wattage: (v) => `at least ${v}W`,
};
const USE_LABEL = { gaming: 'gaming', editing: 'video editing', office: 'office work', general: 'general use' };

/**
 * How the request was understood, as short chips the user can check: [{ label, text }].
 * Built from the validated patch only, so it shows what the engine will actually do.
 *
 * @param {Object} patch - from normalizePatch
 * @param {Object} [previousIntent] - to leave out settings that did not change
 * @returns {Array<{label: string, text: string}>}
 */
export function describePatch(patch, previousIntent = {}, message) {
  const items = [];

  for (const op of patch.ops) {
    if (op.action === 'remove') { items.push({ label: op.category, text: 'remove' }); continue; }
    const bits = [];
    if (op.action === 'add') bits.push('add');
    if (op.direction === 'up') bits.push('better');
    if (op.direction === 'down') bits.push('cheaper');
    if (op.price_target) bits.push(`around ${baht(op.price_target)}`);
    if (op.absorb_savings && mentionsSavings(message)) bits.push('gets the saved money');
    // Required keywords all have to match, so they read as one phrase: "ryzen 7", not "ryzen", "7".
    if (op.required_keywords.length) bits.push(`"${op.required_keywords.join(' ')}"`);
    for (const word of op.exclude_keywords) bits.push(`not "${word}"`);
    for (const [key, value] of Object.entries(op.structured_reqs)) bits.push(SPEC_TEXT[key]?.(value) || `${key} ${value}`);
    items.push({ label: op.category, text: bits.join(', ') || 'change' });
  }

  if (patch.budget_bdt !== null && patch.budget_bdt !== Number(previousIntent.budget_bdt)) {
    items.push({ label: 'Total budget', text: baht(patch.budget_bdt) });
  }
  if (patch.use_case && patch.use_case !== previousIntent.use_case) {
    items.push({ label: 'Use', text: USE_LABEL[patch.use_case] });
  }
  if (patch.preferred_cpu_brand !== undefined && patch.preferred_cpu_brand !== (previousIntent.preferred_cpu_brand ?? null)) {
    items.push({ label: 'CPU brand', text: patch.preferred_cpu_brand ? patch.preferred_cpu_brand.toUpperCase() : 'any' });
  }
  if (patch.preferred_gpu_brand !== undefined && patch.preferred_gpu_brand !== (previousIntent.preferred_gpu_brand ?? null)) {
    items.push({ label: 'GPU brand', text: patch.preferred_gpu_brand ? patch.preferred_gpu_brand.toUpperCase() : 'any' });
  }
  if (patch.no_gpu !== null && patch.no_gpu !== Boolean(previousIntent.no_gpu)) {
    items.push({ label: 'Graphics', text: patch.no_gpu ? 'integrated only' : 'dedicated card' });
  }
  return items;
}
