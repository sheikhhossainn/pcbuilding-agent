/**
 * Budget & Cost Allocation Constants
 * Source: Bangladesh market analysis + testing with ~100 builds
 */

export const BUDGET = {
  // Minimum viable budget for a functional PC build
  MIN_BUDGET_BDT: 20000,

  // Budget ceiling: allows small overspend to find better parts
  // 3% buffer up to 12,000 BDT (prevents tiny budgets from over-allocating)
  CEILING_OVERSPEND_PERCENTAGE: 0.03,
  CEILING_OVERSPEND_MAX_BDT: 12000,

  // Underspend tolerance: acceptable gap between budget and actual spend
  // 0.5% of budget or max 1,500 BDT — whichever is smaller
  UNDERSPEND_TOLERANCE_PERCENTAGE: 0.005,
  UNDERSPEND_TOLERANCE_MAX_BDT: 1500,

  // Budget tiers for PSU sizing heuristics
  HIGH_END_THRESHOLD_BDT: 150000,
  MID_RANGE_THRESHOLD_BDT: 40000,

  // Rebalancing iterations: high-end builds get more passes to spend leftover budget
  REBALANCE_ITERATIONS_HIGH_END: 7,
  REBALANCE_ITERATIONS_DEFAULT: 6,

  // Minimum gap required in rebalance loop to consider an upgrade
  REBALANCE_MIN_GAP_BDT: 200,

  // Overspend factor for fallback: allows PSUs to exceed budget more liberally
  FALLBACK_OVERSPEND_FACTOR_PSU: 1.5,
  FALLBACK_OVERSPEND_FACTOR_DEFAULT: 1.25,
};
