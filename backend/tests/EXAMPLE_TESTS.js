/**
 * Jest Test Examples for BuildMyPC Backend
 * 
 * Run: npm test -- tests/
 * Run (watch): npm test -- tests/ --watch
 * 
 * Each module can be tested independently with mocked dependencies
 */

// ─────────────────────────────────────────────────────────────
// tests/config/budget.test.js
// ─────────────────────────────────────────────────────────────

describe('Budget Configuration', async () => {
  test('ceiling cap is enforced at max addon', async () => {
    const { BUDGET } = await import('../../config/budget.js');
    const budget = 500000; // 500K BDT

    const ceiling = budget + Math.min(
      budget * BUDGET.CEILING_OVERSPEND_PERCENTAGE,
      BUDGET.CEILING_OVERSPEND_MAX_BDT
    );

    // 500K + (500K * 0.03) = 515K, but capped at 500K + 12K = 512K
    expect(ceiling).toBe(512000);
  });

  test('minimum budget threshold is enforced', async () => {
    const { BUDGET } = await import('../../config/budget.js');
    expect(BUDGET.MIN_BUDGET_BDT).toBe(20000);
  });
});

// ─────────────────────────────────────────────────────────────
// tests/engine/compatibilityChecker.test.js
// ─────────────────────────────────────────────────────────────

describe('Compatibility Checker', async () => {
  let checker;

  beforeEach(async () => {
    const { createCompatibilityChecker } = await import('../../engine/compatibilityChecker.js');
    checker = createCompatibilityChecker();
  });

  test('should reject DDR5 RAM on AM4 motherboard', async () => {
    const cpu = {
      name: 'AMD Ryzen 5 5600X',
      specs: { socket: 'AM4', brand: 'amd' }
    };
    const motherboard = {
      name: 'MSI B450-A PRO MAX',
      specs: { socket: 'AM4', ram_type: 'DDR4' }
    };
    const ram = {
      name: 'Kingston Fury 32GB DDR5',
      specs: { ram_type: 'DDR5' }
    };

    const result = checker.isRamTypeCompatible(ram, motherboard);
    expect(result).toBe(false);
  });

  test('should allow DDR5 RAM on AM5 motherboard', async () => {
    const motherboard = {
      name: 'MSI B650 CARBON WIFI',
      specs: { socket: 'AM5', ram_type: 'DDR5' }
    };
    const ram = {
      name: 'Corsair Vengeance 32GB DDR5',
      specs: { ram_type: 'DDR5' }
    };

    const result = checker.isRamTypeCompatible(ram, motherboard);
    expect(result).toBe(true);
  });

  test('CPU-GPU balance: RTX 4090 requires i9/Ryzen 9', async () => {
    const cpu = {
      name: 'Intel Core i7-13700K',
      specs: { brand: 'intel' }
    };
    const gpu = {
      name: 'NVIDIA GeForce RTX 4090',
      price: 250000 // Above premium threshold
    };

    const result = checker.isCpuBalanced(cpu, gpu);
    expect(result).toBe(false);
  });

  test('GPU adequacy: GT 710 rejected for gaming', async () => {
    const gpu = {
      name: 'NVIDIA GeForce GT 710',
      specs: {}
    };

    const result = checker.isGpuAdequateForUseCase(gpu, 'gaming');
    expect(result).toBe(false);
  });

  test('GPU adequacy: RTX 4070 accepted for gaming', async () => {
    const gpu = {
      name: 'NVIDIA GeForce RTX 4070',
      specs: { gpu_brand: 'nvidia' }
    };

    const result = checker.isGpuAdequateForUseCase(gpu, 'gaming');
    expect(result).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// tests/engine/budgetAllocator.test.js
// ─────────────────────────────────────────────────────────────

describe('Budget Allocator', async () => {
  let allocator;

  beforeEach(async () => {
    const { createBudgetAllocator } = await import('../../engine/budgetAllocator.js');
    const mockRepo = {
      findCheapest: jest.fn().mockResolvedValue({ price: 100000 })
    };
    const mockChecker = {};
    allocator = createBudgetAllocator({ partRepository: mockRepo, compatChecker: mockChecker });
  });

  test('should compute PSU wattage with GPU', async () => {
    const cpu = { specs: { tdp: 105 } };
    const gpu = { specs: { tdp: 320 } };

    const targetWattage = allocator.computeTargetPsuWattage(cpu, gpu);

    // (105 + 320) * 1.4 + 100 = 595 + 100 = 695W → round to 700W
    expect(targetWattage).toBe(700);
  });

  test('should compute PSU wattage without GPU', async () => {
    const cpu = { specs: { tdp: 105 } };

    const targetWattage = allocator.computeTargetPsuWattage(cpu, null);

    // (105 + 0) * 1.3 + 60 = 136.5 + 60 = 196.5W → round to 200W
    expect(targetWattage).toBe(200);
  });

  test('should allocate budgets proportional to weights', async () => {
    const blueprint = {
      component_strategy: {
        'Processor': { weight: 20, required: true },
        'Graphics Card': { weight: 40, required: true },
        'RAM': { weight: 10, required: true },
        'Monitor': { weight: 0, required: false },
      },
      minimums: {
        'Processor': 50000,
        'Graphics Card': 100000,
        'RAM': 20000,
      }
    };

    const budgets = allocator.allocateBudgets({
      blueprint,
      totalFloor: 170000,
      budgetCeiling: 220000,
      site: 'startech'
    });

    const leftover = 220000 - 170000; // 50000
    const totalWeight = 20 + 40 + 10; // 70

    // Processor: 50K + (20/70 * 50K) = 50K + 14.28K ≈ 64K
    expect(budgets['Processor']).toBeCloseTo(50000 + (20/70 * 50000), -3);

    // GPU: 100K + (40/70 * 50K) = 100K + 28.57K ≈ 129K
    expect(budgets['Graphics Card']).toBeCloseTo(100000 + (40/70 * 50000), -3);

    // RAM: 20K + (10/70 * 50K) = 20K + 7.14K ≈ 27K
    expect(budgets['RAM']).toBeCloseTo(20000 + (10/70 * 50000), -3);
  });
});

// ─────────────────────────────────────────────────────────────
// tests/utils/cacheManager.test.js
// ─────────────────────────────────────────────────────────────

describe('Cache Manager', () => {
  let cache;

  beforeEach(async () => {
    const { createCacheManager } = await import('../../utils/cacheManager.js');
    cache = createCacheManager({ redisClient: null, useRedis: false });
  });

  test('should cache data and retrieve it', async () => {
    const key = 'test:data';
    const testData = [{ name: 'part1', price: 1000 }];

    await cache.set(key, testData);
    const retrieved = await cache.get(key);

    expect(retrieved).toEqual(testData);
  });

  test('should respect TTL expiration', async () => {
    const key = 'test:expiring';
    const testData = [{ name: 'part1' }];

    // Set with 100ms TTL
    await cache.set(key, testData, 100);

    // Should hit immediately
    let retrieved = await cache.get(key);
    expect(retrieved).toEqual(testData);

    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 150));

    // Should now miss
    retrieved = await cache.get(key);
    expect(retrieved).toBeNull();
  });

  test('should provide stampede protection', async () => {
    const key = 'test:stampede';
    let fetchCount = 0;

    const slowFetch = async () => {
      fetchCount++;
      await new Promise(resolve => setTimeout(resolve, 50));
      return [{ name: 'expensive', price: 10000 }];
    };

    // Start 3 concurrent fetches for same key
    const promise1 = cache.getOrFetch(key, slowFetch);
    const promise2 = cache.getOrFetch(key, slowFetch);
    const promise3 = cache.getOrFetch(key, slowFetch);

    await Promise.all([promise1, promise2, promise3]);

    // Should only have fetched once, not three times
    expect(fetchCount).toBe(1);
  });

  test('should generate consistent cache keys', async () => {
    const key1 = cache.generateKey('startech', 'Processor', 50000, 100000, 'price_asc');
    const key2 = cache.generateKey('startech', 'Processor', 50000, 100000, 'price_asc');

    expect(key1).toBe(key2);
  });
});

// ─────────────────────────────────────────────────────────────
// tests/utils/specInference.test.js
// ─────────────────────────────────────────────────────────────

describe('Spec Inference', async () => {
  let inference;

  beforeEach(async () => {
    const { createSpecInference } = await import('../../utils/specInference.js');
    inference = createSpecInference();
  });

  test('should infer CPU socket from product name (AM5)', async () => {
    const specs = inference.inferSpecs('Processor', 'AMD Ryzen 9 7900X3D Socket AM5');
    expect(specs.socket).toBe('AM5');
    expect(specs.ram_type).toBe('DDR5');
  });

  test('should infer CPU socket from product name (LGA1700)', async () => {
    const specs = inference.inferSpecs('Processor', 'Intel Core i9-13900K LGA1700');
    expect(specs.socket).toBe('LGA1700');
  });

  test('should infer CPU TDP from model tier', async () => {
    const specs9 = inference.inferSpecs('Processor', 'AMD Ryzen 9 7950X');
    expect(specs9.tdp).toBe(125);

    const specs7 = inference.inferSpecs('Processor', 'Intel Core i7-13700K');
    expect(specs7.tdp).toBe(105);

    const specs5 = inference.inferSpecs('Processor', 'AMD Ryzen 5 7600');
    expect(specs5.tdp).toBe(65);
  });

  test('should infer GPU TDP from model', async () => {
    const specs4090 = inference.inferSpecs('Graphics Card', 'NVIDIA RTX 4090 24GB');
    expect(specs4090.tdp).toBe(450);

    const specs4070 = inference.inferSpecs('Graphics Card', 'NVIDIA RTX 4070 12GB');
    expect(specs4070.tdp).toBe(220);

    const specs4060 = inference.inferSpecs('Graphics Card', 'NVIDIA RTX 4060 6GB');
    expect(specs4060.tdp).toBe(160);
  });

  test('should infer PSU wattage from product name', async () => {
    const specs750 = inference.inferSpecs('PSU', 'Corsair RM850x 850W 80+ Gold');
    expect(specs750.wattage).toBe(850);

    const specs650 = inference.inferSpecs('PSU', 'EVGA SuperNOVA 650 G5');
    expect(specs650.wattage).toBe(650);
  });

  test('should default to 500W for unclear PSU names', async () => {
    const specs = inference.inferSpecs('PSU', 'Generic Power Supply Pro');
    expect(specs.wattage).toBe(500);
  });
});

// ─────────────────────────────────────────────────────────────
// Integration test example
// ─────────────────────────────────────────────────────────────

describe('Integration: Budget Allocation Flow', () => {
  test('should calculate floor prices and allocate budgets', async () => {
    const { createBudgetAllocator } = await import('../../engine/budgetAllocator.js');
    
    // Mock repository
    const mockRepo = {
      findCheapest: jest.fn(async (site, category, budget, strategy) => ({
        name: `${category} Component`,
        price: Math.floor(budget * 0.5),
        specs: {}
      }))
    };

    const allocator = createBudgetAllocator({
      partRepository: mockRepo,
      compatChecker: {}
    });

    const blueprint = {
      component_strategy: {
        'Processor': { weight: 15, required: true, required_keywords: [], exclude_keywords: [], structured_reqs: {} },
        'Graphics Card': { weight: 30, required: true, required_keywords: [], exclude_keywords: [], structured_reqs: {} },
        'RAM': { weight: 10, required: true, required_keywords: [], exclude_keywords: [], structured_reqs: {} },
      },
      minimums: {}
    };

    const floorResult = await allocator.calculateFloorPrices({
      blueprint,
      budgetCeiling: 400000,
      site: 'startech'
    });

    expect(floorResult.error).toBeNull();
    expect(floorResult.totalFloor).toBeGreaterThan(0);

    const budgets = allocator.allocateBudgets({
      blueprint: floorResult.updatedBlueprint,
      totalFloor: floorResult.totalFloor,
      budgetCeiling: 400000,
      site: 'startech'
    });

    expect(budgets['Processor']).toBeGreaterThan(0);
    expect(budgets['Graphics Card']).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────
// Jest Configuration: jest.config.js
// ─────────────────────────────────────────────────────────────

// export default {
//   testEnvironment: 'node',
//   transform: {},
//   testMatch: ['**/tests/**/*.test.js'],
//   collectCoverageFrom: [
//     'ai/**/*.js',
//     'engine/**/*.js',
//     'utils/**/*.js',
//     '!utils/errors.js', // Config, less important to test
//   ],
//   coverageThreshold: {
//     global: {
//       branches: 70,
//       functions: 70,
//       lines: 70,
//       statements: 70,
//     },
//   },
// };

// ─────────────────────────────────────────────────────────────
// package.json scripts section:
// ─────────────────────────────────────────────────────────────

// "scripts": {
//   "start": "node server.js",
//   "test": "jest",
//   "test:watch": "jest --watch",
//   "test:coverage": "jest --coverage"
// }
