/**
 * Build Route Handler
 * POST /api/build endpoint that orchestrates the PC building process
 */

import { sendError, createError, ERROR_INVALID_MESSAGE, ERROR_INVALID_SITE, ERROR_INVALID_KEYS, errorBudgetTooLow, ERROR_GROQ_UNAVAILABLE, ERROR_INVALID_INTENT, errorCoreComponentMissing, errorComponentNotFound, errorPsuInsufficient, ERROR_INTERNAL } from '../utils/errors.js';
import { BUDGET } from '../config/budget.js';
import { CPU_TDP } from '../config/tdpHeuristics.js';
import { API, PART_SELECTION } from '../config/thresholds.js';

/**
 * Parse storage capacity in GB from product name
 * @param {string} name - Product name
 * @returns {number} Capacity in GB
 */
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

/**
 * Create build route handler with dependency injection
 * @param {Object} deps - Dependencies
 * @param {Object} deps.intentExtractor - AI intent extractor
 * @param {Object} deps.explanationGenerator - AI explanation generator
 * @param {Object} deps.compatChecker - Compatibility validation
 * @param {Object} deps.budgetAllocator - Budget allocation engine
 * @param {Object} deps.partSelector - Part selection engine
 * @param {Object} deps.partRepository - Component query interface
 * @param {Object} deps.intentOverrideApplier - Function to override intent from message
 * @returns {Function} Express route handler
 */
export const createBuildHandler = (deps) => {
  return async (req, res) => {
    let isAborted = false;
    req.on('close', () => {
      isAborted = true;
    });

    try {
      const { message, site: bodySite, customKeys = {} } = req.body;
      console.log("[build] Incoming request");

      // Validate input
      if (!message || message.length > API.MAX_MESSAGE_LENGTH) {
        return sendError(res, ERROR_INVALID_MESSAGE);
      }
      if (bodySite && !API.VALID_SITES.includes(bodySite)) {
        return sendError(res, ERROR_INVALID_SITE);
      }
      if (customKeys && typeof customKeys !== 'object') {
        return sendError(res, ERROR_INVALID_KEYS);
      }

      // Extract intent from AI
      let intent;
      try {
        intent = await deps.intentExtractor.extract(message);
      } catch (error) {
        console.error("[build] Intent extraction failed:", error);
        if (error.message.includes('Intent extraction failed')) {
          return sendError(res, ERROR_GROQ_UNAVAILABLE);
        }
        return sendError(res, ERROR_INVALID_INTENT);
      }

      // Apply manual overrides from message
      deps.intentOverrideApplier(intent, message);
      console.log("[build] Extracted intent:", JSON.stringify(intent, null, 2));

      if (isAborted) { console.log("[build] Client aborted, stopping."); return; }

      // Validate budget
      if (!intent.budget_bdt) {
        return sendError(res, errorBudgetTooLow(BUDGET.MIN_BUDGET_BDT));
      }
      if (intent.budget_bdt < BUDGET.MIN_BUDGET_BDT) {
        return sendError(res, errorBudgetTooLow(BUDGET.MIN_BUDGET_BDT));
      }

      // Determine site
      const VALID_SITES = API.VALID_SITES;
      const site = (VALID_SITES.includes(bodySite) ? bodySite : null)
        || (VALID_SITES.includes(intent.preferred_site) ? intent.preferred_site : null)
        || 'startech';

      console.log(`[build] Building PC from ${site} for ${intent.budget_bdt} BDT`);

      const budget = intent.budget_bdt;
      const budgetCeiling = budget + Math.min(budget * BUDGET.CEILING_OVERSPEND_PERCENTAGE, BUDGET.CEILING_OVERSPEND_MAX_BDT);
      const noGpu = intent.no_gpu || (intent.component_strategy?.['Graphics Card'] && !intent.component_strategy['Graphics Card'].required) || false;

      // ─── PHASE 1 & 2: Floor price validation & budget allocation ───
      console.log("PHASE 1 & 2: Dynamic Blueprint Reality Check & Weighted Budget Allocation");

      if (isAborted) { console.log("[build] Client aborted, stopping."); return; }

      const floorResult = await deps.budgetAllocator.calculateFloorPrices({
        blueprint: intent,
        budgetCeiling,
        site,
      });

      if (floorResult.error) {
        return sendError(res, createError(400, floorResult.error, 'BUDGET_FLOOR_EXCEEDED'));
      }

      // Allocate budgets by weight
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
        Processor: null,
        Motherboard: null,
        RAM: null,
        Storage: null,
        "Graphics Card": null,
        PSU: null,
        Casing: null,
        "CPU Cooler": null,
        Monitor: null,
        Mouse: null,
        Keyboard: null
      };

      let totalCost = 0;
      let globalRemaining = budgetCeiling;

      // Helper to create filter function based on strategy and selected parts
      const createFilterFn = (category, strat, selectedParts) => {
        return (part) => {
          if (!deps.partRepository.matchesStrategy(part, strat, category)) return false;

          if (category === 'Processor') {
            if (intent.preferred_cpu_brand && part.specs?.brand !== intent.preferred_cpu_brand.toLowerCase()) return false;
            if (noGpu && !deps.compatibilityChecker.cpuHasIntegratedGraphics(part)) return false;
            
            // Quality Filter: Avoid very old CPUs if budget >= 40K
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
            const cpuSocket = selectedParts.Processor.specs?.socket;
            const mbSocket = part.specs?.socket;
            console.log(`[Build] Checking compatibility: CPU socket ${cpuSocket} vs MB socket ${mbSocket} (${part.name})`);
            
            if (!deps.compatibilityChecker.isSocketCompatible(selectedParts.Processor, part)) return false;
            
            // Ensure motherboard supports the RAM type the CPU needs
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

      // Selection order: Processor → Motherboard → RAM → Graphics Card → PSU → others
      const selectionOrder = [
        'Processor', 'Motherboard', 'RAM', 'Graphics Card', 'PSU', 
        'Storage', 'Casing', 'CPU Cooler', 'Monitor', 'Mouse', 'Keyboard'
      ];

      for (const category of selectionOrder) {
        if (isAborted) { console.log("[build] Client aborted, stopping."); return; }

        const budget = dynamicBudgets[category];
        const strat = intent.component_strategy?.[category];

        let isRequired = strat && strat.required;
        let activeBudget = budget;

        if (category === 'CPU Cooler' && selectedBuild.Processor && (selectedBuild.Processor.specs?.tdp || 65) >= 105) {
          isRequired = true;
          if (activeBudget === 0) {
            activeBudget = Math.min(5000, Math.max(0, budgetCeiling - totalCost));
          }
        }

        if (!isRequired || activeBudget === 0) {
          continue;
        }

        const range = { min: 0, max: activeBudget };

        try {
          // Use standard filter (keywords already degraded in Phase 1 if needed)
          const filterFn = createFilterFn(category, strat, selectedBuild);
          const sortOrder = ['RAM', 'PSU'].includes(category) ? 'price_asc' : 'price_desc';
          const part = await deps.partSelector.selectWithFallback(
            site,
            category,
            range,
            sortOrder,
            filterFn,
            globalRemaining
          );

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

      // Validate core build is complete
      if (!selectedBuild.Processor || !selectedBuild.Motherboard || !selectedBuild.RAM || !selectedBuild.PSU) {
        return sendError(res, errorCoreComponentMissing({
          Processor: !!selectedBuild.Processor,
          Motherboard: !!selectedBuild.Motherboard,
          RAM: !!selectedBuild.RAM,
          PSU: !!selectedBuild.PSU
        }));
      }

      // ─── PHASE 4: Rebalancing & Upgrading ───
      console.log("\nPHASE 4: Rebalancing underspent budget...");
      const underspendTolerance = Math.min(budget * 0.005, 1500);
      const targetMinSpend = Math.max(0, budget - underspendTolerance);
      const maxRebalanceIterations = intent.budget_bdt >= 150000 ? 7 : 6;

      for (let i = 0; i < maxRebalanceIterations; i++) {
        if (isAborted) { console.log("[build] Client aborted, stopping."); return; }

        if (totalCost >= targetMinSpend) break;
        const remaining = budgetCeiling - totalCost;
        if (remaining < 300) break;

        const upgradeCandidates = ['Graphics Card', 'Monitor', 'Processor', 'Motherboard', 'RAM', 'Storage', 'PSU', 'CPU Cooler', 'Casing', 'Keyboard', 'Mouse'];
        let best = null;

        upgradeCandidates.forEach(category => {
          const current = selectedBuild[category];
          if (!current) return;
          const strategy = intent.component_strategy[category];
          if (!strategy || !strategy.required) return;
          
          const weight = strategy.weight || 1;
          const expandedMax = Math.min(current.price + remaining, budgetCeiling);
          const gap = expandedMax - current.price;
          const score = gap * weight;

          if (gap > 200 && (!best || score > best.score)) {
            best = { category, possibleMax: expandedMax, gap, score, strat: strategy };
          }
        });

        if (!best) break;

        const currentPart = selectedBuild[best.category];
        const upgradeRange = { min: currentPart.price + 1, max: best.possibleMax };
        if (upgradeRange.max <= upgradeRange.min) break;

        // Compatibility-aware filter for upgrade
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

      // ─── POST-BUILD VALIDATION ───
      console.log("\nPHASE 5: Post-Build Validation...");
      const buildWarnings = [];

      // Check storage capacity vs user request
      const requestedTb = intent.component_strategy?.['Storage']?.structured_reqs?.min_tb;
      if (requestedTb && selectedBuild.Storage) {
        const actualCapGB = parseStorageCapacityGB(selectedBuild.Storage.name);
        const requestedGB = requestedTb * 1000;
        if (actualCapGB < requestedGB * 0.9) {
          buildWarnings.push(`You requested ${requestedTb}TB storage but the selected drive is ${actualCapGB >= 1000 ? (actualCapGB / 1000).toFixed(1) + 'TB' : actualCapGB + 'GB'}. No ${requestedTb}TB drive was available within budget.`);
        }
      }

      // Check GPU adequacy for use case
      if (selectedBuild["Graphics Card"]) {
        if (!deps.compatibilityChecker.isGpuAdequateForUseCase(selectedBuild["Graphics Card"], intent.use_case)) {
          buildWarnings.push(`The selected GPU may not be powerful enough for ${intent.use_case}. Consider increasing your budget for a better GPU.`);
        }
      }

      // Check PSU adequacy
      if (selectedBuild.PSU && selectedBuild.Processor) {
        const requiredW = deps.budgetAllocator.computeTargetPsuWattage(
          selectedBuild.Processor, selectedBuild["Graphics Card"],
          intent.use_case, intent.budget_bdt
        );
        const actualW = selectedBuild.PSU.specs?.wattage || 0;
        if (actualW < requiredW * 0.85) {
          buildWarnings.push(`PSU (${actualW}W) may be insufficient. Recommended: ${Math.round(requiredW)}W for this CPU+GPU combination.`);
        }
      }

      // Check RAM matches request
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

      // Check CPU-Motherboard socket match (safety net)
      if (selectedBuild.Processor && selectedBuild.Motherboard) {
        if (selectedBuild.Processor.specs?.socket !== selectedBuild.Motherboard.specs?.socket) {
          buildWarnings.push(`⚠ INCOMPATIBLE: CPU socket (${selectedBuild.Processor.specs?.socket}) does not match motherboard (${selectedBuild.Motherboard.specs?.socket}).`);
        }
      }

      // Check RAM type compatibility
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
        selectedBuild,
        totalCost,
        intent,
        sitePreference: site,
        buildWarnings,
      });

      // Return build response
      res.json({
        build: selectedBuild,
        total: totalCost,
        explanation: explanation,
        intent: intent,
        warnings: buildWarnings
      });

    } catch (error) {
      console.error("[build] Unhandled error:", error);
      return sendError(res, ERROR_INTERNAL);
    }
  };
};

export default createBuildHandler;
