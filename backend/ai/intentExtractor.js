/**
 * AI Intent Extraction Module
 * Parses natural language requests into structured PC build blueprints
 * 
 * Handles primary 70B model + 8B fallback for rate limiting resilience
 */

import { AI } from '../config/thresholds.js';

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
      });
      
      const intentText = response.choices[0].message.content
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();
      
      const intent = JSON.parse(intentText);
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
      });

      const intentText = fallbackResponse.choices[0].message.content
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();

      const intent = JSON.parse(intentText);
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
