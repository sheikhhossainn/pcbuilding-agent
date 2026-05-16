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
   * Extract user intent from natural language message
   * Tries 70B model first, falls back to 8B if rate-limited
   * 
   * @param {string} userMessage - User's PC build request
   * @returns {Promise<Object>} Parsed BuildIntent object
   * @throws {Error} If both models fail or JSON parsing fails
   */
  const extract = async (userMessage) => {
    let lastError = null;

    // Try primary model (high accuracy)
    try {
      console.log(`[AI] Attempting primary model: ${AI.MODEL_PRIMARY_INTENT}`);
      const response = await groqClient.chat.completions.create({
        model: AI.MODEL_PRIMARY_INTENT,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ],
        temperature: AI.TEMPERATURE_INTENT,
      });
      
      const intentText = response.choices[0].message.content
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();
      
      const intent = JSON.parse(intentText);
      console.log(`[AI] ✓ Intent extracted via ${AI.MODEL_PRIMARY_INTENT}`);
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
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ],
        temperature: AI.TEMPERATURE_INTENT,
      });

      const intentText = fallbackResponse.choices[0].message.content
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();

      const intent = JSON.parse(intentText);
      console.log(`[AI] ✓ Intent extracted via ${AI.MODEL_FALLBACK_INTENT} (fallback)`);
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
