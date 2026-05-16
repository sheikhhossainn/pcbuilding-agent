/**
 * CPU & GPU TDP (Thermal Design Power) Heuristics
 * Used for PSU sizing calculations
 * 
 * Sources:
 * - AMD: Official specs + Zen 5 estimates
 * - Intel: LGA1700 lineup specs
 * - NVIDIA/AMD GPU: Official TDP documentation
 * 
 * Note: These are ESTIMATES for parts without explicit TDP in product names.
 * Conservative estimates preferred to avoid PSU undersizing.
 */

export const CPU_TDP = {
  // Default CPU TDP when brand/model cannot be inferred
  DEFAULT: 65,

  // High-power CPUs (i9, Ryzen 9)
  HIGH_END: 125,

  // Mid-range CPUs (i7, Ryzen 7)
  MID_RANGE: 105,

  // Budget CPUs (i5, Ryzen 5, etc.)
  BUDGET: 65,
};

export const GPU_TDP = {
  // Default GPU TDP when model cannot be inferred
  DEFAULT: 180,

  // Flagship GPUs (RTX/RX 5090, RTX 4090)
  FLAGSHIP: 450,

  // High-end gaming (RTX 4080, RTX 4070 Ti, RX 7900 XT)
  HIGH_END: 320,

  // Mid-range gaming (RTX 4070, RX 7800 XT)
  MID_RANGE: 220,

  // Budget gaming (RTX 4060, RX 7600)
  BUDGET: 160,

  // Ultra-budget / integrated graphics
  INTEGRATED: 50,
};

export const GPU_MODEL_TDP_MAP = {
  // RTX 50-series (current gen)
  '5090': 450,
  '5080': 320,
  '5070': 220,
  '5060': 180,

  // RTX 40-series
  '4090': 450,
  '4080': 320,
  '4070': 220,
  '4060': 160,

  // RX 9000-series (AMD current)
  '9070': 250,
  '9050': 180,

  // RX 7000-series (AMD previous)
  '7900': 320,
  '7800': 250,
  '7700': 220,
  '7600': 160,
};

export const PSU_WATTAGE = {
  // Default PSU wattage when power rating unclear
  DEFAULT: 500,

  // Minimum PSU wattage for any build
  MINIMUM: 300,

  // Maximum reasonable PSU wattage to prevent false positives in name parsing
  MAXIMUM: 1600,

  // Valid PSU wattage range for regex matching
  RANGE_MIN: 300,
  RANGE_MAX: 1600,

  // Base PSU wattage requirements by use case
  BASE_OFFICE: 400,
  BASE_GENERAL: 500,
  BASE_GAMING: 650,
  BASE_EDITING: 700,
  BASE_WORKSTATION: 850,
};

/**
 * PSU multiplier heuristic:
 * Required Wattage = (CPU_TDP + GPU_TDP) * MULTIPLIER + ADDITIVE
 * Multiplier: 1.3-1.4x for headroom (efficiency curve, spikes)
 * Additive: Buffer for other components (drives, USB, etc.)
 */
export const PSU_SIZING = {
  MULTIPLIER_WITH_GPU: 1.4,
  MULTIPLIER_WITHOUT_GPU: 1.3,
  ADDITIVE_WITH_GPU: 100,
  ADDITIVE_WITHOUT_GPU: 60,
};
