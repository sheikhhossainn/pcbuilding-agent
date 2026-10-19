/**
 * Rate limits for POST /api/build.
 *
 * A fresh build makes two AI calls and gets the small quota; a refine (a request that arrives with
 * a previous build the engine would accept) makes one short call and gets its own, larger quota.
 * Requests with the user's own API key are not limited.
 *
 * A cross-check makes no AI call but can read every category at every store on a cold cache, so it
 * has a quota of its own.
 */

import rateLimit from 'express-rate-limit';
import { RATE_LIMITING } from '../config/thresholds.js';
import { sanitizePreviousIntent } from '../routes/build.js';

export const hasCustomKey = (req) => Boolean(
  req.body && req.body.customKeys && (req.body.customKeys.groq || req.body.customKeys.ollama)
);

// Only a previous build the engine would actually accept counts, so junk cannot buy the larger quota.
export const isRefine = (req) => Boolean(
  req.body && sanitizePreviousIntent(req.body.previousIntent)
  && req.body.previousBuild && typeof req.body.previousBuild === 'object'
  && !Array.isArray(req.body.previousBuild)
);

/**
 * @param {{ windowMs?: number, maxBuilds?: number, maxRefines?: number, maxCrossChecks?: number }} [limits] - overridable for tests
 * @returns {{ apiLimiter: Function, refineLimiter: Function, crossCheckLimiter: Function }}
 */
export function createBuildLimiters({
  windowMs = RATE_LIMITING.WINDOW_MS,
  maxBuilds = RATE_LIMITING.MAX_REQUESTS_PER_WINDOW,
  maxRefines = RATE_LIMITING.MAX_REFINES_PER_WINDOW,
  maxCrossChecks = RATE_LIMITING.MAX_CROSS_CHECKS_PER_WINDOW,
} = {}) {
  const common = {
    windowMs,
    message: { error: RATE_LIMITING.LIMIT_MESSAGE },
    standardHeaders: true,
    legacyHeaders: false,
  };
  const apiLimiter = rateLimit({
    ...common,
    max: maxBuilds,
    skip: (req) => {
      if (req.path === '/api/test/build') return true;
      // Refines are counted by refineLimiter
      if (isRefine(req)) return true;
      return hasCustomKey(req);
    },
  });
  const refineLimiter = rateLimit({
    ...common,
    max: maxRefines,
    skip: (req) => !isRefine(req) || hasCustomKey(req),
  });
  const crossCheckLimiter = rateLimit({
    ...common,
    max: maxCrossChecks,
    message: { error: 'Too many store checks in a short time. Please wait a few minutes and try again.' },
  });
  return { apiLimiter, refineLimiter, crossCheckLimiter };
}
