import express from 'express';
import fs from 'fs';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import Groq from 'groq-sdk';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // can use anon or service
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;


const app = express();
const port = process.env.PORT || 3001;

// Render (and most PaaS) run behind a reverse proxy and set X-Forwarded-For.
// express-rate-limit validates this header unless trust proxy is enabled.
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
    const line = `[http] ${req.method} ${req.url}`;
    console.log(line);
    process.stdout.write(`${line}\n`);
    next();
});

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Production default - 5 requests per 15 min
    message: { error: "You've reached the free limit of 5 builds per 15 minutes. Please wait, or enter your own API key in the settings to continue immediately." },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        // Skip rate limiting for test endpoint
        if (req.path === '/api/test/build') return true;
        // Skip for requests with custom API keys
        return (req.body && req.body.customKeys && req.body.customKeys.groq);
    }
});

const intentPrompt = `
You are a PC building assistant for the Bangladesh market.
Extract the user's requirements and return ONLY a valid JSON object, no explanation.

{
  "budget_bdt": number or null,
  "component_strategy": {
    "Monitor": { "weight": number, "required_keywords": ["keyword1"], "exclude_keywords": [], "structured_reqs": { "min_hz": 60 }, "required": boolean },
    "Processor": { "weight": number, "required_keywords": [], "exclude_keywords": [], "structured_reqs": {}, "required": boolean },
    "Motherboard": { "weight": number, "required_keywords": [], "exclude_keywords": [], "structured_reqs": {}, "required": boolean },
    "RAM": { "weight": number, "required_keywords": [], "exclude_keywords": [], "structured_reqs": { "min_gb": 16 }, "required": boolean },
    "Graphics Card": { "weight": number, "required_keywords": [], "exclude_keywords": [], "structured_reqs": {}, "required": boolean },
    "Storage": { "weight": number, "required_keywords": [], "exclude_keywords": [], "structured_reqs": { "min_tb": 1 }, "required": boolean },
    "PSU": { "weight": number, "required_keywords": [], "exclude_keywords": [], "structured_reqs": { "min_wattage": 500 }, "required": boolean },
    "Casing": { "weight": number, "required_keywords": [], "exclude_keywords": [], "structured_reqs": {}, "required": boolean },
    "CPU Cooler": { "weight": number, "required_keywords": [], "exclude_keywords": [], "structured_reqs": {}, "required": boolean },
    "Mouse": { "weight": number, "required_keywords": [], "exclude_keywords": [], "structured_reqs": {}, "required": boolean },
    "Keyboard": { "weight": number, "required_keywords": [], "exclude_keywords": [], "structured_reqs": {}, "required": boolean }
  },
  "preferred_site": "startech" | "techland" | "computermania" | null,
  "preferred_cpu_brand": "amd" | "intel" | null,
  "preferred_gpu_brand": "nvidia" | "amd" | null,
  "use_case": "gaming" | "editing" | "office" | "general"
}

Rules:
- component_strategy MUST include all 11 categories: Processor, Motherboard, RAM, Storage, Graphics Card, PSU, Casing, CPU Cooler, Monitor, Mouse, Keyboard.
- Weights dictate how the leftover budget is distributed. Give higher weights to more important components (e.g. GPU for gaming, Monitor for editing). Total weight can be any number.
- Keyword Constraints: Limit \`required_keywords\` to 1-2 standard retail terms. NEVER use subjective adjectives (e.g., "fast", "silent", "cheap"). For example, use "IPS" or "144Hz" for Monitor, "Ryzen 5" for Processor. If the user suggests multiple options (e.g., "Ryzen 7 OR Ryzen 9"), pick only ONE for \`required_keywords\`. \`required_keywords\` are treated as an AND condition.
- Structured First: If a requirement is numerical (e.g., 16GB RAM, 750W PSU), place it in \`structured_reqs\` (e.g., \`min_gb: 16\`, \`min_tb: 1\`, \`min_hz: 144\`, \`min_wattage: 750\`), NOT in \`required_keywords\`.
- Exclusions: If the user explicitly doesn't want something (e.g., "no RGB"), use \`exclude_keywords\`.
- no_gpu: If user says "no GPU" or "without GPU", set \`required: false\` and \`weight: 0\` for "Graphics Card".
- If user says DDR4/DDR5, put it in Motherboard and RAM \`required_keywords\` or \`exclude_keywords\` to enforce generation.
- Default needs_monitor, needs_mouse, needs_keyboard to true (required: true) unless user explicitly says they already have them (then set \`required: false\`).
- Return ONLY valid JSON.
`;

function parseBudgetFromMessage(message) {
    if (!message) return null;
    const text = message.toLowerCase();
    const normalized = text.replace(/[,]/g, '');

    // Look for budget explicitly if possible (e.g. "budget 80k" or "80k bdt")
    const budgetMatch = normalized.match(/budget\s*.*?(\d+(?:\.\d+)?)\s*k\b/) || normalized.match(/(\d+(?:\.\d+)?)\s*k\s*(?:bdt|tk|taka)/);
    if (budgetMatch) {
        const value = Math.round(parseFloat(budgetMatch[1]) * 1000);
        return Number.isFinite(value) ? value : null;
    }

    // Fallback to general K matching, but ignore common resolutions
    const kMatches = [...normalized.matchAll(/(\d+(?:\.\d+)?)\s*k\b/g)];
    for (const match of kMatches) {
        const num = parseFloat(match[1]);
        // Ignore 4k, 5k, 8k as they are usually resolutions. 
        if (num !== 4 && num !== 5 && num !== 8) {
            const value = Math.round(num * 1000);
            if (value >= 15000) return value;
        }
    }

    const numberMatch = normalized.match(/\b(\d{4,7})\b/);
    if (numberMatch) {
        const value = parseInt(numberMatch[1], 10);
        if (value >= 15000) return value;
    }
    return null;
}

function parseMonitorHz(message) {
    if (!message) return null;
    const match = message.toLowerCase().match(/(\d{2,3})\s*hz/);
    if (!match) return null;
    const value = parseInt(match[1], 10);
    return Number.isFinite(value) ? value : null;
}

function applyIntentOverrides(intent, message) {
    const text = (message || '').toLowerCase();
    const parsedBudget = parseBudgetFromMessage(message);
    if (parsedBudget) {
        const currentBudget = Number.isFinite(intent.budget_bdt) ? intent.budget_bdt : 0;
        const delta = Math.abs(parsedBudget - currentBudget);
        if (!currentBudget || delta >= Math.max(2000, currentBudget * 0.05)) {
            intent.budget_bdt = parsedBudget;
        }
    }

    if (!intent.component_strategy) return;
    const strat = intent.component_strategy;

    const addKeyword = (cat, kw) => {
        if (strat[cat]) {
            strat[cat].required_keywords = strat[cat].required_keywords || [];
            if (!strat[cat].required_keywords.some(k => k.toLowerCase() === kw.toLowerCase())) {
                strat[cat].required_keywords.push(kw);
            }
        }
    };

    const addStructured = (cat, key, val) => {
        if (strat[cat]) {
            strat[cat].structured_reqs = strat[cat].structured_reqs || {};
            strat[cat].structured_reqs[key] = val;
        }
    };

    const addExclude = (cat, kw) => {
        if (strat[cat]) {
            strat[cat].exclude_keywords = strat[cat].exclude_keywords || [];
            if (!strat[cat].exclude_keywords.some(k => k.toLowerCase() === kw.toLowerCase())) {
                strat[cat].exclude_keywords.push(kw);
            }
        }
    };

    const hasDdr5 = text.includes('ddr5');
    const hasDdr4 = text.includes('ddr4');
    if (hasDdr5 && !hasDdr4) { addKeyword('Motherboard', 'DDR5'); addKeyword('RAM', 'DDR5'); }
    if (hasDdr4 && !hasDdr5) { addKeyword('Motherboard', 'DDR4'); addKeyword('RAM', 'DDR4'); }
    if (hasDdr4 && hasDdr5) {
        // If both are mentioned (e.g., "DDR4 or DDR5"), we prefer DDR5 for high budgets, DDR4 for low,
        // or just let the LLM handle it. Adding both causes an AND constraint failure.
        // For safety, let's let the LLM's component_strategy dictate, or default to the newer DDR5 if budget > 100k
        const currentBudget = intent.budget_bdt || 0;
        if (currentBudget > 100000) { addKeyword('Motherboard', 'DDR5'); addKeyword('RAM', 'DDR5'); }
        else { addKeyword('Motherboard', 'DDR4'); addKeyword('RAM', 'DDR4'); }
    }
    if (text.includes('16gb')) addStructured('RAM', 'min_gb', 16);

    const hz = parseMonitorHz(message);
    if (hz) addStructured('Monitor', 'min_hz', hz);

    const storageTbMatch = text.match(/(\d+)\s*tb/);
    if (storageTbMatch) {
        addStructured('Storage', 'min_tb', parseInt(storageTbMatch[1], 10));
    } else {
        const storageGbMatch = text.match(/(\d+)\s*gb\s*(?:ssd|hdd|nvme|storage|m\.2)/);
        if (storageGbMatch) {
            const gb = parseInt(storageGbMatch[1], 10);
            if (gb >= 128) addStructured('Storage', 'min_tb', gb / 1000);
        }
    }

    if (text.includes('nvidia') || text.includes('rtx') || text.includes('geforce')) {
        intent.preferred_gpu_brand = 'nvidia';
        if (strat['Graphics Card']) strat['Graphics Card'].required = true;
    }
    if (text.includes('radeon') || text.includes('rx ')) {
        intent.preferred_gpu_brand = 'amd';
        if (strat['Graphics Card']) strat['Graphics Card'].required = true;
    }
    if (text.includes('no gpu') || text.includes('without gpu') || text.includes('no graphics')) {
        if (strat['Graphics Card']) {
            strat['Graphics Card'].required = false;
            strat['Graphics Card'].weight = 0;
        }
    }

    // Prevent double peripherals: automatically exclude "combo" from Keyboard/Mouse unless explicitly requested
    if (!text.includes('combo')) {
        addExclude('Keyboard', 'combo');
        addExclude('Mouse', 'combo');
    }
}

const CATEGORY_MAPPING = {
    'Processor': 'cpu',
    'Motherboard': 'motherboard',
    'RAM': 'ram',
    'Storage': 'storage',
    'Graphics Card': 'gpu',
    'PSU': 'psu',
    'Casing': 'casing',
    'CPU Cooler': 'cpu-cooler',
    'Monitor': 'monitor',
    'Mouse': 'mouse',
    'Keyboard': 'keyboard',
    'UPS': 'ups'
};


async function fetchPartsFromScraper(site, category, priceMin, priceMax, sortOrder) {
    try {
        if (!supabase) {
            console.error("Supabase not configured!");
            return [];
        }
        const dbCategory = CATEGORY_MAPPING[category];
        let query = supabase
            .from('components')
            .select('*')
            .eq('site', site)
            .eq('category', dbCategory)
            .eq('in_stock', true);

        if (priceMin !== undefined && priceMin !== null) query = query.gte('price', Math.round(priceMin));
        if (priceMax !== undefined && priceMax !== null) query = query.lte('price', Math.round(priceMax));

        if (sortOrder === 'price_asc') {
            query = query.order('price', { ascending: true });
        } else {
            query = query.order('price', { ascending: false });
        }

        query = query.limit(500);

        const { data, error } = await query;
        if (error) {
            console.error(`[supabase] error for ${dbCategory}:`, error);
            return [];
        }

        return data.map(p => {
            const enrichedSpecs = { ...p.specs };
            const inferred = inferSpecs(category, p.name);
            // Merge inferred specs (socket, brand, etc.) with existing specs from DB
            Object.keys(inferred).forEach(key => {
                if (!enrichedSpecs[key]) {
                    enrichedSpecs[key] = inferred[key];
                }
            });
            return {
                name: p.name,
                price: p.price,
                image: p.image,
                url: p.url,
                in_stock: p.in_stock,
                category: category,
                specs: enrichedSpecs
            };
        });
    } catch (e) {
        console.error(`Failed to fetch ${category} from Supabase`, e);
        return [];
    }
}

function inferSpecs(category, name) {
    const specs = {};
    const n = name.toLowerCase();

    if (category === 'Processor') {
        if (n.includes('amd') || n.includes('ryzen') || n.includes('athlon') || n.includes('threadripper')) specs.brand = 'amd';
        else if (n.includes('intel') || n.includes('core i') || n.includes('pentium') || n.includes('celeron')) specs.brand = 'intel';
        else specs.brand = 'unknown';
    }

    if (category === 'Processor' || category === 'Motherboard') {
        if (n.includes('am5') || n.includes('b650') || n.includes('x670') || n.includes('a620') || n.includes('x870') || n.match(/ryzen [579] 7\d{3}/) || n.match(/ryzen [579] 8\d{3}/) || n.match(/ryzen [579] 9[0-9]{3}/)) {
            specs.socket = 'AM5';
            specs.ram_type = 'DDR5';
        } else if (n.includes('am4') || n.includes('b450') || n.includes('b550') || n.includes('x570') || n.includes('a320') || n.includes('a520') || n.match(/ryzen [3579] [3456]\d{3}/) || n.includes('4600g') || n.includes('5600g') || n.includes('5700g')) {
            specs.socket = 'AM4';
            specs.ram_type = 'DDR4';
        } else if (n.includes('lga1700') || n.includes('lga 1700') || n.includes('h610') || n.includes('b660') || n.includes('b760') || n.includes('z690') || n.includes('z790') || n.match(/1[234][14679]00/)) {
            specs.socket = 'LGA1700';
            // Many Intel board listings don't clearly state DDR4/DDR5 in the title.
            // Avoid forcing a wrong type; treat as UNKNOWN unless explicitly present.
            specs.ram_type = (n.includes('ddr4')) ? 'DDR4' : (n.includes('ddr5') ? 'DDR5' : 'UNKNOWN');
        } else if (n.includes('lga1200') || n.includes('lga 1200') || n.includes('h410') || n.includes('b460') || n.includes('h510') || n.includes('b560') || n.includes('z490') || n.includes('z590') || n.match(/1[01][1479]00/) || n.includes('10105')) {
            specs.socket = 'LGA1200';
            specs.ram_type = 'DDR4';
        } else if (n.includes('lga1151') || n.includes('lga 1151') || n.includes('h310') || n.includes('b360') || n.includes('b365') || n.includes('z390') || n.match(/[89][1479]00/)) {
            specs.socket = 'LGA1151';
            specs.ram_type = 'DDR4';
        } else {
            specs.socket = 'UNKNOWN'; // Fallback
            specs.ram_type = (n.includes('ddr5')) ? 'DDR5' : (n.includes('ddr3') ? 'DDR3' : 'UNKNOWN');
        }
    }

    if (category === 'Processor') {
        if (n.includes('i9') || n.includes('ryzen 9')) specs.tdp = 125;
        else if (n.includes('i7') || n.includes('ryzen 7')) specs.tdp = 105;
        else specs.tdp = 65;
    }

    if (category === 'RAM') {
        if (n.includes('ddr5')) specs.ram_type = 'DDR5';
        else if (n.includes('ddr3')) specs.ram_type = 'DDR3';
        else specs.ram_type = 'DDR4';
    }

    if (category === 'Graphics Card') {
        if (n.includes('nvidia') || n.includes('geforce') || n.includes('rtx') || n.includes('gtx')) specs.gpu_brand = 'nvidia';
        else if (n.includes('radeon') || n.includes('rx ')) specs.gpu_brand = 'amd';
        else specs.gpu_brand = 'unknown';

        // Heuristic GPU power draw (rough) for PSU sizing.
        // Keep conservative to avoid undersizing PSUs when models are newer than our mapping.
        if (n.includes('4090')) specs.tdp = 450;
        else if (n.includes('5090')) specs.tdp = 450;
        else if (n.includes('4080') || n.includes('7900') || n.includes('5080')) specs.tdp = 320;
        else if (n.includes('4070') || n.includes('7800') || n.includes('5070')) specs.tdp = 220;
        else if (n.includes('4060') || n.includes('7600')) specs.tdp = 160;
        else if (n.includes('5060')) specs.tdp = 180;
        else specs.tdp = 180;
    }

    if (category === 'PSU') {
        // Try explicit wattage markers first (e.g. "750W", "500 Watt")
        let wattMatch = n.match(/(\d+)\s*(?:w\b|watt)/i);
        if (!wattMatch) {
            // Fallback: find 3-4 digit numbers in valid PSU wattage range
            // Catches "450M", "P750", "CX650M", "RM850x" naming patterns
            const candidates = [...n.matchAll(/(\d{3,4})/g)];
            for (const c of candidates) {
                const w = parseInt(c[1]);
                if (w >= 300 && w <= 1600) { wattMatch = c; break; }
            }
        }
        if (wattMatch) {
            const w = parseInt(wattMatch[1]);
            specs.wattage = (w >= 300 && w <= 1600) ? w : 500;
        } else {
            specs.wattage = 500;
        }
    }

    return specs;
}

// Reject ancient/office-grade GPUs for demanding workloads
function isGpuAdequateForUseCase(gpu, useCase) {
    if (!gpu) return true;
    const n = gpu.name.toLowerCase();

    // Reject GPUs with DDR3 VRAM — too old for any real workload
    if (n.includes('ddr3')) return false;

    // Reject GT series (not GTX/RTX) for editing and gaming — these are display adapters, not GPUs
    if (useCase === 'editing' || useCase === 'gaming') {
        // GT 610, GT 710, GT 730, GT 1030 etc. are office-only
        if (/\bgt\s*\d/i.test(n) && !/gtx/i.test(n) && !/gts/i.test(n)) return false;
        // Reject Radeon HD 5000/6000 series (ancient)
        if (/\bhd\s*[56]\d{3}/i.test(n)) return false;
        // Require at least 4GB VRAM for editing
        if (useCase === 'editing') {
            const vramMatch = n.match(/(\d+)\s*gb/);
            if (vramMatch && parseInt(vramMatch[1]) < 4) return false;
        }
    }
    return true;
}

// Helper to determine if a CPU has an integrated GPU
function cpuHasIntegratedGraphics(p) {
    if (!p) return false;
    const n = p.name.toLowerCase();
    if (n.includes('amd') || n.includes('ryzen') || n.includes('athlon') || n.includes('radeon')) {
        return n.includes('g ') || n.includes('ge ') || n.includes('g-') || n.endsWith('g') || n.endsWith('ge') || n.includes('8700g') || n.includes('8600g') || n.includes('8500g') || n.includes('8300g');
    }
    if (n.includes('intel') || n.includes('core') || n.includes('pentium')) {
        return !n.includes('f ') && !n.includes('f-') && !n.endsWith('f') && !n.includes('kf');
    }
    return true; // Fail-open
}

// Helper to prevent CPU/GPU bottlenecks
function isCpuBalanced(cpu, gpu) {
    if (!gpu || !cpu) return true;
    const n = cpu.name.toLowerCase();
    if (gpu.price >= 220000) {
        // Only i9/Ryzen 9 allowed above this price
        if (!n.includes('i9') && !n.includes('ryzen 9')) return false;
    } else if (gpu.price >= 140000) {
        // i7/Ryzen 7 minimum above this price
        if (!n.includes('i9') && !n.includes('i7') && !n.includes('ryzen 9') && !n.includes('ryzen 7')) return false;
    }
    return true;
}

// Extract storage capacity in GB from product name
function parseStorageCapacityGB(name) {
    const n = name.toLowerCase();
    const tbMatch = n.match(/(\d+(?:\.\d+)?)\s*tb/);
    if (tbMatch) return parseFloat(tbMatch[1]) * 1000;
    const gbMatch = n.match(/(\d+)\s*gb/);
    if (gbMatch) {
        const gb = parseInt(gbMatch[1]);
        if (gb >= 120) return gb;
    }
    return 0;
}

function getQualityFloorFilter(strategy) {
    return (p) => {
        if (!strategy) return true;
        // Structured Reqs
        if (strategy.structured_reqs) {
            if (strategy.structured_reqs.min_wattage && (p.specs.wattage || 0) < strategy.structured_reqs.min_wattage) return false;
            if (strategy.structured_reqs.min_gb) {
                const name = p.name.toLowerCase();
                const gb = strategy.structured_reqs.min_gb;
                const half = gb / 2;
                const gbMatch = name.includes(`${gb}gb`) || name.includes(`${gb} gb`) || name.includes(`2x${half}gb`) || name.includes(`2x${half} gb`) || name.includes(`${gb}g `);
                if (!gbMatch) return false;
            }
            if (strategy.structured_reqs.min_tb) {
                const capGB = parseStorageCapacityGB(p.name);
                if (capGB < strategy.structured_reqs.min_tb * 1000 * 0.9) return false;
            }
            if (strategy.structured_reqs.min_hz) {
                const parsedHz = parseMonitorHz(p.name);
                const actualHz = parsedHz !== null ? parsedHz : 60; // Assume 60Hz if not explicitly stated in name
                if (actualHz < strategy.structured_reqs.min_hz) return false;
            }
        }
        // Exclude
        const pName = p.name.toLowerCase();
        if (strategy.exclude_keywords && strategy.exclude_keywords.length > 0) {
            for (const kw of strategy.exclude_keywords) {
                if (pName.includes(kw.toLowerCase())) return false;
            }
        }
        // Require
        if (strategy.required_keywords && strategy.required_keywords.length > 0) {
            for (const kw of strategy.required_keywords) {
                if (!pName.includes(kw.toLowerCase())) return false;
            }
        }
        return true;
    };
}

function getPsuWattageFloor(intent, cpu, gpu) {
    const useCase = intent?.use_case || 'general';
    const budget = intent?.budget_bdt || 0;
    const tier = budget >= 150000 ? 'high-end' : (budget < 40000 ? 'budget' : 'mid');

    let floor = 500;
    if (useCase === 'gaming' && gpu) {
        floor = 650;
        if (tier === 'high-end') floor = 750;
        if (tier === 'budget') floor = 550;
    }

    const gpuTdp = gpu?.specs?.tdp || 0;
    if (gpuTdp >= 450) floor = Math.max(floor, 1000);
    else if (gpuTdp >= 400) floor = Math.max(floor, 850);
    else if (gpuTdp >= 350) floor = Math.max(floor, 800);
    else if (gpuTdp >= 320) floor = Math.max(floor, 750);
    else if (gpuTdp >= 250) floor = Math.max(floor, 700);
    else if (gpuTdp >= 200) floor = Math.max(floor, 650);

    const cpuTdp = cpu?.specs?.tdp || 0;
    if (cpuTdp >= 125 && gpu) floor = Math.max(floor, 650);

    return floor;
}

function computeTargetPsuWattage(intent, cpu, gpu) {
    const cpuTdp = cpu?.specs?.tdp || 65;
    const gpuTdp = gpu?.specs?.tdp || 0;

    const useCase = intent?.use_case || 'general';
    const multiplier = (useCase === 'gaming' && gpu) ? 1.4 : 1.3;
    const additive = gpu ? 100 : 60;

    const required = cpuTdp + gpuTdp;
    const computed = (required * multiplier) + additive;
    const floored = Math.max(computed, getPsuWattageFloor(intent, cpu, gpu));

    return Math.ceil(floored / 50) * 50;
}

function sortParts(parts, sortOrder) {
    if (sortOrder === 'price_asc') {
        parts.sort((a, b) => a.price - b.price);
    } else {
        parts.sort((a, b) => b.price - a.price);
    }
    return parts;
}

async function getPartsCached(cache, site, category, range, sortOrder) {
    const min = range?.min;
    const max = range?.max;
    const key = `${(site || '').trim().toLowerCase()}:${category}:${min || 0}-${max || 0}:${sortOrder || 'none'}`;
    const entry = cache.get(key);
    if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.data;

    const parts = await fetchPartsFromScraper(site, category, min, max, sortOrder);
    let filtered = parts.filter(p => p.price !== null && p.in_stock);
    if (min !== undefined && min !== null) filtered = filtered.filter(p => p.price >= min);
    if (max !== undefined && max !== null) filtered = filtered.filter(p => p.price <= max);
    sortParts(filtered, sortOrder || 'price_desc');
    cache.set(key, { data: filtered, ts: Date.now() });
    return filtered;
}

async function selectPart(cache, site, category, range, sortOrder, filterFn) {
    let parts = await getPartsCached(cache, site, category, range, sortOrder);
    let candidates = filterFn ? parts.filter(filterFn) : parts;
    return candidates[0] || null;
}

async function selectWithFallback(cache, site, category, range, sortOrder, filterFn, globalRemaining) {
    let part = await selectPart(cache, site, category, range, sortOrder, filterFn);
    if (!part && range && range.max > 0) {
        const overspendFactor = category === 'PSU' ? 1.5 : 1.25;
        const fallbackMax = Math.max(range.max, Math.min(Math.round(range.max * overspendFactor), globalRemaining || Infinity));

        if (fallbackMax > range.max) {
            const aboveRange = { min: range.max, max: fallbackMax };
            part = await selectPart(cache, site, category, aboveRange, 'price_asc', filterFn);
        }
        if (!part) {
            const belowRange = { min: 0, max: range.min };
            part = await selectPart(cache, site, category, belowRange, 'price_desc', filterFn);
        }
        if (!part && fallbackMax > 0) {
            const survivalRange = { min: 0, max: fallbackMax };
            part = await selectPart(cache, site, category, survivalRange, 'price_asc', filterFn);
        }
    }
    return part;
}

async function getCheapestPart(cache, site, category, budget, filterFn) {
    let parts = await getPartsCached(cache, site, category, { min: 0, max: budget }, 'price_asc');
    let candidates = filterFn ? parts.filter(filterFn) : parts;
    return candidates[0] || null;
}

async function calculateFloorPrices(cache, site, blueprint, budget) {
    let totalFloor = 0;
    let error = null;
    const minimums = {};

    const categories = Object.keys(blueprint.component_strategy || {});

    for (const category of categories) {
        const strategy = blueprint.component_strategy[category];
        if (!strategy || !strategy.required || (site === 'computermania' && ['Monitor', 'Mouse', 'Keyboard'].includes(category))) {
            minimums[category] = 0;
            continue;
        }

        // Keyword Degradation Safety Net loop
        let keywordsToTry = [...(strategy.required_keywords || [])];
        let structuredReqs = { ...strategy.structured_reqs };
        let part = null;

        while (true) {
            const tempStrategy = { ...strategy, required_keywords: keywordsToTry, structured_reqs: structuredReqs };
            const baseFilter = getQualityFloorFilter(tempStrategy);
            const filterFn = (p) => {
                if (!baseFilter(p)) return false;
                if (category === 'Processor') {
                    const brandMatch = !blueprint.preferred_cpu_brand || p.specs.brand === blueprint.preferred_cpu_brand.toLowerCase();
                    if (!brandMatch) return false;
                    if (!p.specs.socket || p.specs.socket === 'UNKNOWN') return false;

                    const noGpu = blueprint.no_gpu || (blueprint.component_strategy?.['Graphics Card'] && !blueprint.component_strategy['Graphics Card'].required) || false;
                    if (noGpu && !cpuHasIntegratedGraphics(p)) return false;
                    const ramStrategy = blueprint.component_strategy['RAM'] || {};
                    const requestedRamType = (ramStrategy.required_keywords || []).find(k => k.toLowerCase() === 'ddr4' || k.toLowerCase() === 'ddr5');
                    if (requestedRamType) {
                        const reqType = requestedRamType.toUpperCase();
                        if (reqType === 'DDR5' && (p.specs.socket === 'AM4' || p.specs.socket === 'LGA1200' || p.specs.socket === 'LGA1151')) return false;
                        if (reqType === 'DDR4' && p.specs.socket === 'AM5') return false;
                        if (reqType === 'DDR3' && (p.specs.socket === 'AM4' || p.specs.socket === 'AM5' || p.specs.socket === 'LGA1700')) return false;
                    }
                }
                if (category === 'Motherboard') {
                    if (p.specs.socket === 'UNKNOWN') return false;
                    const ramStrategy = blueprint.component_strategy['RAM'] || {};
                    const requestedRamType = (ramStrategy.required_keywords || []).find(k => k.toLowerCase() === 'ddr4' || k.toLowerCase() === 'ddr5');
                    if (requestedRamType) {
                        const reqType = requestedRamType.toUpperCase();
                        if (p.specs.ram_type && p.specs.ram_type !== 'UNKNOWN' && p.specs.ram_type !== reqType) return false;
                        if (p.specs.socket === 'LGA1700' && p.specs.ram_type === 'UNKNOWN') return false;
                    }
                }
                if (category === 'Graphics Card') {
                    if (blueprint.preferred_gpu_brand && p.specs.gpu_brand !== blueprint.preferred_gpu_brand.toLowerCase()) return false;
                    if (!isGpuAdequateForUseCase(p, blueprint.use_case)) return false;
                }
                if (category === 'PSU') {
                    const estimatedTarget = computeTargetPsuWattage(blueprint, null, null);
                    if (p.specs.wattage < estimatedTarget) return false;
                }
                return true;
            };
            part = await getCheapestPart(cache, site, category, budget, filterFn);

            if (part) {
                blueprint.component_strategy[category].required_keywords = [...keywordsToTry];
                blueprint.component_strategy[category].structured_reqs = { ...structuredReqs };
                break; // found it
            } else if (keywordsToTry.length > 0) {
                const dropped = keywordsToTry.pop();
                console.warn(`Dropped keyword '${dropped}' for ${category} to find matching part`);
            } else if (category === 'RAM' && structuredReqs.min_gb && structuredReqs.min_gb > 16) {
                // Fallback: reduce RAM requirement incrementally (64GB → 32GB → 16GB)
                const previousReq = structuredReqs.min_gb;
                if (previousReq >= 32) {
                    structuredReqs.min_gb = 32;
                    console.warn(`Reduced ${category} requirement from ${previousReq}GB to 32GB to find matching part`);
                } else if (previousReq >= 24) {
                    structuredReqs.min_gb = 16;
                    console.warn(`Reduced ${category} requirement from ${previousReq}GB to 16GB to find matching part`);
                } else {
                    delete structuredReqs.min_gb;
                    console.warn(`Removed min_gb requirement for ${category} to find matching part`);
                }
            } else if (category === 'Storage' && structuredReqs.min_tb && structuredReqs.min_tb > 1) {
                // Fallback: reduce storage requirement (2TB → 1TB)
                const previousReq = structuredReqs.min_tb;
                structuredReqs.min_tb = 1;
                console.warn(`Reduced ${category} requirement from ${previousReq}TB to 1TB to find matching part`);
            } else if (category === 'Monitor' && structuredReqs.min_hz && structuredReqs.min_hz > 60) {
                // Fallback: reduce monitor Hz requirement
                const previousReq = structuredReqs.min_hz;
                if (previousReq >= 144) {
                    structuredReqs.min_hz = 60;
                    console.warn(`Reduced ${category} requirement from ${previousReq}Hz to 60Hz to find matching part`);
                }
            } else {
                break; // out of fallbacks
            }
        }

        if (!part) {
            const reqs = (strategy.required_keywords && strategy.required_keywords.length > 0) ? strategy.required_keywords.join(", ") : "specific features";
            error = `To meet your specific requirements (e.g., ${reqs}) for ${category}, no matching part was found in the current inventory. Please relax your requirements.`;
            break;
        }

        minimums[category] = part.price;
        totalFloor += part.price;

        if (category === 'Processor' && part.specs.tdp >= 105) {
            if (!blueprint.component_strategy['CPU Cooler'] || !blueprint.component_strategy['CPU Cooler'].required) {
                const coolerFloor = await getCheapestPart(cache, site, 'CPU Cooler', budget, null);
                if (coolerFloor) {
                    minimums['CPU Cooler'] = coolerFloor.price;
                    totalFloor += coolerFloor.price;
                }
            }
        }
    }

    if (!error && totalFloor > budget) {
        error = `To meet your specific requirements, the absolute minimum cost from current inventory is ${totalFloor} BDT. Your budget is ${budget} BDT. Please increase your budget or relax your requirements.`;
    }

    return { minimums, totalFloor, error };
}
const globalPartsCache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000;
const sanitizeKey = (k) => (typeof k === 'string' && k.length < 200) ? k.trim() : null;

// Periodic cleanup of expired cache entries
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of globalPartsCache.entries()) {
        if (now - entry.ts >= CACHE_TTL_MS) globalPartsCache.delete(key);
    }
}, CACHE_TTL_MS);

app.post('/api/build', apiLimiter, async (req, res) => {
    try {
        const { message, site: bodySite, customKeys = {} } = req.body;
        console.log("[build] Incoming request");
        if (!message || message.length > 2000) {
            return res.status(400).json({ error: 'Message is required and must be under 2000 characters.' });
        }
        if (bodySite && !['startech', 'techland', 'computermania'].includes(bodySite)) {
            return res.status(400).json({ error: 'Invalid site selected' });
        }
        if (customKeys && typeof customKeys !== 'object') {
            return res.status(400).json({ error: 'Invalid customKeys format' });
        }

        const getGroqClient = () => {
            const key = sanitizeKey(customKeys.groq) || process.env.GROQ_API_KEY;
            if (!key) throw new Error("Groq API key is missing");
            return new Groq({ apiKey: key });
        };

        const fetchIntent = async () => {
            const client = getGroqClient();
            try {
                const intentResponse = await client.chat.completions.create({
                    model: "llama-3.3-70b-versatile",
                    messages: [
                        { role: "system", content: intentPrompt },
                        { role: "user", content: message }
                    ],
                    temperature: 0.1,
                });
                return intentResponse.choices[0].message.content;
            } catch (error) {
                console.warn("llama-3.3-70b-versatile failed for intent extraction. Falling back to llama-3.1-8b-instant...", error.message);
                const fallbackResponse = await client.chat.completions.create({
                    model: "llama-3.1-8b-instant",
                    messages: [
                        { role: "system", content: intentPrompt },
                        { role: "user", content: message }
                    ],
                    temperature: 0.1,
                });
                return fallbackResponse.choices[0].message.content;
            }
        };

        let intentText = "";

        try {
            intentText = await fetchIntent();
        } catch (error) {
            console.error("Groq API failed for intent extraction.", error);
            return res.status(500).json({ error: "The AI service is currently unavailable or rate limited. Please try again later or provide your own Groq API key." });
        }
        intentText = intentText.replace(/```json/g, '').replace(/```/g, '').trim();

        let intent;
        try {
            intent = JSON.parse(intentText);
        } catch (e) {
            console.error("Failed to parse intent JSON:", intentText);
            return res.status(500).json({ error: 'Failed to process your request correctly.' });
        }
        applyIntentOverrides(intent, message);
        console.log("Extracted intent:", JSON.stringify(intent, null, 2));

        if (!intent.budget_bdt) {
            return res.json({
                error: "I need a budget to build a PC. Please specify your budget in BDT."
            });
        }

        if (intent.budget_bdt < 20000) {
            return res.json({
                error: "Your budget is a bit too low to build a functional new PC. The minimum budget required is around 20,000 BDT. Please increase your budget or consider used parts."
            });
        }

        const VALID_SITES = ['startech', 'techland', 'computermania'];
        const site = (VALID_SITES.includes(bodySite) ? bodySite : null)
            || (VALID_SITES.includes(intent.preferred_site) ? intent.preferred_site : null)
            || 'startech';

        console.log(`Building PC from ${site} for ${intent.budget_bdt} BDT`);

        const budget = intent.budget_bdt;
        const budgetCeiling = budget + Math.min(budget * 0.03, 12000);
        const noGpu = intent.no_gpu || (intent.component_strategy && intent.component_strategy['Graphics Card'] && !intent.component_strategy['Graphics Card'].required) || false;
        const partsCache = globalPartsCache;

        let selectedBuild = {
            Processor: null,
            Motherboard: null,
            RAM: null,
            Storage: null,
            "Graphics Card": null,
            PSU: null,
            Casing: null,
            "CPU Cooler": null,
            Monitor: null,
            Mouse: null,
            Keyboard: null
        };

        let totalCost = 0;

        console.log("PHASE 1 & 2: Dynamic Blueprint Reality Check & Weighted Budget Allocation");
        const floorCheck = await calculateFloorPrices(partsCache, site, intent, budgetCeiling);
        if (floorCheck.error) {
            return res.json({ error: floorCheck.error });
        }

        let totalWeight = 0;
        const categories = Object.keys(intent.component_strategy || {});
        for (const cat of categories) {
            if (intent.component_strategy[cat] && intent.component_strategy[cat].required && !(site === 'computermania' && ['Monitor', 'Mouse', 'Keyboard'].includes(cat))) {
                totalWeight += intent.component_strategy[cat].weight || 1;
            }
        }

        const leftoverBudget = Math.max(0, budgetCeiling - floorCheck.totalFloor);
        const dynamicBudgets = {};
        for (const cat of categories) {
            if (intent.component_strategy[cat] && intent.component_strategy[cat].required && !(site === 'computermania' && ['Monitor', 'Mouse', 'Keyboard'].includes(cat))) {
                const weight = intent.component_strategy[cat].weight || 1;
                dynamicBudgets[cat] = Math.round(floorCheck.minimums[cat] + ((weight / totalWeight) * leftoverBudget));
            } else {
                dynamicBudgets[cat] = 0;
            }
        }

        console.log("=".repeat(60));
        console.log(`Total Budget: ${budget} BDT (Ceiling: ${budgetCeiling})`);
        console.log(`Total Floor Price: ${floorCheck.totalFloor} BDT`);
        console.log(`Leftover Budget: ${leftoverBudget} BDT`);
        console.log("Dynamic Budgets:", dynamicBudgets);
        console.log("=".repeat(60));

        console.log("\nPHASE 3: Selecting components using Dynamic Budgets...");

        let needsCooler = false;

        // CPU
        if (dynamicBudgets['Processor'] > 0) {
            const cpuAllowedMax = dynamicBudgets['Processor'];
            const cpuRange = { min: 0, max: cpuAllowedMax };
            const cpuCondition = (p) => {
                const brandMatch = !intent.preferred_cpu_brand || p.specs.brand === intent.preferred_cpu_brand.toLowerCase();
                if (!brandMatch) return false;
                if (!p.specs.socket || p.specs.socket === 'UNKNOWN') return false;
                if (noGpu && !cpuHasIntegratedGraphics(p)) return false;

                // Enforce RAM compatibility if the LLM required a specific RAM type
                const ramStrategy = intent.component_strategy['RAM'] || {};
                const requestedRamType = (ramStrategy.required_keywords || []).find(k => k.toLowerCase() === 'ddr4' || k.toLowerCase() === 'ddr5');
                if (requestedRamType) {
                    const reqType = requestedRamType.toUpperCase();
                    if (reqType === 'DDR5' && (p.specs.socket === 'AM4' || p.specs.socket === 'LGA1200' || p.specs.socket === 'LGA1151')) return false;
                    if (reqType === 'DDR4' && p.specs.socket === 'AM5') return false;
                    if (reqType === 'DDR3' && (p.specs.socket === 'AM4' || p.specs.socket === 'AM5' || p.specs.socket === 'LGA1700')) return false;
                }
                return getQualityFloorFilter(intent.component_strategy['Processor'])(p);
            };
            selectedBuild.Processor = await selectWithFallback(partsCache, site, 'Processor', cpuRange, 'price_desc', cpuCondition, budgetCeiling - totalCost);
            if (selectedBuild.Processor) {
                console.log(`✓ Processor: ${selectedBuild.Processor.name} - ${selectedBuild.Processor.price} BDT`);
                totalCost += selectedBuild.Processor.price;
                if (selectedBuild.Processor.specs.tdp >= 105) needsCooler = true;
            } else {
                return res.json({ error: "Could not find a compatible Processor within the allocated budget." });
            }
        }

        // Motherboard
        if (dynamicBudgets['Motherboard'] > 0 && selectedBuild.Processor) {
            const moboAllowedMax = dynamicBudgets['Motherboard'];
            const moboRange = { min: 0, max: moboAllowedMax };
            const moboCondition = p => {
                if (p.specs.socket === 'UNKNOWN') return false;
                if (p.specs.socket !== selectedBuild.Processor.specs.socket) return false;

                const ramStrategy = intent.component_strategy['RAM'] || {};
                const requestedRamType = (ramStrategy.required_keywords || []).find(k => k.toLowerCase() === 'ddr4' || k.toLowerCase() === 'ddr5');
                if (requestedRamType) {
                    if (p.specs.socket === 'LGA1700' && p.specs.ram_type === 'UNKNOWN') return false;
                }
                return getQualityFloorFilter(intent.component_strategy['Motherboard'])(p);
            };
            selectedBuild.Motherboard = await selectWithFallback(partsCache, site, 'Motherboard', moboRange, 'price_desc', moboCondition, budgetCeiling - totalCost);
            if (!selectedBuild.Motherboard) {
                // Expand range slightly if we missed by a few bucks
                const expandedRange = { min: 0, max: Math.round(moboAllowedMax * 1.1) };
                selectedBuild.Motherboard = await selectPart(partsCache, site, 'Motherboard', expandedRange, 'price_desc', moboCondition);
            }
            if (selectedBuild.Motherboard) {
                if (selectedBuild.Motherboard.specs.ram_type === 'UNKNOWN' && selectedBuild.Processor) {
                    selectedBuild.Motherboard.specs.ram_type = selectedBuild.Processor.specs.ram_type;
                }
                console.log(`✓ Motherboard: ${selectedBuild.Motherboard.name} - ${selectedBuild.Motherboard.price} BDT`);
                totalCost += selectedBuild.Motherboard.price;
            } else {
                return res.json({ error: `Could not find a compatible ${selectedBuild.Processor.specs.socket} Motherboard within allocated budget.` });
            }
        }

        // RAM
        if (dynamicBudgets['RAM'] > 0) {
            const ramAllowedMax = dynamicBudgets['RAM'];
            const ramRange = { min: 0, max: ramAllowedMax };

            const ramStrategy = intent.component_strategy['RAM'];
            const ramCondition = p => {
                const desiredRamType = selectedBuild.Motherboard?.specs?.ram_type && selectedBuild.Motherboard.specs.ram_type !== 'UNKNOWN'
                    ? selectedBuild.Motherboard.specs.ram_type : null;
                if (desiredRamType && p.specs.ram_type !== desiredRamType) return false;
                return getQualityFloorFilter(ramStrategy)(p);
            };

            selectedBuild.RAM = await selectWithFallback(partsCache, site, 'RAM', ramRange, 'price_asc', ramCondition, budgetCeiling - totalCost);
            if (selectedBuild.RAM) {
                console.log(`✓ RAM: ${selectedBuild.RAM.name} - ${selectedBuild.RAM.price} BDT`);
                totalCost += selectedBuild.RAM.price;
            } else {
                return res.json({ error: "Could not find compatible RAM within allocated budget." });
            }
        }

        // Graphics Card
        const gpuStrategy = intent.component_strategy['Graphics Card'];
        if (gpuStrategy && gpuStrategy.required && !noGpu) {
            const gpuAllowedMax = dynamicBudgets['Graphics Card'];
            const gpuRange = { min: 0, max: gpuAllowedMax };
            const gpuFilter = p => {
                if (intent.preferred_gpu_brand && p.specs.gpu_brand !== intent.preferred_gpu_brand.toLowerCase()) return false;
                if (!isGpuAdequateForUseCase(p, intent.use_case)) return false;
                if (!isCpuBalanced(selectedBuild.Processor, p)) return false;
                return getQualityFloorFilter(intent.component_strategy['Graphics Card'])(p);
            };
            selectedBuild["Graphics Card"] = await selectWithFallback(partsCache, site, 'Graphics Card', gpuRange, 'price_desc', gpuFilter, budgetCeiling - totalCost);
            if (selectedBuild["Graphics Card"]) {
                console.log(`✓ GPU: ${selectedBuild["Graphics Card"].name} - ${selectedBuild["Graphics Card"].price} BDT`);
                totalCost += selectedBuild["Graphics Card"].price;
            }
        }

        // PSU
        if (dynamicBudgets['PSU'] > 0) {
            const targetPsuWattage = computeTargetPsuWattage(intent, selectedBuild.Processor, selectedBuild["Graphics Card"]);
            const psuAllowedMax = dynamicBudgets['PSU'];
            const psuRange = { min: 0, max: psuAllowedMax };
            const psuCondition = p => p.specs.wattage >= targetPsuWattage && getQualityFloorFilter(intent.component_strategy['PSU'])(p);
            selectedBuild.PSU = await selectWithFallback(partsCache, site, 'PSU', psuRange, 'price_asc', psuCondition, budgetCeiling - totalCost);
            if (selectedBuild.PSU) {
                console.log(`✓ PSU: ${selectedBuild.PSU.name} - ${selectedBuild.PSU.price} BDT`);
                totalCost += selectedBuild.PSU.price;
            } else {
                return res.json({ error: `Could not find a PSU with at least ${Math.round(targetPsuWattage)}W.` });
            }
        }

        // Storage
        if (dynamicBudgets['Storage'] > 0) {
            const storageAllowedMax = dynamicBudgets['Storage'];
            const storageRange = { min: 0, max: storageAllowedMax };
            selectedBuild.Storage = await selectWithFallback(partsCache, site, 'Storage', storageRange, 'price_desc', getQualityFloorFilter(intent.component_strategy['Storage']), budgetCeiling - totalCost);
            if (selectedBuild.Storage) {
                console.log(`✓ Storage: ${selectedBuild.Storage.name} - ${selectedBuild.Storage.price} BDT`);
                totalCost += selectedBuild.Storage.price;
            }
        }

        // CPU Cooler
        if (dynamicBudgets['CPU Cooler'] > 0 || needsCooler) {
            const coolerAllowedMax = dynamicBudgets['CPU Cooler'] || Math.min(5000, Math.max(0, budgetCeiling - totalCost));
            if (coolerAllowedMax > 0) {
                const coolerRange = { min: 0, max: coolerAllowedMax };
                const cooler = await selectWithFallback(partsCache, site, 'CPU Cooler', coolerRange, 'price_desc', getQualityFloorFilter(intent.component_strategy['CPU Cooler'] || {}), budgetCeiling - totalCost);
                if (cooler) {
                    selectedBuild["CPU Cooler"] = cooler;
                    console.log(`✓ CPU Cooler: ${cooler.name} - ${cooler.price} BDT`);
                    totalCost += cooler.price;
                }
            }
        }

        // Casing
        if (dynamicBudgets['Casing'] > 0) {
            const casingAllowedMax = dynamicBudgets['Casing'];
            const casingRange = { min: 0, max: casingAllowedMax };
            const casing = await selectWithFallback(partsCache, site, 'Casing', casingRange, 'price_desc', getQualityFloorFilter(intent.component_strategy['Casing']), budgetCeiling - totalCost);
            if (casing) {
                selectedBuild.Casing = casing;
                console.log(`✓ Casing: ${casing.name} - ${casing.price} BDT`);
                totalCost += casing.price;
            }
        }

        // Peripherals
        if (dynamicBudgets['Monitor'] > 0) {
            const monMax = dynamicBudgets['Monitor'];
            selectedBuild.Monitor = await selectWithFallback(partsCache, site, 'Monitor', { min: 0, max: monMax }, 'price_desc', getQualityFloorFilter(intent.component_strategy['Monitor']), budgetCeiling - totalCost);
            if (selectedBuild.Monitor) {
                console.log(`✓ Monitor: ${selectedBuild.Monitor.name} - ${selectedBuild.Monitor.price} BDT`);
                totalCost += selectedBuild.Monitor.price;
            }
        }
        if (dynamicBudgets['Mouse'] > 0) {
            const mouseMax = dynamicBudgets['Mouse'];
            selectedBuild.Mouse = await selectWithFallback(partsCache, site, 'Mouse', { min: 0, max: mouseMax }, 'price_desc', getQualityFloorFilter(intent.component_strategy['Mouse']), budgetCeiling - totalCost);
            if (selectedBuild.Mouse) {
                console.log(`✓ Mouse: ${selectedBuild.Mouse.name} - ${selectedBuild.Mouse.price} BDT`);
                totalCost += selectedBuild.Mouse.price;
            }
        }
        if (dynamicBudgets['Keyboard'] > 0) {
            const keyMax = dynamicBudgets['Keyboard'];
            selectedBuild.Keyboard = await selectWithFallback(partsCache, site, 'Keyboard', { min: 0, max: keyMax }, 'price_desc', getQualityFloorFilter(intent.component_strategy['Keyboard']), budgetCeiling - totalCost);
            if (selectedBuild.Keyboard) {
                console.log(`✓ Keyboard: ${selectedBuild.Keyboard.name} - ${selectedBuild.Keyboard.price} BDT`);
                totalCost += selectedBuild.Keyboard.price;
            }
        }

        console.log("\nPHASE 4: Rebalancing underspent budget...");
        const underspendTolerance = Math.min(budget * 0.005, 1500);
        const targetMinSpend = Math.max(0, budget - underspendTolerance);

        const isHighEnd = intent.budget_bdt >= 150000;
        const maxRebalanceIterations = isHighEnd ? 7 : 6;
        for (let i = 0; i < maxRebalanceIterations; i++) {
            if (totalCost >= targetMinSpend) break;
            const remaining = budgetCeiling - totalCost;
            if (remaining < 300) break;

            const upgradeCandidates = ['Graphics Card', 'Monitor', 'Processor', 'Motherboard', 'RAM', 'Storage', 'PSU', 'CPU Cooler', 'Casing', 'Keyboard', 'Mouse'];
            let best = null;

            upgradeCandidates.forEach(category => {
                const current = selectedBuild[category];
                if (!current) return;

                const strategy = intent.component_strategy[category];
                if (!strategy || !strategy.required) return;

                // The AI-defined weight becomes the multiplier for the gap
                const weight = strategy.weight || 1;

                // Allowed max is the existing dynamic budget + remaining
                const expandedMax = Math.min(current.price + remaining, budgetCeiling);
                const gap = expandedMax - current.price;
                const score = gap * weight;

                if (gap > 200 && (!best || score > best.score)) {
                    best = { category, possibleMax: expandedMax, gap, score, filter: getQualityFloorFilter(strategy) };
                }
            });

            if (!best) break;

            const currentPart = selectedBuild[best.category];
            const upgradeRange = {
                min: currentPart.price + 1,
                max: best.possibleMax
            };
            if (upgradeRange.max <= upgradeRange.min) break;

            let filterFn = best.filter;
            if (best.category === 'Graphics Card') {
                filterFn = p => {
                    if (intent.preferred_gpu_brand && p.specs.gpu_brand !== intent.preferred_gpu_brand.toLowerCase()) return false;
                    if (!isGpuAdequateForUseCase(p, intent.use_case)) return false;
                    if (!isCpuBalanced(selectedBuild.Processor, p)) return false;
                    const psuOk = selectedBuild.PSU?.specs?.wattage
                        ? selectedBuild.PSU.specs.wattage >= computeTargetPsuWattage(intent, selectedBuild.Processor, p)
                        : true;
                    return psuOk && best.filter(p);
                };
            } else if (best.category === 'Processor') {
                filterFn = p => {
                    const brandMatch = !intent.preferred_cpu_brand || p.specs.brand === intent.preferred_cpu_brand.toLowerCase();
                    const socketMatch = selectedBuild.Motherboard ? p.specs.socket === selectedBuild.Motherboard.specs.socket : true;
                    if (!brandMatch || !socketMatch) return false;
                    if (noGpu && !cpuHasIntegratedGraphics(p)) return false;
                    const psuOk = selectedBuild.PSU?.specs?.wattage
                        ? selectedBuild.PSU.specs.wattage >= computeTargetPsuWattage(intent, p, selectedBuild["Graphics Card"])
                        : true;
                    return psuOk && best.filter(p);
                };
            } else if (best.category === 'Motherboard') {
                filterFn = p => {
                    if (!selectedBuild.Processor) return false;
                    if (p.specs.socket === 'UNKNOWN' || selectedBuild.Processor.specs.socket === 'UNKNOWN') return false;
                    if (p.specs.socket !== selectedBuild.Processor.specs.socket) return false;
                    const desiredRamType = selectedBuild.RAM?.specs?.ram_type || intent.ram_type;
                    if (desiredRamType && p.specs.ram_type !== 'UNKNOWN' && p.specs.ram_type !== desiredRamType) return false;
                    if (desiredRamType && p.specs.socket === 'LGA1700' && p.specs.ram_type === 'UNKNOWN') return false;
                    return best.filter(p);
                };
            } else if (best.category === 'RAM') {
                filterFn = p => {
                    const desiredRamType = selectedBuild.Motherboard?.specs?.ram_type && selectedBuild.Motherboard.specs.ram_type !== 'UNKNOWN'
                        ? selectedBuild.Motherboard.specs.ram_type
                        : null;
                    if (desiredRamType && p.specs.ram_type !== desiredRamType) return false;
                    return best.filter(p);
                };
            } else if (best.category === 'PSU') {
                filterFn = p => p.specs.wattage >= computeTargetPsuWattage(intent, selectedBuild.Processor, selectedBuild["Graphics Card"]) && best.filter(p);
            }

            const upgraded = await selectPart(partsCache, site, best.category, upgradeRange, 'price_desc', filterFn);
            if (upgraded && upgraded.price > currentPart.price) {
                totalCost -= currentPart.price;
                selectedBuild[best.category] = upgraded;
                totalCost += upgraded.price;
                console.log(`  Upgraded ${best.category}: ${upgraded.name} (+${upgraded.price - currentPart.price} BDT)`);
            }
        }

        // ─── POST-BUILD VALIDATION ────────────────────────────────────────
        // Generate compatibility warnings to include in the response
        const buildWarnings = [];

        // Check storage capacity vs user request
        const requestedTb = intent.component_strategy?.['Storage']?.structured_reqs?.min_tb;
        if (requestedTb && selectedBuild.Storage) {
            const actualCapGB = parseStorageCapacityGB(selectedBuild.Storage.name);
            const requestedGB = requestedTb * 1000;
            if (actualCapGB < requestedGB * 0.9) {
                buildWarnings.push(`You requested ${requestedTb}TB storage but the selected drive is ${actualCapGB >= 1000 ? (actualCapGB / 1000).toFixed(1) + 'TB' : actualCapGB + 'GB'}. No ${requestedTb}TB drive was available within budget.`);
            }
        }

        // Check GPU adequacy for use case
        if (selectedBuild["Graphics Card"]) {
            if (!isGpuAdequateForUseCase(selectedBuild["Graphics Card"], intent.use_case)) {
                buildWarnings.push(`The selected GPU may not be powerful enough for ${intent.use_case}. Consider increasing your budget for a better GPU.`);
            }
        }

        // Check PSU adequacy
        if (selectedBuild.PSU && selectedBuild.Processor) {
            const requiredW = computeTargetPsuWattage(intent, selectedBuild.Processor, selectedBuild["Graphics Card"]);
            const actualW = selectedBuild.PSU.specs?.wattage || 0;
            if (actualW < requiredW * 0.85) {
                buildWarnings.push(`PSU (${actualW}W) may be insufficient. Recommended: ${Math.round(requiredW)}W for this CPU+GPU combination.`);
            }
        }

        // Check RAM matches request
        const requestedGb = intent.component_strategy?.['RAM']?.structured_reqs?.min_gb;
        if (requestedGb && selectedBuild.RAM) {
            const ramName = selectedBuild.RAM.name.toLowerCase();
            const half = requestedGb / 2;
            const hasRequestedGB = ramName.includes(`${requestedGb}gb`) || ramName.includes(`${requestedGb} gb`)
                || ramName.includes(`2x${half}gb`) || ramName.includes(`2x${half} gb`);
            if (!hasRequestedGB) {
                buildWarnings.push(`You requested ${requestedGb}GB RAM but the selected kit may differ. Check the product listing.`);
            }
        }

        // Check CPU-Motherboard socket match (safety net)
        if (selectedBuild.Processor && selectedBuild.Motherboard) {
            if (selectedBuild.Processor.specs.socket !== selectedBuild.Motherboard.specs.socket) {
                buildWarnings.push(`⚠ INCOMPATIBLE: CPU socket (${selectedBuild.Processor.specs.socket}) does not match motherboard (${selectedBuild.Motherboard.specs.socket}).`);
            }
        }

        // Check RAM type compatibility
        if (selectedBuild.RAM && selectedBuild.Motherboard) {
            const moboRamType = selectedBuild.Motherboard.specs.ram_type;
            const selectedRamType = selectedBuild.RAM.specs.ram_type;
            if (moboRamType && moboRamType !== 'UNKNOWN' && selectedRamType && selectedRamType !== moboRamType) {
                buildWarnings.push(`⚠ INCOMPATIBLE: RAM type (${selectedRamType}) does not match motherboard (${moboRamType}).`);
            }
        }

        if (buildWarnings.length > 0) {
            console.log('\nBuild Warnings:');
            buildWarnings.forEach(w => console.warn(`  ⚠ ${w}`));
        }

        // Validate if core build is basically functional
        if (!selectedBuild.Processor || !selectedBuild.Motherboard || !selectedBuild.RAM || !selectedBuild.PSU) {
            console.error("CORE BUILD INCOMPLETE:");
            console.error(`  Processor: ${selectedBuild.Processor ? '✓' : '✗'}`);
            console.error(`  Motherboard: ${selectedBuild.Motherboard ? '✓' : '✗'}`);
            console.error(`  RAM: ${selectedBuild.RAM ? '✓' : '✗'}`);
            console.error(`  PSU: ${selectedBuild.PSU ? '✓' : '✗'}`);
            console.error(`  Total spent: ${totalCost} BDT (Total allocated budget was ${budgetCeiling} BDT)`);
            return res.json({
                error: "I couldn't put together a fully compatible build within that exact budget from the live scraped parts. Please try adjusting your budget."
            });
        }

        // Step 5: Explanation generation
        const explanationPrompt = `
You are a PC building assistant. You have selected the following components for a user who wants a ${intent.use_case} PC with a budget of ${budget} BDT from ${site}.

Selected Parts:
${Object.keys(selectedBuild).map(k => {
            if (selectedBuild[k]) return `- ${k}: ${selectedBuild[k].name} (${selectedBuild[k].price} BDT)`;
            return '';
        }).filter(Boolean).join('\n')}

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

        const fetchExplanation = async () => {
            const client = getGroqClient();
            const explanationResponse = await client.chat.completions.create({
                model: "llama-3.1-8b-instant",
                messages: [{ role: "user", content: explanationPrompt }],
                temperature: 0.3,
            });
            return explanationResponse.choices[0].message.content;
        };

        let explanation = "";
        try {
            explanation = await fetchExplanation();
        } catch (error) {
            console.error("Groq API failed for explanation.", error);
            explanation = "Explanation could not be generated due to API limits.";
        }

        res.json({
            build: selectedBuild,
            total: totalCost,
            explanation: explanation,
            intent: intent,
            warnings: buildWarnings
        });

    } catch (error) {
        console.error("Error in /api/build:", error);
        const logMsg = (error.stack || error) + "\n\n";
        fs.appendFile(path.join(__dirname, 'error.log'), logMsg, (err) => {
            if (err) console.error("Failed to write to error.log:", err);
        });
        res.status(500).json({ error: "An internal server error occurred while building your PC." });
    }
});

app.listen(port, () => {
    console.log(`Backend server running on http://localhost:${port}`);
});

