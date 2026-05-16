/**
 * Cache Manager Module
 * Provides unified caching interface with in-memory fallback and Redis option
 * Supports Promise deduplication to prevent cache stampede
 */

import { PART_SELECTION } from '../config/thresholds.js';

/**
 * Create cache manager with optional Redis support
 * Falls back to in-memory Map if Redis unavailable
 * 
 * @param {Object} deps - Dependencies
 * @param {Object} [deps.redisClient] - Optional Redis client (ioredis)
 * @param {boolean} [deps.useRedis] - Force use of Redis if available
 * @returns {Object} Unified cache interface
 */
export const createCacheManager = ({ redisClient = null, useRedis = false } = {}) => {
  const memoryCache = new Map();
  const pendingPromises = new Map(); // For stampede protection

  const hasRedis = useRedis && redisClient;

  /**
   * Generate consistent cache key
   * @param {string} category - Component category
   * @param {string} site - Retailer site
   * @param {number} minPrice - Minimum price
   * @param {number} maxPrice - Maximum price
   * @param {string} sortOrder - Sort order
   * @returns {string} Cache key
   */
  const generateKey = (site, category, minPrice, maxPrice, sortOrder) => {
    return `cache:${(site || '').toLowerCase()}:${category}:${minPrice || 0}-${maxPrice || 0}:${sortOrder || 'none'}`;
  };

  /**
   * Get from cache with stampede protection
   * If key is being fetched, return same promise (no duplicate queries)
   * 
   * @param {string} key - Cache key
   * @returns {Promise<Array|null>} Cached data or null if miss/expired
   */
  const get = async (key) => {
    // Check pending promises first (stampede protection)
    if (pendingPromises.has(key)) {
      console.log(`[Cache] ⚡ Stampede protection: reusing pending promise for ${key}`);
      return pendingPromises.get(key);
    }

    // Check Redis
    if (hasRedis) {
      try {
        const cached = await redisClient.get(key);
        if (cached) {
          console.log(`[Cache] ✓ Hit (Redis): ${key}`);
          return JSON.parse(cached);
        }
      } catch (error) {
        console.warn(`[Cache] Redis read failed, falling back to memory:`, error.message);
      }
    }

    // Check in-memory cache
    const entry = memoryCache.get(key);
    if (entry && Date.now() - entry.ts < PART_SELECTION.CACHE_TTL_MS) {
      console.log(`[Cache] ✓ Hit (Memory): ${key}`);
      return entry.data;
    }

    if (entry) {
      console.log(`[Cache] Expired (Memory): ${key}`);
      memoryCache.delete(key);
    }

    return null;
  };

  /**
   * Set cache value
   * Writes to both Redis and memory
   * 
   * @param {string} key - Cache key
   * @param {Array} data - Data to cache
   * @param {number} [ttlMs] - Time to live in milliseconds
   */
  const set = async (key, data, ttlMs = PART_SELECTION.CACHE_TTL_MS) => {
    // Store in memory
    memoryCache.set(key, { data, ts: Date.now() });

    // Store in Redis with TTL
    if (hasRedis) {
      try {
        const ttlSeconds = Math.ceil(ttlMs / 1000);
        await redisClient.setex(key, ttlSeconds, JSON.stringify(data));
        console.log(`[Cache] Set (Redis): ${key} TTL ${ttlSeconds}s`);
      } catch (error) {
        console.warn(`[Cache] Redis write failed:`, error.message);
      }
    } else {
      console.log(`[Cache] Set (Memory): ${key}`);
    }
  };

  /**
   * Wrap a data fetching function with caching and stampede protection
   * 
   * @param {string} key - Cache key
   * @param {Function} fetchFn - Async function to fetch data
   * @param {number} [ttlMs] - Cache TTL
   * @returns {Promise<Array>} Cached or fetched data
   */
  const getOrFetch = async (key, fetchFn, ttlMs = PART_SELECTION.CACHE_TTL_MS) => {
    // Try cache first
    const cached = await get(key);
    if (cached) return cached;

    // Stampede protection: if another request is already fetching, wait for it
    if (pendingPromises.has(key)) {
      console.log(`[Cache] ⚡ Waiting for pending fetch: ${key}`);
      return pendingPromises.get(key);
    }

    // Start new fetch
    const fetchPromise = (async () => {
      try {
        const data = await fetchFn();
        await set(key, data, ttlMs);
        return data;
      } finally {
        pendingPromises.delete(key);
      }
    })();

    // Track this promise for stampede protection
    pendingPromises.set(key, fetchPromise);

    return fetchPromise;
  };

  /**
   * Clear entire cache (useful for testing or invalidation)
   */
  const clear = async () => {
    memoryCache.clear();
    if (hasRedis) {
      try {
        const keys = await redisClient.keys('cache:*');
        if (keys.length > 0) {
          await redisClient.del(...keys);
          console.log(`[Cache] Cleared ${keys.length} Redis keys`);
        }
      } catch (error) {
        console.warn(`[Cache] Redis clear failed:`, error.message);
      }
    }
    console.log(`[Cache] Memory cache cleared`);
  };

  /**
   * Get cache statistics
   */
  const getStats = async () => {
    const memorySize = memoryCache.size;
    let redisKeys = 0;

    if (hasRedis) {
      try {
        redisKeys = await redisClient.dbsize();
      } catch (error) {
        console.warn(`[Cache] Failed to get Redis stats:`, error.message);
      }
    }

    return {
      mode: hasRedis ? 'Redis + Memory' : 'Memory only',
      memoryEntries: memorySize,
      redisEntries: redisKeys,
      ttlMs: PART_SELECTION.CACHE_TTL_MS,
    };
  };

  return {
    get,
    set,
    getOrFetch,
    clear,
    getStats,
    generateKey,
  };
};

export default createCacheManager;
