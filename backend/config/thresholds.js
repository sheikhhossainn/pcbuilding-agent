/**
 * Compatibility & Selection Thresholds
 * Used for GPU adequacy, CPU balancing, and part filtering
 */

export const GPU_ADEQUACY = {
  // Minimum VRAM for editing/professional work (GB)
  MIN_VRAM_EDITING_GB: 4,

  // GPU price thresholds for CPU tier requirements
  GPU_PRICE_REQUIRES_I9_RYZEN9_BDT: 220000,
  GPU_PRICE_REQUIRES_I7_RYZEN7_BDT: 140000,

  // Reject GPUs with these strings (office/display adapters)
  // Pattern: GT series without GTX/GTS qualifier
  REJECT_PATTERNS: [
    'ddr3', // Ancient VRAM type
  ],
};

export const CPU_GPU_BALANCE = {
  // GPU price threshold where only i9/Ryzen 9 allowed
  PREMIUM_GPU_PRICE_BDT: 220000,

  // GPU price threshold where i7/Ryzen 7 minimum
  MID_GPU_PRICE_BDT: 140000,
};

export const PART_SELECTION = {
  // Maximum parts to fetch per query from Supabase
  QUERY_LIMIT: 5000,

  // Minimum storage capacity acceptable for user (GB)
  // If user requests 2TB but only 1.8TB available, still acceptable (90% threshold)
  STORAGE_ACCEPTABLE_THRESHOLD: 0.7, // Accept 70% of required capacity (lenient for budget builds)

  // Cache TTL (Time To Live) in milliseconds
  // Cache entries older than this are discarded
  CACHE_TTL_MS: 30 * 60 * 1000, // 30 minutes

  // Price expansion tolerance when no exact match in range
  // For RAM/cooling: allows up to 25% overspend
  // For PSU: allows up to 50% overspend (PSU undersizing is critical)
  PRICE_EXPANSION_FACTOR_DEFAULT: 1.25,
  PRICE_EXPANSION_FACTOR_PSU: 1.5,

  // Minimum price delta required to consider as an upgrade (BDT)
  MIN_UPGRADE_DELTA_BDT: 1,
};

export const RATE_LIMITING = {
  // Rate limit window in milliseconds
  WINDOW_MS: 15 * 60 * 1000, // 15 minutes

  // Max requests per window for unauthenticated users
  MAX_REQUESTS_PER_WINDOW: 10,

  // Message to display when limit exceeded
  LIMIT_MESSAGE: "You've reached the free limit of 10 builds per 15 minutes. Please wait, or enter your own API key in the settings to continue immediately.",
};

export const API = {
  // Maximum message length for build requests (characters)
  MAX_MESSAGE_LENGTH: 2000,

  // Valid site identifiers
  VALID_SITES: ['startech', 'techland', 'computermania'],
};

export const AI = {
  // Primary LLM model for intent extraction (high accuracy)
  MODEL_PRIMARY_INTENT: 'llama-3.3-70b-versatile',

  // Fallback LLM model (faster, for rate limiting)
  MODEL_FALLBACK_INTENT: 'llama-3.1-8b-instant',

  // Model for explanation generation (always fast)
  MODEL_EXPLANATION: 'llama-3.1-8b-instant',

  // Temperature for intent extraction (lower = more deterministic)
  TEMPERATURE_INTENT: 0.1,

  // Temperature for explanation (slightly higher for variety)
  TEMPERATURE_EXPLANATION: 0.3,
};
