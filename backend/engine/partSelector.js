/**
 * Part Selection Engine
 * Finds and selects optimal components within budget constraints
 * Handles fallback logic and price expansion
 */

import { PART_SELECTION } from '../config/thresholds.js';

/**
 * Create part selector with dependency injection
 * @param {Object} deps - Dependencies
 * @param {Object} deps.partRepository - Interface for querying parts
 * @param {Object} deps.compatChecker - Compatibility validation
 * @returns {Object} Part selector interface
 */
export const createPartSelector = ({ partRepository, compatChecker }) => {
  /**
   * Select a single part from candidates, optionally filtered
   * 
   * @param {string} site - Retailer site
   * @param {string} category - Component category
   * @param {Object} priceRange - {min, max} in BDT
   * @param {string} sortOrder - 'price_asc' or 'price_desc'
   * @param {Function} filterFn - Optional filter predicate
   * @returns {Promise<Object|null>} Best matching part or null
   */
  const selectPart = async (site, category, priceRange, sortOrder, filterFn) => {
    const parts = await partRepository.query(site, category, priceRange, sortOrder);

    if (!filterFn) return parts[0] || null;

    const candidates = parts.filter(filterFn);
    return candidates[0] || null;
  };

  /**
   * Select part with intelligent fallback strategy
   * Tries: exact range → above range → below range → survival range
   * 
   * @param {string} site - Retailer site
   * @param {string} category - Component category
   * @param {Object} range - {min, max} in BDT
   * @param {string} sortOrder - 'price_asc' or 'price_desc'
   * @param {Function} filterFn - Part filter predicate
   * @param {number} globalRemaining - Total budget remaining
   * @returns {Promise<Object|null>} Selected part with fallback
   */
  const selectWithFallback = async (site, category, range, sortOrder, filterFn, globalRemaining) => {
    let part = await selectPart(site, category, range, sortOrder, filterFn);

    if (!part && range && range.max > 0) {
      // Calculate expansion factor (PSU can expand more than other parts)
      const expansionFactor = category === 'PSU'
        ? PART_SELECTION.PRICE_EXPANSION_FACTOR_PSU
        : PART_SELECTION.PRICE_EXPANSION_FACTOR_DEFAULT;

      const fallbackMax = Math.max(
        range.max,
        Math.min(Math.round(range.max * expansionFactor), globalRemaining || Infinity)
      );

      // Try: above allocated range
      if (fallbackMax > range.max) {
        const aboveRange = { min: range.max, max: fallbackMax };
        part = await selectPart(site, category, aboveRange, 'price_asc', filterFn);
      }

      // Try: below allocated range
      if (!part) {
        const belowRange = { min: 0, max: range.min };
        part = await selectPart(site, category, belowRange, 'price_desc', filterFn);
      }

      // Try: survival range (anything available)
      if (!part && fallbackMax > 0) {
        const survivalRange = { min: 0, max: fallbackMax };
        part = await selectPart(site, category, survivalRange, 'price_asc', filterFn);
      }

      // Don't fallback to different sites — respect user's site preference
      // Return null if preferred site has no compatible parts
    }

    return part;
  };

  /**
   * Upgrade a selected component to better model within new budget
   * 
   * @param {string} site - Retailer site
   * @param {string} category - Component category
   * @param {Object} currentPart - Current selection
   * @param {Object} newBudgetRange - Expanded budget {min, max}
   * @param {Function} filterFn - Compatibility filter
   * @returns {Promise<Object|null>} Better part or null
   */
  const upgradeComponent = async (site, category, currentPart, newBudgetRange, filterFn) => {
    const upgradeRange = {
      min: currentPart.price + 1,
      max: newBudgetRange.max,
    };

    if (upgradeRange.max <= upgradeRange.min) return null;

    const upgraded = await selectPart(site, category, upgradeRange, 'price_desc', filterFn);
    return (upgraded && upgraded.price > currentPart.price) ? upgraded : null;
  };

  return {
    selectPart,
    selectWithFallback,
    upgradeComponent,
  };
};

export default createPartSelector;
