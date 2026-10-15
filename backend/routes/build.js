/**
 * Build Route Handler
 * POST /api/build  → enqueue job, return { jobId, position, estimatedWait }
 * GET  /api/build/:jobId → poll for job status / result
 */

import { createJob, getJobStatus } from '../utils/queueManager.js';
import { sendError, ERROR_INVALID_MESSAGE, ERROR_INVALID_SITE, ERROR_INVALID_KEYS } from '../utils/errors.js';
import { API } from '../config/thresholds.js';
import { SWAPPABLE_CATEGORIES } from '../engine/alternatives.js';

const MAX_PART_NAME_LENGTH = 300;
const MAX_URL_LENGTH = 500;

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
      ...(part.specs && typeof part.specs === 'object' ? { specs: part.specs } : {}),
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
        previousIntent: previousIntent || null,
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

// Keep the old named export for backward compat (unused now, but prevents import errors)
export const createBuildHandler = createSubmitHandler;
export default createSubmitHandler;
