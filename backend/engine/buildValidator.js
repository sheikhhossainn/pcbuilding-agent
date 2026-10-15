/**
 * Build Validator
 * Pure checks run on a finished build: used by the orchestrator (Phase 5) and by
 * POST /api/build/validate so the UI can re-check after the user removes or swaps a part.
 */

import { CPU_TDP, GPU_TDP, SYSTEM_DRAW } from '../config/tdpHeuristics.js';

export function parseStorageCapacityGB(name) {
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
 * Collect post-build warnings for a selected build.
 *
 * @param {Object} params
 * @param {Object} params.build - category -> part ({ name, specs, ... }) | null
 * @param {Object} params.intent - { use_case, budget_bdt, component_strategy }
 * @param {Object} deps
 * @param {Object} deps.compatibilityChecker
 * @param {Object} deps.budgetAllocator - needs computeTargetPsuWattage
 * @returns {string[]} warnings (INCOMPATIBLE ones contain the word "INCOMPATIBLE")
 */
export function collectBuildWarnings({ build, intent }, deps) {
  const warnings = [];
  const strategy = intent?.component_strategy || {};

  const requestedTb = strategy['Storage']?.structured_reqs?.min_tb;
  if (requestedTb && build.Storage) {
    const actualCapGB = parseStorageCapacityGB(build.Storage.name);
    const requestedGB = requestedTb * 1000;
    if (actualCapGB < requestedGB * 0.9) {
      warnings.push(`You requested ${requestedTb}TB storage but the selected drive is ${actualCapGB >= 1000 ? (actualCapGB / 1000).toFixed(1) + 'TB' : actualCapGB + 'GB'}. No ${requestedTb}TB drive was available within budget.`);
    }
  }

  if (build["Graphics Card"]) {
    if (!deps.compatibilityChecker.isGpuAdequateForUseCase(build["Graphics Card"], intent.use_case)) {
      warnings.push(`The selected GPU may not be powerful enough for ${intent.use_case}. Consider increasing your budget.`);
    }
  }

  if (build.PSU && build.Processor) {
    const requiredW = deps.budgetAllocator.computeTargetPsuWattage(build.Processor, build["Graphics Card"], intent.use_case, intent.budget_bdt);
    const actualW = build.PSU.specs?.wattage || 0;
    if (actualW < requiredW * 0.85) {
      warnings.push(`PSU (${actualW}W) may be insufficient. Recommended: ${Math.round(requiredW)}W.`);
    }
  }

  const requestedGb = strategy['RAM']?.structured_reqs?.min_gb;
  if (requestedGb && build.RAM) {
    const ramName = build.RAM.name.toLowerCase();
    const half = requestedGb / 2;
    const hasRequestedGB = ramName.includes(`${requestedGb}gb`) || ramName.includes(`${requestedGb} gb`)
      || ramName.includes(`2x${half}gb`) || ramName.includes(`2x${half} gb`);
    if (!hasRequestedGB) {
      warnings.push(`You requested ${requestedGb}GB RAM but the selected kit may differ. Check the product listing.`);
    }
  }

  if (build.Processor && build.Motherboard) {
    const cpuSocket = build.Processor.specs?.socket;
    const moboSocket = build.Motherboard.specs?.socket;
    const isKnown = (socket) => socket && socket !== 'UNKNOWN';

    if (isKnown(cpuSocket) && isKnown(moboSocket)) {
      if (cpuSocket !== moboSocket) {
        warnings.push(`⚠ INCOMPATIBLE: CPU socket (${cpuSocket}) does not match motherboard (${moboSocket}).`);
      }
    } else {
      // We could not read one of the sockets from the product name. That is "unverified",
      // not "incompatible" — don't alarm the user with a false INCOMPATIBLE.
      const unknownPart = !isKnown(cpuSocket) ? 'processor' : 'motherboard';
      warnings.push(`Couldn't confirm the CPU and motherboard share a socket (the ${unknownPart}'s socket isn't listed). Check the product pages before buying.`);
    }
  }

  if (build.RAM && build.Motherboard) {
    const moboRamType = build.Motherboard.specs?.ram_type;
    const selectedRamType = build.RAM.specs?.ram_type;
    if (moboRamType && moboRamType !== 'UNKNOWN' && selectedRamType && selectedRamType !== moboRamType) {
      warnings.push(`⚠ INCOMPATIBLE: RAM type (${selectedRamType}) does not match motherboard (${moboRamType}).`);
    }
  }

  return warnings;
}

/**
 * Estimate power draw and the PSU wattage the engine would recommend.
 * Single source of truth for the UI's power card.
 *
 * @returns {{ draw: number, recommended: number, psuWattage: number, loadPct: number }}
 */
export function estimatePower(build, intent, deps) {
  const cpu = build.Processor;
  const gpu = build["Graphics Card"];

  const cpuDraw = cpu ? (cpu.specs?.tdp || CPU_TDP.DEFAULT) : 0;
  const gpuDraw = gpu ? (gpu.specs?.tdp || GPU_TDP.DEFAULT) : SYSTEM_DRAW.INTEGRATED_GPU;
  const baseDraw = build.Motherboard ? SYSTEM_DRAW.BASE : 0;
  const draw = cpuDraw + gpuDraw + baseDraw;

  const recommended = deps.budgetAllocator.computeTargetPsuWattage(
    cpu || {},
    gpu || null,
    intent?.use_case || 'general',
    intent?.budget_bdt || 0
  );

  const psuWattage = build.PSU?.specs?.wattage || 0;
  const loadPct = psuWattage > 0 ? Math.round((draw / psuWattage) * 100) : 0;

  return { draw, recommended, psuWattage, loadPct };
}
