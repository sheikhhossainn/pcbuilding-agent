/**
 * Intent overrides
 * Deterministic fixes applied on top of the LLM intent: explicit budget, DDR type, RAM/storage
 * size, monitor refresh rate, GPU brand, "no GPU". The message the user typed always wins.
 */

// Smallest and largest budgets the parser will believe. Anything outside is a model number
// or a typo ("14900k" is an i9, not 14.9 million taka).
const MIN_PLAUSIBLE_BDT = 15000;
const MAX_PLAUSIBLE_BDT = 5000000;

const plausible = (value) => Number.isFinite(value) && value >= MIN_PLAUSIBLE_BDT && value <= MAX_PLAUSIBLE_BDT;

// Every pattern below starts with (?<![a-z0-9.\-]): a number that is not glued to a letter,
// digit, dot or dash. That keeps "i7-13700k", "rtx4090k" and "v2.5k" from being read as money.
const LAKH_RE = /(?<![a-z0-9.\-])(\d+(?:\.\d+)?)\s*(?:lakhs?|lacs?|lak)\b(?:\s*(?:and\s*)?(\d+(?:\.\d+)?)\s*(?:k|thousand)\b)?/;
const UNIT_PATTERNS = [
  { re: /(?<![a-z0-9.\-])(\d+(?:\.\d+)?)\s*k\s*(?:bdt|tk|taka)\b/, scale: 1000 },
  { re: /(?<![a-z0-9.\-])(\d{4,7})\s*(?:bdt|tk|taka)\b/, scale: 1 },
  { re: /\b(?:bdt|tk|taka)\.?\s*(\d{4,7})\b/, scale: 1 },
  { re: /\b(?:bdt|tk|taka)\.?\s*(\d+(?:\.\d+)?)\s*k\b/, scale: 1000 },
  { re: /(?<![a-z0-9.\-])(\d+(?:\.\d+)?)\s*thousand\b/, scale: 1000 },
];
const AFTER_BUDGET_RE = /budget\b[^0-9]{0,24}(\d+(?:\.\d+)?)\s*(k\b)?/;
const K_RE = /(?<![a-z0-9.\-])(\d+(?:\.\d+)?)\s*k\b/g;
const RAW_RE = /(?<![a-z0-9.\-])(\d{5,7})\b(?!\s*(?:mhz|mt\/s|w\b|watt|gb|tb|hz|mah|rpm))/g;

/**
 * Pull a BDT budget out of free text. Understands "80k", "80,000", "80000 tk", "৳80000",
 * "1.2 lakh", "1 lakh 20 thousand" and ignores CPU/GPU model numbers and display resolutions.
 * @param {string} message
 * @returns {number|null}
 */
export const parseBudgetFromMessage = (message) => {
  if (!message) return null;
  const text = String(message).toLowerCase().replace(/৳/g, ' tk ');
  const normalized = text.replace(/(\d),(?=\d{3}\b)/g, '$1');

  // "1.2 lakh", "2 lac", "1 lakh 20 thousand"
  const lakh = normalized.match(LAKH_RE);
  if (lakh) {
    const value = Math.round(parseFloat(lakh[1]) * 100000 + (lakh[2] ? parseFloat(lakh[2]) * 1000 : 0));
    if (plausible(value)) return value;
  }

  // Money with an explicit unit: "80k tk", "80000 bdt", "tk 80000", "80 thousand"
  for (const { re, scale } of UNIT_PATTERNS) {
    const m = normalized.match(re);
    if (!m) continue;
    const value = Math.round(parseFloat(m[1]) * scale);
    if (plausible(value)) return value;
  }

  // "budget ... 80k" / "budget 80000": the nearest figure after the word "budget"
  const afterBudget = normalized.match(AFTER_BUDGET_RE);
  if (afterBudget) {
    const raw = parseFloat(afterBudget[1]);
    const value = afterBudget[2] ? Math.round(raw * 1000) : Math.round(raw);
    if (plausible(value)) return value;
  }

  // General "80k", skipping resolutions (4k) and anything glued to a model name
  for (const match of normalized.matchAll(K_RE)) {
    const value = Math.round(parseFloat(match[1]) * 1000);
    if (plausible(value)) return value;
  }

  // Raw 5-7 digit number not attached to a model name ("80000", not "i5-12400")
  for (const match of normalized.matchAll(RAW_RE)) {
    const value = parseInt(match[1], 10);
    if (plausible(value)) return value;
  }

  return null;
};

const parseMonitorHz = (message) => {
  if (!message) return null;
  const match = message.toLowerCase().match(/(\d{2,3})\s*hz/);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  return Number.isFinite(value) ? value : null;
};

const addKeyword = (strat, cat, kw) => {
  if (strat[cat]) {
    strat[cat].required_keywords = strat[cat].required_keywords || [];
    if (!strat[cat].required_keywords.some(k => k.toLowerCase() === kw.toLowerCase())) {
      strat[cat].required_keywords.push(kw);
    }
  }
};

const addStructured = (strat, cat, key, val) => {
  if (strat[cat]) {
    strat[cat].structured_reqs = strat[cat].structured_reqs || {};
    strat[cat].structured_reqs[key] = val;
  }
};

const addExclude = (strat, cat, kw) => {
  if (strat[cat]) {
    strat[cat].exclude_keywords = strat[cat].exclude_keywords || [];
    if (!strat[cat].exclude_keywords.some(k => k.toLowerCase() === kw.toLowerCase())) {
      strat[cat].exclude_keywords.push(kw);
    }
  }
};

export const applyIntentOverrides = (intent, message) => {
  // Parse budget from message (handles "400k", "400K BDT", "1.5 lakh", etc.)
  const parsedBudget = parseBudgetFromMessage(message);
  if (parsedBudget) {
    const currentBudget = Number.isFinite(intent.budget_bdt) ? intent.budget_bdt : 0;
    const delta = Math.abs(parsedBudget - currentBudget);
    if (!currentBudget || delta >= Math.max(2000, currentBudget * 0.05)) {
      intent.budget_bdt = parsedBudget;
    }
  }

  if (!intent.component_strategy) return;

  const text = (message || '').toLowerCase();
  const strat = intent.component_strategy;

  // Apply DDR4/DDR5 preferences
  const hasDdr5 = text.includes('ddr5');
  const hasDdr4 = text.includes('ddr4');
  if (hasDdr5 && !hasDdr4) {
    addKeyword(strat, 'Motherboard', 'DDR5');
    addKeyword(strat, 'RAM', 'DDR5');
  }
  if (hasDdr4 && !hasDdr5) {
    addKeyword(strat, 'Motherboard', 'DDR4');
    addKeyword(strat, 'RAM', 'DDR4');
  }
  if (hasDdr4 && hasDdr5) {
    // Both mentioned (e.g., "DDR4 or DDR5"): pick based on budget
    const currentBudget = intent.budget_bdt || 0;
    if (currentBudget > 100000) {
      addKeyword(strat, 'Motherboard', 'DDR5');
      addKeyword(strat, 'RAM', 'DDR5');
    } else {
      addKeyword(strat, 'Motherboard', 'DDR4');
      addKeyword(strat, 'RAM', 'DDR4');
    }
  }

  // Apply RAM requirement from message (must be explicitly about RAM, not storage/VRAM)
  const isStorageOrVram16 = /16gb\s*(?:ssd|hdd|storage|vram|graphics|gpu|card)/i.test(text);
  if (text.includes('16gb') && !isStorageOrVram16) addStructured(strat, 'RAM', 'min_gb', 16);
  if (text.includes('32gb') && (text.includes('ram') || text.includes('memory'))) addStructured(strat, 'RAM', 'min_gb', 32);
  if (text.includes('64gb') && (text.includes('ram') || text.includes('memory'))) addStructured(strat, 'RAM', 'min_gb', 64);

  // Apply monitor Hz requirement
  const hz = parseMonitorHz(message);
  if (hz) addStructured(strat, 'Monitor', 'min_hz', hz);

  // Apply storage requirement
  const storageTbMatch = text.match(/(\d+)\s*tb/);
  if (storageTbMatch) {
    addStructured(strat, 'Storage', 'min_tb', parseInt(storageTbMatch[1], 10));
  }

  // Apply storage requirement (GB fallback for "512gb SSD" etc.)
  if (!storageTbMatch) {
    const storageGbMatch = text.match(/(\d+)\s*gb\s*(?:ssd|hdd|nvme|storage|m\.2)/);
    if (storageGbMatch) {
      const gb = parseInt(storageGbMatch[1], 10);
      if (gb >= 128) addStructured(strat, 'Storage', 'min_tb', gb / 1000);
    }
  }

  // Apply GPU brand preference (also force required=true)
  if (text.includes('nvidia') || text.includes('rtx') || text.includes('geforce')) {
    intent.preferred_gpu_brand = 'nvidia';
    if (strat['Graphics Card']) strat['Graphics Card'].required = true;
  }
  if (text.includes('radeon') || text.includes('rx ') || /\brx\s?\d{3,4}/i.test(text)) {
    intent.preferred_gpu_brand = 'amd';
    if (strat['Graphics Card']) strat['Graphics Card'].required = true;
  }

  // Handle "no GPU" request
  const wantsNoGpu = /\b(?:no|without)\s+(?:a\s+)?(?:dedicated\s+)?(?:gpu|graphics(?:\s+card)?)\b/.test(text)
    || text.includes('apu build')
    || text.includes('integrated graphics only')
    || /\bigpu only\b/.test(text);
  if (wantsNoGpu) {
    intent.no_gpu = true;
    if (strat['Graphics Card']) {
      strat['Graphics Card'].required = false;
      strat['Graphics Card'].weight = 0;
    }
  }

  // Prevent double peripherals (combo keyboard+mouse rejection)
  if (!text.includes('combo')) {
    addExclude(strat, 'Keyboard', 'combo');
    addExclude(strat, 'Mouse', 'combo');
  }
};
