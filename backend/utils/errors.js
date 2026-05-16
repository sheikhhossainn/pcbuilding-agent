/**
 * Standardized Error Handling
 * 
 * All error responses use proper HTTP status codes.
 * Frontend can rely on status codes, not parsing JSON for errors.
 */

/**
 * Create a standardized error response
 * @param {number} status - HTTP status code
 * @param {string} message - User-facing error message
 * @param {string} [code] - Error code for frontend to handle specific cases
 * @returns {{status: number, message: string, code?: string}}
 */
export function createError(status, message, code = null) {
  const error = { status, message };
  if (code) error.code = code;
  return error;
}

/**
 * Respond with error using proper HTTP status
 * @param {Object} res - Express response object
 * @param {Object} error - Error object from createError()
 */
export function sendError(res, error) {
  res.status(error.status).json({
    error: error.message,
    ...(error.code && { code: error.code }),
  });
}

// ────── Common Errors ──────

/**
 * 400 Bad Request - Invalid input
 */
export const ERROR_INVALID_MESSAGE = createError(
  400,
  'Message is required and must be under 2000 characters.',
  'INVALID_MESSAGE'
);

export const ERROR_INVALID_SITE = createError(
  400,
  'Invalid site selected. Choose from: startech, techland, computermania',
  'INVALID_SITE'
);

export const ERROR_INVALID_KEYS = createError(
  400,
  'Invalid customKeys format',
  'INVALID_KEYS'
);

/**
 * 400 Bad Request - Budget issues
 */
export function errorBudgetTooLow(minBudget = 20000) {
  return createError(
    400,
    `Your budget is too low. Minimum required: ${minBudget.toLocaleString('en-BD')} BDT.`,
    'BUDGET_TOO_LOW'
  );
}

export function errorCannotMeetRequirements(category, requirements) {
  return createError(
    400,
    `To meet your specific requirements (${requirements}) for ${category}, no matching part was found in inventory. Please relax your requirements.`,
    'NO_MATCHING_PART'
  );
}

export function errorInsufficientBudget(totalFloor, budget) {
  return createError(
    400,
    `The absolute minimum cost to meet your requirements is ${totalFloor.toLocaleString('en-BD')} BDT, but your budget is ${budget.toLocaleString('en-BD')} BDT. Please increase budget or relax requirements.`,
    'BUDGET_INSUFFICIENT'
  );
}

export function errorCoreComponentMissing(components) {
  const missing = Object.entries(components)
    .filter(([, found]) => !found)
    .map(([name]) => name)
    .join(', ');

  return createError(
    500,
    `Could not assemble a complete build. Missing: ${missing}. Try adjusting your budget.`,
    'CORE_COMPONENT_MISSING'
  );
}

/**
 * 500 Internal Server Error
 */
export const ERROR_GROQ_UNAVAILABLE = createError(
  500,
  'The AI service is currently unavailable or rate-limited. Please try again later or provide your own Groq API key.',
  'GROQ_UNAVAILABLE'
);

export const ERROR_INVALID_INTENT = createError(
  500,
  'Failed to process your request correctly. Please rephrase your requirements.',
  'INVALID_INTENT'
);

export const ERROR_INTERNAL = createError(
  500,
  'An internal server error occurred while building your PC.',
  'INTERNAL_ERROR'
);

/**
 * Specific component errors
 */
export function errorComponentNotFound(category, reason = '') {
  const msg = `Could not find a compatible ${category} within allocated budget.`;
  return createError(400, msg + (reason ? ` ${reason}` : ''), 'COMPONENT_NOT_FOUND');
}

export function errorPsuInsufficient(targetWattage) {
  return createError(
    400,
    `Could not find a PSU with at least ${Math.round(targetWattage)}W within budget.`,
    'PSU_INSUFFICIENT'
  );
}
