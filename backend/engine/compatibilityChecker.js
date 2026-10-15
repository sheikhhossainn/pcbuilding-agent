/**
 * Compatibility Checker Module
 * Validates CPU/GPU/RAM/PSU compatibility constraints
 */

import { GPU_ADEQUACY, CPU_GPU_BALANCE } from '../config/thresholds.js';

/**
 * Create compatibility checker with dependency injection
 * @param {Object} deps - Dependencies
 * @param {Object} deps.config - Configuration object (used for future customization)
 * @returns {Object} Compatibility checker interface
 */
// Memory generations each socket can actually drive. LGA1700 boards ship in both DDR4 and DDR5
// flavours, so the board (not the CPU) decides there.
const SOCKET_RAM_TYPES = {
  AM5: ['DDR5'],
  AM4: ['DDR4'],
  LGA1851: ['DDR5'],
  LGA1700: ['DDR4', 'DDR5'],
  LGA1200: ['DDR4'],
  LGA1151: ['DDR4'],
  LGA1155: ['DDR3'],
  LGA1150: ['DDR3'],
};

export const createCompatibilityChecker = ({ config = {} } = {}) => {
  /**
   * Check if GPU is adequate for the specified use case
   * Rejects ancient/office-grade GPUs and insufficient VRAM
   * 
   * @param {Object} gpu - GPU part object with name/specs
   * @param {string} useCase - Build purpose: 'gaming' | 'editing' | 'office' | 'general'
   * @returns {boolean} True if GPU is suitable
   */
  const isGpuAdequateForUseCase = (gpu, useCase) => {
    if (!gpu) return true;
    const n = gpu.name.toLowerCase();

    // Reject GPUs with DDR3 VRAM — too old for any real workload
    if (n.includes('ddr3')) return false;

    // Reject GT series (not GTX/RTX) for demanding workloads
    if (useCase === 'editing' || useCase === 'gaming') {
      // GT 610, GT 710, GT 730, GT 1030 etc. are office-only
      if (/\bgt\s*\d/i.test(n) && !/gtx/i.test(n) && !/gts/i.test(n)) return false;
      // Reject Radeon HD 5000/6000 series (ancient)
      if (/\bhd\s*[56]\d{3}/i.test(n)) return false;
      // Display-adapter class cards that are no better than a modern iGPU: RX 500-550, old
      // R5/R7/R9, GTX 7xx, Arc A310, and workstation/pro lines (not tuned for games).
      if (/\brx\s?5[0-5]0\b/i.test(n)) return false;
      if (/\br[579]\s?[23]\d{2}\b/i.test(n)) return false;
      if (/\bgtx\s?7\d{2}\b/i.test(n)) return false;
      if (/\barc\s?a3[01]0\b/i.test(n)) return false;
      if (/\b(?:workstation|quadro)\b|\barc\s+pro\b/i.test(n)) return false;
      // Require at least 4GB VRAM for editing
      if (useCase === 'editing') {
        const vramMatch = n.match(/(\d+)\s*gb/);
        if (vramMatch && parseInt(vramMatch[1]) < GPU_ADEQUACY.MIN_VRAM_EDITING_GB) return false;
      }
    }
    return true;
  };

  /**
   * Check if CPU is balanced with GPU (prevent bottlenecks)
   * Higher-end GPUs require correspondingly high-end CPUs
   * 
   * @param {Object} cpu - CPU part object
   * @param {Object} gpu - GPU part object
   * @returns {boolean} True if CPU tier matches GPU tier
   */
  const isCpuBalanced = (cpu, gpu) => {
    if (!gpu || !cpu) return true;
    const n = cpu.name.toLowerCase();
    
    if (gpu.price >= CPU_GPU_BALANCE.PREMIUM_GPU_PRICE_BDT) {
      // Only i9/Ryzen 9 allowed above this price
      if (!n.includes('i9') && !n.includes('ryzen 9')) return false;
    } else if (gpu.price >= CPU_GPU_BALANCE.MID_GPU_PRICE_BDT) {
      // i7/Ryzen 7 minimum above this price
      if (!n.includes('i9') && !n.includes('i7') && !n.includes('ryzen 9') && !n.includes('ryzen 7')) return false;
    }
    return true;
  };

  /**
   * Check if CPU has integrated graphics
   * Used to validate GPU requirement when user requests no dGPU
   * 
   * @param {Object} cpu - CPU part object
   * @returns {boolean} True if CPU has iGPU
   */
  const cpuHasIntegratedGraphics = (cpu) => {
    if (!cpu) return false;
    const n = cpu.name.toLowerCase();
    
    // F-suffix detection via regex on model numbers (e.g., i5-12400F, 7600F, 13700KF)
    const hasFSuffix = /i[3579]-?\d{4,5}k?f\b/i.test(n) || /ryzen\s*\d\s*\d{4}f\b/i.test(n);
    
    if (n.includes('amd') || n.includes('ryzen') || n.includes('athlon') || n.includes('radeon')) {
      // Ryzen 7000/9000/8000 (AM5) have iGPUs by default unless they have F-suffix
      if (cpu.specs?.socket === 'AM5' || n.match(/ryzen\s*[3-9]\s*[789]\d{3}/)) {
        return !hasFSuffix;
      }
      // Older AMD: only G-series APUs have iGPU
      return n.includes('g ') || n.includes('ge ') || n.includes('g-') || /\d+g\b/.test(n) || n.includes('graphics') || n.includes('radeon');
    }
    if (n.includes('intel') || n.includes('core') || n.includes('pentium') || n.includes('celeron')) {
      return !hasFSuffix;
    }
    return true; // Fail-open
  };

  /**
   * Check if CPU iGPU is adequate for the use case
   * @param {Object} cpu - Component
   * @param {string} useCase - Build use case
   * @returns {boolean}
   */
  const isCpuIntegratedGpuAdequate = (cpu, useCase) => {
    if (!cpuHasIntegratedGraphics(cpu)) return false;

    // Gaming/Editing need capable iGPU (Ryzen G-series, AM5, or modern Intel Core 12th gen+)
    if (useCase === 'gaming' || useCase === 'editing') {
      const name = cpu.name.toLowerCase();
      // Ryzen G/GE APUs
      if (name.includes('ryzen') && (name.includes(' g') || name.includes('ge') || /\d+g\b/.test(name))) {
        return true;
      }
      // AM5 Ryzen processors with integrated RDNA graphics
      if (cpu.specs?.socket === 'AM5' || /ryzen\s*[3-9]\s*[789]\d{3}/i.test(name)) {
        return true;
      }
      // Modern Intel with UHD 770 or better (12th gen+ or Core Ultra)
      const gen = cpu.specs?.gen || 0;
      if (cpu.specs?.brand === 'intel' && (gen >= 12 || name.includes('ultra'))) {
        return true;
      }
      return false;
    }
    return true; // For office/general, any iGPU is fine
  };

  /**
   * Check if CPU is considered modern enough for the budget
   * @param {Object} cpu - Component
   * @param {number} totalBudget - Total PC budget
   * @returns {boolean}
   */
  const isCpuModern = (cpu, totalBudget) => {
    if (!cpu || !cpu.specs) return true;
    if (totalBudget < 40000) return true; // On ultra-budget, everything is fair game
    
    const brand = cpu.specs?.brand;
    const gen = cpu.specs?.gen || 0;
    const name = cpu.name.toLowerCase();

    if (brand === 'intel') {
      if (gen > 0 && gen < 10) return false;
      // Also check for older model numbers not caught by gen
      if (name.includes('i7-4') || name.includes('i5-4') || name.includes('i3-4')) return false;
      if (name.includes('i7-3') || name.includes('i5-3') || name.includes('i3-3')) return false;
    }
    if (brand === 'amd') {
      if (gen > 0 && gen < 3000) return false;
      if (name.includes('athlon') && !name.includes('3000')) return false;
      if (name.includes('fx-')) return false;
    }
    return true;
  };

  /**
   * Check CPU-Motherboard socket compatibility
   * 
   * @param {Object} cpu - CPU part with specs.socket
   * @param {Object} motherboard - Motherboard part with specs.socket
   * @returns {boolean} True if sockets match
   */
  const isSocketCompatible = (cpu, motherboard) => {
    // If specs are missing, infer from name
    let cpuSocket = cpu?.specs?.socket || inferSocketFromName(cpu?.name || '');
    let mbSocket = motherboard?.specs?.socket || inferSocketFromName(motherboard?.name || '');

    // Normalize UNKNOWN to null
    if (cpuSocket === 'UNKNOWN') cpuSocket = null;
    if (mbSocket === 'UNKNOWN') mbSocket = null;

    // If we can't determine socket, allow it (fail-open)
    if (!cpuSocket || !mbSocket) {
      // But if we know the brands, they MUST match
      const cpuBrand = cpu?.specs?.brand;
      const mbBrand = motherboard?.specs?.brand;
      if (cpuBrand && mbBrand && cpuBrand !== 'unknown' && mbBrand !== 'unknown' && cpuBrand !== mbBrand) {
        return false;
      }
      return true;
    }
    
    // Exact socket match required
    if (cpuSocket !== mbSocket) return false;

    // Chipset specific constraints for AM4
    if (cpuSocket === 'AM4') {
      const cpuName = (cpu?.name || '').toLowerCase();
      const mbName = (motherboard?.name || '').toLowerCase();
      
      // B550 and A520 do not support 3400G, 3200G, 2000 series, 1000 series, or older Athlons
      if (mbName.includes('b550') || mbName.includes('a520')) {
        if (cpuName.includes('3400g') || cpuName.includes('3200g') || cpuName.match(/ryzen\s*[357]\s*[12]\d{3}/) || cpuName.includes('athlon')) {
          return false;
        }
      }
    }

    return true;
  };

  /**
   * Infer socket type from component name
   * @param {string} name - Component name
   * @returns {string|null} Socket type (AM4, AM5, LGA1700, etc.) or null
   */
  const inferSocketFromName = (name) => {
    if (!name) return null;
    const n = name.toUpperCase();
    
    // AMD sockets
    if (n.includes('AM5')) return 'AM5';
    if (n.includes('AM4')) return 'AM4';
    if (n.includes('AM3')) return 'AM3';
    
    // Intel sockets — check longer strings first to avoid substring collisions
    if (n.includes('LGA1851')) return 'LGA1851';
    if (n.includes('LGA1700')) return 'LGA1700';
    if (n.includes('LGA1200')) return 'LGA1200';
    if (n.includes('LGA1155')) return 'LGA1155';
    if (n.includes('LGA1151')) return 'LGA1151';
    if (n.includes('LGA1150')) return 'LGA1150';
    
    return null;
  };

  /**
   * Check RAM-Motherboard type compatibility (DDR4 vs DDR5)
   * 
   * @param {Object} motherboard - Motherboard part with specs.ram_type
   * @param {Object} ram - RAM part with specs.ram_type
   * @returns {boolean} True if RAM type matches motherboard
   */
  const isRamTypeCompatible = (motherboard, ram) => {
    let mbRamType = motherboard?.specs?.ram_type || inferRamTypeFromName(motherboard?.name || '');
    let ramType = ram?.specs?.ram_type || inferRamTypeFromName(ram?.name || '');

    // Normalize UNKNOWN to null
    if (mbRamType === 'UNKNOWN') mbRamType = null;
    if (ramType === 'UNKNOWN') ramType = null;

    if (!ramType) return true; // can't tell what the kit is (fail-open)
    if (mbRamType) return mbRamType === ramType;

    // Board's memory type isn't in its name: fall back to what its socket can drive, so a
    // DDR3 kit is never paired with a modern board just because the listing was terse.
    const socket = motherboard?.specs?.socket && motherboard.specs.socket !== 'UNKNOWN'
      ? motherboard.specs.socket
      : inferSocketFromName(motherboard?.name || '');
    const allowed = SOCKET_RAM_TYPES[socket];
    return allowed ? allowed.includes(ramType) : true;
  };

  /**
   * Can this CPU's socket run the given memory generation?
   * @param {Object} cpu - CPU part
   * @param {string} ramType - 'DDR3' | 'DDR4' | 'DDR5'
   * @returns {boolean} True when supported or when the socket is unknown (fail-open)
   */
  const cpuSupportsRamType = (cpu, ramType) => {
    if (!ramType) return true;
    const socket = cpu?.specs?.socket && cpu.specs.socket !== 'UNKNOWN'
      ? cpu.specs.socket
      : inferSocketFromName(cpu?.name || '');
    const allowed = SOCKET_RAM_TYPES[socket];
    return allowed ? allowed.includes(ramType.toUpperCase()) : true;
  };

  /**
   * Infer RAM type from component name
   * @param {string} name - Component name
   * @returns {string|null} RAM type (DDR4, DDR5, etc.) or null
   */
  const inferRamTypeFromName = (name) => {
    if (!name) return null;
    const n = name.toUpperCase();
    
    if (n.includes('DDR5')) return 'DDR5';
    if (n.includes('DDR4')) return 'DDR4';
    if (n.includes('DDR3')) return 'DDR3';
    
    return null;
  };

  /**
   * Validate all major compatibility constraints
   * 
   * @param {Object} params - Validation parameters
   * @param {Object} params.build - Selected build (all components)
   * @param {Object} params.intent - User's build intent
   * @returns {Object} {valid: boolean, issues: string[]}
   */
  const validateBuild = (params) => {
    const { build, intent } = params;
    const issues = [];

    // CPU-Motherboard socket
    if (build.Processor && build.Motherboard) {
      if (!isSocketCompatible(build.Processor, build.Motherboard)) {
        issues.push(`Socket mismatch: CPU ${build.Processor.specs?.socket} vs Motherboard ${build.Motherboard.specs?.socket}`);
      }
    }

    // RAM-Motherboard type
    if (build.RAM && build.Motherboard) {
      if (!isRamTypeCompatible(build.Motherboard, build.RAM)) {
        issues.push(`RAM type mismatch: ${build.RAM.specs?.ram_type} vs Motherboard ${build.Motherboard.specs?.ram_type}`);
      }
    }

    // GPU-CPU balance
    if (build["Graphics Card"] && build.Processor) {
      if (!isCpuBalanced(build.Processor, build["Graphics Card"])) {
        issues.push(`CPU may bottleneck GPU (${build.Processor.name} with ${build["Graphics Card"].name})`);
      }
    }

    // GPU adequacy for use case
    if (build["Graphics Card"]) {
      if (!isGpuAdequateForUseCase(build["Graphics Card"], intent.use_case)) {
        issues.push(`GPU may be inadequate for ${intent.use_case}`);
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  };

  return {
    isGpuAdequateForUseCase,
    isCpuBalanced,
    cpuHasIntegratedGraphics,
    isCpuIntegratedGpuAdequate,
    isCpuModern,
    isSocketCompatible,
    isRamTypeCompatible,
    cpuSupportsRamType,
    validateBuild,
  };
};

export default createCompatibilityChecker;
