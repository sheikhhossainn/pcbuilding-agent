/**
 * Budget Allocation Engine
 * Calculates floor prices, allocates budgets by component weight, handles rebalancing
 */

import { BUDGET } from '../config/budget.js';
import { CPU_TDP, GPU_TDP, PSU_SIZING, PSU_WATTAGE } from '../config/tdpHeuristics.js';
import { PART_SELECTION } from '../config/thresholds.js';

const CORE_COMPONENTS = ['Processor', 'Motherboard', 'RAM', 'Graphics Card', 'PSU', 'Storage', 'Casing', 'Monitor'];

/**
 * Create budget allocator with dependency injection
 * @param {Object} deps - Dependencies
 * @param {Object} deps.partRepository - Interface for querying parts from DB
 * @param {Object} deps.compatChecker - Compatibility checker for filters
 * @returns {Object} Budget allocator interface
 */
export const createBudgetAllocator = ({ partRepository, compatChecker }) => {
  /**
   * Compute target PSU wattage based on CPU+GPU draw
   * Formula: (CPU_TDP + GPU_TDP) * multiplier + additive
   * 
   * @param {Object} cpu - CPU part with specs.tdp
   * @param {Object} gpu - GPU part with specs.tdp (nullable)
   * @returns {number} Recommended PSU wattage
   */
  const computeTargetPsuWattage = (cpu, gpu, useCase = 'general', budget = 0) => {
    const cpuTdp = cpu?.specs?.tdp || CPU_TDP.DEFAULT;
    const gpuTdp = gpu?.specs?.tdp || 0;

    const multiplier = gpu ? PSU_SIZING.MULTIPLIER_WITH_GPU : PSU_SIZING.MULTIPLIER_WITHOUT_GPU;
    const additive = gpu ? PSU_SIZING.ADDITIVE_WITH_GPU : PSU_SIZING.ADDITIVE_WITHOUT_GPU;

    const required = cpuTdp + gpuTdp;
    const computed = (required * multiplier) + additive;

    let floor = 500;
    if ((useCase === 'gaming' || useCase === 'editing') && gpu) {
        floor = budget >= 150000 ? 750 : (budget < 40000 ? 550 : 650);
    }
    if (gpuTdp >= 450) floor = Math.max(floor, 1000);
    else if (gpuTdp >= 400) floor = Math.max(floor, 850);
    else if (gpuTdp >= 350) floor = Math.max(floor, 800);
    else if (gpuTdp >= 320) floor = Math.max(floor, 750);
    else if (gpuTdp >= 250) floor = Math.max(floor, 700);
    else if (gpuTdp >= 200) floor = Math.max(floor, 650);

    if (cpuTdp >= 125 && gpu) floor = Math.max(floor, 650);

    const finalW = Math.max(computed, floor);
    return Math.ceil(finalW / 50) * 50; // Round up to nearest 50W
  };

  /**
   * Allocate budget to components based on weights
   * Returns dynamic budgets: minimum price + (weight / total_weight * leftover)
   * 
   * @param {Object} params - Allocation parameters
   * @param {Object} params.blueprint - Component strategy with weights
   * @param {number} params.totalFloor - Sum of minimum prices
   * @param {number} params.budgetCeiling - Maximum allowed spend
   * @param {string} params.site - Retailer site for filtering
   * @returns {Object} Dynamic budgets per component
   */
  const allocateBudgets = (params) => {
    const { blueprint, totalFloor, budgetCeiling, site, minimums } = params;

    let totalWeight = 0;
    const categories = Object.keys(blueprint.component_strategy || {});

    // Calculate total weight for required components
    for (const cat of categories) {
      const strat = blueprint.component_strategy[cat];
      const isPeripheral = ['Monitor', 'Mouse', 'Keyboard'].includes(cat);
      const isComputermania = site === 'computermania' && isPeripheral;

      if (strat && strat.required && !isComputermania) {
        totalWeight += strat.weight || 1;
      }
    }

    const leftoverBudget = Math.max(0, budgetCeiling - totalFloor);
    const dynamicBudgets = {};

    // Allocate to each component
    for (const cat of categories) {
      const strat = blueprint.component_strategy[cat];
      const isPeripheral = ['Monitor', 'Mouse', 'Keyboard'].includes(cat);
      const isComputermania = site === 'computermania' && isPeripheral;

      if (strat && strat.required && !isComputermania) {
        const weight = strat.weight || 1;
        const minPrice = minimums?.[cat] || blueprint.minimums?.[cat] || 0;
        dynamicBudgets[cat] = Math.round(minPrice + ((weight / totalWeight) * leftoverBudget));
      } else {
        dynamicBudgets[cat] = 0;
      }
    }

    return dynamicBudgets;
  };

  /**
   * Calculate floor prices: minimum cost to meet specifications
   * Includes fallback degradation for structured requirements (min_gb, min_hz, etc.)
   * 
   * @param {Object} params - Floor calculation parameters
   * @param {Object} params.blueprint - Component strategy
   * @param {number} params.budgetCeiling - Maximum budget
   * @param {string} params.site - Retailer site
   * @returns {Promise<Object>} {minimums, totalFloor, error, updatedBlueprint}
   */
  const calculateFloorPrices = async (params) => {
    const { blueprint, budgetCeiling, site } = params;
    let totalFloor = 0;
    let error = null;
    const minimums = {};
    const floorParts = {};

    const categories = Object.keys(blueprint.component_strategy || {});

    const availableSockets = await partRepository.getAvailableSockets(site);
    console.log(`[Floor] Available motherboard sockets at ${site}:`, Array.from(availableSockets));

    for (const category of categories) {
      const strategy = blueprint.component_strategy[category];
      console.log(`[Floor] Checking ${category}: required=${strategy?.required}, site=${site}`);
      const isPeripheral = ['Monitor', 'Mouse', 'Keyboard'].includes(category);
      const isComputermania = site === 'computermania' && isPeripheral;

      if (!strategy || !strategy.required || isComputermania) {
        minimums[category] = 0;
        continue;
      }

      // Keyword + Structured Requirement degradation loop
      let keywordsToTry = [...(strategy.required_keywords || [])];
      let structuredReqs = { ...strategy.structured_reqs };
      let part = null;

      while (true) {
        const tempStrategy = { ...strategy, required_keywords: keywordsToTry, structured_reqs: structuredReqs };
        
        const filterFn = (p) => {
          if (category === 'Processor') {
            // Trap CPU prevention: Must have motherboard in stock
            if (p.specs?.socket && p.specs.socket !== 'UNKNOWN' && !availableSockets.has(p.specs.socket)) return false;

            // Quality Filter: Avoid very old CPUs if budget >= 40K
            console.log(`[Floor] Checking modern: ${p.name}`);
            if (!compatChecker.isCpuModern(p, blueprint.budget_bdt)) return false;

            const brandMatch = !blueprint.preferred_cpu_brand || p.specs?.brand === blueprint.preferred_cpu_brand.toLowerCase();
            const noGpu = blueprint.no_gpu || (blueprint.component_strategy?.['Graphics Card'] && !blueprint.component_strategy['Graphics Card'].required);
            if (noGpu && !compatChecker.isCpuIntegratedGpuAdequate(p, blueprint.use_case)) return false;
            
            if (!brandMatch) return false;

            const ramStrategy = blueprint.component_strategy['RAM'] || {};
            const requestedRamType = (ramStrategy.required_keywords || []).find(k => k.toLowerCase() === 'ddr4' || k.toLowerCase() === 'ddr5');
            if (requestedRamType) {
              const reqType = requestedRamType.toUpperCase();
              if (reqType === 'DDR5' && (p.specs?.socket === 'AM4' || p.specs?.socket === 'LGA1200' || p.specs?.socket === 'LGA1151')) return false;
              if (reqType === 'DDR4' && p.specs?.socket === 'AM5') return false;
              if (reqType === 'DDR3' && (p.specs?.socket === 'AM4' || p.specs?.socket === 'AM5' || p.specs?.socket === 'LGA1700')) return false;
            }
            return true;
          }
          if (category === 'Motherboard') {
            if (p.specs?.socket === 'UNKNOWN') return false;
            if (p.specs?.socket === 'INTEGRATED') return false; 

            // Ensure motherboard matches preferred brand or already selected processor floor
            const targetBrand = blueprint.preferred_cpu_brand || floorParts.Processor?.specs?.brand;
            if (targetBrand) {
              const brand = p.specs?.brand;
              if (brand && brand !== 'unknown' && brand !== targetBrand.toLowerCase()) return false;
            }
            
            if (floorParts.Processor) {
              if (!compatChecker.isSocketCompatible(floorParts.Processor, p)) return false;
            }

            const ramStrategy = blueprint.component_strategy['RAM'] || {};
            const requestedRamType = (ramStrategy.required_keywords || []).find(k => k.toLowerCase() === 'ddr4' || k.toLowerCase() === 'ddr5');
            if (requestedRamType) {
              const reqType = requestedRamType.toUpperCase();
              if (p.specs?.ram_type && p.specs.ram_type !== 'UNKNOWN' && p.specs.ram_type !== reqType) return false;
            }
          }
          if (category === 'RAM') {
            const cpu = floorParts.Processor;
            const mb = floorParts.Motherboard;
            if (mb) {
              if (!compatChecker.isRamTypeCompatible(mb, p)) return false;
            } else if (cpu) {
              const cpuRamType = cpu.specs?.ram_type;
              if (cpuRamType && cpuRamType !== 'UNKNOWN' && p.specs?.ram_type && p.specs.ram_type !== 'UNKNOWN') {
                if (cpuRamType !== p.specs.ram_type) return false;
              }
            }
          }
          if (category === 'Graphics Card') {
            if (blueprint.preferred_gpu_brand && p.specs?.gpu_brand !== blueprint.preferred_gpu_brand.toLowerCase()) return false;
            if (!compatChecker.isGpuAdequateForUseCase(p, blueprint.use_case)) return false;
          }
          if (category === 'PSU') {
            const noGpu = blueprint.no_gpu || (blueprint.component_strategy?.['Graphics Card'] && !blueprint.component_strategy['Graphics Card'].required);
            const gpuTdp = (!noGpu && (blueprint.use_case === 'gaming' || blueprint.use_case === 'editing')) ? 220 : 0;
            const targetW = computeTargetPsuWattage(floorParts.Processor, noGpu ? null : { specs: { tdp: gpuTdp } }, blueprint.use_case, blueprint.budget_bdt);
            if ((p.specs?.wattage || 0) < targetW) return false;
          }
          return true;
        };

        // Query for cheapest matching part
        part = await partRepository.findCheapest(site, category, budgetCeiling, tempStrategy, filterFn);
        
        // Don't fallback to different sites — respect user's site preference
        if (part) {
          // Success: update blueprint with degraded requirements
          blueprint.component_strategy[category].required_keywords = [...keywordsToTry];
          blueprint.component_strategy[category].structured_reqs = { ...structuredReqs };
          break;
        } else {
          if (keywordsToTry.length > 0 && keywordsToTry.some(k => !['ddr4', 'ddr5'].includes(k.toLowerCase()))) {
            // Drop a keyword and retry, but never drop RAM types
            const dropIndex = keywordsToTry.findIndex(k => !['ddr4', 'ddr5'].includes(k.toLowerCase()));
            const dropped = keywordsToTry.splice(dropIndex, 1)[0];
            console.warn(`[Floor] Dropped keyword '${dropped}' for ${category} to find matching part`);
          } else if (category === 'RAM' && structuredReqs.min_gb && structuredReqs.min_gb > 8) {
            // Degrade RAM requirement
            const previous = structuredReqs.min_gb;
            if (previous > 32) {
              structuredReqs.min_gb = 32;
              console.warn(`[Floor] Reduced ${category} requirement from ${previous}GB to 32GB`);
            } else if (previous > 16) {
              structuredReqs.min_gb = 16;
              console.warn(`[Floor] Reduced ${category} requirement from ${previous}GB to 16GB`);
            } else {
              structuredReqs.min_gb = 8;
              console.warn(`[Floor] Reduced ${category} requirement from ${previous}GB to 8GB`);
            }
          } else if (category === 'Storage' && structuredReqs.min_tb && structuredReqs.min_tb > 1) {
            // Degrade storage requirement
            const previous = structuredReqs.min_tb;
            structuredReqs.min_tb = 1;
            console.warn(`[Floor] Reduced ${category} requirement from ${previous}TB to 1TB`);
          } else if (category === 'Monitor' && structuredReqs.min_hz && structuredReqs.min_hz > 60) {
            // Degrade monitor Hz
            const previous = structuredReqs.min_hz;
            structuredReqs.min_hz = 60;
            console.warn(`[Floor] Reduced ${category} requirement from ${previous}Hz to 60Hz`);
          } else if (strategy.exclude_keywords && strategy.exclude_keywords.length > 0) {
            const dropped = strategy.exclude_keywords.shift();
            console.warn(`[Floor] Dropped exclude_keyword '${dropped}' for ${category} to find match`);
          } else if (category === 'Processor' && blueprint.preferred_cpu_brand) {
            console.warn(`[Floor] Dropped preferred CPU brand '${blueprint.preferred_cpu_brand}' for ${category} to find match`);
            blueprint.preferred_cpu_brand = null;
          } else if (category === 'Graphics Card' && blueprint.preferred_gpu_brand) {
            console.warn(`[Floor] Dropped preferred GPU brand '${blueprint.preferred_gpu_brand}' for ${category} to find match`);
            blueprint.preferred_gpu_brand = null;
          } else {
            break; // No more fallbacks
          }
        }
      }

      if (!part) {
        const reqs = (strategy.required_keywords && strategy.required_keywords.length > 0)
          ? strategy.required_keywords.join(", ")
          : "specific features";
        error = `No ${category} matching your requirements (${reqs}) found in current inventory.`;
        break;
      }

      minimums[category] = part.price;
      floorParts[category] = part;
      totalFloor += part.price;

      if (category === 'Processor' && (part.specs?.tdp || 65) >= 105) {
        if (!blueprint.component_strategy['CPU Cooler'] || !blueprint.component_strategy['CPU Cooler'].required) {
          const cooler = await partRepository.findCheapest(site, 'CPU Cooler', budgetCeiling, null);
          if (cooler) {
            minimums['CPU Cooler'] = cooler.price;
            totalFloor += cooler.price;
          }
        }
      }
    }

    if (!error && totalFloor > budgetCeiling) {
      console.warn(`[Floor] Total floor (${totalFloor}) exceeds budget (${budgetCeiling}). Attempting emergency requirement reduction...`);
      
      // Try to drop keywords from categories that have them, starting with most expensive
      const categoriesToReduce = categories.filter(c => minimums[c] !== undefined).sort((a, b) => minimums[b] - minimums[a]);
      
      for (const cat of categoriesToReduce) {
        const strat = blueprint.component_strategy[cat];
        if (!strat) continue;

        // 1. Try dropping required_keywords
        if (strat.required_keywords && strat.required_keywords.length > 0) {
          const dropped = strat.required_keywords.shift();
          console.warn(`[Floor] Emergency: Dropping required_keyword '${dropped}' from ${cat} to fit budget`);
          return calculateFloorPrices({ site, blueprint, budgetCeiling });
        }

        // 2. Try dropping structured_reqs
        if (strat.structured_reqs && Object.keys(strat.structured_reqs).length > 0) {
          const keys = Object.keys(strat.structured_reqs);
          const dropped = keys[0];
          delete strat.structured_reqs[dropped];
          console.warn(`[Floor] Emergency: Dropping structured_req '${dropped}' from ${cat} to fit budget`);
          return calculateFloorPrices({ site, blueprint, budgetCeiling });
        }

        // 3. Try dropping exclude_keywords
        if (strat.exclude_keywords && strat.exclude_keywords.length > 0) {
          const dropped = strat.exclude_keywords.shift();
          console.warn(`[Floor] Emergency: Dropping exclude_keyword '${dropped}' from ${cat} to fit budget`);
          return calculateFloorPrices({ site, blueprint, budgetCeiling });
        }
      }
      
      error = `Minimum cost (${totalFloor} BDT) exceeds your budget (${budgetCeiling} BDT). Please try increasing your budget or simplifying your request.`;
    }

    return {
      minimums,
      totalFloor,
      error,
      updatedBlueprint: blueprint,
    };
  };

  return {
    computeTargetPsuWattage,
    allocateBudgets,
    calculateFloorPrices,
  };
};

export default createBudgetAllocator;
