/**
 * Build Orchestrator
 * Extracted core build logic from routes/build.js.
 * Workers call executeBuild(payload, deps) directly — no req/res involved.
 */

import { BUDGET } from '../config/budget.js';
import { API } from '../config/thresholds.js';

function parseStorageCapacityGB(name) {
  const n = name.toLowerCase();
  const tbMatch = n.match(/(\d+(?:\.\d+)?)\s*tb/);
  if (tbMatch) return parseFloat(tbMatch[1]) * 1000;
  const gbMatch = n.match(/(\d+)\s*gb/);
  if (gbMatch) {
    const gb = parseInt(gbMatch[1]);
    if (gb >= 120) return gb;
  }
  return 0;
}

class BuildError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
    this.userMessage = message;
  }
}

/**
 * Execute a full PC build pipeline
 * @param {Object} payload - { message, site, customKeys }
 * @param {Object} deps - injected dependencies
 * @returns {Object} { build, total, explanation, intent, warnings }
 */
export async function executeBuild(payload, deps) {
  const { message, site: bodySite, previousIntent: prevIntent, previousBuild: prevBuild } = payload;

  // Validate input
  if (!message || message.length > API.MAX_MESSAGE_LENGTH) {
    throw new BuildError(400, 'Message is required and must be under 2000 characters.', 'INVALID_MESSAGE');
  }
  if (bodySite && !API.VALID_SITES.includes(bodySite)) {
    throw new BuildError(400, 'Invalid site selected.', 'INVALID_SITE');
  }

  // Extract intent from AI (pass previous context for follow-ups)
  let intent;
  try {
    intent = await deps.intentExtractor.extract(message, prevIntent || null, prevBuild || null);
  } catch (error) {
    console.error("[orchestrator] Intent extraction failed:", error);
    if (error.message.includes('Intent extraction failed')) {
      throw new BuildError(500, 'The AI service is currently unavailable. Please try again later.', 'GROQ_UNAVAILABLE');
    }
    throw new BuildError(500, 'Failed to process your request. Please rephrase.', 'INVALID_INTENT');
  }

  // Apply manual overrides
  deps.intentOverrideApplier(intent, message);
  console.log("[orchestrator] Extracted intent:", JSON.stringify(intent, null, 2));

  // Validate budget
  if (!intent.budget_bdt || intent.budget_bdt < BUDGET.MIN_BUDGET_BDT) {
    throw new BuildError(400, `Budget too low. Minimum: ${BUDGET.MIN_BUDGET_BDT.toLocaleString('en-BD')} BDT.`, 'BUDGET_TOO_LOW');
  }

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
  console.log("PHASE 1 & 2: Dynamic Blueprint Reality Check & Weighted Budget Allocation");

  const floorResult = await deps.budgetAllocator.calculateFloorPrices({
    blueprint: intent,
    budgetCeiling,
    site,
  });

  if (floorResult.error) {
    throw new BuildError(400, floorResult.error, 'BUDGET_FLOOR_EXCEEDED');
  }

  const dynamicBudgets = deps.budgetAllocator.allocateBudgets({
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
  console.log("\nPHASE 3: Selecting components using Dynamic Budgets...");

  const selectedBuild = {
    Processor: null, Motherboard: null, RAM: null, Storage: null,
    "Graphics Card": null, PSU: null, Casing: null, "CPU Cooler": null,
    Monitor: null, Mouse: null, Keyboard: null
  };

  let totalCost = 0;
  let globalRemaining = budgetCeiling;

  // ─── Follow-up: Lock unchanged components from previous build ───
  const lockedCategories = new Set();
  if (prevBuild && prevIntent && prevIntent.component_strategy) {
    const oldStrats = prevIntent.component_strategy;
    const newStrats = intent.component_strategy || {};

    // Also check if top-level preferences changed
    const budgetChanged = prevIntent.budget_bdt !== intent.budget_bdt;
    const cpuBrandChanged = prevIntent.preferred_cpu_brand !== intent.preferred_cpu_brand;
    const gpuBrandChanged = prevIntent.preferred_gpu_brand !== intent.preferred_gpu_brand;
    const useCaseChanged = prevIntent.use_case !== intent.use_case;

    for (const category of Object.keys(selectedBuild)) {
      const oldS = oldStrats[category];
      const newS = newStrats[category];
      const prevPart = prevBuild[category];

      // Skip if no previous part or no strategy to compare
      if (!prevPart || !prevPart.name || !oldS || !newS) continue;

      // Check if this category's strategy changed
      const stratChanged =
        JSON.stringify(oldS.required_keywords || []) !== JSON.stringify(newS.required_keywords || []) ||
        JSON.stringify(oldS.exclude_keywords || []) !== JSON.stringify(newS.exclude_keywords || []) ||
        JSON.stringify(oldS.structured_reqs || {}) !== JSON.stringify(newS.structured_reqs || {}) ||
        oldS.required !== newS.required ||
        oldS.weight !== newS.weight;

      // CPU/Motherboard must also re-select if brand preference or budget changed significantly
      const isCpuAffected = category === 'Processor' && (cpuBrandChanged || budgetChanged);
      const isGpuAffected = category === 'Graphics Card' && (gpuBrandChanged || budgetChanged);
      const isBudgetSensitive = budgetChanged && ['Processor', 'Graphics Card', 'Monitor'].includes(category);

      if (!stratChanged && !isCpuAffected && !isGpuAffected && !isBudgetSensitive && !useCaseChanged) {
        // Lock this component — reuse previous build's part
        selectedBuild[category] = prevPart;
        totalCost += prevPart.price;
        globalRemaining -= prevPart.price;
        lockedCategories.add(category);
        console.log(`🔒 ${category}: Locked from previous build → ${prevPart.name} (${prevPart.price} BDT)`);
      }
    }

    if (lockedCategories.size > 0) {
      console.log(`[Follow-up] Locked ${lockedCategories.size} unchanged categories, re-selecting ${Object.keys(selectedBuild).length - lockedCategories.size}`);
    }
  }

  const createFilterFn = (category, strat, selectedParts) => {
    return (part) => {
      if (!deps.partRepository.matchesStrategy(part, strat, category)) return false;

      if (category === 'Processor') {
        if (intent.preferred_cpu_brand && part.specs?.brand !== intent.preferred_cpu_brand.toLowerCase()) return false;
        if (noGpu && !deps.compatibilityChecker.cpuHasIntegratedGraphics(part)) return false;
        if (!deps.compatibilityChecker.isCpuModern(part, intent.budget_bdt)) return false;
        const ramStrategy = intent.component_strategy?.['RAM'] || {};
        const requestedRamType = (ramStrategy.required_keywords || []).find(k => k.toLowerCase() === 'ddr4' || k.toLowerCase() === 'ddr5');
        if (requestedRamType) {
          const reqType = requestedRamType.toUpperCase();
          if (reqType === 'DDR5' && (part.specs?.socket === 'AM4' || part.specs?.socket === 'LGA1200' || part.specs?.socket === 'LGA1151')) return false;
          if (reqType === 'DDR4' && part.specs?.socket === 'AM5') return false;
          if (reqType === 'DDR3' && (part.specs?.socket === 'AM4' || part.specs?.socket === 'AM5' || part.specs?.socket === 'LGA1700')) return false;
        }
      }

      if (category === 'Motherboard' && selectedParts.Processor) {
        if (!deps.compatibilityChecker.isSocketCompatible(selectedParts.Processor, part)) return false;
        const cpuRamType = selectedParts.Processor.specs?.ram_type;
        if (cpuRamType && cpuRamType !== 'UNKNOWN' && part.specs?.ram_type && part.specs.ram_type !== 'UNKNOWN') {
          if (cpuRamType !== part.specs.ram_type) return false;
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
    'Storage', 'Casing', 'CPU Cooler', 'Monitor', 'Mouse', 'Keyboard'
  ];

  for (const category of selectionOrder) {
    // Skip locked components from previous build (follow-up mode)
    if (lockedCategories.has(category)) continue;

    const catBudget = dynamicBudgets[category];
    const strat = intent.component_strategy?.[category];
    let isRequired = strat && strat.required;
    let activeBudget = catBudget;

    if (category === 'CPU Cooler' && selectedBuild.Processor && (selectedBuild.Processor.specs?.tdp || 65) >= 105) {
      isRequired = true;
      if (activeBudget === 0) activeBudget = Math.min(5000, Math.max(0, budgetCeiling - totalCost));
    }

    if (!isRequired || activeBudget === 0) continue;

    const range = { min: 0, max: activeBudget };
    try {
      const filterFn = createFilterFn(category, strat, selectedBuild);
      const sortOrder = ['RAM', 'PSU'].includes(category) ? 'price_asc' : 'price_desc';
      const part = await deps.partSelector.selectWithFallback(site, category, range, sortOrder, filterFn, globalRemaining);
      if (part) {
        selectedBuild[category] = part;
        totalCost += part.price;
        globalRemaining -= part.price;
        console.log(`✓ ${category}: ${part.name} (${part.price} BDT)`);
      } else {
        console.warn(`⚠ ${category}: No component found within budget`);
      }
    } catch (error) {
      console.error(`✗ ${category}: Selection error:`, error.message);
    }
  }

  // Validate core build
  if (!selectedBuild.Processor || !selectedBuild.Motherboard || !selectedBuild.RAM || !selectedBuild.PSU) {
    const missing = ['Processor', 'Motherboard', 'RAM', 'PSU'].filter(c => !selectedBuild[c]).join(', ');
    throw new BuildError(500, `Could not assemble a complete build. Missing: ${missing}. Try adjusting your budget.`, 'CORE_COMPONENT_MISSING');
  }

  // ─── PHASE 4: Rebalancing ───
  console.log("\nPHASE 4: Rebalancing underspent budget...");
  const underspendTolerance = Math.min(budget * 0.005, 1500);
  const targetMinSpend = Math.max(0, budget - underspendTolerance);
  const maxRebalanceIterations = intent.budget_bdt >= 150000 ? 7 : 6;

  for (let i = 0; i < maxRebalanceIterations; i++) {
    if (totalCost >= targetMinSpend) break;
    const remaining = budgetCeiling - totalCost;
    if (remaining < 300) break;

    const upgradeCandidates = ['Graphics Card', 'Monitor', 'Processor', 'Motherboard', 'RAM', 'Storage', 'PSU', 'CPU Cooler', 'Casing', 'Keyboard', 'Mouse'];
    let best = null;

    upgradeCandidates.forEach(cat => {
      const current = selectedBuild[cat];
      if (!current) return;
      const strategy = intent.component_strategy[cat];
      if (!strategy || !strategy.required) return;
      const weight = strategy.weight || 1;
      const expandedMax = Math.min(current.price + remaining, budgetCeiling);
      const gap = expandedMax - current.price;
      const score = gap * weight;
      if (gap > 200 && (!best || score > best.score)) {
        best = { category: cat, possibleMax: expandedMax, gap, score, strat: strategy };
      }
    });

    if (!best) break;

    const currentPart = selectedBuild[best.category];
    const upgradeRange = { min: currentPart.price + 1, max: best.possibleMax };
    if (upgradeRange.max <= upgradeRange.min) break;

    let upgradedPart = null;
    try {
      const parts = await deps.partRepository.query(site, best.category, upgradeRange, 'price_desc');
      for (const part of parts) {
        if (!deps.partRepository.matchesStrategy(part, best.strat)) continue;
        if (best.category === 'Graphics Card') {
          if (intent.preferred_gpu_brand && part.specs?.gpu_brand !== intent.preferred_gpu_brand.toLowerCase()) continue;
          if (!deps.compatibilityChecker.isGpuAdequateForUseCase(part, intent.use_case)) continue;
          if (selectedBuild.Processor && !deps.compatibilityChecker.isCpuBalanced(selectedBuild.Processor, part)) continue;
          if (selectedBuild.PSU?.specs?.wattage) {
            const targetW = deps.budgetAllocator.computeTargetPsuWattage(selectedBuild.Processor || {}, part);
            if (selectedBuild.PSU.specs.wattage < targetW) continue;
          }
        }
        if (best.category === 'Processor') {
          if (intent.preferred_cpu_brand && part.specs?.brand !== intent.preferred_cpu_brand.toLowerCase()) continue;
          if (noGpu && !deps.compatibilityChecker.cpuHasIntegratedGraphics(part)) continue;
          if (selectedBuild.Motherboard && !deps.compatibilityChecker.isSocketCompatible(part, selectedBuild.Motherboard)) continue;
          if (selectedBuild.PSU?.specs?.wattage) {
            const targetW = deps.budgetAllocator.computeTargetPsuWattage(part, selectedBuild["Graphics Card"]);
            if (selectedBuild.PSU.specs.wattage < targetW) continue;
          }
        }
        if (best.category === 'Motherboard') {
          if (selectedBuild.Processor && !deps.compatibilityChecker.isSocketCompatible(selectedBuild.Processor, part)) continue;
          if (selectedBuild.RAM && !deps.compatibilityChecker.isRamTypeCompatible(part, selectedBuild.RAM)) continue;
        }
        if (best.category === 'RAM') {
          if (selectedBuild.Motherboard && !deps.compatibilityChecker.isRamTypeCompatible(selectedBuild.Motherboard, part)) continue;
        }
        if (best.category === 'PSU') {
          const targetW = deps.budgetAllocator.computeTargetPsuWattage(selectedBuild.Processor || {}, selectedBuild["Graphics Card"]);
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
    }
  }

  // ─── PHASE 5: Post-Build Validation ───
  console.log("\nPHASE 5: Post-Build Validation...");
  const buildWarnings = [];

  const requestedTb = intent.component_strategy?.['Storage']?.structured_reqs?.min_tb;
  if (requestedTb && selectedBuild.Storage) {
    const actualCapGB = parseStorageCapacityGB(selectedBuild.Storage.name);
    const requestedGB = requestedTb * 1000;
    if (actualCapGB < requestedGB * 0.9) {
      buildWarnings.push(`You requested ${requestedTb}TB storage but the selected drive is ${actualCapGB >= 1000 ? (actualCapGB / 1000).toFixed(1) + 'TB' : actualCapGB + 'GB'}. No ${requestedTb}TB drive was available within budget.`);
    }
  }

  if (selectedBuild["Graphics Card"]) {
    if (!deps.compatibilityChecker.isGpuAdequateForUseCase(selectedBuild["Graphics Card"], intent.use_case)) {
      buildWarnings.push(`The selected GPU may not be powerful enough for ${intent.use_case}. Consider increasing your budget.`);
    }
  }

  if (selectedBuild.PSU && selectedBuild.Processor) {
    const requiredW = deps.budgetAllocator.computeTargetPsuWattage(selectedBuild.Processor, selectedBuild["Graphics Card"], intent.use_case, intent.budget_bdt);
    const actualW = selectedBuild.PSU.specs?.wattage || 0;
    if (actualW < requiredW * 0.85) {
      buildWarnings.push(`PSU (${actualW}W) may be insufficient. Recommended: ${Math.round(requiredW)}W.`);
    }
  }

  const requestedGb = intent.component_strategy?.['RAM']?.structured_reqs?.min_gb;
  if (requestedGb && selectedBuild.RAM) {
    const ramName = selectedBuild.RAM.name.toLowerCase();
    const half = requestedGb / 2;
    const hasRequestedGB = ramName.includes(`${requestedGb}gb`) || ramName.includes(`${requestedGb} gb`)
      || ramName.includes(`2x${half}gb`) || ramName.includes(`2x${half} gb`);
    if (!hasRequestedGB) {
      buildWarnings.push(`You requested ${requestedGb}GB RAM but the selected kit may differ. Check the product listing.`);
    }
  }

  if (selectedBuild.Processor && selectedBuild.Motherboard) {
    if (selectedBuild.Processor.specs?.socket !== selectedBuild.Motherboard.specs?.socket) {
      buildWarnings.push(`⚠ INCOMPATIBLE: CPU socket (${selectedBuild.Processor.specs?.socket}) does not match motherboard (${selectedBuild.Motherboard.specs?.socket}).`);
    }
  }

  if (selectedBuild.RAM && selectedBuild.Motherboard) {
    const moboRamType = selectedBuild.Motherboard.specs?.ram_type;
    const selectedRamType = selectedBuild.RAM.specs?.ram_type;
    if (moboRamType && moboRamType !== 'UNKNOWN' && selectedRamType && selectedRamType !== moboRamType) {
      buildWarnings.push(`⚠ INCOMPATIBLE: RAM type (${selectedRamType}) does not match motherboard (${moboRamType}).`);
    }
  }

  if (buildWarnings.length > 0) {
    console.log('\nBuild Warnings:');
    buildWarnings.forEach(w => console.warn(`  ⚠ ${w}`));
  }

  // ─── PHASE 6: Generate explanation ───
  const explanation = await deps.explanationGenerator.generate({
    selectedBuild, totalCost, intent, sitePreference: site, buildWarnings,
  });

  return {
    build: selectedBuild,
    total: totalCost,
    explanation,
    intent,
    warnings: buildWarnings,
  };
}
