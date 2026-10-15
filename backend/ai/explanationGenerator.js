/**
 * AI Explanation Generation Module
 * Creates human-readable build justifications using LLM
 */

import { AI } from '../config/thresholds.js';
import { SYSTEM_DRAW } from '../config/tdpHeuristics.js';

const KNOWN = (v) => v && !['UNKNOWN', 'INTEGRATED', 'unknown'].includes(v);

/**
 * Derive concrete, verifiable compatibility/performance facts from part specs
 * so the LLM justifies the build with real values instead of generic praise.
 * @param {Object} build - Selected components keyed by category
 * @returns {string[]} Fact lines
 */
export const buildFacts = (build) => {
  const facts = [];
  const cpu = build.Processor;
  const mobo = build.Motherboard;
  const ram = build.RAM;
  const gpu = build['Graphics Card'];
  const psu = build.PSU;

  if (cpu && mobo && KNOWN(cpu.specs?.socket) && cpu.specs.socket === mobo.specs?.socket) {
    facts.push(`CPU and motherboard share the ${cpu.specs.socket} socket, so the processor drops straight in.`);
  }
  if (mobo && ram && KNOWN(mobo.specs?.ram_type) && mobo.specs.ram_type === ram.specs?.ram_type) {
    facts.push(`Motherboard and RAM both use ${ram.specs.ram_type}.`);
  }
  if (cpu && ram && KNOWN(ram.specs?.ram_type)) {
    facts.push(`The CPU supports ${ram.specs.ram_type} memory.`);
  }
  if (cpu && gpu) {
    facts.push('A dedicated graphics card is installed, so the GPU (not the CPU) handles rendering/graphics load.');
  } else if (cpu) {
    facts.push('No dedicated graphics card: the CPU uses integrated graphics.');
  }

  const cpuTdp = cpu?.specs?.tdp;
  const gpuTdp = gpu?.specs?.tdp;
  const psuW = psu?.specs?.wattage;
  if (cpuTdp && (gpu ? gpuTdp : true)) {
    const gpuDraw = gpu ? gpuTdp : SYSTEM_DRAW.INTEGRATED_GPU;
    const draw = cpuTdp + gpuDraw + SYSTEM_DRAW.BASE;
    facts.push(`Estimated peak draw is about ${draw}W (CPU ${cpuTdp}W + ${gpu ? 'GPU' : 'integrated graphics'} ${gpuDraw}W + ${SYSTEM_DRAW.BASE}W for board, RAM and drives).`);
    if (psuW) {
      const headroom = Math.round((1 - draw / psuW) * 100);
      if (headroom > 0) facts.push(`The ${psuW}W PSU leaves about ${headroom}% headroom over that draw.`);
    }
  }
  return facts;
};

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

    const factsText = buildFacts(selectedBuild).map(f => `- ${f}`).join('\n');

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

Verified facts about this exact build (computed by the compatibility engine, treat as true):
${factsText || '- (none available)'}
${followUpInstructions}

Write a natural, conversational paragraph (4-6 sentences) justifying the build.
Rules:
- Speak directly to the user in a casual, human tone (e.g., "I went with the Ryzen 5 because...").
- Prove compatibility with the verified facts above: name the shared socket, the RAM generation the board and kit share, and that the PSU has headroom over the estimated draw. Use the real values (e.g., "AM4", "DDR4", "~230W on a 500W PSU"), not vague claims like "works great together".
- Justify performance for their use case: say what the key parts (CPU/GPU/RAM/storage) actually do for that workload (e.g., cores for rendering, VRAM for timelines, RAM for multitasking) and where the budget was prioritized.
- Only state numbers that appear in the Selected Parts names or the verified facts. Never invent benchmark figures, FPS, or specs.
- If a trade-off was made (older platform, entry-level GPU, no upgrade path), say so honestly in one short clause.
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
      }, { timeout: 30000 });

      const explanation = response.choices?.[0]?.message?.content;
      if (!explanation || !explanation.trim()) {
        return "Here is your build. The parts are checked for compatibility; see the notes below for anything to double-check.";
      }
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
