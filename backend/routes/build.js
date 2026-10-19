/**
 * Build Route Handler
 * POST /api/build  → enqueue job, return { jobId, position, estimatedWait }
 * POST /api/build/cross-check → enqueue a cross-check of a finished build, return { jobId }
 * GET  /api/build/:jobId → poll for job status / result (both kinds of job)
 */

import { createJob, getJobStatus } from '../utils/queueManager.js';
import { sendError, ERROR_INVALID_MESSAGE, ERROR_INVALID_SITE, ERROR_INVALID_KEYS } from '../utils/errors.js';
import { API } from '../config/thresholds.js';
import { SWAPPABLE_CATEGORIES } from '../engine/alternatives.js';

const MAX_PART_NAME_LENGTH = 300;
const MAX_URL_LENGTH = 500;
const MAX_KEYWORDS = 10;
const MAX_KEYWORD_LENGTH = 40;
const MIN_BUDGET = 0;
const MAX_BUDGET = 5000000;
const USE_CASES = new Set(['gaming', 'editing', 'office', 'general']);
const CPU_BRANDS = new Set(['amd', 'intel']);
const GPU_BRANDS = new Set(['nvidia', 'amd']);
const SPEC_REQ_KEYS = ['min_gb', 'min_hz', 'min_tb', 'min_wattage'];

const finiteIn = (value, min, max) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

const cleanWords = (raw) => (Array.isArray(raw) ? raw : [])
  .filter((w) => typeof w === 'string' && w.trim().length > 0)
  .slice(0, MAX_KEYWORDS)
  .map((w) => w.replace(/\s+/g, ' ').trim().slice(0, MAX_KEYWORD_LENGTH));

/**
 * The previous intent comes back from the browser and is placed in the LLM prompt and used to
 * decide which parts stay locked. Rebuild it from known fields only: free-form strings, unknown
 * categories and extra keys never reach the prompt or the engine.
 * Returns null when nothing usable is left (the request then runs as a fresh build).
 */
export function sanitizePreviousIntent(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const budget = finiteIn(raw.budget_bdt, MIN_BUDGET, MAX_BUDGET);
  if (!budget) return null;

  const rawStrategy = raw.component_strategy && typeof raw.component_strategy === 'object' ? raw.component_strategy : {};
  const component_strategy = {};
  for (const category of SWAPPABLE_CATEGORIES) {
    const strat = rawStrategy[category];
    if (!strat || typeof strat !== 'object') continue;
    const structured_reqs = {};
    for (const key of SPEC_REQ_KEYS) {
      const value = finiteIn(strat.structured_reqs?.[key], 0, 100000);
      if (value !== null) structured_reqs[key] = value;
    }
    component_strategy[category] = {
      weight: finiteIn(strat.weight, 0, 10) ?? 1,
      required: strat.required === true,
      required_keywords: cleanWords(strat.required_keywords),
      exclude_keywords: cleanWords(strat.exclude_keywords),
      structured_reqs,
      ...(Array.isArray(strat.default_excludes) ? { default_excludes: cleanWords(strat.default_excludes) } : {}),
    };
  }
  if (Object.keys(component_strategy).length === 0) return null;

  const defaults = {};
  for (const key of ['RAM', 'Storage']) if (raw._defaults?.[key] === true) defaults[key] = true;

  return {
    budget_bdt: budget,
    use_case: USE_CASES.has(raw.use_case) ? raw.use_case : 'general',
    no_gpu: raw.no_gpu === true,
    preferred_site: API.VALID_SITES.includes(raw.preferred_site) ? raw.preferred_site : null,
    preferred_cpu_brand: CPU_BRANDS.has(raw.preferred_cpu_brand) ? raw.preferred_cpu_brand : null,
    preferred_gpu_brand: GPU_BRANDS.has(raw.preferred_gpu_brand) ? raw.preferred_gpu_brand : null,
    ...(API.VALID_SITES.includes(raw._applied_site) ? { _applied_site: raw._applied_site } : {}),
    ...(Object.keys(defaults).length > 0 ? { _defaults: defaults } : {}),
    component_strategy,
  };
}

/**
 * Parts kept from a previous build arrive from the browser. Keep only well-formed fields so a
 * tampered payload cannot inject non-numeric prices or oversized strings into the engine.
 */
export function sanitizePreviousBuild(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const category of SWAPPABLE_CATEGORIES) {
    const part = raw[category];
    if (!part || typeof part !== 'object') continue;
    const price = Number(part.price);
    if (typeof part.name !== 'string' || part.name.length === 0 || part.name.length > MAX_PART_NAME_LENGTH) continue;
    if (!Number.isFinite(price) || price < 0) continue;
    out[category] = {
      name: part.name,
      price,
      url: typeof part.url === 'string' ? part.url.slice(0, MAX_URL_LENGTH) : null,
      category,
      ...(part.image && typeof part.image === 'string' ? { image: part.image.slice(0, MAX_URL_LENGTH) } : {}),
      // Specs are never taken from the browser: they decide compatibility and wattage, so the
      // engine works them out again from the part name.
    };
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Keep only known category names the user removed by hand. */
export function sanitizeRemovedCategories(raw) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((c) => typeof c === 'string' && SWAPPABLE_CATEGORIES.includes(c)))];
}

/**
 * Create the POST /api/build handler (submit a build job)
 * @returns {Function} Express route handler
 */
export const createSubmitHandler = () => {
  return (req, res) => {
    try {
      const {
        message, site: bodySite, customKeys = {}, previousIntent, previousBuild, removedCategories,
      } = req.body;

      // Validate input (fast — no async)
      if (!message || typeof message !== 'string' || message.length > API.MAX_MESSAGE_LENGTH) {
        return sendError(res, ERROR_INVALID_MESSAGE);
      }
      if (bodySite && !API.VALID_SITES.includes(bodySite)) {
        return sendError(res, ERROR_INVALID_SITE);
      }
      if (customKeys && typeof customKeys !== 'object') {
        return sendError(res, ERROR_INVALID_KEYS);
      }

      // Enqueue job
      const { jobId, position, estimatedWait } = createJob({
        message,
        site: bodySite,
        customKeys,
        previousIntent: sanitizePreviousIntent(previousIntent),
        previousBuild: sanitizePreviousBuild(previousBuild),
        removedCategories: sanitizeRemovedCategories(removedCategories),
      });

      console.log(`[build] Job ${jobId.slice(0, 8)} queued at position ${position}`);

      res.json({
        jobId,
        status: 'queued',
        position,
        estimatedWait,
      });
    } catch (error) {
      if (error.code === 'QUEUE_FULL') {
        return res.status(503).json({ error: error.message });
      }
      console.error("[build] Submit error:", error);
      res.status(500).json({ error: 'Failed to submit build request.' });
    }
  };
};

/**
 * Create the GET /api/build/:jobId handler (poll for status)
 * @returns {Function} Express route handler
 */
export const createStatusHandler = () => {
  return (req, res) => {
    const { jobId } = req.params;

    if (!jobId || typeof jobId !== 'string' || jobId.length < 10) {
      return res.status(400).json({ error: 'Invalid job ID.' });
    }

    const status = getJobStatus(jobId);

    if (!status) {
      return res.status(404).json({ error: 'Job not found. It may have expired.' });
    }

    res.json(status);
  };
};

// A cross-check needs a bootable build to compare.
const CROSS_CHECK_REQUIRED = ['Processor', 'Motherboard', 'RAM', 'PSU'];

/**
 * Create the POST /api/build/cross-check handler. Body: { build, intent, site }.
 * The build is priced at every other store; no AI is involved.
 * @returns {Function} Express route handler
 */
export const createCrossCheckHandler = () => {
  return (req, res) => {
    try {
      const { build: rawBuild, intent: rawIntent, site } = req.body || {};
      if (!site || !API.VALID_SITES.includes(site)) {
        return sendError(res, ERROR_INVALID_SITE);
      }
      const build = sanitizePreviousBuild(rawBuild);
      const missing = CROSS_CHECK_REQUIRED.filter((c) => !build?.[c]);
      if (missing.length > 0) {
        return res.status(400).json({ error: `Add a ${missing.join(', ')} to this build before cross-checking it.` });
      }
      const { jobId } = createJob({ build, intent: sanitizePreviousIntent(rawIntent), site }, { lane: 'crossCheck' });
      res.json({ jobId, status: 'queued' });
    } catch (error) {
      if (error.code === 'QUEUE_FULL') {
        return res.status(503).json({ error: error.message });
      }
      console.error('[cross-check] Submit error:', error);
      res.status(500).json({ error: 'Failed to start the cross-check.' });
    }
  };
};

// Keep the old named export for backward compat (unused now, but prevents import errors)
export const createBuildHandler = createSubmitHandler;
export default createSubmitHandler;
