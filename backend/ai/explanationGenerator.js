/**
 * AI Explanation Generation Module
 * Creates human-readable build justifications using LLM
 */

import { AI } from '../config/thresholds.js';

/**
 * Create explanation generator with dependency injection
 * @param {Object} deps - Dependencies
 * @param {Object} deps.groqClient - Groq API client
 * @returns {Object} Explanation generator interface
 */
export const createExplanationGenerator = ({ groqClient }) => {
  /**
   * Generate user-friendly explanation of PC build choices
   * Includes compatibility evidence and trade-off justification
   * 
   * @param {Object} params - Generation parameters
   * @param {Object} params.selectedBuild - Selected components (keyed by category)
   * @param {number} params.totalCost - Total cost in BDT
   * @param {Object} params.intent - User's extracted intent/preferences
   * @param {string} params.sitePreference - Preferred retailer
   * @param {string[]} params.buildWarnings - Non-fatal compatibility warnings
   * @returns {Promise<string>} Human-readable explanation
   */
  const generate = async (params) => {
    const {
      selectedBuild,
      totalCost,
      intent,
      sitePreference,
      buildWarnings = [],
    } = params;

    const budget = intent.budget_bdt || 0;
    const useCase = intent.use_case || 'general';

    const buildListText = Object.keys(selectedBuild)
      .map(category => {
        const part = selectedBuild[category];
        if (!part) return '';
        return `- ${category}: ${part.name} (${part.price} BDT)`;
      })
      .filter(Boolean)
      .join('\n');

    const explanationPrompt = `
You are a PC building assistant. You have selected the following components for a user who wants a ${useCase} PC with a budget of ${budget} BDT from ${sitePreference}.

Selected Parts:
${buildListText}

Total Cost: ${totalCost} BDT

Write a short explanation (3-5 sentences) that justifies the build AND explicitly states compatibility evidence. Include 2-3 concrete references such as:
- CPU socket matches motherboard socket
- RAM type matches motherboard (DDR4/DDR5)
- PSU wattage is sufficient for estimated CPU/GPU draw
- GPU requirement met (or no GPU requested)
- Whether storage capacity matches what user requested
Avoid generic fluff and do not mention parts that are not selected.
${buildWarnings.length > 0 ? '\nIMPORTANT WARNINGS to mention:\n' + buildWarnings.join('\n') : ''}
`;

    try {
      console.log(`[AI] Generating explanation via ${AI.MODEL_EXPLANATION}`);
      const response = await groqClient.chat.completions.create({
        model: AI.MODEL_EXPLANATION,
        messages: [{ role: "user", content: explanationPrompt }],
        temperature: AI.TEMPERATURE_EXPLANATION,
      });

      const explanation = response.choices[0].message.content;
      console.log(`[AI] ✓ Explanation generated`);
      return explanation;
    } catch (error) {
      console.error(`[AI] Explanation generation failed:`, error.message);
      return "Explanation could not be generated due to API limits.";
    }
  };

  return {
    generate,
  };
};

export default createExplanationGenerator;
