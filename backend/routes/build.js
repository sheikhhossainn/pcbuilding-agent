/**
 * Build Route Handler
 * POST /api/build  → enqueue job, return { jobId, position, estimatedWait }
 * GET  /api/build/:jobId → poll for job status / result
 */

import { createJob, getJobStatus } from '../utils/queueManager.js';
import { sendError, ERROR_INVALID_MESSAGE, ERROR_INVALID_SITE, ERROR_INVALID_KEYS } from '../utils/errors.js';
import { API } from '../config/thresholds.js';

/**
 * Create the POST /api/build handler (submit a build job)
 * @returns {Function} Express route handler
 */
export const createSubmitHandler = () => {
  return (req, res) => {
    try {
      const { message, site: bodySite, customKeys = {} } = req.body;

      // Validate input (fast — no async)
      if (!message || message.length > API.MAX_MESSAGE_LENGTH) {
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
      });

      console.log(`[build] Job ${jobId.slice(0, 8)} queued at position ${position}`);

      res.json({
        jobId,
        status: 'queued',
        position,
        estimatedWait,
      });
    } catch (error) {
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
