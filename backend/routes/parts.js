/**
 * Parts Routes
 * POST /api/parts/alternatives → compatible swap candidates for one category
 * POST /api/build/validate     → re-run compatibility + power checks on an edited build
 *
 * Request bodies come from the browser, so everything is re-validated and part specs
 * are re-inferred from names server-side instead of trusting client-supplied specs.
 */

import { API } from '../config/thresholds.js';
import { SWAPPABLE_CATEGORIES, findAlternatives } from '../engine/alternatives.js';
import { collectBuildWarnings, estimatePower } from '../engine/buildValidator.js';

const MAX_NAME_LENGTH = 300;
const MAX_URL_LENGTH = 500;
const USE_CASES = new Set(['gaming', 'editing', 'office', 'general']);

const finiteNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function sanitizeBuild(rawBuild, specInference) {
  if (!rawBuild || typeof rawBuild !== 'object' || Array.isArray(rawBuild)) return null;

  const build = {};
  for (const category of SWAPPABLE_CATEGORIES) {
    const part = rawBuild[category];
    if (!part || typeof part !== 'object') continue;
    if (typeof part.name !== 'string' || part.name.length === 0 || part.name.length > MAX_NAME_LENGTH) continue;
    const price = finiteNumber(part.price);
    if (price === null) continue;

    build[category] = {
      name: part.name,
      price,
      url: typeof part.url === 'string' ? part.url.slice(0, MAX_URL_LENGTH) : null,
      category,
      specs: specInference.inferSpecs(category, part.name),
    };
  }
  return build;
}

export function sanitizeIntent(rawIntent) {
  const intent = rawIntent && typeof rawIntent === 'object' ? rawIntent : {};
  const strategy = intent.component_strategy && typeof intent.component_strategy === 'object'
    ? intent.component_strategy
    : {};

  const minTb = finiteNumber(strategy['Storage']?.structured_reqs?.min_tb);
  const minGb = finiteNumber(strategy['RAM']?.structured_reqs?.min_gb);

  return {
    use_case: USE_CASES.has(intent.use_case) ? intent.use_case : 'general',
    budget_bdt: finiteNumber(intent.budget_bdt) ?? 0,
    component_strategy: {
      ...(minTb ? { Storage: { structured_reqs: { min_tb: minTb } } } : {}),
      ...(minGb ? { RAM: { structured_reqs: { min_gb: minGb } } } : {}),
    },
  };
}

/**
 * @param {Object} deps
 * @param {Object} deps.specInference
 * @param {Object} deps.compatibilityChecker
 * @param {Object} deps.budgetAllocator - only computeTargetPsuWattage is used
 */
export const createValidateHandler = ({ specInference, compatibilityChecker, budgetAllocator }) => {
  return (req, res) => {
    try {
      const build = sanitizeBuild(req.body?.build, specInference);
      if (!build) return res.status(400).json({ error: 'A build object is required.' });

      const intent = sanitizeIntent(req.body?.intent);
      const deps = { compatibilityChecker, budgetAllocator };

      res.json({
        warnings: collectBuildWarnings({ build, intent }, deps),
        power: estimatePower(build, intent, deps),
      });
    } catch (error) {
      console.error('[validate] Error:', error);
      res.status(500).json({ error: 'Failed to validate the build.' });
    }
  };
};

/**
 * @param {Object} deps
 * @param {Object|null} deps.partRepository - null when the database is not configured
 * @param {Object} deps.specInference
 * @param {Object} deps.compatibilityChecker
 * @param {Object} deps.budgetAllocator
 */
export const createAlternativesHandler = ({ partRepository, specInference, compatibilityChecker, budgetAllocator }) => {
  return async (req, res) => {
    try {
      const { category, site, limit } = req.body || {};

      if (!SWAPPABLE_CATEGORIES.includes(category)) {
        return res.status(400).json({ error: 'Unknown part category.' });
      }
      if (!API.VALID_SITES.includes(site)) {
        return res.status(400).json({ error: 'Unknown retailer.' });
      }
      if (!partRepository) {
        return res.status(503).json({ error: 'Part catalog is not available right now.' });
      }

      const build = sanitizeBuild(req.body?.build, specInference) || {};
      const intent = sanitizeIntent(req.body?.intent);

      const alternatives = await findAlternatives(
        { category, site, build, intent, limit },
        { partRepository, compatibilityChecker, budgetAllocator }
      );

      res.json({
        category,
        alternatives: alternatives.map((part) => ({
          name: part.name,
          price: part.price,
          url: part.url,
          image: part.image,
          in_stock: part.in_stock,
          category: part.category,
          specs: part.specs,
          updatedAt: part.updatedAt ?? null,
          delta: part.delta,
        })),
      });
    } catch (error) {
      console.error('[alternatives] Error:', error);
      const unreachable = String(error.message || '').includes('Database is currently unreachable');
      res.status(unreachable ? 503 : 500).json({
        error: unreachable
          ? 'The parts database is unreachable. Please try again in a moment.'
          : 'Failed to load alternatives.',
      });
    }
  };
};
