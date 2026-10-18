/**
 * Build Orchestrator
 * Extracted core build logic from routes/build.js.
 * Workers call executeBuild(payload, deps) directly — no req/res involved.
 */

import { BUDGET } from '../config/budget.js';
import { API } from '../config/thresholds.js';
import { collectBuildWarnings, estimatePower } from './buildValidator.js';
import { applyPatch, isEmptyPatch } from './followUpPatch.js';

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
// on the shelf. Only applied to a part named as the absorber.
const ABSORB_CAPS = {
  PSU: { share: 0.12, floor: 9000 },
};

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
      if (payload._followUp) followUp = { ...payload._followUp, changing: new Set() };
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

  const floorResult = await deps.budgetAllocator.calculateFloorPrices({
    blueprint: intent,
    budgetCeiling,
    site,
  });

  if (floorResult.error) {
    throw new BuildError(400, floorResult.error, 'BUDGET_FLOOR_EXCEEDED');
  }

  if (floorResult.updatedBlueprint) {
    intent = floorResult.updatedBlueprint;
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

  if (site === 'computermania') {
    const rawMsg = (message || '').toLowerCase();
    const requestedPeripherals = ['Monitor', 'Mouse', 'Keyboard'].some(p => intent.component_strategy?.[p]?.required) ||
      rawMsg.includes('monitor') || rawMsg.includes('mouse') || rawMsg.includes('keyboard');
    if (requestedPeripherals) {
      buildWarnings.push('Monitor, mouse, and keyboard are not tracked in ComputerMania catalog and were omitted from this build.');
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

    // Verify inventory availability and apply final locks
    for (const category of initialLocks) {
      const prevPart = prevBuild[category];
      const availability = deps.partRepository.checkAvailability ? await deps.partRepository.checkAvailability(prevPart.url) : { price: prevPart.price, in_stock: true };
      
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
      reserve += floorResult.minimums?.[later] || 0;
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

      if (part) {
        selectedBuild[category] = part;
        totalCost += part.price;
        globalRemaining -= part.price;
        console.log(`✓ ${category}: ${part.name} (${part.price} BDT)`);
      } else {
        console.warn(`⚠ ${category}: No component found within budget`);
        // Anything the build asked for and could not get is worth telling the user about.
        buildWarnings.push(`Could not find a suitable **${category}** matching your request at ${site} within budget. It may be out of stock.`);
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
    if (followUp && unmet.length > 0) {
      for (const category of unmet) {
        const strat = intent.component_strategy[category];
        const named = followUp.targets?.[category];
        const pool = globalRemaining - reserveAfter(selectionOrder.indexOf(category), true);
        const dropped = (strat.required_keywords || []).filter((k) => !/^ddr[345]$/i.test(k));
        const relaxed = { ...strat, required_keywords: (strat.required_keywords || []).filter((k) => !dropped.includes(k)) };
        // Closest at or under the named price; the selector itself then tries a little above it.
        const bandFor = (spread) => (named
          ? { min: Math.round(named.target * (1 - spread)), max: Math.round(named.target) }
          : { min: 0, max: Math.round((dynamicBudgets[category] || 0) * (1 + spread)) });

        // Same keywords with a wider price band, then without the old keywords, then both.
        const attempts = [
          { strat, spread: (named?.tolerance ?? 0.15) * 2.3 },
          ...(dropped.length ? [{ strat: relaxed, spread: named?.tolerance ?? 0.15 }, { strat: relaxed, spread: (named?.tolerance ?? 0.15) * 2.3 }] : []),
        ];
        for (const attempt of attempts) {
          const part = await deps.partSelector.selectWithFallback(
            site, category, bandFor(attempt.spread), 'price_desc',
            createFilterFn(category, attempt.strat, selectedBuild, {}), pool,
          );
          if (!part) continue;
          selectedBuild[category] = part;
          totalCost += part.price;
          globalRemaining -= part.price;
          // The first pass already warned that nothing matched; this part is now found.
          const missed = `Could not find a suitable **${category}**`;
          for (let i = buildWarnings.length - 1; i >= 0; i--) if (buildWarnings[i].startsWith(missed)) buildWarnings.splice(i, 1);
          if (attempt.strat === relaxed && dropped.length) {
            strat.required_keywords = relaxed.required_keywords;
            buildWarnings.push(`No ${category} matching "${dropped.join(' ')}" was available${named ? ` around ${named.target.toLocaleString('en-BD')} BDT` : ''}, so that wish was dropped. Picked: ${part.name}.`);
          } else if (named) {
            buildWarnings.push(`Nothing exactly around ${named.target.toLocaleString('en-BD')} BDT for ${category}; picked the closest: ${part.name}.`);
          }
          console.log(`[Follow-up] ${category}: relaxed and kept the other parts → ${part.name} (${part.price} BDT)`);
          break;
        }
      }
      unmet = findUnmet();
    }

    if (unmet.length > 0) {
      console.log(`[Follow-up] Kept parts leave no room for ${unmet.join(', ')}; rebuilding from scratch.`);
      setScope(null);
      const rebuilt = await executeBuild(
        {
          ...payload, previousBuild: null, previousIntent: null, _intent: intentSnapshot,
          _followUp: followUp && { targets: followUp.targets, absorbers: followUp.absorbers },
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
    let diagnosticMsg = `Could not assemble a complete build at **${site}**. Missing: ${missing.join(', ')}. `;
    
    // Check if this is a ComputerMania inventory issue
    if (site === 'computermania') {
      diagnosticMsg += `ComputerMania may have limited inventory for this budget/use case. Try StarTech or TechLand, or increase your budget.`;
    } else {
      diagnosticMsg += `Try adjusting your budget or selecting a different retailer.`;
    }
    
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
      const absorbCap = absorbers.has(cat) ? absorbCapFor(cat, budget) : Infinity;
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

  // ─── PHASE 5: Post-Build Validation ───
  console.log("\nPHASE 5: Post-Build Validation...");

  if (totalCost > budgetCeiling) {
    throw new BuildError(
      400,
      `This configuration costs ${totalCost.toLocaleString('en-BD')} BDT, which exceeds your budget ceiling of ${budgetCeiling.toLocaleString('en-BD')} BDT. Try adjusting your request, reducing requirements, or removing optional components like peripherals.`,
      'BUDGET_EXCEEDED'
    );
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
  const explanation = await deps.explanationGenerator.generate({
    selectedBuild, totalCost, intent, sitePreference: site, buildWarnings,
    lockedCategories: Array.from(lockedCategories),
  });

  intent._applied_site = site;

  return {
    build: selectedBuild,
    total: totalCost,
    budget,
    explanation,
    intent,
    warnings: buildWarnings,
    notes,
    power: estimatePower(selectedBuild, intent, deps),
    scope: prevBuild && !restarting ? {
      locked: Array.from(lockedCategories),
      changing: Object.keys(selectedBuild).filter((c) => !lockedCategories.has(c) && (selectedBuild[c] || prevBuild[c])),
    } : null,
  };
}
