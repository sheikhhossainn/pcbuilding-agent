/**
 * AI Intent Extraction Module
 * Parses natural language requests into structured PC build blueprints
 * 
 * Handles primary 70B model + 8B fallback for rate limiting resilience
 */

import { AI } from '../config/thresholds.js';

const EXPECTED_CATEGORIES = [
  'Processor', 'Motherboard', 'RAM', 'Storage', 'Graphics Card',
  'PSU', 'Casing', 'CPU Cooler', 'Monitor', 'Mouse', 'Keyboard', 'UPS'
];

const DEFAULT_STRATEGY = { weight: 1, required_keywords: [], exclude_keywords: [], structured_reqs: {}, required: false };

/**
 * Validate and normalize intent JSON from LLM output.
 * Fills missing fields with safe defaults, coerces types, ensures all categories exist.
 * @param {Object} raw - Raw parsed JSON from LLM
 * @returns {Object} Normalized intent object
 */
function validateAndNormalizeIntent(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Intent extraction returned invalid data (not an object).');
  }

  // Coerce budget to number
  if (raw.budget_bdt !== null && raw.budget_bdt !== undefined) {
    raw.budget_bdt = Number(raw.budget_bdt);
    if (!Number.isFinite(raw.budget_bdt)) raw.budget_bdt = null;
  }

  // Ensure component_strategy exists
  if (!raw.component_strategy || typeof raw.component_strategy !== 'object') {
    raw.component_strategy = {};
  }

  // Normalize category names (common LLM mistakes)
  const aliases = {
    'GPU': 'Graphics Card', 'gpu': 'Graphics Card', 'graphics card': 'Graphics Card',
    'CPU': 'Processor', 'cpu': 'Processor', 'processor': 'Processor',
    'motherboard': 'Motherboard', 'ram': 'RAM', 'storage': 'Storage',
    'psu': 'PSU', 'casing': 'Casing', 'monitor': 'Monitor',
    'mouse': 'Mouse', 'keyboard': 'Keyboard', 'ups': 'UPS',
    'cpu cooler': 'CPU Cooler', 'CPU cooler': 'CPU Cooler', 'cooler': 'CPU Cooler',
    'cpu-cooler': 'CPU Cooler',
  };
  const strat = raw.component_strategy;
  for (const [key, value] of Object.entries(strat)) {
    const canonical = aliases[key] || aliases[key.toLowerCase()];
    if (canonical && canonical !== key) {
      strat[canonical] = value;
      delete strat[key];
    }
  }

  // Ensure all expected categories exist with valid structure
  for (const cat of EXPECTED_CATEGORIES) {
    if (!strat[cat]) {
      strat[cat] = { ...DEFAULT_STRATEGY };
    } else {
      const s = strat[cat];
      s.weight = typeof s.weight === 'number' && Number.isFinite(s.weight) ? s.weight : 1;
      s.required = typeof s.required === 'boolean' ? s.required : false;
      s.required_keywords = Array.isArray(s.required_keywords) ? s.required_keywords.map(String) : [];
      s.exclude_keywords = Array.isArray(s.exclude_keywords) ? s.exclude_keywords.map(String) : [];
      s.structured_reqs = (s.structured_reqs && typeof s.structured_reqs === 'object') ? s.structured_reqs : {};
    }
  }

  // Normalize string fields
  if (raw.use_case && typeof raw.use_case === 'string') {
    raw.use_case = raw.use_case.toLowerCase();
    if (!['gaming', 'editing', 'office', 'general'].includes(raw.use_case)) {
      raw.use_case = 'general';
    }
  } else {
    raw.use_case = 'general';
  }

  if (raw.preferred_cpu_brand && typeof raw.preferred_cpu_brand === 'string') {
    raw.preferred_cpu_brand = raw.preferred_cpu_brand.toLowerCase();
    if (!['amd', 'intel'].includes(raw.preferred_cpu_brand)) raw.preferred_cpu_brand = null;
  }
  if (raw.preferred_gpu_brand && typeof raw.preferred_gpu_brand === 'string') {
    raw.preferred_gpu_brand = raw.preferred_gpu_brand.toLowerCase();
    if (!['nvidia', 'amd'].includes(raw.preferred_gpu_brand)) raw.preferred_gpu_brand = null;
  }

  // Ensure no_gpu is a boolean and in sync with Graphics Card required status
  raw.no_gpu = Boolean(raw.no_gpu || (raw.component_strategy?.['Graphics Card'] && !raw.component_strategy['Graphics Card'].required));

  return raw;
}

/**
 * Create intent extractor with dependency injection
 * @param {Object} deps - Dependencies
 * @param {Object} deps.groqClient - Groq API client
 * @param {string} deps.systemPrompt - System prompt template for intent extraction
 * @returns {Object} Intent extractor interface
 */
export const createIntentExtractor = ({ groqClient, systemPrompt }) => {
  /**
   * Build a follow-up system message when modifying an existing build
   * @param {Object} previousIntent - The intent JSON from the last build
   * @param {Object} previousBuild - The actual components selected in the last build
   * @returns {string} Additional system instruction for the LLM
   */
  const buildFollowUpContext = (previousIntent, previousBuild) => {
    // Summarize what was actually built (component name + price)
    let buildSummary = '';
    if (previousBuild && typeof previousBuild === 'object') {
      const parts = Object.entries(previousBuild)
        .filter(([, v]) => v && v.name)
        .map(([cat, v]) => `  - ${cat}: ${v.name} (${v.price} BDT)`)
        .join('\n');
      if (parts) buildSummary = `\n\nActual components that were selected:\n${parts}`;
    }

    return `
You are MODIFYING an existing PC build. The user wants to change ONE or TWO specific things.

CRITICAL RULE: Do NOT change ANY category that the user did not explicitly mention. Copy every unchanged category's weight, required_keywords, exclude_keywords, structured_reqs, and required fields EXACTLY as they are below. Do not "improve" or "optimize" unmentioned categories.

Current configuration JSON:
${JSON.stringify(previousIntent, null, 2)}
${buildSummary}

Rules:
- ONLY modify the specific category/field the user mentions. Everything else must be an exact copy.
- Do NOT change weights for categories the user didn't mention.
- Do NOT add or remove keywords for categories the user didn't mention.
- Do NOT change budget_bdt unless the user explicitly mentions a new budget.
- Do NOT change preferred_cpu_brand or preferred_gpu_brand unless the user explicitly mentions a brand.
- Do NOT change use_case unless the user explicitly mentions a different use case.
- Do NOT change no_gpu unless the user explicitly asks to add or remove dedicated graphics.
- If the user wants to remove dedicated GPU (e.g. "no gpu", "remove graphics card"), set "no_gpu": true and set Graphics Card "required": false and "weight": 0.
- If the user wants to add a dedicated GPU, set "no_gpu": false and set Graphics Card "required": true.
- If the user wants to remove a component, set its "required" to false and "weight" to 0.
- If the user says "start over" or "new build", ignore the previous config entirely.
- Return ONLY the full updated JSON. No explanation.`;
  };

  /**
   * Extract user intent from natural language message
   * Tries 70B model first, falls back to 8B if rate-limited
   * 
   * @param {string} userMessage - User's PC build request
   * @param {Object} [previousIntent] - Previous build intent for follow-up refinement
   * @param {Object} [previousBuild] - Previous build's selected components
   * @returns {Promise<Object>} Parsed BuildIntent object
   * @throws {Error} If both models fail or JSON parsing fails
   */
  const extract = async (userMessage, previousIntent = null, previousBuild = null) => {
    let lastError = null;
    const isFollowUp = !!previousIntent;

    // Build messages array — add follow-up context if refining an existing build
    const messages = [
      { role: "system", content: systemPrompt },
    ];
    if (isFollowUp) {
      messages.push({ role: "system", content: buildFollowUpContext(previousIntent, previousBuild) });
      console.log(`[AI] Follow-up mode: modifying existing intent`);
    }
    messages.push({ role: "user", content: userMessage });

    // Try primary model (high accuracy)
    try {
      console.log(`[AI] Attempting primary model: ${AI.MODEL_PRIMARY_INTENT}`);
      const response = await groqClient.chat.completions.create({
        model: AI.MODEL_PRIMARY_INTENT,
        messages,
        temperature: AI.TEMPERATURE_INTENT,
      }, { timeout: 30000 });
      
      const intentText = response.choices[0].message.content
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();
      
      const intent = validateAndNormalizeIntent(JSON.parse(intentText));
      console.log(`[AI] ✓ Intent extracted via ${AI.MODEL_PRIMARY_INTENT}${isFollowUp ? ' (follow-up)' : ''}`);
      return intent;
    } catch (error) {
      lastError = error;
      console.warn(`[AI] ${AI.MODEL_PRIMARY_INTENT} failed:`, error.message);
    }

    // Fallback to secondary model (faster, handles rate limits)
    try {
      console.log(`[AI] Falling back to: ${AI.MODEL_FALLBACK_INTENT}`);
      const fallbackResponse = await groqClient.chat.completions.create({
        model: AI.MODEL_FALLBACK_INTENT,
        messages,
        temperature: AI.TEMPERATURE_INTENT,
      }, { timeout: 30000 });

      const intentText = fallbackResponse.choices[0].message.content
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();

      const intent = validateAndNormalizeIntent(JSON.parse(intentText));
      console.log(`[AI] ✓ Intent extracted via ${AI.MODEL_FALLBACK_INTENT} (fallback${isFollowUp ? ', follow-up' : ''})`);
      return intent;
    } catch (fallbackError) {
      console.error(`[AI] Both models failed. Primary:`, lastError.message, `Fallback:`, fallbackError.message);
      throw new Error(`Intent extraction failed: ${lastError.message}`);
    }
  };

  return {
    extract,
  };
};

export default createIntentExtractor;
