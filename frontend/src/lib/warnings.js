export const ALL_CATEGORIES = [
  'Processor', 'Motherboard', 'RAM', 'Storage', 'Graphics Card',
  'PSU', 'CPU Cooler', 'Casing', 'Monitor', 'Mouse', 'Keyboard', 'UPS',
];

/**
 * Parses and groups raw engine warnings into structured sections:
 * 1. Critical incompatibilities (INCOMPATIBLE)
 * 2. Parts left out of the build (and why: budget vs catalog)
 * 3. Requirement relaxations/adjustments for parts that ARE in the build
 * 4. General advisory notes
 */
export function parseWarnings(warnings) {
  const incompatibles = [];
  const leftOutCategories = [];
  const leftOutSet = new Set();
  let isBudgetReason = false;
  let isCatalogReason = false;
  const pendingNotes = [];

  for (const raw of (warnings || [])) {
    const w = String(raw || '').trim();
    if (!w) continue;

    if (w.includes('INCOMPATIBLE')) {
      incompatibles.push(w);
      continue;
    }

    const isLeftOut = /left out/i.test(w) || /omitted from this build/i.test(w);
    if (isLeftOut) {
      if (/budget/i.test(w)) isBudgetReason = true;
      if (/catalog|tracked/i.test(w)) isCatalogReason = true;

      // Find categories mentioned in the sentence, ordered by where they appear
      const found = [];
      for (const cat of ALL_CATEGORIES) {
        const re = new RegExp(`\\b${cat}\\b`, 'i');
        const match = w.match(re);
        if (match) {
          found.push({ cat, index: match.index });
        }
      }
      found.sort((a, b) => a.index - b.index);

      for (const { cat } of found) {
        if (!leftOutSet.has(cat)) {
          leftOutSet.add(cat);
          leftOutCategories.push(cat);
        }
      }
      continue;
    }

    const isDegradation = /dropped (?:required )?keyword/i.test(w) ||
      /reduced .* requirement/i.test(w) ||
      /relaxed .* requirement/i.test(w) ||
      /emergency: dropped/i.test(w) ||
      /emergency: relaxed/i.test(w) ||
      /chose \d+GB of RAM/i.test(w) ||
      /smallest sensible SSD/i.test(w) ||
      /switched .* preference/i.test(w);

    pendingNotes.push({ text: w, isDegradation });
  }

  // Second pass: prune keyword/spec warnings for parts that were completely left out
  const adjustments = [];
  const otherNotes = [];

  for (const { text, isDegradation } of pendingNotes) {
    const touchesLeftOut = Array.from(leftOutSet).some((cat) => {
      const re = new RegExp(`\\b${cat}\\b`, 'i');
      return re.test(text);
    });

    if (touchesLeftOut && isDegradation) {
      // Suppress redundant keyword/spec warnings for parts not in the build
      continue;
    }

    if (isDegradation) {
      const cleaned = text
        .replace(/^Emergency:\s*/i, '')
        .replace(/fit budget ceiling/gi, 'fit your budget')
        .replace(/specification "min_gb"/gi, 'minimum capacity')
        .replace(/specification "min_tb"/gi, 'storage capacity')
        .replace(/specification "min_hz"/gi, 'refresh rate');
      adjustments.push(cleaned);
    } else {
      otherNotes.push(text);
    }
  }

  // Consolidate adjustments for the same category (e.g. RAM 32GB keyword + capacity)
  const consolidatedAdjustments = [];
  const ramAdjustments = adjustments.filter((a) => /\bRAM\b/i.test(a));
  const nonRamAdjustments = adjustments.filter((a) => !/\bRAM\b/i.test(a));

  if (ramAdjustments.length > 1) {
    const has32 = ramAdjustments.some((a) => /32GB/i.test(a));
    const label = has32
      ? 'RAM capacity requirement (32GB) relaxed to fit your budget'
      : 'RAM capacity requirement relaxed to fit your budget';
    consolidatedAdjustments.push(label);
  } else {
    consolidatedAdjustments.push(...ramAdjustments);
  }
  consolidatedAdjustments.push(...nonRamAdjustments);

  return {
    incompatibles,
    leftOutCategories,
    leftOutReason: isCatalogReason && !isBudgetReason ? 'catalog' : 'budget',
    adjustments: consolidatedAdjustments,
    otherNotes,
  };
}
