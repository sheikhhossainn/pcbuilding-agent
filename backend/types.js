/**
 * JSDoc Type Definitions for BuildMyPC Backend
 * 
 * These provide IDE autocomplete and type checking for key objects.
 * Usage: Import and use in JSDoc comments to get type checking benefits
 * without needing TypeScript transpilation.
 * 
 * @example
 * import * as Types from './types.js';
 * 
 * // In function:
 * /** @type {Types.Part} *\/
 * const processor = selectedParts.Processor;
 */

/**
 * @typedef {Object} ComponentStrategy
 * @property {number} weight - Budget allocation weight relative to other components
 * @property {string[]} required_keywords - Keywords that MUST appear in product name (AND condition)
 * @property {string[]} exclude_keywords - Keywords that MUST NOT appear in product name
 * @property {Object.<string, number>} structured_reqs - Numerical requirements (min_gb, min_hz, min_tb, min_wattage)
 * @property {boolean} required - Whether this component is mandatory for the build
 */
export const ComponentStrategy = {};

/**
 * @typedef {Object} BuildIntent
 * @property {number|null} budget_bdt - User's budget in Bangladeshi Taka
 * @property {Object.<string, ComponentStrategy>} component_strategy - Strategy per component category
 * @property {string|null} preferred_site - Preferred vendor: 'startech' | 'techland' | 'computermania'
 * @property {string|null} preferred_cpu_brand - CPU preference: 'amd' | 'intel'
 * @property {string|null} preferred_gpu_brand - GPU preference: 'nvidia' | 'amd'
 * @property {string} use_case - Build purpose: 'gaming' | 'editing' | 'office' | 'general'
 * @property {boolean} [no_gpu] - Whether GPU should be excluded
 */
export const BuildIntent = {};

/**
 * @typedef {Object} PartSpecs
 * @property {string} [brand] - Brand name ('amd', 'intel', 'nvidia', etc.)
 * @property {string} [socket] - CPU socket ('AM5', 'LGA1700', etc.)
 * @property {string} [ram_type] - RAM type ('DDR4', 'DDR5', etc.)
 * @property {number} [tdp] - Thermal Design Power in watts
 * @property {number} [wattage] - PSU power rating in watts
 * @property {number} [min_gb] - RAM capacity in GB
 * @property {string} [gpu_brand] - GPU brand ('nvidia', 'amd')
 */
export const PartSpecs = {};

/**
 * @typedef {Object} Part
 * @property {string} name - Product name from retailer
 * @property {number} price - Price in BDT
 * @property {string} image - URL to product image
 * @property {string} url - Direct link to product page
 * @property {boolean} in_stock - Whether part is currently in stock
 * @property {string} category - Component category (e.g., 'Processor', 'RAM')
 * @property {PartSpecs} specs - Inferred/parsed specifications
 */
export const Part = {};

/**
 * @typedef {Object} SelectedBuild
 * @property {Part|null} Processor
 * @property {Part|null} Motherboard
 * @property {Part|null} RAM
 * @property {Part|null} Storage
 * @property {Part|null} ["Graphics Card"]
 * @property {Part|null} PSU
 * @property {Part|null} Casing
 * @property {Part|null} ["CPU Cooler"]
 * @property {Part|null} Monitor
 * @property {Part|null} Mouse
 * @property {Part|null} Keyboard
 */
export const SelectedBuild = {};

/**
 * @typedef {Object} FloorPriceResult
 * @property {Object.<string, number>} minimums - Cheapest price for each required component (BDT)
 * @property {number} totalFloor - Sum of all minimum prices (BDT)
 * @property {string|null} error - Error message if floor check failed, null if successful
 */
export const FloorPriceResult = {};

/**
 * @typedef {Object} BuildResponse
 * @property {SelectedBuild} build - Selected components for the build
 * @property {number} total - Total cost in BDT
 * @property {string} explanation - Human-readable explanation of build choices
 * @property {BuildIntent} intent - Extracted and processed user intent
 * @property {string[]} warnings - Compatibility warnings (not fatal, but worth noting)
 */
export const BuildResponse = {};

/**
 * @typedef {Object} AppError
 * @property {number} status - HTTP status code (400, 500, etc.)
 * @property {string} message - User-facing error message
 * @property {string} [code] - Error code for frontend to handle specific cases
 * @property {string} [details] - Internal debugging details (not sent to user)
 */
export const AppError = {};

/**
 * @typedef {Object} PriceRange
 * @property {number} min - Minimum acceptable price (BDT)
 * @property {number} max - Maximum acceptable price (BDT)
 */
export const PriceRange = {};

export default {
  ComponentStrategy,
  BuildIntent,
  PartSpecs,
  Part,
  SelectedBuild,
  FloorPriceResult,
  BuildResponse,
  AppError,
  PriceRange,
};
