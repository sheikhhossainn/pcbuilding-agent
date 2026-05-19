/**
 * Spec Inference Module
 * Extracts component specifications from product names via pattern matching
 * Used when database specs are incomplete
 */

import { CPU_TDP, GPU_TDP, GPU_MODEL_TDP_MAP, PSU_WATTAGE } from '../config/tdpHeuristics.js';

/**
 * Create spec inference engine
 * @returns {Object} Inference interface
 */
export const createSpecInference = () => {
  /**
   * Infer specifications from product name
   * Extracts: brand, socket, RAM type, TDP, wattage, etc.
   * 
   * @param {string} category - Component category
   * @param {string} name - Product name
   * @returns {Object} Inferred specs object
   */
  const inferSpecs = (category, name) => {
    const specs = {};
    if (!name) return specs;
    const n = name.toLowerCase();

    // ──── CPU SPECS ────
    if (category === 'Processor') {
      // Brand detection
      if (n.includes('amd') || n.includes('ryzen') || n.includes('athlon') || n.includes('threadripper')) {
        specs.brand = 'amd';
      } else if (n.includes('intel') || n.includes('core i') || n.includes('pentium') || n.includes('celeron')) {
        specs.brand = 'intel';
      } else {
        specs.brand = 'unknown';
      }

      // Generation detection
      const genMatch = n.match(/(\d+)(?:th|st|nd|rd)\s*gen/);
      if (genMatch) {
        specs.gen = parseInt(genMatch[1]);
      } else {
        const intelGenMatch = n.match(/i[3579]-(\d+)\d{2}/);
        if (intelGenMatch) {
          specs.gen = parseInt(intelGenMatch[1]);
        } else if (n.includes('ryzen')) {
          const ryzenGenMatch = n.match(/ryzen\s*\d+\s*(\d)\d{3}/);
          if (ryzenGenMatch) specs.gen = parseInt(ryzenGenMatch[1]) * 1000;
        } else if (n.match(/(?:pentium|celeron)/)) {
          // Pentium/Celeron G-series socket mapping by model number
          const pentiumMatch = n.match(/g(\d)(\d)\d{2}/);
          if (pentiumMatch) {
            const firstDigit = parseInt(pentiumMatch[1]);
            const secondDigit = parseInt(pentiumMatch[2]);
            if (firstDigit >= 7) specs.gen = 12;                          // G7xxx: Alder Lake (LGA1700)
            else if (firstDigit >= 6) specs.gen = 10;                     // G6xxx: Comet Lake (LGA1200)
            else if (firstDigit === 5 && secondDigit >= 9) specs.gen = 10; // G59xx: Comet Lake (LGA1200)
            else if (firstDigit >= 4) specs.gen = 8;                      // G4xxx-G58xx: Coffee/Kaby Lake (LGA1151)
          }
        }
      }

      // Socket detection
      if (n.includes('am5') || n.includes('b650') || n.includes('x670') || n.includes('a620') || n.includes('x870') || (specs.gen >= 7000 && n.includes('ryzen'))) {
        specs.socket = 'AM5';
        specs.ram_type = 'DDR5';
      } else if (n.includes('am4') || n.includes('b450') || n.includes('b550') || n.includes('x570') || n.includes('a320') || n.includes('a520') || (specs.gen >= 1000 && specs.gen < 7000 && n.includes('ryzen'))) {
        specs.socket = 'AM4';
        specs.ram_type = 'DDR4';
      } else if (n.includes('lga1851') || n.includes('lga 1851') || n.includes('z890') || n.includes('b860') || n.includes('ultra 9') || n.includes('ultra 7') || n.includes('ultra 5')) {
        specs.socket = 'LGA1851';
        specs.ram_type = 'DDR5';
      } else if (n.includes('lga1700') || n.includes('lga 1700') || n.includes('h610') || n.includes('b660') || n.includes('b760') || n.includes('z690') || n.includes('z790') || (specs.gen >= 12 && specs.gen <= 14)) {
        specs.socket = 'LGA1700';
        specs.ram_type = (n.includes('ddr4')) ? 'DDR4' : (n.includes('ddr5') ? 'DDR5' : 'UNKNOWN');
      } else if (n.includes('lga1200') || n.includes('lga 1200') || n.includes('h410') || n.includes('b460') || n.includes('h510') || n.includes('b560') || specs.gen === 10 || specs.gen === 11) {
        specs.socket = 'LGA1200';
        specs.ram_type = 'DDR4';
      } else if (n.includes('lga1151') || n.includes('lga 1151') || n.includes('h110') || n.includes('b250') || n.includes('h310') || n.includes('b360') || n.includes('b365') || (specs.gen >= 6 && specs.gen <= 9)) {
        specs.socket = 'LGA1151';
        specs.ram_type = 'DDR4';
      } else if (n.includes('lga1155') || n.includes('lga 1155') || n.includes('h61') || n.includes('b75') || specs.gen === 2 || specs.gen === 3) {
        specs.socket = 'LGA1155';
        specs.ram_type = 'DDR3';
      } else if (n.includes('lga1150') || n.includes('lga 1150') || n.includes('h81') || n.includes('b85') || specs.gen === 4) {
        specs.socket = 'LGA1150';
        specs.ram_type = 'DDR3';
      } else {
        specs.socket = 'UNKNOWN';
        specs.ram_type = (n.includes('ddr5')) ? 'DDR5' : (n.includes('ddr4') ? 'DDR4' : 'UNKNOWN');
      }

      // TDP estimation
      if (n.includes('i9') || n.includes('ryzen 9')) {
        specs.tdp = CPU_TDP.HIGH_END;
      } else if (n.includes('i7') || n.includes('ryzen 7')) {
        specs.tdp = CPU_TDP.MID_RANGE;
      } else {
        specs.tdp = CPU_TDP.DEFAULT;
      }
    }

    // ──── MOTHERBOARD SPECS ────
    if (category === 'Motherboard') {
      // Socket and Brand detection
      if (n.includes('am5') || n.includes('b650') || n.includes('x670') || n.includes('a620') || n.includes('x870')) {
        specs.socket = 'AM5';
        specs.ram_type = 'DDR5';
        specs.brand = 'amd';
      } else if (n.includes('am4') || n.includes('b450') || n.includes('b550') || n.includes('x570') || n.includes('a320') || n.includes('a520')) {
        specs.socket = 'AM4';
        specs.ram_type = 'DDR4';
        specs.brand = 'amd';
      } else if (n.includes('lga1851') || n.includes('lga 1851') || n.includes('z890') || n.includes('b860')) {
        specs.socket = 'LGA1851';
        specs.ram_type = 'DDR5';
        specs.brand = 'intel';
      } else if (n.includes('lga1700') || n.includes('lga 1700') || n.includes('h610') || n.includes('b660') || n.includes('b760') || n.includes('z690') || n.includes('z790')) {
        specs.socket = 'LGA1700';
        specs.ram_type = (n.includes('ddr5')) ? 'DDR5' : (n.includes('ddr4') ? 'DDR4' : 'UNKNOWN');
        specs.brand = 'intel';
      } else if (n.includes('lga1200') || n.includes('lga 1200') || n.includes('h410') || n.includes('b460') || n.includes('h510') || n.includes('b560')) {
        specs.socket = 'LGA1200';
        specs.ram_type = 'DDR4';
        specs.brand = 'intel';
      } else if (n.includes('lga1151') || n.includes('lga 1151') || n.includes('h110') || n.includes('b250') || n.includes('h310') || n.includes('b360') || n.includes('b365')) {
        specs.socket = 'LGA1151';
        specs.ram_type = 'DDR4';
        specs.brand = 'intel';
      } else if (n.includes('lga1150') || n.includes('lga 1150') || n.includes('h81') || n.includes('b85')) {
        specs.socket = 'LGA1150';
        specs.ram_type = 'DDR3';
        specs.brand = 'intel';
      } else if (n.includes('lga1155') || n.includes('lga 1155') || n.includes('h61') || n.includes('b75')) {
        specs.socket = 'LGA1155';
        specs.ram_type = 'DDR3';
        specs.brand = 'intel';
      } else if (n.includes('lga2011') || n.includes('x79') || n.includes('x99')) {
        specs.socket = 'LGA2011';
        specs.brand = 'intel';
      } else if (n.includes('n100') || n.includes('j4105') || n.includes('j4125') || n.includes('n5105')) {
        specs.socket = 'INTEGRATED';
        specs.brand = 'intel';
      } else if (n.includes('a320') || n.includes('b350') || n.includes('x370') || n.includes('b450') || n.includes('x470') || n.includes('a520') || n.includes('b550') || n.includes('x570')) {
        specs.socket = 'AM4';
        specs.brand = 'amd';
      } else if (n.includes('a620') || n.includes('b650') || n.includes('x670') || n.includes('b850') || n.includes('x870')) {
        specs.socket = 'AM5';
        specs.brand = 'amd';
      } else if (n.includes('h61') || n.includes('b75')) {
        specs.socket = 'LGA1155';
        specs.brand = 'intel';
      } else if (n.includes('h81') || n.includes('b85') || n.includes('h97') || n.includes('z97')) {
        specs.socket = 'LGA1150';
        specs.brand = 'intel';
      } else if (n.includes('h110') || n.includes('b150') || n.includes('b250') || n.includes('h310') || n.includes('b360') || n.includes('b365') || n.includes('z370') || n.includes('z390')) {
        specs.socket = 'LGA1151';
        specs.brand = 'intel';
      } else if (n.includes('h410') || n.includes('b460') || n.includes('h510') || n.includes('b560')) {
        specs.socket = 'LGA1200';
        specs.brand = 'intel';
      } else if (n.includes('h610') || n.includes('b660') || n.includes('b760') || n.includes('z690') || n.includes('z790')) {
        specs.socket = 'LGA1700';
        specs.brand = 'intel';
      } else {
        specs.socket = 'UNKNOWN';
        specs.brand = 'unknown';
      }
    }

    // ──── RAM SPECS ────
    if (category === 'RAM') {
      if (n.includes('ddr5')) specs.ram_type = 'DDR5';
      else if (n.includes('ddr4')) specs.ram_type = 'DDR4';
      else if (n.includes('ddr3')) specs.ram_type = 'DDR3';
      else specs.ram_type = 'UNKNOWN';
    }

    // ──── GPU SPECS ────
    if (category === 'Graphics Card') {
      // Brand detection
      if (n.includes('nvidia') || n.includes('geforce') || n.includes('rtx') || n.includes('gtx')) {
        specs.gpu_brand = 'nvidia';
      } else if (n.includes('radeon') || n.includes('rx ')) {
        specs.gpu_brand = 'amd';
      } else {
        specs.gpu_brand = 'unknown';
      }

      // TDP estimation from model number
      let tdp = GPU_TDP.DEFAULT;
      for (const [model, modelTdp] of Object.entries(GPU_MODEL_TDP_MAP)) {
        if (n.includes(model)) {
          tdp = modelTdp;
          break;
        }
      }
      specs.tdp = tdp;
    }

    // ──── PSU SPECS ────
    if (category === 'PSU') {
      // First try: explicit "Xw" or "X watt" in name — always trust this
      const explicitMatch = n.match(/(\d+)\s*(?:w\b|watt)/i);
      if (explicitMatch) {
        specs.wattage = parseInt(explicitMatch[1]);
      } else {
        // Fallback: guess from 3-4 digit numbers (only within valid PSU range)
        const candidates = [...n.matchAll(/(\d{3,4})/g)];
        let found = false;
        for (const c of candidates) {
          const w = parseInt(c[1]);
          if (w >= PSU_WATTAGE.RANGE_MIN && w <= PSU_WATTAGE.RANGE_MAX) {
            specs.wattage = w;
            found = true;
            break;
          }
        }
        if (!found) specs.wattage = PSU_WATTAGE.DEFAULT;
      }
    }

    return specs;
  };

  return {
    inferSpecs,
  };
};

export default createSpecInference;
