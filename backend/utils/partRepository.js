/**
 * Part Repository Module
 * Abstracts database queries for components
 * Makes it easy to mock for testing or swap data sources
 */

import { PART_SELECTION } from '../config/thresholds.js';

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
 * @param {Object} deps.supabase - Supabase client
 * @param {Object} deps.specInference - Spec inference utilities
 * @param {Object} deps.cache - Cache manager
 * @returns {Object} Repository interface
 */
export const createPartRepository = ({ supabase, specInference, cache }) => {
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
      let query = supabase
        .from('components')
        .select('*')
        .eq('site', site)
        .eq('category', dbCategory)
        .eq('in_stock', true);

      if (priceRange?.min !== undefined && priceRange.min !== null) {
        query = query.gte('price', Math.round(priceRange.min));
      }
      if (priceRange?.max !== undefined && priceRange.max !== null) {
        query = query.lte('price', Math.round(priceRange.max));
      }

      if (sortOrder === 'price_asc') {
        query = query.order('price', { ascending: true });
      } else {
        query = query.order('price', { ascending: false });
      }

      query = query.limit(PART_SELECTION.QUERY_LIMIT);

      const { data, error } = await query;
      console.log(`[Repo] Query for ${dbCategory} at ${site} returned ${data?.length || 0} items`);

      if (error) {
        console.error(`[Repo] Supabase error for ${dbCategory}:`, error);
        return [];
      }

      // Enrich with inferred specs
      const enriched = data.map(p => ({
        name: p.name,
        price: p.price,
        image: p.image,
        url: p.url,
        in_stock: p.in_stock,
        category: category,
        specs: {
          ...p.specs,
          ...specInference.inferSpecs(category, p.name),
        }
      }));

      // Cache results
      await cache.set(cacheKey, enriched);
      return enriched;
    } catch (error) {
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

    // Exclude keywords check
    if (strategy.exclude_keywords && strategy.exclude_keywords.length > 0) {
      const partName = part.name.toLowerCase();
      for (const kw of strategy.exclude_keywords) {
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
      if (category === 'PSU' && strategy.structured_reqs.min_wattage) {
        if ((part.specs?.wattage || 0) < strategy.structured_reqs.min_wattage) return false;
      }
      
      if (category === 'RAM' && strategy.structured_reqs.min_gb) {
        const gb = strategy.structured_reqs.min_gb;
        const name = part.name.toLowerCase();
        
        let totalGb = 0;
        const m = name.match(/(\d+)\s*(?:gb|g)\b/);
        if (m) {
          totalGb = parseInt(m[1]);
          if (name.includes('2x') || name.includes('x2')) {
            // If name is "2x8GB", total is already 16 in many cases, but let's be safe
            if (totalGb <= gb / 2) totalGb *= 2;
          }
        }
        
        if (totalGb < gb) return false;
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
  const parseStorageCapacity = (name) => {
    const n = name.toLowerCase();
    const tbMatch = n.match(/(\d+(?:\.\d+)?)\s*tb/);
    if (tbMatch) return parseFloat(tbMatch[1]) * 1000;
    const gbMatch = n.match(/(\d+)\s*gb/);
    if (gbMatch) {
      const gb = parseInt(gbMatch[1]);
      return gb >= 120 ? gb : 0;
    }
    return 0;
  };

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
    const query = supabase
      .from('components')
      .select('name, specs')
      .eq('category', 'motherboard');
    
    if (site !== 'all') {
      query.eq('site', site);
    }
    
    const { data } = await query;
    const enriched = (data || []).map(p => ({
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
  };

  const checkAvailability = async (url) => {
    try {
      const { data, error } = await supabase
        .from('components')
        .select('in_stock, price')
        .eq('url', url)
        .single();
      if (error || !data) return null;
      return data;
    } catch (e) {
      return null;
    }
  };

  return {
    query,
    findCheapest,
    matchesStrategy,
    getAvailableSockets,
    checkAvailability,
  };
};

export default createPartRepository;
