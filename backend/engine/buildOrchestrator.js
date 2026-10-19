/**
 * Build Orchestrator
 * Extracted core build logic from routes/build.js.
 * Workers call executeBuild(payload, deps) directly — no req/res involved.
 */

import { BUDGET } from '../config/budget.js';
import { API } from '../config/thresholds.js';
import { siteLabel, siteNotice, untrackedCategories } from '../config/sites.js';
import { collectBuildWarnings, estimatePower } from './buildValidator.js';
import { applyPatch, describePatch, isEmptyPatch } from './followUpPatch.js';
import { describeRefine } from './refineExplanation.js';

// A build cannot be assembled without these, so "remove" never applies to them.
const MANDATORY_CATEGORIES = new Set(['Processor', 'Motherboard', 'RAM', 'PSU']);

class BuildError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
    this.userMessage = message;
  }
}

/**
 * RAM is picked cheapest-first, so without a capacity floor the "cheapest compatible kit"
 * can be a 4GB stick in a 70k build. Fill in a sane minimum when the request didn't set one.
 */
export function applyDefaultRamCapacity(intent) {
  const ram = intent?.component_strategy?.RAM;
  if (!ram || !ram.required) return;
  ram.structured_reqs = ram.structured_reqs || {};
  if (ram.structured_reqs.min_gb) return;
  const budget = Number(intent.budget_bdt) || 0;
  const gamingOrEditing = intent.use_case === 'gaming' || intent.use_case === 'editing';
  const sixteen = gamingOrEditing ? budget >= 45000 : budget >= 70000;
  // Under ~30k the whole PC is a compromise; 8GB would push it out of reach.
  ram.structured_reqs.min_gb = sixteen ? 16 : budget >= 30000 ? 8 : 4;
  intent._defaults = { ...(intent._defaults || {}), RAM: true };
}

/**
 * Same idea for storage: below ~40k a 256GB drive is fair, above that 480-512GB is the floor.
 */
export function applyDefaultStorageCapacity(intent) {
  const storage = intent?.component_strategy?.Storage;
  if (!storage || !storage.required) return;
  storage.structured_reqs = storage.structured_reqs || {};
  if (storage.structured_reqs.min_tb) return;
  const budget = Number(intent.budget_bdt) || 0;
  if (budget >= 40000) {
    storage.structured_reqs.min_tb = 0.5;
    intent._defaults = { ...(intent._defaults || {}), Storage: true };
  }
}

// Catalog listings that match a category but are not what a desk PC needs.
const DEFAULT_EXCLUDES = {
  Monitor: ['portable', 'monitor stand', 'monitor arm', 'desk mount', 'wall mount', 'single arm', 'dual arm', 'vesa', 'light bar'],
  Keyboard: ['surface', 'cover', 'ipad', 'keycap', 'single hand', 'numpad', 'keypad'],
  Mouse: ['mouse pad', 'mousepad', 'bungee', 'headset'],
  RAM: [' ecc', 'rdimm', 'sodimm', 'so-dimm', 'laptop', 'notebook'],
  Storage: ['portable', 'external', 'usb', 'enclosure'],
  'Graphics Card': ['workstation', 'quadro'],
  'CPU Cooler': ['upgrade kit', 'thermal paste', 'compound'],
};

export function applyDefaultExcludes(intent, message = '') {
  const text = String(message).toLowerCase();
  for (const [category, words] of Object.entries(DEFAULT_EXCLUDES)) {
    const strat = intent?.component_strategy?.[category];
    if (!strat) continue;
    // Kept apart from exclude_keywords: those can be relaxed to find stock, these never are.
    strat.default_excludes = words.filter((word) => !text.includes(word.trim())); // user asked for exactly that
  }
}

// Leftover budget should not balloon a desk accessory: a 47k monitor in a 100k build is not
// an upgrade the user wanted. Share of the stated budget (with a floor for small builds).
const UPGRADE_CAPS = {
  Monitor: { share: 0.2, floor: 12000 },
  Keyboard: { share: 0.04, floor: 3500 },
  Mouse: { share: 0.03, floor: 3000 },
  UPS: { share: 0.08, floor: 6000 },
};

// When the user hands freed-up money to one part, it still should not turn into the priciest one
// on the shelf. Only applied to a part named as the absorber; CPU and GPU are bounded by the
// balance checks instead.
const ABSORB_CAPS = {
  PSU: { share: 0.12, floor: 9000 },
  Casing: { share: 0.08, floor: 8000 },
  'CPU Cooler': { share: 0.06, floor: 7000 },
  Storage: { share: 0.15, floor: 12000 },
  RAM: { share: 0.15, floor: 12000 },
  Motherboard: { share: 0.15, floor: 12000 },
};

// A refine that has no room may give up ONE extra kept part before the whole build is re-planned
// (giving up two or more, say GPU and CPU for a bigger SSD, is a bigger change than the user asked
// for). This is how many different single parts are tried, in order, for that role.
const MAX_RELEASE_TRIES = 3;
// Board and memory follow the CPU choice, so they are never released on their own.
const COUPLED_TO_PLATFORM = new Set(['Motherboard', 'RAM']);

// Which kept part to give up first: the one that costs the most per unit of weight the user gave it.
const releaseScore = (category, build, intent) =>
  (build[category]?.price || 0) / Math.max(intent.component_strategy?.[category]?.weight || 0, 0.5);

const absorbCapFor = (category, budget) => {
  const cap = ABSORB_CAPS[category];
  return cap ? Math.max(cap.floor, Math.round(budget * cap.share)) : Infinity;
};

const upgradeCapFor = (category, budget) => {
  const cap = UPGRADE_CAPS[category];
  return cap ? Math.max(cap.floor, Math.round(budget * cap.share)) : Infinity;
};

/**
 * Execute a full PC build pipeline
 * @param {Object} payload - { message, site, customKeys }
 * @param {Object} deps - injected dependencies
 * @param {Object} [ctx]
 * @param {(stage: string) => void} [ctx.onStage] - progress hook: intent | planning | selecting | optimizing | checking | explaining
 * @param {(items: Array<{label: string, text: string}>) => void} [ctx.onInterpretation] - refine only: how the message was understood
 * @param {(changing: string[]|null) => void} [ctx.onScope] - refine only: the parts being searched again (null = all of them)
 * @returns {Object} { build, total, budget, explanation, intent, warnings, notes, power }
 */
export async function executeBuild(payload, deps, ctx = {}) {
  const {
    message, site: bodySite, previousIntent: prevIntent, previousBuild: prevBuild,
    removedCategories = [],
  } = payload;

  // Parts that arrive without specs (a shared link, or a session saved before specs were
  // returned) still need them: locked parts take part in compatibility checks below.
  if (prevBuild && deps.specInference) {
    for (const [category, part] of Object.entries(prevBuild)) {
      if (part && part.name && !part.specs) {
        part.specs = deps.specInference.inferSpecs(category, part.name);
      }
    }
  }

  const setStage = (stage) => {
    try { ctx.onStage?.(stage); } catch { /* progress reporting must never break a build */ }
  };
  setStage('intent');
  const setInterpretation = (items) => {
    try { ctx.onInterpretation?.(items); } catch { /* progress reporting must never break a build */ }
  };
  const setScope = (changing) => {
    try { ctx.onScope?.(changing); } catch { /* progress reporting must never break a build */ }
  };

  // Validate input
  if (!message || message.length > API.MAX_MESSAGE_LENGTH) {
    throw new BuildError(400, 'Message is required and must be under 2000 characters.', 'INVALID_MESSAGE');
  }
  if (bodySite && !API.VALID_SITES.includes(bodySite)) {
    throw new BuildError(400, 'Invalid site selected.', 'INVALID_SITE');
  }

  // Extract intent from AI (pass previous context for follow-ups)
  let intent;
  // Set when the refine message was read as a patch: which parts to search again, and what the
  // user said about price and where freed-up money should go.
  let followUp = null;
  let restarting = false;
  try {
    if (payload._intent) {
      intent = JSON.parse(JSON.stringify(payload._intent));
      // A re-plan keeps what the user said about price and where freed money goes.
      if (payload._followUp) followUp = { ...payload._followUp, changing: new Set(payload._followUp.changing || []) };
      if (followUp?.interpretation) setInterpretation(followUp.interpretation);
    } else {
      let patch = null;
      if (prevIntent && prevBuild && deps.intentExtractor.extractPatch) {
        try {
          patch = await deps.intentExtractor.extractPatch(message, prevIntent, prevBuild);
        } catch (error) {
          // Fall back to the full-intent reader below rather than failing the refine.
          console.warn('[orchestrator] Patch extraction failed, using full intent:', error.message);
        }
      }
      if (patch && isEmptyPatch(patch) && patch.clarify) {
        throw new BuildError(422, patch.clarify, 'NEEDS_CLARIFICATION');
      }
      if (patch && !patch.restart && !isEmptyPatch(patch)) {
        const plan = applyPatch(prevIntent, patch, prevBuild, message);
        intent = plan.intent;
        followUp = plan;
        plan.interpretation = describePatch(patch, prevIntent, message);
        setInterpretation(plan.interpretation);
        setScope([...plan.changing]);
        console.log(`[orchestrator] Follow-up patch: re-search ${[...plan.changing].join(', ') || 'nothing'}`);
      } else {
        restarting = Boolean(patch?.restart);
        intent = await deps.intentExtractor.extract(message, restarting ? null : prevIntent || null, restarting ? null : prevBuild || null);
      }
    }
  } catch (error) {
    if (error instanceof BuildError) throw error;
    console.error("[orchestrator] Intent extraction failed:", error);
    if (error.message.includes('Intent extraction failed')) {
      throw new BuildError(500, 'The AI service is currently unavailable. Please try again later.', 'GROQ_UNAVAILABLE');
    }
    throw new BuildError(500, 'Failed to process your request. Please rephrase.', 'INVALID_INTENT');
  }

  // Apply manual overrides. In a follow-up, "monitor around 20k" prices the monitor; it must not
  // become the new total budget (the recursive re-plan below passes `_intent` instead of a prevIntent).
  const overrideOpts = {
    followUp: Boolean((prevIntent && !restarting) || payload._intent),
    previousBudget: restarting ? null : Number(prevIntent?.budget_bdt) || null,
  };
  deps.intentOverrideApplier(intent, message, overrideOpts);

  // Honor parts the user removed by hand: don't quietly put them back on a refine.
  // The four parts a PC cannot boot without are never dropped.
  const removed = new Set(
    (Array.isArray(removedCategories) ? removedCategories : []).filter((c) => !MANDATORY_CATEGORIES.has(c))
  );
  for (const category of removed) {
    const strat = intent.component_strategy?.[category];
    if (strat) {
      strat.required = false;
      strat.weight = 0;
    }
    if (category === 'Graphics Card') intent.no_gpu = true;
  }
  applyDefaultRamCapacity(intent);
  applyDefaultStorageCapacity(intent);
  applyDefaultExcludes(intent, message);
  console.log("[orchestrator] Extracted intent:", JSON.stringify(intent, null, 2));

  // Validate budget
  if (!intent.budget_bdt || intent.budget_bdt < BUDGET.MIN_BUDGET_BDT) {
    throw new BuildError(400, `Budget too low. Minimum: ${BUDGET.MIN_BUDGET_BDT.toLocaleString('en-BD')} BDT.`, 'BUDGET_TOO_LOW');
  }

  // Kept so a follow-up whose kept parts leave no room can be rebuilt without re-asking the LLM.
  const intentSnapshot = JSON.parse(JSON.stringify(intent));

  // Determine site
  const VALID_SITES = API.VALID_SITES;
  const site = (VALID_SITES.includes(bodySite) ? bodySite : null)
    || (VALID_SITES.includes(intent.preferred_site) ? intent.preferred_site : null)
    || 'startech';

  console.log(`[orchestrator] Building from ${site} for ${intent.budget_bdt} BDT`);

  const budget = intent.budget_bdt;
  const budgetCeiling = budget + Math.min(budget * BUDGET.CEILING_OVERSPEND_PERCENTAGE, BUDGET.CEILING_OVERSPEND_MAX_BDT);
  const noGpu = intent.no_gpu || (intent.component_strategy?.['Graphics Card'] && !intent.component_strategy['Graphics Card'].required) || false;

  // ─── PHASE 1 & 2: Floor price validation & budget allocation ───
  setStage('planning');
  console.log("PHASE 1 & 2: Dynamic Blueprint Reality Check & Weighted Budget Allocation");

  const intentSnapshotBeforeFloor = JSON.parse(JSON.stringify(intent));

  // "Better than what I have" / "cheaper than what I have" / "a stronger PSU" steer which part is
  // picked; they are not a reason to refuse the build. If nothing better exists (the part is already
  // the best or the cheapest in stock) the floor check would fail with "no X found". It runs without
  // them, and they are put back for the selection, which keeps the old part and says so.
  const steering = {};
  const steeringFloor = {};
  for (const op of followUp?.ops || []) {
    if (!op.direction) continue;
    const reqs = intent.component_strategy?.[op.category]?.structured_reqs;
    if (!reqs) continue;
    const keys = ['better_than', 'worse_than', 'no_worse_on'];
    if (op.category === 'PSU' && op.direction === 'up' && !Object.keys(op.structured_reqs || {}).length) keys.push('min_wattage');
    steering[op.category] = {};
    for (const key of keys) {
      if (key in reqs) { steering[op.category][key] = reqs[key]; delete reqs[key]; }
    }
  }
  const floorResult = await deps.budgetAllocator.calculateFloorPrices({
    blueprint: intent,
    budgetCeiling,
    site,
  });

  if (floorResult.error) {
    // A store that can't supply a build says why, so the user knows to pick another one.
    throw new BuildError(400, [floorResult.error, siteNotice(site)].filter(Boolean).join(' '), 'BUDGET_FLOOR_EXCEEDED');
  }

  if (floorResult.updatedBlueprint) {
    intent = floorResult.updatedBlueprint;
  }

  for (const [category, held] of Object.entries(steering)) {
    const strat = intent.component_strategy?.[category];
    if (!strat) continue;
    strat.structured_reqs = { ...(strat.structured_reqs || {}), ...held };
    // The part has to be at least as dear as the cheapest one that satisfies the wish, or its share of
    // the budget would be sized for the part it is replacing. When nothing does, the floor stays as it was.
    const current = floorResult.minimums?.[category];
    if (typeof current !== 'number') continue;
    const cheapest = (await deps.partRepository.query(site, category, { min: 0, max: budgetCeiling }, 'price_asc'))
      .find((part) => deps.partRepository.matchesStrategy(part, strat, category));
    if (cheapest && cheapest.price > current) steeringFloor[category] = cheapest.price;
  }

  // The floor check prices every part at its cheapest and, when that total is over budget, relaxes
  // requirements (16GB of RAM down to 8GB, a keyword dropped). A refine keeps most parts at the
  // price they already have, so relaxing a part the user did not touch would only unlock it and
  // downgrade it for nothing. Parts outside the refine's scope get their requirements back.
  if (followUp) {
    const restored = [];
    for (const category of Object.keys(intentSnapshotBeforeFloor.component_strategy || {})) {
      if (followUp.changing.has(category)) continue;
      const before = JSON.stringify(intentSnapshotBeforeFloor.component_strategy[category]);
      if (intent.component_strategy?.[category] && JSON.stringify(intent.component_strategy[category]) !== before) {
        intent.component_strategy[category] = JSON.parse(before);
        restored.push(category);
      }
    }
    if (restored.length > 0 && floorResult.degradations) {
      floorResult.degradations = floorResult.degradations.filter((d) => !restored.some((c) => d.includes(c)));
    }
  }

  let dynamicBudgets = deps.budgetAllocator.allocateBudgets({
    blueprint: intent,
    minimums: floorResult.minimums,
    totalFloor: floorResult.totalFloor,
    budgetCeiling,
    site,
  });

  console.log("=".repeat(60));
  console.log(`Total Budget: ${budget} BDT (Ceiling: ${budgetCeiling})`);
  console.log(`Total Floor Price: ${floorResult.totalFloor} BDT`);
  console.log(`Leftover Budget: ${budgetCeiling - floorResult.totalFloor} BDT`);
  console.log("Dynamic Budgets:", dynamicBudgets);
  console.log("=".repeat(60));

  // ─── PHASE 3: Select components ───
  setStage('selecting');
  console.log("\nPHASE 3: Selecting components using Dynamic Budgets...");

  const selectedBuild = {
    Processor: null, Motherboard: null, RAM: null, Storage: null,
    "Graphics Card": null, PSU: null, Casing: null, "CPU Cooler": null,
    Monitor: null, Mouse: null, Keyboard: null, UPS: null
  };

  let totalCost = 0;
  let globalRemaining = budgetCeiling;
  const buildWarnings = [];

  if (floorResult.degradations && floorResult.degradations.length > 0) {
    buildWarnings.push(...floorResult.degradations);
  }

  const untracked = untrackedCategories(site);
  if (untracked.length > 0) {
    const rawMsg = (message || '').toLowerCase();
    const requested = untracked.filter((c) => intent.component_strategy?.[c]?.required || rawMsg.includes(c.toLowerCase()));
    if (requested.length > 0) {
      buildWarnings.push(`${new Intl.ListFormat('en', { type: 'conjunction' }).format(untracked)} are not tracked in the ${siteLabel(site)} catalog and were omitted from this build.`);
    }
  }

  // Memory generation the user asked for (DDR3/4/5), from the RAM or motherboard keywords.
  const requestedDdrOf = (strategyMap) => {
    for (const cat of ['RAM', 'Motherboard']) {
      const kw = (strategyMap?.[cat]?.required_keywords || []).find((k) => /^ddr[345]$/i.test(k));
      if (kw) return kw.toUpperCase();
    }
    return null;
  };

  // ─── Follow-up: Lock unchanged components from previous build ───
  const lockedCategories = new Set();
  const targetFloors = {}; // lowest price accepted for a part the user priced ("around 20k")
  if (prevBuild && prevIntent && prevIntent.component_strategy && !restarting) {
    const oldStrats = prevIntent.component_strategy;
    const newStrats = intent.component_strategy || {};

    const budgetChanged = prevIntent.budget_bdt !== intent.budget_bdt;
    const cpuBrandChanged = prevIntent.preferred_cpu_brand !== intent.preferred_cpu_brand;
    const gpuBrandChanged = prevIntent.preferred_gpu_brand !== intent.preferred_gpu_brand;
    const useCaseChanged = prevIntent.use_case !== intent.use_case;
    const siteChanged = prevIntent._applied_site && prevIntent._applied_site !== site;

    const initialLocks = new Set();

    for (const category of Object.keys(selectedBuild)) {
      const oldS = oldStrats[category];
      const newS = newStrats[category];
      const prevPart = prevBuild[category];

      if (!prevPart || !prevPart.name || !oldS || !newS) continue;

      const stratChanged =
        JSON.stringify(oldS.required_keywords || []) !== JSON.stringify(newS.required_keywords || []) ||
        JSON.stringify(oldS.exclude_keywords || []) !== JSON.stringify(newS.exclude_keywords || []) ||
        JSON.stringify(oldS.structured_reqs || {}) !== JSON.stringify(newS.structured_reqs || {}) ||
        oldS.required !== newS.required ||
        oldS.weight !== newS.weight;

      const isCpuAffected = category === 'Processor' && (cpuBrandChanged || budgetChanged);
      const isGpuAffected = category === 'Graphics Card' && (gpuBrandChanged || budgetChanged);
      const isBudgetSensitive = budgetChanged && ['Processor', 'Graphics Card', 'Monitor'].includes(category);

      // A patch already says which parts the request touches; without one, infer it from what changed.
      const untouched = followUp
        ? !followUp.changing.has(category) && !siteChanged
        : !isCpuAffected && !isGpuAffected && !isBudgetSensitive && !useCaseChanged && !siteChanged;
      if (!stratChanged && untouched) {
        initialLocks.add(category);
      }
    }

    // A new memory generation (e.g. "switch to DDR5") can't be served by a kept CPU whose
    // socket only drives the old one, so the CPU has to be re-chosen with it.
    const wantedDdr = requestedDdrOf(intent.component_strategy);
    if (wantedDdr && initialLocks.has('Processor')
      && !deps.compatibilityChecker.cpuSupportsRamType(prevBuild.Processor, wantedDdr)) {
      initialLocks.delete('Processor');
    }

    // Apply Compatibility Cascade
    if (!initialLocks.has('Processor')) {
      initialLocks.delete('Motherboard');
      initialLocks.delete('RAM');
      
      // Clear RAM type constraints to allow the new CPU to dictate it
      if (intent.component_strategy?.Motherboard?.required_keywords) {
        intent.component_strategy.Motherboard.required_keywords = 
          intent.component_strategy.Motherboard.required_keywords.filter(k => !['ddr4', 'ddr5', 'ddr3'].includes(k.toLowerCase()));
      }
      if (intent.component_strategy?.RAM?.required_keywords) {
        intent.component_strategy.RAM.required_keywords = 
          intent.component_strategy.RAM.required_keywords.filter(k => !['ddr4', 'ddr5', 'ddr3'].includes(k.toLowerCase()));
      }
    } else if (!initialLocks.has('Motherboard')) {
      initialLocks.delete('RAM');
      
      if (intent.component_strategy?.RAM?.required_keywords) {
        intent.component_strategy.RAM.required_keywords = 
          intent.component_strategy.RAM.required_keywords.filter(k => !['ddr4', 'ddr5', 'ddr3'].includes(k.toLowerCase()));
      }
    }

    // PSU sizing follows the CPU and GPU: a kept PSU is only valid while both are kept.
    if (!initialLocks.has('Processor') || (!initialLocks.has('Graphics Card') && !noGpu)) {
      initialLocks.delete('PSU');
    }

    // Re-apply user overrides AFTER cascade stripping so explicit DDR requests survive.
    // Spec requirements were already relaxed against real stock in the floor phase; keep
    // those values so the override doesn't quietly re-raise them (e.g. a 32GB kit that
    // doesn't exist for the kept platform).
    const relaxedSpecs = Object.fromEntries(
      Object.entries(intent.component_strategy || {}).map(([c, st]) => [c, { ...(st?.structured_reqs || {}) }])
    );
    deps.intentOverrideApplier(intent, message, overrideOpts);
    for (const [c, specs] of Object.entries(relaxedSpecs)) {
      if (!intent.component_strategy?.[c]) continue;
      const current = intent.component_strategy[c].structured_reqs || {};
      for (const [k, val] of Object.entries(specs)) {
        if (typeof val === 'number' && typeof current[k] === 'number' && val < current[k]) current[k] = val;
      }
      intent.component_strategy[c].structured_reqs = current;
    }

    // Verify inventory availability and apply final locks (one query for all kept parts).
    const lockUrls = [...initialLocks].map((c) => prevBuild[c].url).filter(Boolean);
    const availabilityByUrl = deps.partRepository.checkAvailabilityMany && lockUrls.length > 0
      ? await deps.partRepository.checkAvailabilityMany(lockUrls)
      : null;
    for (const category of initialLocks) {
      const prevPart = prevBuild[category];
      const availability = availabilityByUrl
        ? availabilityByUrl.get(prevPart.url) ?? null
        : deps.partRepository.checkAvailability ? await deps.partRepository.checkAvailability(prevPart.url) : { price: prevPart.price, in_stock: true };
      
      if (availability && availability.in_stock) {
        const currentPrice = availability.price || prevPart.price;
        prevPart.price = currentPrice; // Update to current price
        
        selectedBuild[category] = prevPart;
        totalCost += prevPart.price;
        globalRemaining -= prevPart.price;
        lockedCategories.add(category);
        console.log(`🔒 ${category}: Locked from previous build → ${prevPart.name} (${prevPart.price} BDT)`);
      } else {
        console.log(`🔓 ${category}: Unlocked because it is no longer in stock or available.`);
      }
    }

    // Final answer on what is being searched again (stock checks above may have unlocked a part).
    setScope(Object.keys(selectedBuild).filter((c) => !lockedCategories.has(c) && (prevBuild[c] || intent.component_strategy?.[c]?.required)));

    if (lockedCategories.size > 0) {
      console.log(`[Follow-up] Locked ${lockedCategories.size} unchanged categories, re-selecting ${Object.keys(selectedBuild).length - lockedCategories.size}`);
      
      // Recalculate dynamic budgets with reduced ceiling for unlocked categories
      const adjustedCeiling = budgetCeiling - totalCost;
      const adjustedMinimums = {};
      let adjustedFloor = 0;
      for (const cat of Object.keys(floorResult.minimums)) {
        if (lockedCategories.has(cat)) continue; // Skip locked categories
        adjustedMinimums[cat] = floorResult.minimums[cat] || 0;
        adjustedFloor += adjustedMinimums[cat];
      }
      // A part asked to be "better" has to be sized for the better part, not the one it replaces,
      // as long as the money for that exists; otherwise its share is left as it was.
      const steeredFloor = adjustedFloor + Object.entries(steeringFloor)
        .filter(([cat]) => !lockedCategories.has(cat) && cat in adjustedMinimums)
        .reduce((sum, [cat, price]) => sum + price - adjustedMinimums[cat], 0);
      if (steeredFloor > adjustedFloor && steeredFloor <= adjustedCeiling) {
        for (const [cat, price] of Object.entries(steeringFloor)) {
          if (!lockedCategories.has(cat) && cat in adjustedMinimums) adjustedMinimums[cat] = price;
        }
        adjustedFloor = steeredFloor;
      }
      dynamicBudgets = deps.budgetAllocator.allocateBudgets({
        blueprint: intent,
        minimums: adjustedMinimums,
        totalFloor: adjustedFloor,
        budgetCeiling: adjustedCeiling + adjustedFloor, // totalFloor is subtracted inside allocateBudgets
        site,
      });
      // Zero out locked categories in dynamic budgets
      for (const cat of lockedCategories) {
        dynamicBudgets[cat] = 0;
      }
      console.log(`[Follow-up] Recalculated dynamic budgets for unlocked categories:`, dynamicBudgets);
    }

    // A price the user named for a part replaces the share the allocator would have given it.
    for (const [cat, { target, tolerance }] of Object.entries(followUp?.targets || {})) {
      if (lockedCategories.has(cat)) continue;
      // Closest at or under the named price first (the selector then tries a little above it).
      dynamicBudgets[cat] = Math.round(target);
      targetFloors[cat] = Math.round(target * (1 - tolerance));
    }

    // A released part comes back only as much cheaper as the gap needs.
    for (const [cat, maxPrice] of Object.entries(payload._shrink || {})) {
      if (lockedCategories.has(cat)) continue;
      dynamicBudgets[cat] = maxPrice;
      targetFloors[cat] = Math.round(maxPrice * 0.75);
    }
  }

  const availableSockets = await deps.partRepository.getAvailableSockets(site);
  const requestedDdr = requestedDdrOf(intent.component_strategy);

  // Cheapest memory per generation (that satisfies the RAM request) and, per socket, the
  // cheapest board+memory pair. Used to keep CPU and board choices from making their
  // matching RAM unaffordable (DDR5 kits cost roughly twice DDR4 here).
  const ramFloorByType = {};
  const platformFloorBySocket = {};
  let platformKnown = false;

  function ramFloorFor(board) {
    const type = board.specs?.ram_type;
    if (type && type !== 'UNKNOWN') return ramFloorByType[type];
    // Board does not say: assume the cheapest generation its socket can drive.
    const socketTypes = {
      AM5: ['DDR5'], AM4: ['DDR4'], LGA1851: ['DDR5'], LGA1700: ['DDR4', 'DDR5'],
      LGA1200: ['DDR4'], LGA1151: ['DDR4'], LGA1155: ['DDR3'], LGA1150: ['DDR3'],
    }[board.specs?.socket] || [];
    const prices = socketTypes.map((t) => ramFloorByType[t]).filter((p) => p !== undefined);
    return prices.length ? Math.min(...prices) : undefined;
  }

  try {
    const [boardList, ramList] = await Promise.all([
      deps.partRepository.query(site, 'Motherboard', { min: 0, max: budgetCeiling }, 'price_asc'),
      deps.partRepository.query(site, 'RAM', { min: 0, max: budgetCeiling }, 'price_asc'),
    ]);
    const ramStrategy = intent.component_strategy?.RAM;
    const boardStrategy = intent.component_strategy?.Motherboard;
    for (const ram of ramList || []) {
      const t = ram.specs?.ram_type;
      if (!t || t === 'UNKNOWN' || t in ramFloorByType) continue;
      if (deps.partRepository.matchesStrategy(ram, ramStrategy, 'RAM')) ramFloorByType[t] = ram.price;
    }
    for (const board of boardList || []) {
      const socket = board.specs?.socket;
      if (!socket || socket === 'UNKNOWN' || socket === 'INTEGRATED') continue;
      if (!deps.partRepository.matchesStrategy(board, boardStrategy, 'Motherboard')) continue;
      const floor = ramFloorFor(board);
      if (floor === undefined) continue;
      const pair = board.price + floor;
      if (!(socket in platformFloorBySocket) || pair < platformFloorBySocket[socket]) platformFloorBySocket[socket] = pair;
    }
    platformKnown = Object.keys(platformFloorBySocket).length > 0;
  } catch (err) {
    console.warn('[orchestrator] Platform floor lookup failed, skipping feasibility filter:', err.message);
  }

  const createFilterFn = (category, strat, selectedParts, { strict = false, feasible = false, platformCap = Infinity, shareCap = Infinity } = {}) => {
    return (part) => {
      if (!deps.partRepository.matchesStrategy(part, strat, category)) return false;

      if (category === 'Processor') {
        // Trap CPU prevention: Must have motherboard in stock
        if (part.specs?.socket && part.specs.socket !== 'UNKNOWN' && !availableSockets.has(part.specs.socket)) return false;
        if (intent.preferred_cpu_brand && part.specs?.brand !== intent.preferred_cpu_brand.toLowerCase()) return false;
        if (noGpu && !deps.compatibilityChecker.isCpuIntegratedGpuAdequate(part, intent.use_case)) return false;
        if (!deps.compatibilityChecker.isCpuModern(part, intent.budget_bdt)) return false;
        if (requestedDdr && !deps.compatibilityChecker.cpuSupportsRamType(part, requestedDdr)) return false;
        if (feasible && platformKnown) {
          const platform = platformFloorBySocket[part.specs?.socket];
          if (platform === undefined || part.price + platform > platformCap) return false;
          if (platform > shareCap) return false;
        }
      }

      if (category === 'Motherboard') {
        if (part.specs?.socket === 'UNKNOWN' || part.specs?.socket === 'INTEGRATED') return false;
        // First pass skips boards whose listing doesn't say DDR4 or DDR5: a wrong guess means
        // a kit that physically doesn't fit. They're only used when nothing verified fits.
        if (strict && (!part.specs?.ram_type || part.specs.ram_type === 'UNKNOWN')) return false;
        if (feasible && platformKnown) {
          const ramFloor = ramFloorFor(part);
          if (ramFloor === undefined || part.price + ramFloor > platformCap) return false;
          if (ramFloor > shareCap) return false;
        }
        const targetBrand = intent.preferred_cpu_brand || selectedParts.Processor?.specs?.brand;
        if (targetBrand && part.specs?.brand && part.specs.brand !== 'unknown' && part.specs.brand !== targetBrand.toLowerCase()) {
          return false;
        }
        if (selectedParts.Processor) {
          if (!deps.compatibilityChecker.isSocketCompatible(selectedParts.Processor, part)) return false;
          const cpuRamType = selectedParts.Processor.specs?.ram_type;
          if (cpuRamType && cpuRamType !== 'UNKNOWN' && part.specs?.ram_type && part.specs.ram_type !== 'UNKNOWN') {
            if (cpuRamType !== part.specs.ram_type) return false;
          }
        }
      }

      if (category === 'RAM') {
        const mb = selectedParts.Motherboard;
        const cpu = selectedParts.Processor;
        if (mb) {
          if (!deps.compatibilityChecker.isRamTypeCompatible(mb, part)) return false;
        } else if (cpu) {
          const cpuRamType = cpu.specs?.ram_type;
          const ramType = part.specs?.ram_type;
          if (cpuRamType && ramType && cpuRamType !== 'UNKNOWN' && ramType !== 'UNKNOWN') {
            if (cpuRamType !== ramType) return false;
          }
        }
      }

      if (category === 'Graphics Card') {
        if (intent.preferred_gpu_brand && part.specs?.gpu_brand !== intent.preferred_gpu_brand.toLowerCase()) return false;
        if (!deps.compatibilityChecker.isGpuAdequateForUseCase(part, intent.use_case)) return false;
        if (selectedParts.Processor && !deps.compatibilityChecker.isCpuBalanced(selectedParts.Processor, part)) return false;
      }

      if (category === 'PSU') {
        const targetW = deps.budgetAllocator.computeTargetPsuWattage(
          selectedParts.Processor || {},
          selectedParts["Graphics Card"],
          intent.use_case,
          intent.budget_bdt
        );
        if ((part.specs?.wattage || 0) < targetW) return false;
      }

      return true;
    };
  };

  const selectionOrder = [
    'Processor', 'Motherboard', 'RAM', 'Graphics Card', 'PSU',
    'Storage', 'Casing', 'CPU Cooler', 'Monitor', 'Mouse', 'Keyboard', 'UPS'
  ];

  // Money that must stay available for parts still to be picked: their cheapest-possible
  // price from the floor phase. Without it an early part can spend what a later one needs.
  const reserveAfter = (index, onlyMandatory) => {
    let reserve = 0;
    for (const later of selectionOrder.slice(index + 1)) {
      if (lockedCategories.has(later) || selectedBuild[later]) continue;
      if (onlyMandatory && !MANDATORY_CATEGORIES.has(later)) continue;
      if (!onlyMandatory && !(intent.component_strategy?.[later]?.required)) continue;
      // A part the user priced keeps room for that price, so an earlier part (the PSU that is
      // meant to take the savings) cannot eat what the monitor was promised.
      reserve += Math.max(floorResult.minimums?.[later] || 0, targetFloors[later] || 0);
    }
    return reserve;
  };

  for (const [index, category] of selectionOrder.entries()) {
    // Skip locked components from previous build (follow-up mode)
    if (lockedCategories.has(category)) continue;

    const catBudget = dynamicBudgets[category];
    const strat = intent.component_strategy?.[category];
    let isRequired = strat && strat.required;
    let activeBudget = catBudget;
    let forcedCooler = false;

    if (category === 'CPU Cooler' && !removed.has(category) && selectedBuild.Processor && (selectedBuild.Processor.specs?.tdp || 65) >= 105) {
      isRequired = true;
      forcedCooler = true;
      if (activeBudget === 0) activeBudget = Math.min(5000, Math.max(0, budgetCeiling - totalCost));
    }

    if (!isRequired || activeBudget === 0) continue;

    const range = { min: targetFloors[category] || 0, max: activeBudget };
    // A hot CPU can't run without its cooler, so that one may dip into the extras' reserve too.
    const mandatory = MANDATORY_CATEGORIES.has(category) || forcedCooler;
    try {
      const sortOrder = ['RAM', 'PSU'].includes(category) ? 'price_asc' : 'price_desc';

      // Tightest cap first (keep everything still to come affordable), then loosen. Only
      // parts the PC cannot boot without may eat into the optional parts' reserve.
      const caps = [globalRemaining - reserveAfter(index, false)];
      if (mandatory) caps.push(globalRemaining - reserveAfter(index, true), globalRemaining);

      // Passes, most careful first. CPU/board must leave their matching RAM and the rest of
      // the build affordable; boards must say their memory type. Later passes relax that.
      const ramIndex = selectionOrder.indexOf('RAM');
      const platformCap = globalRemaining - reserveAfter(ramIndex, false);
      // Keep the platform's memory in proportion: a board/CPU whose cheapest matching RAM is far
      // over the RAM share (e.g. a DDR5 variant when DDR4 does the job) is tried last.
      const ramShare = dynamicBudgets.RAM || 0;
      const platformShare = ramShare + (dynamicBudgets.Motherboard || 0);
      const memoryCap = ramShare > 0 ? ramShare * 1.3 : Infinity;
      const pairCap = platformShare > 0 ? platformShare * 1.3 : Infinity;
      const passes = category === 'Processor'
        ? [{ feasible: true, shareCap: pairCap }, { feasible: true }, {}]
        : category === 'Motherboard'
          ? [{ strict: true, feasible: true, shareCap: memoryCap }, { strict: true, feasible: true }, { feasible: true }, {}]
          : [{}];

      let part = null;
      for (const pass of passes) {
        const filterFn = createFilterFn(category, strat, selectedBuild, { ...pass, platformCap });
        for (const cap of caps) {
          part = await deps.partSelector.selectWithFallback(site, category, range, sortOrder, filterFn, cap, { mandatory });
          if (part) break;
        }
        if (part) break;
      }

      // A released part exists to make room, so it must come back cheaper. The selector widens
      // upward when its band is empty (a gap in the catalog), which can hand back the old part.
      const cap = payload._shrink?.[category];
      if (part && cap && part.price > cap) {
        const cheaper = await deps.partSelector.selectPart(
          site, category, { min: 0, max: Math.min(cap, Math.max(globalRemaining, 0)) }, 'price_desc',
          createFilterFn(category, strat, selectedBuild, { platformCap }),
        );
        if (cheaper) part = cheaper;
      }

      if (part) {
        selectedBuild[category] = part;
        totalCost += part.price;
        globalRemaining -= part.price;
        console.log(`✓ ${category}: ${part.name} (${part.price} BDT)`);
      } else {
        console.warn(`⚠ ${category}: No component found within budget`);
        // Anything the build asked for and could not get is worth telling the user about.
        buildWarnings.push(`Could not find a suitable **${category}** matching your request at ${siteLabel(site)} within budget. It may be out of stock.`);
      }
    } catch (error) {
      console.error(`✗ ${category}: Selection error:`, error.message);
    }
  }

  // Follow-up: parts kept from the previous build can leave too little money for the part
  // the user actually changed (e.g. "2TB storage" with a locked 33k GPU). Rebuild fresh
  // from the same intent rather than failing or silently dropping what they asked for.
  if (lockedCategories.size > 0) {
    const findUnmet = () => selectionOrder.filter((c) => !lockedCategories.has(c) && !selectedBuild[c]
      && !removed.has(c) && intent.component_strategy?.[c]?.required && (dynamicBudgets[c] || 0) > 0);
    let unmet = findUnmet();

    // First loosen what the user said earlier for that part (a "27 inch QHD" from the first request
    // against a new "around 20k"), keeping every other part as it is. Only if that fails is it
    // a re-plan of the whole build.
    const canRelease = Boolean(followUp && prevBuild && !payload._release);
    const deferredQuality = new Map();
    if (followUp && unmet.length > 0) {
      for (const category of unmet) {
        const strat = intent.component_strategy[category];
        const named = followUp.targets?.[category];
        // Read when used: a part settled later (after a release attempt) must see what the others spent meanwhile.
        const poolNow = () => globalRemaining - reserveAfter(selectionOrder.indexOf(category), true);
        const dropped = (strat.required_keywords || []).filter((k) => !/^ddr[345]$/i.test(k));
        const withoutKeywords = { ...strat, required_keywords: (strat.required_keywords || []).filter((k) => !dropped.includes(k)) };
        // "A stronger PSU" with no figure was turned into the next wattage tier; it goes with the bound.
        const derivedWattage = category === 'PSU' && followUp.ops?.some((o) => o.category === 'PSU'
          && o.direction === 'up' && !Object.keys(o.structured_reqs || {}).length);
        const withoutBound = (st) => {
          const { better_than: _b, worse_than: _w, no_worse_on: _n, ...reqs } = st.structured_reqs || {};
          if (derivedWattage) delete reqs.min_wattage;
          return { ...st, structured_reqs: reqs };
        };
        const hasBound = typeof strat.structured_reqs?.better_than === 'number' || typeof strat.structured_reqs?.worse_than === 'number';
        const tol = named?.tolerance ?? 0.15;
        // A named price: closest at or under it (the selector then tries a little above). A price
        // worked out from "better"/"cheaper" is only a guide, so it widens on both sides.
        const bandFor = (spread) => {
          if (!named) return { min: 0, max: Math.round((dynamicBudgets[category] || 0) * (1 + spread)) };
          return {
            min: Math.round(named.target * (1 - spread)),
            max: Math.round(named.derived ? named.target * (1 + spread) : named.target),
          };
        };

        // Loosen one thing at a time, oldest wish first: a wider price band, then the keywords
        // from the earlier request, and only last the "better than what I have" bound.
        const attempts = [
          { strat, spread: tol * 2.3, kind: 'band' },
          ...(dropped.length ? [
            { strat: withoutKeywords, spread: tol, kind: 'keywords' },
            { strat: withoutKeywords, spread: tol * 2.3, kind: 'keywords' },
          ] : []),
        ];
        const qualityAttempt = hasBound
          ? { strat: withoutBound(dropped.length ? withoutKeywords : strat), spread: tol * 2.3, kind: 'quality' }
          : null;

        // A price the user named that the budget cannot reach: the best part the rest of the budget can pay for.
        const afford = named && !named.derived
          ? { strat: withoutBound(dropped.length ? withoutKeywords : strat), band: { min: 0, max: Math.round(named.target) }, kind: 'afford' }
          : null;

        const run = async (list) => {
          for (const attempt of list) {
            const part = await deps.partSelector.selectWithFallback(
              site, category, attempt.band || bandFor(attempt.spread), 'price_desc',
              createFilterFn(category, attempt.strat, selectedBuild, {}), poolNow(),
            );
            if (!part) {
              console.log(`[Follow-up] ${category}: nothing for the ${attempt.kind} attempt (pool ${Math.round(poolNow())} BDT)`);
              continue;
            }
            selectedBuild[category] = part;
            totalCost += part.price;
            globalRemaining -= part.price;
            // The first pass already warned that nothing matched; this part is now found.
            const missed = `Could not find a suitable **${category}**`;
            for (let i = buildWarnings.length - 1; i >= 0; i--) if (buildWarnings[i].startsWith(missed)) buildWarnings.splice(i, 1);
            if (attempt.kind === 'keywords' || (['quality', 'afford'].includes(attempt.kind) && dropped.length)) {
              strat.required_keywords = withoutKeywords.required_keywords;
              buildWarnings.push(`No ${category} matching "${dropped.join(' ')}" was available${named && !named.derived ? ` around ${named.target.toLocaleString('en-BD')} BDT` : ''}, so that wish was dropped. Picked: ${part.name}.`);
            }
            if (attempt.kind === 'quality') {
              const same = prevBuild?.[category]?.name === part.name;
              buildWarnings.push(same
                ? `No ${category} better than your current ${part.name} fits the rest of the budget, so it stays. Raise the budget, or ask for something cheaper elsewhere, to make room.`
                : `No ${category} clearly better than the old one fit the rest of the budget; picked the closest: ${part.name}.`);
            }
            console.log(`[Follow-up] ${category}: relaxed (${attempt.kind}) and kept the other parts → ${part.name} (${part.price} BDT)`);
            return true;
          }
          return false;
        };

        if (!(await run(attempts)) && qualityAttempt) {
          // The better part exists but not at this price. Making room for it by re-picking one other
          // part comes first; settling for the old part is what is left if that cannot be done.
          const cheapest = canRelease
            ? (await deps.partRepository.query(site, category, { min: 0, max: budgetCeiling }, 'price_asc'))
              .find(createFilterFn(category, dropped.length ? withoutKeywords : strat, selectedBuild, {}))
            : null;
          if (cheapest) {
            // Keep the old part's price aside, so what the other parts spend meanwhile cannot leave
            // "the old part stays" with no money behind it.
            const hold = prevBuild?.[category]?.price || 0;
            globalRemaining -= hold;
            deferredQuality.set(category, { need: cheapest.price, hold, settle: () => run([qualityAttempt]) });
          } else await run([qualityAttempt]);
        } else if (afford && !selectedBuild[category]) {
          // Same order as above: re-picking one other part to reach the named price comes before settling for less.
          if (canRelease) {
            const hold = prevBuild?.[category]?.price || 0;
            globalRemaining -= hold;
            deferredQuality.set(category, { need: Math.round(named.target * (1 - tol)), hold, settle: () => run([afford]) });
          } else await run([afford]);
        }
      }
      unmet = findUnmet();
    }

    // Still no room. If giving up a few more kept parts would cover the gap, re-pick just those
    // (the ones that cost the most for the weight the user gave them) instead of the whole build.
    if (unmet.length > 0 && followUp && prevBuild && !payload._release) {
      const need = unmet.reduce((sum, c) => sum + (deferredQuality.get(c)?.need ?? (floorResult.minimums?.[c] || 0)), 0);
      const held = [...deferredQuality.values()].reduce((sum, d) => sum + d.hold, 0);
      const shortfall = need - Math.max(globalRemaining + held, 0);
      // One kept part is given up per attempt (two or more is a bigger change than the user asked for),
      // and a part that turns out to have nothing cheaper to give is followed by the next one.
      const options = [];
      if (shortfall > 0) {
        const candidates = [...lockedCategories]
          .filter((c) => !COUPLED_TO_PLATFORM.has(c) && selectedBuild[c])
          .sort((a, b) => releaseScore(b, selectedBuild, intent) - releaseScore(a, selectedBuild, intent));
        for (const c of candidates) {
          // What it frees is its price minus the cheapest acceptable replacement.
          const gain = selectedBuild[c].price - (floorResult.minimums?.[c] || 0);
          if (gain < shortfall) continue;
          // Re-pick it only as much cheaper as the gap needs, not from a fresh share of the budget.
          options.push({ give: [c], shrink: { [c]: Math.max(floorResult.minimums?.[c] || 0, Math.round(selectedBuild[c].price - shortfall * 1.15)) } });
        }
      }
      for (const { give, shrink } of options.slice(0, MAX_RELEASE_TRIES)) {
        console.log(`[Follow-up] No room for ${unmet.join(', ')}; also re-picking ${give.join(', ')}.`);
        try {
          const retried = await executeBuild(
            {
              ...payload, _intent: intentSnapshot, _release: give, _shrink: shrink,
              _followUp: {
                targets: followUp.targets, absorbers: followUp.absorbers, ops: followUp.ops, interpretation: followUp.interpretation,
                changing: [...followUp.changing, ...give],
              },
            },
            deps,
            ctx
          );
          // Asked for a better part and got the old one back: the released part had nothing cheaper to give.
          const stuck = [...deferredQuality.keys()].some((c) => retried.build[c] && retried.build[c].name === prevBuild[c]?.name);
          if (stuck) {
            console.log(`[Follow-up] Re-picking ${give.join(', ')} freed nothing; trying the next part.`);
            continue;
          }
          // The retry may itself have fallen back to a re-plan, which says so; one explanation is enough.
          if (retried.notes.some((n) => /re-planned from scratch/.test(n))) return retried;
          const note = `To make room for ${unmet.join(', ')}, ${give.join(' and ')} ${give.length > 1 ? 'were' : 'was'} picked again as well.`;
          retried.notes = [note, ...retried.notes];
          retried.warnings = [note, ...retried.warnings];
          return retried;
        } catch (error) {
          if (!(error instanceof BuildError)) throw error;
          console.log(`[Follow-up] Re-picking ${give.join(', ')} did not help (${error.code}).`);
        }
      }
    }

    for (const [category, deferred] of deferredQuality) {
      globalRemaining += deferred.hold;
      if (!selectedBuild[category]) await deferred.settle();
    }
    if (deferredQuality.size > 0) unmet = findUnmet();

    // Nothing could be found at any price the rest of the budget allows. Before re-planning everything,
    // put the user's current part back, and take back whatever else was swapped meanwhile until the
    // build fits again. The result is "nothing could be done within this budget", said plainly.
    // Only for wishes that are a matter of degree ("around 20k", "better"). A hard requirement ("2TB",
    // "DDR5") cannot be met by keeping the old part, so that still ends in a re-plan.
    const isSoftWish = (category) => {
      const op = followUp?.ops?.find((o) => o.category === category);
      return Boolean(op) && op.action !== 'add' && (op.price_target || op.direction)
        && !op.required_keywords.length && !Object.keys(op.structured_reqs).length;
    };
    if (unmet.length > 0 && followUp && prevBuild && !restarting
      && unmet.every((c) => prevBuild[c]?.name && isSoftWish(c))) {
      const swapBack = async (category) => {
        const old = prevBuild[category];
        const availability = old.url && deps.partRepository.checkAvailability
          ? await deps.partRepository.checkAvailability(old.url)
          : { price: old.price, in_stock: true };
        if (!availability?.in_stock) return false;
        const price = availability.price || old.price;
        if (selectedBuild[category]) totalCost -= selectedBuild[category].price;
        selectedBuild[category] = { ...old, price };
        totalCost += price;
        lockedCategories.add(category);
        return true;
      };
      const restored = [];
      const takenBack = [];
      for (const category of unmet) if (await swapBack(category)) restored.push(category);
      if (restored.length === unmet.length) {
        const byRise = Object.keys(selectedBuild)
          .filter((c) => !lockedCategories.has(c) && selectedBuild[c] && prevBuild[c] && selectedBuild[c].name !== prevBuild[c].name)
          .sort((a, b) => (selectedBuild[b].price - prevBuild[b].price) - (selectedBuild[a].price - prevBuild[a].price));
        for (const category of byRise) {
          if (totalCost <= budgetCeiling) break;
          if (await swapBack(category)) takenBack.push(category);
        }
        const platformIntact = ['Processor', 'Motherboard', 'RAM'].every((c) => selectedBuild[c]?.name === prevBuild[c]?.name);
        if (totalCost <= budgetCeiling && platformIntact) {
          // The part that could not be found is no longer "missing": it is the user's current one.
          for (const category of restored) {
            const missed = `Could not find a suitable **${category}**`;
            for (let i = buildWarnings.length - 1; i >= 0; i--) if (buildWarnings[i].startsWith(missed)) buildWarnings.splice(i, 1);
          }
          for (const category of [...restored, ...takenBack]) {
            buildWarnings.push(`Could not fit a new ${category} into your budget, so your current ${prevBuild[category].name} was kept. Raise the budget, or ask for something cheaper elsewhere, to make room.`);
          }
          unmet = [];
          setScope(Object.keys(selectedBuild).filter((c) => !lockedCategories.has(c) && (selectedBuild[c] || prevBuild[c])));
        }
      }
    }

    if (unmet.length > 0) {
      console.log(`[Follow-up] Kept parts leave no room for ${unmet.join(', ')}; rebuilding from scratch.`);
      setScope(null);
      const rebuilt = await executeBuild(
        {
          ...payload, previousBuild: null, previousIntent: null, _intent: intentSnapshot,
          _followUp: followUp && { targets: followUp.targets, absorbers: followUp.absorbers, ops: followUp.ops, interpretation: followUp.interpretation },
        },
        deps,
        ctx
      );
      const note = `Your previous parts left too little room for ${unmet.join(', ')}, so this build was re-planned from scratch.`;
      rebuilt.notes = [note, ...rebuilt.notes];
      rebuilt.warnings = [note, ...rebuilt.warnings];
      return rebuilt;
    }
  }

  // Validate core build
  if (!selectedBuild.Processor || !selectedBuild.Motherboard || !selectedBuild.RAM || !selectedBuild.PSU) {
    const missing = ['Processor', 'Motherboard', 'RAM', 'PSU'].filter(c => !selectedBuild[c]);
    
    // Provide diagnostic info about inventory at chosen site
    const diagnosticMsg = `Could not assemble a complete build at **${siteLabel(site)}**. Missing: ${missing.join(', ')}. `
      + (siteNotice(site) || 'Try adjusting your budget or selecting a different retailer.');
    
    console.error(`[orchestrator] Build validation failed at ${site}:`, missing);
    throw new BuildError(400, diagnosticMsg, 'INVENTORY_INSUFFICIENT');
  }

  // ─── PHASE 4: Rebalancing ───
  setStage('optimizing');
  console.log("\nPHASE 4: Rebalancing underspent budget...");
  const underspendTolerance = Math.min(budget * 0.005, 1500);
  const targetMinSpend = Math.max(0, budget - underspendTolerance);
  const maxRebalanceIterations = intent.budget_bdt >= 150000 ? 7 : 6;
  const failedUpgrades = new Set();
  const absorbers = new Set(followUp?.absorbers || []);
  // Parts the user named for a change, or handed money to, must not balloon with leftover budget.
  const capped = new Set([...absorbers, ...(followUp?.ops || []).map((o) => o.category)]);
  // Cheapest cooler on offer, so a CPU upgrade never strands the build without one.
  const coolerFloor = floorResult.minimums?.['CPU Cooler']
    || ((await deps.partRepository.query(site, 'CPU Cooler', { min: 0, max: budgetCeiling }, 'price_asc'))[0]?.price ?? 0);

  for (let i = 0; i < maxRebalanceIterations; i++) {
    if (totalCost >= targetMinSpend) break;
    // A hot CPU still waiting on its cooler: keep that money out of every upgrade.
    const coolerOwed = !removed.has('CPU Cooler') && !selectedBuild['CPU Cooler'] && selectedBuild.Processor
      && (selectedBuild.Processor.specs?.tdp || 65) >= 105 ? coolerFloor : 0;
    const remaining = budgetCeiling - totalCost - coolerOwed;
    if (remaining < 300) break;

    const upgradeCandidates = ['Graphics Card', 'Monitor', 'Processor', 'Motherboard', 'RAM', 'Storage', 'PSU', 'CPU Cooler', 'Casing', 'Keyboard', 'Mouse', 'UPS'];
    let best = null;

    upgradeCandidates.forEach(cat => {
      if (failedUpgrades.has(cat)) return;
      // A kept part stays as it was; leftover money is reported, not spent on it.
      if (lockedCategories.has(cat)) return;
      // "Use the saved money for X": only X takes it, so a part the user priced stays at that price.
      if (absorbers.size > 0 && !absorbers.has(cat)) return;
      const current = selectedBuild[cat];
      if (!current) return;
      const strategy = intent.component_strategy[cat];
      if (!strategy || !strategy.required) return;
      const weight = strategy.weight || 1;
      const absorbCap = capped.has(cat) ? absorbCapFor(cat, budget) : Infinity;
      const expandedMax = Math.min(current.price + remaining, budgetCeiling, upgradeCapFor(cat, budget), absorbCap);
      const gap = expandedMax - current.price;
      const score = gap * weight;
      if (gap > 200 && (!best || score > best.score)) {
        best = { category: cat, possibleMax: expandedMax, gap, score, strat: strategy };
      }
    });

    if (!best) break;

    const currentPart = selectedBuild[best.category];
    const upgradeRange = { min: currentPart.price + 1, max: best.possibleMax };
    if (upgradeRange.max <= upgradeRange.min) {
      failedUpgrades.add(best.category);
      continue;
    }

    let upgradedPart = null;
    try {
      const parts = await deps.partRepository.query(site, best.category, upgradeRange, 'price_desc');
      for (const part of parts) {
        if (!deps.partRepository.matchesStrategy(part, best.strat, best.category)) continue;
        if (best.category === 'Graphics Card') {
          if (intent.preferred_gpu_brand && part.specs?.gpu_brand !== intent.preferred_gpu_brand.toLowerCase()) continue;
          if (!deps.compatibilityChecker.isGpuAdequateForUseCase(part, intent.use_case)) continue;
          if (selectedBuild.Processor && !deps.compatibilityChecker.isCpuBalanced(selectedBuild.Processor, part)) continue;
          if (selectedBuild.PSU?.specs?.wattage) {
            const targetW = deps.budgetAllocator.computeTargetPsuWattage(selectedBuild.Processor || {}, part, intent.use_case, intent.budget_bdt);
            if (selectedBuild.PSU.specs.wattage < targetW) continue;
          }
        }
        if (best.category === 'Processor') {
          if (intent.preferred_cpu_brand && part.specs?.brand !== intent.preferred_cpu_brand.toLowerCase()) continue;
          if (noGpu && !deps.compatibilityChecker.isCpuIntegratedGpuAdequate(part, intent.use_case)) continue;
          if (!deps.compatibilityChecker.isCpuModern(part, intent.budget_bdt)) continue;
          if (selectedBuild.Motherboard && !deps.compatibilityChecker.isSocketCompatible(part, selectedBuild.Motherboard)) continue;
          if (selectedBuild.RAM && !deps.compatibilityChecker.cpuSupportsRamType(part, selectedBuild.RAM.specs?.ram_type)) continue;
          // A hot CPU needs a cooler: the upgrade must leave room to buy one.
          if ((part.specs?.tdp || 65) >= 105 && !selectedBuild['CPU Cooler']
            && part.price - currentPart.price + coolerFloor > remaining) continue;
          if (selectedBuild.PSU?.specs?.wattage) {
            const targetW = deps.budgetAllocator.computeTargetPsuWattage(part, selectedBuild["Graphics Card"], intent.use_case, intent.budget_bdt);
            if (selectedBuild.PSU.specs.wattage < targetW) continue;
          }
        }
        if (best.category === 'Motherboard') {
          if (part.specs?.socket === 'UNKNOWN' || part.specs?.socket === 'INTEGRATED') continue;
          if (selectedBuild.Processor && !deps.compatibilityChecker.isSocketCompatible(selectedBuild.Processor, part)) continue;
          if (selectedBuild.RAM && !deps.compatibilityChecker.isRamTypeCompatible(part, selectedBuild.RAM)) continue;
        }
        if (best.category === 'RAM') {
          if (selectedBuild.Motherboard && !deps.compatibilityChecker.isRamTypeCompatible(selectedBuild.Motherboard, part)) continue;
        }
        if (best.category === 'PSU') {
          const targetW = deps.budgetAllocator.computeTargetPsuWattage(selectedBuild.Processor || {}, selectedBuild["Graphics Card"], intent.use_case, intent.budget_bdt);
          if ((part.specs?.wattage || 0) < targetW) continue;
        }
        upgradedPart = part;
        break;
      }
    } catch (err) {
      console.warn(`[Rebalance] Error upgrading ${best.category}:`, err.message);
    }

    if (upgradedPart && upgradedPart.price > currentPart.price) {
      totalCost -= currentPart.price;
      selectedBuild[best.category] = upgradedPart;
      totalCost += upgradedPart.price;
      console.log(`  Upgraded ${best.category}: ${upgradedPart.name} (+${upgradedPart.price - currentPart.price} BDT)`);
    } else {
      failedUpgrades.add(best.category);
    }
  }

  // A rebalance can swap in a hotter CPU after the cooler step already ran.
  if (!removed.has('CPU Cooler') && !selectedBuild['CPU Cooler'] && selectedBuild.Processor
    && (selectedBuild.Processor.specs?.tdp || 65) >= 105) {
    const room = budgetCeiling - totalCost;
    if (room > 0) {
      const coolerStrategy = intent.component_strategy?.['CPU Cooler'];
      const cooler = await deps.partSelector.selectWithFallback(
        site, 'CPU Cooler', { min: 0, max: Math.min(5000, room) }, 'price_desc',
        (p) => deps.partRepository.matchesStrategy(p, coolerStrategy, 'CPU Cooler'), room
      );
      if (cooler) {
        selectedBuild['CPU Cooler'] = cooler;
        totalCost += cooler.price;
      }
    }
  }

  // A part is searched again only because the part it depends on might change (the PSU because the
  // graphics card might). When that part came out the same, the new pick has no reason to differ:
  // put the old one back, so "a better GPU" that finds nothing does not quietly swap the PSU.
  if (followUp && prevBuild && !restarting) {
    const named = new Set([...(followUp.ops || []).map((o) => o.category), ...Object.keys(followUp.targets || {}), ...(followUp.absorbers || [])]);
    const DEPENDS_ON = { Motherboard: ['Processor'], RAM: ['Motherboard'], PSU: ['Processor', 'Graphics Card'] };
    for (const category of ['Motherboard', 'RAM', 'PSU']) {
      const now = selectedBuild[category];
      const old = prevBuild[category];
      if (!now || !old || lockedCategories.has(category) || named.has(category) || now.name === old.name) continue;
      if (!DEPENDS_ON[category].every((parent) => (selectedBuild[parent]?.name ?? null) === (prevBuild[parent]?.name ?? null))) continue;
      if (totalCost - now.price + old.price > budgetCeiling) continue;
      const availability = old.url && deps.partRepository.checkAvailability
        ? await deps.partRepository.checkAvailability(old.url)
        : { price: old.price, in_stock: true };
      if (!availability?.in_stock) continue;
      const price = availability.price || old.price;
      if (totalCost - now.price + price > budgetCeiling) continue;
      totalCost += price - now.price;
      selectedBuild[category] = { ...old, price };
      lockedCategories.add(category);
      console.log(`[Follow-up] ${category}: kept ${old.name}, nothing it depends on changed`);
    }
  }

  // ─── PHASE 5: Post-Build Validation ───
  console.log("\nPHASE 5: Post-Build Validation...");

  if (totalCost > budgetCeiling) {
    throw new BuildError(
      400,
      `This configuration costs ${totalCost.toLocaleString('en-BD')} BDT, which exceeds your budget ceiling of ${budgetCeiling.toLocaleString('en-BD')} BDT. Try adjusting your request, reducing requirements, or removing optional components like peripherals.`,
      'BUDGET_EXCEEDED'
    );
  }

  // A price the user named for a part: say so when the part that fit is outside that range.
  for (const [cat, { target, tolerance, derived }] of Object.entries(followUp?.targets || {})) {
    const picked = selectedBuild[cat];
    // A price worked out from "better"/"cheaper" is a guide of ours, not something the user asked for.
    if (!picked || lockedCategories.has(cat) || derived) continue;
    if (picked.price >= target * (1 - tolerance) && picked.price <= target * (1 + tolerance)) continue;
    buildWarnings.push(`You asked for a ${cat} around ${target.toLocaleString('en-BD')} BDT; the closest that fit the rest of your budget was ${picked.name} at ${picked.price.toLocaleString('en-BD')} BDT.`);
  }

  // Kept parts are not upgraded, so a follow-up can end well under budget: say so.
  const unspent = budget - totalCost;
  if (lockedCategories.size > 0 && unspent > Math.max(budget * 0.02, 1500)) {
    buildWarnings.push(`${unspent.toLocaleString('en-BD')} BDT of your budget is unspent because the parts you kept were left as they are. Ask for a specific upgrade to use it.`);
  }

  // Warnings produced while selecting parts (degradations, missing parts, retailer notes).
  // Kept separate so the UI can re-run only the validator after the user edits the build.
  const notes = [...buildWarnings];

  setStage('checking');
  const validationWarnings = collectBuildWarnings({ build: selectedBuild, intent }, deps);
  buildWarnings.push(...validationWarnings);

  if (buildWarnings.length > 0) {
    console.log('\nBuild Warnings:');
    buildWarnings.forEach(w => console.warn(`  ⚠ ${w}`));
  }

  // ─── PHASE 6: Generate explanation ───
  setStage('explaining');
  // A refine's story is already known from the diff, so it is written here instead of by a second LLM call.
  const explanation = followUp && prevBuild && !restarting && lockedCategories.size > 0
    ? describeRefine({
      build: selectedBuild, previousBuild: prevBuild, locked: Array.from(lockedCategories),
      followUp, total: totalCost, budget,
    })
    : await deps.explanationGenerator.generate({
      selectedBuild, totalCost, intent, sitePreference: site, buildWarnings,
      lockedCategories: Array.from(lockedCategories),
    });

  intent._applied_site = site;
  // "Better than what I have" only steered this search; it must not outlive it in the saved intent.
  for (const strat of Object.values(intent.component_strategy || {})) {
    if (strat?.structured_reqs) {
      delete strat.structured_reqs.better_than;
      delete strat.structured_reqs.worse_than;
      delete strat.structured_reqs.no_worse_on;
    }
  }

  return {
    build: selectedBuild,
    total: totalCost,
    budget,
    explanation,
    intent,
    warnings: buildWarnings,
    notes,
    power: estimatePower(selectedBuild, intent, deps),
    interpretation: prevBuild && !restarting ? followUp?.interpretation || null : null,
    scope: prevBuild && !restarting ? {
      locked: Array.from(lockedCategories),
      changing: Object.keys(selectedBuild).filter((c) => !lockedCategories.has(c) && (selectedBuild[c] || prevBuild[c])),
    } : null,
  };
}
