/**
 * Part Repository Module
 * Abstracts database queries for components
 * Makes it easy to mock for testing or swap data sources
 */

import { PART_SELECTION } from '../config/thresholds.js';
import { parseRamCapacityGb, parseStorageCapacityGb } from './capacity.js';
import { qualityScore } from './partQuality.js';

const CATEGORY_MAPPING = {
  'Processor': 'cpu',
  'Motherboard': 'motherboard',
  'RAM': 'ram',
  'Storage': 'storage',
  'Graphics Card': 'gpu',
  'PSU': 'psu',
  'Casing': 'casing',
  'CPU Cooler': 'cpu-cooler',
  'Monitor': 'monitor',
  'Mouse': 'mouse',
  'Keyboard': 'keyboard',
  'UPS': 'ups'
};

/**
 * Create part repository with dependency injection
 * @param {Object} deps - Dependencies
 * @param {Object} deps.db - libSQL (Turso) client
 * @param {Object} deps.specInference - Spec inference utilities
 * @param {Object} deps.cache - Cache manager
 * @returns {Object} Repository interface
 */
export const createPartRepository = ({ db, specInference, cache }) => {
  const dbClient = db;
  /**
   * Query parts from database with filters
   * Uses cache to avoid redundant queries
   * 
   * @param {string} site - Retailer site
   * @param {string} category - Component category
   * @param {Object} priceRange - {min, max} in BDT
   * @param {string} sortOrder - 'price_asc' or 'price_desc'
   * @returns {Promise<Array>} Array of Part objects
   */
  const query = async (site, category, priceRange, sortOrder) => {
    const cacheKey = cache.generateKey(site, category, priceRange?.min, priceRange?.max, sortOrder);

    // Try cache first
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    // Fetch from DB
    const dbCategory = CATEGORY_MAPPING[category];
    if (!dbCategory) {
      console.warn(`[Repo] Unknown category: ${category}`);
      return [];
    }

    try {
      const sqlParts = [
        'SELECT * FROM components WHERE site = ? AND category = ? AND in_stock = 1'
      ];
      const args = [site, dbCategory];

      if (priceRange?.min !== undefined && priceRange.min !== null) {
        sqlParts.push('AND price >= ?');
        args.push(Math.round(priceRange.min));
      }
      if (priceRange?.max !== undefined && priceRange.max !== null) {
        sqlParts.push('AND price <= ?');
        args.push(Math.round(priceRange.max));
      }

      const orderDirection = sortOrder === 'price_asc' ? 'ASC' : 'DESC';
      sqlParts.push(`ORDER BY price ${orderDirection}`);
      sqlParts.push('LIMIT ?');
      args.push(PART_SELECTION.QUERY_LIMIT);

      const sql = sqlParts.join(' ');
      const result = await dbClient.execute({ sql, args });
      const data = result.rows || [];

      console.log(`[Repo] Query for ${dbCategory} at ${site} returned ${data.length} items`);

      // Enrich with inferred specs
      const enriched = data.map(p => {
        let specsObj = {};
        if (p.specs) {
          if (typeof p.specs === 'object') {
            specsObj = p.specs;
          } else {
            try {
              specsObj = JSON.parse(p.specs);
            } catch (e) {
              specsObj = {};
            }
          }
        }
        return {
          name: p.name,
          price: Number(p.price),
          image: p.image,
          url: p.url,
          in_stock: Boolean(p.in_stock),
          // When the scraper last confirmed this listing (shown as "updated 2h ago")
          updatedAt: p.last_updated || null,
          category: category,
          specs: {
            ...specsObj,
            ...specInference.inferSpecs(category, p.name),
          }
        };
      });

      // Cache results
      await cache.set(cacheKey, enriched);
      return enriched;
    } catch (error) {
      // If it's already our rethrown network error, propagate it
      if (error.message?.includes('Database is currently unreachable')) {
        throw error;
      }
      // Unexpected errors (e.g. network failures caught at fetch level)
      const msg = error.message || '';
      const isNetwork = msg.includes('fetch failed') || msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT') || msg.includes('URL_INVALID') || msg.includes('SERVER_ERROR');
      if (isNetwork) {
        console.error(`[Repo] ❌ DATABASE UNREACHABLE while querying ${category}:`, msg);
        throw new Error(`Database is currently unreachable. Please try again in a moment.`);
      }
      console.error(`[Repo] Failed to query ${category}:`, error);
      return [];
    }
  };

  /**
   * Find cheapest part matching strategy
   * Applies keyword and structured requirement filters
   * 
   * @param {string} site - Retailer site
   * @param {string} category - Component category
   * @param {number} budget - Maximum price
   * @param {Object} strategy - Component strategy with filters
   * @returns {Promise<Object|null>} Cheapest matching part or null
   */
  const findCheapest = async (site, category, budget, strategy, filterFn) => {
    const parts = await query(site, category, { min: 0, max: budget }, 'price_asc');

    let totalChecked = 0;
    let strategyFail = 0;
    let filterFail = 0;

    for (const part of parts) {
      totalChecked++;
      if (!matchesStrategy(part, strategy, category)) {
        strategyFail++;
        continue;
      }
      if (filterFn && !filterFn(part)) {
        filterFail++;
        continue;
      }
      return part;
    }
    
    if (parts.length > 0) {
      console.log(`[Repo] findCheapest for ${category} returned null. Checked: ${totalChecked}, strategyFail: ${strategyFail}, filterFail: ${filterFail}`);
    }
    return null;
  };

  /**
   * Check if part matches strategy constraints
   * 
   * @param {Object} part - Part to check
   * @param {Object} strategy - Component strategy
   * @param {string} category - Component category
   * @returns {boolean} True if part meets all constraints
   */
  const matchesStrategy = (part, strategy, category) => {
    if (!strategy) return true;

    // Exclude keywords check (the user's/LLM's, plus engine defaults for non-PC listings)
    const excluded = [...(strategy.exclude_keywords || []), ...(strategy.default_excludes || [])];
    if (excluded.length > 0) {
      const partName = part.name.toLowerCase();
      for (const kw of excluded) {
        if (partName.includes(kw.toLowerCase())) return false;
      }
    }

    // Required keywords check (AND condition)
    if (strategy.required_keywords && strategy.required_keywords.length > 0) {
      const partName = part.name.toLowerCase();
      for (const kw of strategy.required_keywords) {
        const kwLower = kw.toLowerCase();
        if (!partName.includes(kwLower)) {
          // DDR type can be verified via inferred specs even if not in product name.
          // Many boards (e.g. LGA1200 H510) don't say "DDR4" because it's the only option.
          if ((kwLower === 'ddr4' || kwLower === 'ddr5' || kwLower === 'ddr3')
            && part.specs?.ram_type === kw.toUpperCase()) {
            continue; // Spec-verified match, skip name-based check
          }
          return false;
        }
      }
    }

    // Structured requirements check (category-specific)
    if (strategy.structured_reqs) {
      // "Better than / cheaper than the part I have": compared on the category's own quality scale.
      const { better_than: betterThan, worse_than: worseThan } = strategy.structured_reqs;
      if (typeof betterThan === 'number' && qualityScore(category, part) <= betterThan) return false;
      if (typeof worseThan === 'number' && qualityScore(category, part) >= worseThan) return false;

      if (category === 'PSU' && strategy.structured_reqs.min_wattage) {
        if ((part.specs?.wattage || 0) < strategy.structured_reqs.min_wattage) return false;
      }
      
      if (category === 'RAM' && strategy.structured_reqs.min_gb) {
        if (parseRamCapacityGb(part.name) < strategy.structured_reqs.min_gb) return false;
      }
      
      if (category === 'Storage' && strategy.structured_reqs.min_tb) {
        const capGB = parseStorageCapacity(part.name);
        if (capGB < strategy.structured_reqs.min_tb * 1000 * PART_SELECTION.STORAGE_ACCEPTABLE_THRESHOLD) return false;
      }
      
      if (category === 'Monitor' && strategy.structured_reqs.min_hz) {
        const hz = parseMonitorHz(part.name);
        const actualHz = hz || 60;
        if (actualHz < strategy.structured_reqs.min_hz) return false;
      }
    }

    return true;
  };

  /**
   * Parse storage capacity in GB from product name
   */
  const parseStorageCapacity = parseStorageCapacityGb;

  /**
   * Parse monitor refresh rate in Hz
   */
  const parseMonitorHz = (name) => {
    const match = name.toLowerCase().match(/(\d{2,3})\s*hz/);
    if (!match) return null;
    const hz = parseInt(match[1], 10);
    return Number.isFinite(hz) ? hz : null;
  };

  /**
   * Get all available sockets in motherboard inventory for a site
   * @param {string} site 
   * @returns {Promise<Set<string>>}
   */
  const getAvailableSockets = async (site) => {
    try {
      let sql = 'SELECT name, specs FROM components WHERE category = ? AND in_stock = 1';
      const args = ['motherboard'];

      if (site !== 'all') {
        sql += ' AND site = ?';
        args.push(site);
      }

      const result = await dbClient.execute({ sql, args });
      const data = result.rows || [];
      const enriched = data.map(p => ({
        ...p,
        specs: specInference.inferSpecs('Motherboard', p.name)
      }));

      if (enriched.length > 0) {
        console.log(`[Repo] First 5 motherboards at ${site}:`, enriched.slice(0, 5).map(p => `${p.name} -> ${p.specs.socket}`));
      }

      const sockets = new Set();
      enriched.forEach(m => {
        const socket = m.specs?.socket;
        if (socket && socket !== 'UNKNOWN') sockets.add(socket);
      });
      return sockets;
    } catch (e) {
      console.error(`[Repo] Failed to getAvailableSockets for ${site}:`, e);
      return new Set();
    }
  };

  const checkAvailability = async (url) => {
    try {
      const result = await dbClient.execute({
        sql: 'SELECT in_stock, price FROM components WHERE url = ? LIMIT 1',
        args: [url]
      });
      const row = result.rows?.[0];
      if (!row) return null;
      return {
        in_stock: Boolean(row.in_stock),
        price: Number(row.price)
      };
    } catch (e) {
      return null;
    }
  };

  /**
   * Stock and price for several listings in one round trip.
   * @param {string[]} urls
   * @returns {Promise<Map<string, {in_stock: boolean, price: number}>>} only the urls found; empty on error
   */
  const checkAvailabilityMany = async (urls) => {
    const unique = [...new Set((urls || []).filter(Boolean))];
    const found = new Map();
    if (unique.length === 0) return found;
    try {
      const result = await dbClient.execute({
        sql: `SELECT url, in_stock, price FROM components WHERE url IN (${unique.map(() => '?').join(',')})`,
        args: unique,
      });
      for (const row of result.rows || []) {
        found.set(row.url, { in_stock: Boolean(row.in_stock), price: Number(row.price) });
      }
    } catch (e) {
      // Same as checkAvailability: an unreadable row means the part is not trusted as available.
    }
    return found;
  };

  return {
    query,
    findCheapest,
    matchesStrategy,
    getAvailableSockets,
    checkAvailability,
    checkAvailabilityMany,
  };
};

export default createPartRepository;
