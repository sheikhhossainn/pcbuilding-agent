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
      lockedCategories = [],
    } = params;

    const budget = intent.budget_bdt || 0;
    const useCase = intent.use_case || 'general';

    const buildListText = Object.keys(selectedBuild)
      .map(category => {
        const part = selectedBuild[category];
        if (!part) return '';
        const lockedTag = lockedCategories.includes(category) ? ' (Kept from previous build)' : '';
        return `- ${category}: ${part.name} (${part.price} BDT)${lockedTag}`;
      })
      .filter(Boolean)
      .join('\n');

    const isFollowUp = lockedCategories.length > 0;
    const followUpInstructions = isFollowUp ? `
You are modifying the user's previous build. In a natural, conversational way, briefly mention what parts you kept (don't list them all, just summarize) and highlight the specific parts you swapped out based on their new request. Assure them the new combination is fully compatible.` : '';

    const explanationPrompt = `
Act as a friendly, expert PC builder who just finished designing a PC for a user.
Their Request: A ${useCase} PC.
Their Budget: ${budget} BDT.
Shop Used: ${sitePreference}.

Selected Parts:
${buildListText}
Total Cost: ${totalCost} BDT
${followUpInstructions}

Write a natural, conversational paragraph (3-5 sentences) explaining the build.
Rules:
- Speak directly to the user in a casual, human tone (e.g., "I went with the Ryzen 5 because...").
- Briefly explain why the main components (CPU/Motherboard/GPU) work well together and are compatible.
- Explain how this build fits their specific needs.
- CRITICAL: ONLY mention the components listed above in the "Selected Parts" section. DO NOT invent, hallucinate, or mention any components (especially Graphics Cards or CPUs) that are not explicitly listed in the "Selected Parts" list above. If a Graphics Card is not listed, it means this build uses integrated graphics.
- NEVER use robotic bullet points or rigidly list out all the parts (the user can already see the parts list on their screen). 
- Avoid robotic phrasing like "Here is what I have done:" or "These parts are fully compatible because...". Weave the compatibility naturally into the sentences.
${buildWarnings.length > 0 ? '\nIMPORTANT WARNINGS to mention naturally:\n' + buildWarnings.join('\n') : ''}
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
