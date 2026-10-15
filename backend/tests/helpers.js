import { createCompatibilityChecker } from '../engine/compatibilityChecker.js';
import { createBudgetAllocator } from '../engine/budgetAllocator.js';
import { createSpecInference } from '../utils/specInference.js';

export const specInference = createSpecInference();
export const compatibilityChecker = createCompatibilityChecker();
// Only the pure power-sizing math is used in tests, so no repository is needed.
export const budgetAllocator = createBudgetAllocator({ partRepository: null, compatChecker: compatibilityChecker });

export const deps = { compatibilityChecker, budgetAllocator };

/** Build a part the way partRepository would: name + price + inferred specs. */
export function part(category, name, price, extra = {}) {
  return {
    name,
    price,
    url: `https://shop.test/${encodeURIComponent(name)}`,
    in_stock: true,
    category,
    specs: specInference.inferSpecs(category, name),
    ...extra,
  };
}

/** Minimal Express-like response double. */
export function fakeRes() {
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) { res.statusCode = code; return res; },
    json(payload) { res.body = payload; return res; },
  };
  return res;
}
