/**
 * Alternatives Finder
 * Given a build and a category, returns in-stock parts for that category that stay
 * compatible with the rest of the build, closest in price to the current part first.
 * Backs the "Swap part" drawer.
 */

export const SWAPPABLE_CATEGORIES = [
  'Processor', 'Motherboard', 'RAM', 'Storage', 'Graphics Card',
  'PSU', 'CPU Cooler', 'Casing', 'Monitor', 'Mouse', 'Keyboard', 'UPS',
];

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;

/**
 * @param {Object} params
 * @param {string} params.category
 * @param {string} params.site
 * @param {Object} params.build - category -> part (specs already inferred)
 * @param {Object} params.intent - { use_case, budget_bdt }
 * @param {number} [params.limit]
 * @param {Object} deps
 * @param {Object} deps.partRepository
 * @param {Object} deps.compatibilityChecker
 * @param {Object} deps.budgetAllocator
 */
export async function findAlternatives({ category, site, build, intent, limit = DEFAULT_LIMIT }, deps) {
  const { partRepository, compatibilityChecker: cc, budgetAllocator } = deps;
  const useCase = intent?.use_case || 'general';
  const budget = intent?.budget_bdt || 0;

  const current = build[category] || null;
  const cpu = build.Processor || null;
  const mobo = build.Motherboard || null;
  const ram = build.RAM || null;
  const gpu = build["Graphics Card"] || null;
  const psu = build.PSU || null;

  const targetPsu = (cpuPart, gpuPart) =>
    budgetAllocator.computeTargetPsuWattage(cpuPart || {}, gpuPart || null, useCase, budget);

  const accept = (part) => {
    switch (category) {
      case 'Processor': {
        if (mobo) {
          if (!cc.isSocketCompatible(part, mobo)) return false;
          const cpuRam = part.specs?.ram_type;
          const moboRam = mobo.specs?.ram_type;
          if (cpuRam && cpuRam !== 'UNKNOWN' && moboRam && moboRam !== 'UNKNOWN' && cpuRam !== moboRam) return false;
        }
        if (gpu && !cc.isCpuBalanced(part, gpu)) return false;
        if (psu?.specs?.wattage && psu.specs.wattage < targetPsu(part, gpu)) return false;
        return true;
      }
      case 'Motherboard': {
        if (part.specs?.socket === 'UNKNOWN' || part.specs?.socket === 'INTEGRATED') return false;
        if (cpu) {
          if (!cc.isSocketCompatible(cpu, part)) return false;
          const cpuRam = cpu.specs?.ram_type;
          const moboRam = part.specs?.ram_type;
          if (cpuRam && cpuRam !== 'UNKNOWN' && moboRam && moboRam !== 'UNKNOWN' && cpuRam !== moboRam) return false;
        }
        if (ram && !cc.isRamTypeCompatible(part, ram)) return false;
        return true;
      }
      case 'RAM': {
        if (mobo) return cc.isRamTypeCompatible(mobo, part);
        if (cpu) {
          const cpuRam = cpu.specs?.ram_type;
          const ramType = part.specs?.ram_type;
          if (cpuRam && cpuRam !== 'UNKNOWN' && ramType && ramType !== 'UNKNOWN' && cpuRam !== ramType) return false;
        }
        return true;
      }
      case 'Graphics Card': {
        if (!cc.isGpuAdequateForUseCase(part, useCase)) return false;
        if (cpu && !cc.isCpuBalanced(cpu, part)) return false;
        if (psu?.specs?.wattage && psu.specs.wattage < targetPsu(cpu, part)) return false;
        return true;
      }
      case 'PSU':
        return (part.specs?.wattage || 0) >= targetPsu(cpu, gpu);
      default:
        return true;
    }
  };

  const all = await partRepository.query(site, category, { min: 0, max: null }, 'price_asc');
  const currentPrice = current?.price ?? null;

  const candidates = all.filter((part) => {
    if (current && (part.url === current.url || part.name === current.name)) return false;
    return accept(part);
  });

  const cappedLimit = Math.min(Math.max(1, Number(limit) || DEFAULT_LIMIT), MAX_LIMIT);

  // Nearest in price to what the user has now, then show cheapest first.
  const nearest = currentPrice === null
    ? candidates.slice(0, cappedLimit)
    : [...candidates]
        .sort((a, b) => Math.abs(a.price - currentPrice) - Math.abs(b.price - currentPrice))
        .slice(0, cappedLimit);

  return nearest
    .sort((a, b) => a.price - b.price)
    .map((part) => ({
      ...part,
      delta: currentPrice === null ? null : part.price - currentPrice,
    }));
}
