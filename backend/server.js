import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });
import rateLimit from 'express-rate-limit';

const app = express();
const port = 3001;

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
  max: 5, // Limit each IP to 5 requests per window
  message: { error: "You've reached the free limit of 5 builds per 15 minutes. Please wait, or enter your own API key in the settings to continue immediately." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    return (req.body && req.body.customKeys && (req.body.customKeys.groq || req.body.customKeys.gemini));
  }
});

const intentPrompt = `
You are a PC building assistant for the Bangladesh market.
Extract the user's requirements and return ONLY a valid JSON object, no explanation.

{
  "budget_bdt": number or null,
  "use_case": "gaming" | "editing" | "office" | "general",
  "tier": "budget" | "mid" | "high-end",
  "preferred_site": "startech" | "techland" | "computermania" | null,
  "preferred_cpu_brand": "amd" | "intel" | null,
  "preferred_gpu_brand": "nvidia" | "amd" | null,
  "no_gpu": boolean,
  "ram_gb": number or null,
  "ram_type": "DDR4" | "DDR5" | null,
  "needs_monitor": boolean,
  "needs_mouse": boolean,
  "needs_keyboard": boolean,
  "monitor_hz": number or null,
  "rgb_needed": boolean,
  "components_user_has": [],
  "preferred_brands": [],
  "other_notes": ""
}

Rules:
- Normalize budget written as "50k", "৫০ হাজার", "50,000" all to a number
- If use case is unclear default to "general"
- "simulation" tasks like Proteus, Multisim, MATLAB = use_case "office"
- "UI/UX", "design", "web development", "frontend", "graphic design" = use_case "general" (light workload)
- Prioritize CPU and RAM over GPU for office/simulation builds
- If no site is preferred, default preferred_site to "startech"
- Default needs_monitor, needs_mouse, needs_keyboard to true unless user explicitly says they already have them
- If user says DDR4, set ram_type to "DDR4"; DDR4 = AM4 socket (Ryzen 5000 series and older)
- If user says DDR5, set ram_type to "DDR5"; DDR5 = AM5 socket (Ryzen 7000 series and newer)
- tier: "budget" if budget < 40000 or user says cheap/budget, "high-end" if budget >= 150000 or user says high end/premium/very high/best, otherwise "mid"
- If user mentions NVIDIA/RTX/GeForce set preferred_gpu_brand to "nvidia"; if user mentions Radeon/RX set preferred_gpu_brand to "amd"
- If user mentions a specific monitor refresh rate (e.g. 240Hz, 144Hz) set monitor_hz to that number
- no_gpu: Set to true if user says "no GPU", "without GPU", "don't need GPU", "no graphics card", "integrated graphics only", or explicitly states they want office/general use with tight budget
- Return ONLY valid JSON
`;

function parseBudgetFromMessage(message) {
  if (!message) return null;
  const text = message.toLowerCase();
  const normalized = text.replace(/[,]/g, '');
  const kMatch = normalized.match(/(\d+(?:\.\d+)?)\s*k\b/);
  if (kMatch) {
    const value = Math.round(parseFloat(kMatch[1]) * 1000);
    return Number.isFinite(value) ? value : null;
  }
  const numberMatch = normalized.match(/\b(\d{2,7})\b/);
  if (numberMatch) {
    const value = parseInt(numberMatch[1], 10);
    return Number.isFinite(value) ? value : null;
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
    if (!currentBudget || delta >= Math.max(5000, currentBudget * 0.15)) {
      intent.budget_bdt = parsedBudget;
    }
  }

  if (text.includes('ddr5')) intent.ram_type = 'DDR5';
  if (text.includes('ddr4')) intent.ram_type = 'DDR4';
  if (text.includes('16gb')) intent.ram_gb = 16;

  const hz = parseMonitorHz(message);
  if (hz) intent.monitor_hz = hz;

  if (text.includes('nvidia') || text.includes('rtx') || text.includes('geforce')) {
    intent.preferred_gpu_brand = 'nvidia';
    intent.no_gpu = false;
  }
  if (text.includes('radeon') || text.includes('rx ')) {
    intent.preferred_gpu_brand = 'amd';
    intent.no_gpu = false;
  }
  if (text.includes('no gpu') || text.includes('without gpu') || text.includes('no graphics')) {
    intent.no_gpu = true;
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
  'Keyboard': 'keyboard'
};


async function fetchPartsFromScraper(site, category, priceMin, priceMax, sortOrder) {
  try {
    console.log(`[scraper] Fetching ${category} (min=${priceMin ?? 'none'}, max=${priceMax ?? 'none'}, sort=${sortOrder || 'none'})`);
    const params = new URLSearchParams({
      site: site,
      category: CATEGORY_MAPPING[category]
    });
    if (priceMin !== undefined && priceMin !== null) params.set('price_min', Math.round(priceMin));
    if (priceMax !== undefined && priceMax !== null) params.set('price_max', Math.round(priceMax));
    if (sortOrder) params.set('sort', sortOrder);

    const response = await fetch(`http://localhost:8000/scrape?${params.toString()}`);
    if (!response.ok) return [];
    const data = await response.json();
    // Decorate with basic inferred specs so our compatibility rules don't crash
    return data.products.map(p => ({
      ...p,
      category: category,
      specs: inferSpecs(category, p.name)
    }));
  } catch (e) {
    console.error(`Failed to fetch ${category} from ${site}`, e);
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
        if (n.includes('am5') || n.includes('b650') || n.includes('x670') || n.includes('a620') || n.includes('x870') || n.match(/ryzen [579] (7|8|9)\d{3}/)) {
            specs.socket = 'AM5';
            specs.ram_type = 'DDR5';
        } else if (n.includes('am4') || n.includes('b450') || n.includes('b550') || n.includes('x570') || n.includes('a320') || n.includes('a520') || n.match(/ryzen [3579] (3|4|5)\d{3}/) || n.includes('4600g') || n.includes('5600g') || n.includes('5700g')) {
            specs.socket = 'AM4';
            specs.ram_type = 'DDR4';
        } else if (n.includes('lga1700') || n.includes('lga 1700') || n.includes('h610') || n.includes('b660') || n.includes('b760') || n.includes('z690') || n.includes('z790') || n.match(/1[234][14679]00/)) {
            specs.socket = 'LGA1700';
            specs.ram_type = (n.includes('ddr4')) ? 'DDR4' : 'DDR5';
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

        if (n.includes('4090')) specs.tdp = 450;
        else if (n.includes('4080') || n.includes('7900')) specs.tdp = 320;
        else if (n.includes('4070') || n.includes('7800')) specs.tdp = 220;
        else if (n.includes('4060') || n.includes('7600')) specs.tdp = 160;
        else specs.tdp = 150;
    }

    if (category === 'PSU') {
        const match = n.match(/(\d+)\s*(w\b|watt)/i);
        if (match) specs.wattage = parseInt(match[1]);
        else specs.wattage = 500;
    }

    return specs;
}

  function buildRange(budget, minPct, maxPct, priority) {
    return {
      min: Math.round(budget * minPct),
      max: Math.round(budget * maxPct),
      priority: priority
    };
  }

  function adjustRatio([minPct, maxPct], tier) {
    let scale = 1.0;
    if (tier === 'high-end') scale = 1.15;
    if (tier === 'budget') scale = 0.9;
    const min = Math.max(0, minPct * scale);
    const max = Math.min(0.6, maxPct * scale);
    return [min, Math.max(min, max)];
  }

  function calculateBudgetRanges(budget, intent) {
    const useCase = intent.use_case || 'general';
    const tier = intent.tier || 'mid';
    const noGpu = intent.no_gpu || false;

    let ratios = {};

    if (useCase === 'gaming' && !noGpu) {
      ratios = {
        'Graphics Card': [0.30, 0.38],
        'Processor': [0.15, 0.25],
        'Motherboard': [0.05, 0.10],
        'RAM': [0.05, 0.08],
        'Storage': [0.03, 0.07],
        'PSU': [0.02, 0.04],
        'Casing': [0.01, 0.03],
        'CPU Cooler': [0.01, 0.03],
        'Monitor': [0.05, 0.10],
        'Mouse': [0.005, 0.015],
        'Keyboard': [0.005, 0.015]
      };
    } else if (useCase === 'editing' && !noGpu) {
      ratios = {
        'Graphics Card': [0.20, 0.30],
        'Processor': [0.20, 0.30],
        'Motherboard': [0.06, 0.12],
        'RAM': [0.08, 0.12],
        'Storage': [0.06, 0.10],
        'PSU': [0.03, 0.05],
        'Casing': [0.02, 0.04],
        'CPU Cooler': [0.01, 0.03],
        'Monitor': [0.05, 0.10],
        'Mouse': [0.005, 0.015],
        'Keyboard': [0.005, 0.015]
      };
    } else if (useCase === 'general' && !noGpu) {
      ratios = {
        'Graphics Card': [0.12, 0.22],
        'Processor': [0.18, 0.26],
        'Motherboard': [0.07, 0.12],
        'RAM': [0.08, 0.12],
        'Storage': [0.05, 0.10],
        'PSU': [0.03, 0.05],
        'Casing': [0.02, 0.04],
        'CPU Cooler': [0.01, 0.03],
        'Monitor': [0.06, 0.12],
        'Mouse': [0.01, 0.02],
        'Keyboard': [0.01, 0.02]
      };
    } else {
      ratios = {
        'Graphics Card': [0.0, 0.0],
        'Processor': [0.22, 0.30],
        'Motherboard': [0.08, 0.12],
        'RAM': [0.10, 0.18],
        'Storage': [0.05, 0.10],
        'PSU': [0.03, 0.05],
        'Casing': [0.02, 0.04],
        'CPU Cooler': [0.01, 0.03],
        'Monitor': [0.08, 0.15],
        'Mouse': [0.01, 0.03],
        'Keyboard': [0.01, 0.03]
      };
    }

    const priorities = {
      'Graphics Card': 1,
      'Processor': 1,
      'Motherboard': 2,
      'RAM': 2,
      'PSU': 2,
      'Storage': 3,
      'Casing': 3,
      'CPU Cooler': 3,
      'Monitor': 3,
      'Mouse': 3,
      'Keyboard': 3
    };

    const ranges = {};
    Object.keys(priorities).forEach(category => {
      const ratio = ratios[category] || [0, 0];
      const [minPct, maxPct] = adjustRatio(ratio, tier);
      ranges[category] = buildRange(budget, minPct, maxPct, priorities[category]);
    });

    if (intent.needs_monitor === false) ranges['Monitor'] = buildRange(budget, 0, 0, priorities['Monitor']);
    if (intent.needs_mouse === false) ranges['Mouse'] = buildRange(budget, 0, 0, priorities['Mouse']);
    if (intent.needs_keyboard === false) ranges['Keyboard'] = buildRange(budget, 0, 0, priorities['Keyboard']);
    if (noGpu) ranges['Graphics Card'] = buildRange(budget, 0, 0, priorities['Graphics Card']);

    return ranges;
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
    const key = `${category}:${min || 0}-${max || 0}:${sortOrder || 'none'}`;
    if (cache.has(key)) return cache.get(key);

    const parts = await fetchPartsFromScraper(site, category, min, max, sortOrder);
    let filtered = parts.filter(p => p.price !== null && p.in_stock);
    if (min !== undefined && min !== null) filtered = filtered.filter(p => p.price >= min);
    if (max !== undefined && max !== null) filtered = filtered.filter(p => p.price <= max);
    sortParts(filtered, sortOrder || 'price_desc');
    cache.set(key, filtered);
    return filtered;
  }

  async function selectPart(cache, site, category, range, sortOrder, filterFn) {
    const parts = await getPartsCached(cache, site, category, range, sortOrder);
    const candidates = filterFn ? parts.filter(filterFn) : parts;
    return candidates[0] || null;
  }

  async function selectWithFallback(cache, site, category, range, sortOrder, filterFn, budget) {
    let part = await selectPart(cache, site, category, range, sortOrder, filterFn);
    if (!part && range && range.max > 0) {
        // First try to find the cheapest part slightly above our max (minimize overspending)
        const aboveRange = { min: range.max, max: Math.min(Math.round(range.max * 1.25), budget) };
        part = await selectPart(cache, site, category, aboveRange, 'price_asc', filterFn);
        if (!part) {
            // Then try to find the best part slightly below our min
            const belowRange = { min: 0, max: range.min };
            part = await selectPart(cache, site, category, belowRange, 'price_desc', filterFn);
        }
        if (!part) {
            // Ultimate fallback: take the cheapest item we can find in the expanded range to save budget
            const survivalRange = { min: 0, max: Math.min(Math.round(range.max * 1.25), budget) };
            part = await selectPart(cache, site, category, survivalRange, 'price_asc', filterFn);
        }
    }
    return part;
  }

  function isCpuBalanced(cpu, gpu) {
    if (!gpu) return true;
    const n = cpu.name.toLowerCase();
    if (gpu.price >= 140000) {
      return n.includes('i9') || n.includes('i7') || n.includes('ryzen 9') || n.includes('ryzen 7');
    }
    if (gpu.price >= 90000) {
      return !(n.includes('i3') || n.includes('ryzen 3') || n.includes('athlon'));
    }
    return true;
  }

  function formatMinimumError(label, minRequired) {
    return `Your request needs at least ${minRequired} BDT to cover minimum ${label} parts. Please increase budget or relax requirements.`;
  }

  async function getCheapestPart(cache, site, category, budget, filterFn) {
    const parts = await getPartsCached(cache, site, category, { min: 0, max: budget }, 'price_asc');
    const candidates = filterFn ? parts.filter(filterFn) : parts;
    return candidates[0] || null;
  }

  async function calculatePeripheralMinimums(cache, site, intent, budget) {
    const minimums = {
      monitor: 0,
      mouse: 0,
      keyboard: 0,
      total: 0,
      error: null
    };

    if (intent.needs_monitor) {
      const monitorFilter = intent.monitor_hz
        ? (p => {
            const n = p.name.toLowerCase();
            return n.includes(`${intent.monitor_hz}hz`) || n.includes(`${intent.monitor_hz} hz`);
          })
        : undefined;
      const monitor = await getCheapestPart(cache, site, 'Monitor', budget, monitorFilter);
      if (!monitor && intent.monitor_hz) {
        minimums.error = `No ${intent.monitor_hz}Hz monitor found within the available inventory.`;
        return minimums;
      }
      const fallbackMonitor = monitor || await getCheapestPart(cache, site, 'Monitor', budget);
      minimums.monitor = fallbackMonitor ? fallbackMonitor.price : 20000;
    }

    if (intent.needs_mouse) {
      const mouse = await getCheapestPart(cache, site, 'Mouse', budget);
      minimums.mouse = mouse ? mouse.price : 4000;
    }

    if (intent.needs_keyboard) {
      const keyboard = await getCheapestPart(cache, site, 'Keyboard', budget);
      minimums.keyboard = keyboard ? keyboard.price : 5000;
    }

    minimums.total = minimums.monitor + minimums.mouse + minimums.keyboard;
    return minimums;
  }

  async function calculateCoreMinimums(cache, site, intent, budget, noGpu) {
    const minimums = {
      processor: 0,
      motherboard: 0,
      ram: 0,
      storage: 0,
      psu: 0,
      casing: 0,
      cpuCooler: 0,
      coolerMin: 0,
      gpu: 0,
      total: 0,
      error: null,
      coolerRequired: false
    };

    let gpu = null;
    if (!noGpu) {
      const gpuFilter = p => !intent.preferred_gpu_brand || p.specs.gpu_brand === intent.preferred_gpu_brand.toLowerCase();
      gpu = await getCheapestPart(cache, site, 'Graphics Card', budget, gpuFilter);
      if (!gpu && intent.preferred_gpu_brand) {
        gpu = await getCheapestPart(cache, site, 'Graphics Card', budget);
      }
      if (!gpu) {
        minimums.error = "No GPU found in the available inventory.";
        return minimums;
      }
      minimums.gpu = gpu.price;
    }

    const cpuFilter = p => {
      const brandMatch = !intent.preferred_cpu_brand || p.specs.brand === intent.preferred_cpu_brand.toLowerCase();
      if (!brandMatch) return false;
      if (intent.ram_type === 'DDR4') return p.specs.socket === 'AM4' && isCpuBalanced(p, gpu);
      if (intent.ram_type === 'DDR5') return p.specs.socket === 'AM5' && isCpuBalanced(p, gpu);
      return isCpuBalanced(p, gpu);
    };

    const cpu = await getCheapestPart(cache, site, 'Processor', budget, cpuFilter);
    if (!cpu) {
      minimums.error = `No compatible ${intent.preferred_cpu_brand ? intent.preferred_cpu_brand.toUpperCase() : ''} CPU found.`.trim();
      return minimums;
    }
    minimums.processor = cpu.price;

    const moboFilter = p => {
      if (p.specs.socket === 'UNKNOWN' || cpu.specs.socket === 'UNKNOWN') return false;
      const socketMatch = p.specs.socket === cpu.specs.socket;
      if (intent.ram_type) return socketMatch && p.specs.ram_type === intent.ram_type;
      return socketMatch;
    };

    const motherboard = await getCheapestPart(cache, site, 'Motherboard', budget, moboFilter);
    if (!motherboard) {
      minimums.error = `No compatible ${cpu.specs.socket} motherboard found.`;
      return minimums;
    }
    minimums.motherboard = motherboard.price;

    const ramFilter = p => {
      if (intent.ram_type && p.specs.ram_type !== intent.ram_type) return false;
      if (intent.ram_gb) {
        const name = p.name.toLowerCase();
        const half = intent.ram_gb / 2;
        return name.includes(`${intent.ram_gb}gb`)
          || name.includes(`${intent.ram_gb} gb`)
          || name.includes(`2x${half}gb`)
          || name.includes(`2x${half} gb`)
          || name.includes(`${intent.ram_gb}g `);
      }
      return true;
    };

    const ram = await getCheapestPart(cache, site, 'RAM', budget, ramFilter);
    if (!ram) {
      minimums.error = `No compatible RAM found for ${intent.ram_type || 'requested'}.`;
      return minimums;
    }
    minimums.ram = ram.price;

    const storage = await getCheapestPart(cache, site, 'Storage', budget);
    if (!storage) {
      minimums.error = "No storage found in the available inventory.";
      return minimums;
    }
    minimums.storage = storage.price;

    const requiredTdp = (cpu.specs.tdp || 65) + (gpu?.specs?.tdp || 0);
    const targetPsuWattage = (requiredTdp * 1.2) + 50;
    const psuFilter = p => p.specs.wattage >= targetPsuWattage;
    const psu = await getCheapestPart(cache, site, 'PSU', budget, psuFilter);
    if (!psu) {
      minimums.error = `No PSU found with at least ${Math.round(targetPsuWattage)}W.`;
      return minimums;
    }
    minimums.psu = psu.price;

    const casing = await getCheapestPart(cache, site, 'Casing', budget);
    if (!casing) {
      minimums.error = "No casing found in the available inventory.";
      return minimums;
    }
    minimums.casing = casing.price;

    const cooler = await getCheapestPart(cache, site, 'CPU Cooler', budget);
    if (cooler) {
      minimums.coolerMin = cooler.price;
      if (cpu.specs.tdp >= 105) {
        minimums.cpuCooler = cooler.price;
        minimums.coolerRequired = true;
      }
    }

    minimums.total = minimums.processor + minimums.motherboard + minimums.ram
      + minimums.storage + minimums.psu + minimums.casing + minimums.cpuCooler + minimums.gpu;

    return minimums;
  }

  function getRemainingCoreMinimum(coreMinimums, selectedBuild, noGpu, needsCooler, excludeCategory) {
    let sum = 0;
    const add = (category, value) => {
      if (excludeCategory !== category) sum += value;
    };

    if (!selectedBuild.Processor) add('Processor', coreMinimums.processor);
    if (!selectedBuild.Motherboard) add('Motherboard', coreMinimums.motherboard);
    if (!selectedBuild.RAM) add('RAM', coreMinimums.ram);
    if (!selectedBuild.Storage) add('Storage', coreMinimums.storage);
    if (!selectedBuild.PSU) add('PSU', coreMinimums.psu);
    if (!selectedBuild.Casing) add('Casing', coreMinimums.casing);
    if (!noGpu && !selectedBuild["Graphics Card"]) add('Graphics Card', coreMinimums.gpu);
    if (needsCooler && !selectedBuild["CPU Cooler"]) add('CPU Cooler', coreMinimums.coolerMin);

    return sum;
  }

app.post('/api/build', apiLimiter, async (req, res) => {
  try {
    const { message, site: bodySite, customKeys = {} } = req.body;
    console.log("[build] Incoming request");
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const apiProvider = req.body.apiProvider || 'groq';

    const getGroqClient = () => {
       const key = customKeys.groq || process.env.GROQ_API_KEY;
       if (!key) throw new Error("Groq API key is missing");
       return new Groq({ apiKey: key });
    };

    const getGeminiClient = () => {
       const key = customKeys.gemini || process.env.GEMINI_API_KEY;
       if (!key) throw new Error("Gemini API key is missing");
       return new GoogleGenAI({ apiKey: key });
    };

    const fetchIntent = async (provider) => {
        if (provider === 'gemini') {
            const client = getGeminiClient();
            const intentResponse = await client.models.generateContent({
              model: 'gemini-2.5-pro',
              contents: [{ role: 'user', parts: [{ text: intentPrompt + "\n\nUser Message: " + message }] }]
            });
            return intentResponse.text;
        } else {
            const client = getGroqClient();
            const intentResponse = await client.chat.completions.create({
              model: "llama-3.3-70b-versatile",
              messages: [
                { role: "system", content: intentPrompt },
                { role: "user", content: message }
              ],
              temperature: 0.1,
            });
            return intentResponse.choices[0].message.content;
        }
    };

    let intentText = "";
    let usedProvider = apiProvider;

    try {
        intentText = await fetchIntent(apiProvider);
    } catch (error) {
        console.warn(`${apiProvider} failed for intent extraction. Auto-failover to secondary...`, error.message);
        const secondaryProvider = apiProvider === 'groq' ? 'gemini' : 'groq';
        try {
            intentText = await fetchIntent(secondaryProvider);
            usedProvider = secondaryProvider;
        } catch (secondaryError) {
            console.error("Both primary and secondary APIs failed for intent extraction.", secondaryError);
            return res.status(500).json({ error: "All AI providers are currently unavailable or rate limited. Please try again later or provide your own API key." });
        }
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

    const site = bodySite || intent.preferred_site || "startech";
    console.log(`Building PC from ${site} for ${intent.budget_bdt} BDT`);

    const budget = intent.budget_bdt;
    const noGpu = intent.no_gpu || false;
    const budgetRanges = calculateBudgetRanges(budget, intent);
    const partsCache = new Map();

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

    // PHASE 1: Calculate dynamic minimum budgets for core and peripherals
    console.log("PHASE 1: Calculating minimum required budgets...");
    const coreMinimums = await calculateCoreMinimums(partsCache, site, intent, budget, noGpu);
    if (coreMinimums.error) {
      return res.json({ error: coreMinimums.error });
    }

    const peripheralMinimums = await calculatePeripheralMinimums(partsCache, site, intent, budget);
    if (peripheralMinimums.error) {
      return res.json({ error: peripheralMinimums.error });
    }

    const minimumRequired = coreMinimums.total + peripheralMinimums.total;
    if (minimumRequired > budget) {
      return res.json({ error: formatMinimumError("core + peripherals", minimumRequired) });
    }

    const coreBudget = budget - peripheralMinimums.total;

    console.log("=".repeat(60));
    console.log(`Total Budget: ${budget} BDT`);
    console.log(`Core Minimum: ${coreMinimums.total} BDT`);
    console.log(`Peripheral Minimum: ${peripheralMinimums.total} BDT`);
    console.log(`Core Component Budget: ${coreBudget} BDT`);
    console.log("=".repeat(60));

    // Recompute budget ranges for core components only
    const coreOnlyIntent = { ...intent, needs_monitor: false, needs_mouse: false, needs_keyboard: false };
    const coreRanges = calculateBudgetRanges(coreBudget, coreOnlyIntent);
    let needsCooler = false;

    const anchorCategory = (intent.use_case === 'gaming' && !noGpu) ? 'Graphics Card' : 'Processor';

    console.log("\nPHASE 2: Selecting core components from " + coreBudget + " BDT...");
    
    // Step 1: Anchor selection
    if (anchorCategory === 'Graphics Card') {
      const remainingMin = getRemainingCoreMinimum(coreMinimums, selectedBuild, noGpu, needsCooler, 'Graphics Card');
      const gpuAllowedMax = coreBudget - totalCost - remainingMin;
      if (gpuAllowedMax <= 0) {
        return res.json({ error: formatMinimumError("core components", coreMinimums.total + peripheralMinimums.total) });
      }
      const gpuRange = { min: 0, max: Math.min(coreRanges['Graphics Card'].max, gpuAllowedMax) };
      const gpuFilter = p => !intent.preferred_gpu_brand || p.specs.gpu_brand === intent.preferred_gpu_brand.toLowerCase();
      selectedBuild["Graphics Card"] = await selectWithFallback(partsCache, site, 'Graphics Card', gpuRange, 'price_desc', gpuFilter, gpuAllowedMax);
      if (!selectedBuild["Graphics Card"] && intent.preferred_gpu_brand) {
        selectedBuild["Graphics Card"] = await selectWithFallback(partsCache, site, 'Graphics Card', gpuRange, 'price_desc', undefined, gpuAllowedMax);
      }
      if (selectedBuild["Graphics Card"]) {
        console.log(`✓ GPU (Anchor): ${selectedBuild["Graphics Card"].name} - ${selectedBuild["Graphics Card"].price} BDT`);
        totalCost += selectedBuild["Graphics Card"].price;
      }
    }

    // Step 2: CPU -> Motherboard -> RAM chain
    const cpuCondition = (p) => {
      const brandMatch = !intent.preferred_cpu_brand || p.specs.brand === intent.preferred_cpu_brand.toLowerCase();
      if (!brandMatch) return false;
      if (intent.ram_type === 'DDR4') return p.specs.socket === 'AM4' && isCpuBalanced(p, selectedBuild["Graphics Card"]);
      if (intent.ram_type === 'DDR5') return p.specs.socket === 'AM5' && isCpuBalanced(p, selectedBuild["Graphics Card"]);
      return isCpuBalanced(p, selectedBuild["Graphics Card"]);
    };

    const cpuRemainingMin = getRemainingCoreMinimum(coreMinimums, selectedBuild, noGpu, needsCooler, 'Processor');
    const cpuAllowedMax = coreBudget - totalCost - cpuRemainingMin;
    if (cpuAllowedMax <= 0) {
      return res.json({ error: formatMinimumError("core components", coreMinimums.total + peripheralMinimums.total) });
    }
    const cpuRange = { min: 0, max: Math.min(coreRanges['Processor'].max, cpuAllowedMax) };
    selectedBuild.Processor = await selectWithFallback(partsCache, site, 'Processor', cpuRange, 'price_desc', cpuCondition, cpuAllowedMax);
    if (!selectedBuild.Processor && intent.preferred_cpu_brand) {
      console.error(`FAILED: Could not find compatible ${intent.preferred_cpu_brand.toUpperCase()} processor within core budget`);
      return res.json({ error: `Could not find a compatible ${intent.preferred_cpu_brand.toUpperCase()} processor within your budget range. Try increasing your budget.` });
    }
    if (!selectedBuild.Processor) {
      console.error(`FAILED: Could not find any processor within core budget`);
      return res.json({ error: "Could not find a compatible processor within your budget range. Try increasing your budget." });
    }
    console.log(`✓ Processor: ${selectedBuild.Processor.name} - ${selectedBuild.Processor.price} BDT`);
    totalCost += selectedBuild.Processor.price;
    if (selectedBuild.Processor.specs.tdp >= 105) {
      needsCooler = true;
    }

    const moboRemainingMin = getRemainingCoreMinimum(coreMinimums, selectedBuild, noGpu, needsCooler, 'Motherboard');
    const moboAllowedMax = coreBudget - totalCost - moboRemainingMin;
    if (moboAllowedMax <= 0) {
      return res.json({ error: formatMinimumError("core components", coreMinimums.total + peripheralMinimums.total) });
    }
    const moboRange = { min: 0, max: Math.min(coreRanges['Motherboard'].max, moboAllowedMax) };
    const moboCondition = p => {
      if (p.specs.socket === 'UNKNOWN' || selectedBuild.Processor.specs.socket === 'UNKNOWN') return false;
      const socketMatch = p.specs.socket === selectedBuild.Processor.specs.socket;
      if (intent.ram_type) return socketMatch && p.specs.ram_type === intent.ram_type;
      return socketMatch;
    };

    selectedBuild.Motherboard = await selectWithFallback(partsCache, site, 'Motherboard', moboRange, 'price_desc', moboCondition, moboAllowedMax);
    if (!selectedBuild.Motherboard && selectedBuild.Processor.specs.socket === 'AM5') {
      const expandedMax = Math.max(moboRange.max, Math.round(moboAllowedMax * 1.1));
      const expandedRange = { min: moboRange.min, max: expandedMax };
      console.log(`Motherboard not found in range [${moboRange.min}, ${moboRange.max}]. Trying expanded range [${expandedRange.min}, ${expandedRange.max}]...`);
      selectedBuild.Motherboard = await selectPart(partsCache, site, 'Motherboard', expandedRange, 'price_desc', moboCondition);
    }
    if (!selectedBuild.Motherboard) {
      console.error(`FAILED: Could not find matching motherboard for ${selectedBuild.Processor.specs.socket}`);
      return res.json({ error: `Found a CPU but couldn't find a matching ${selectedBuild.Processor.specs.socket} Motherboard. Try a different site.` });
    }
    console.log(`✓ Motherboard: ${selectedBuild.Motherboard.name} - ${selectedBuild.Motherboard.price} BDT`);
    totalCost += selectedBuild.Motherboard.price;

    const ramRemainingMin = getRemainingCoreMinimum(coreMinimums, selectedBuild, noGpu, needsCooler, 'RAM');
    const ramAllowedMax = coreBudget - totalCost - ramRemainingMin;
    if (ramAllowedMax <= 0) {
      return res.json({ error: formatMinimumError("core components", coreMinimums.total + peripheralMinimums.total) });
    }
    const ramRange = { min: 0, max: Math.min(coreRanges['RAM'].max, ramAllowedMax) };
    const ramCondition = p => {
      if (intent.ram_type && p.specs.ram_type !== intent.ram_type) return false;
      const typeMatch = p.specs.ram_type !== 'UNKNOWN'
        && selectedBuild.Motherboard.specs.ram_type !== 'UNKNOWN'
        && p.specs.ram_type === selectedBuild.Motherboard.specs.ram_type;
      if (intent.ram_gb) {
        const name = p.name.toLowerCase();
        const half = intent.ram_gb / 2;
        const gbMatch = name.includes(`${intent.ram_gb}gb`)
          || name.includes(`${intent.ram_gb} gb`)
          || name.includes(`2x${half}gb`)
          || name.includes(`2x${half} gb`)
          || name.includes(`${intent.ram_gb}g `);
        return typeMatch && gbMatch;
      }
      return typeMatch;
    };

    selectedBuild.RAM = await selectWithFallback(partsCache, site, 'RAM', ramRange, 'price_desc', ramCondition, ramAllowedMax);
    if (!selectedBuild.RAM && intent.ram_gb) {
      console.error(`FAILED: Could not find ${intent.ram_gb}GB ${selectedBuild.Motherboard.specs.ram_type} RAM`);
      return res.json({ error: `Could not find ${intent.ram_gb}GB ${selectedBuild.Motherboard.specs.ram_type} RAM in stock. Try adjusting RAM capacity or try a different site.` });
    }
    if (!selectedBuild.RAM) {
      console.error(`FAILED: Could not find any compatible RAM`);
      return res.json({ error: `Could not find compatible RAM. Try a different site or increase budget.` });
    }
    console.log(`✓ RAM: ${selectedBuild.RAM.name} (${intent.ram_gb || 'any'}GB) - ${selectedBuild.RAM.price} BDT`);
    totalCost += selectedBuild.RAM.price;

    // Step 3: GPU if needed and not already selected
    if (!noGpu && !selectedBuild["Graphics Card"] && coreRanges['Graphics Card'].max > 0) {
      const gpuRemainingMin = getRemainingCoreMinimum(coreMinimums, selectedBuild, noGpu, needsCooler, 'Graphics Card');
      const gpuAllowedMax = coreBudget - totalCost - gpuRemainingMin;
      if (gpuAllowedMax <= 0) {
        return res.json({ error: formatMinimumError("core components", coreMinimums.total + peripheralMinimums.total) });
      }
      const gpuRange = { min: 0, max: Math.min(coreRanges['Graphics Card'].max, gpuAllowedMax) };
      const gpuFilter = p => !intent.preferred_gpu_brand || p.specs.gpu_brand === intent.preferred_gpu_brand.toLowerCase();
      selectedBuild["Graphics Card"] = await selectWithFallback(partsCache, site, 'Graphics Card', gpuRange, 'price_desc', gpuFilter, gpuAllowedMax);
      if (!selectedBuild["Graphics Card"] && intent.preferred_gpu_brand) {
        selectedBuild["Graphics Card"] = await selectWithFallback(partsCache, site, 'Graphics Card', gpuRange, 'price_desc', undefined, gpuAllowedMax);
      }
      if (selectedBuild["Graphics Card"]) {
        console.log(`✓ GPU: ${selectedBuild["Graphics Card"].name} - ${selectedBuild["Graphics Card"].price} BDT`);
        totalCost += selectedBuild["Graphics Card"].price;
      }
    }

    if (!noGpu && !selectedBuild["Graphics Card"]) {
      console.error(`ERROR: No GPU found for gaming build`);
      return res.json({ error: "Could not find any GPU within your budget range. Try another site or reduce other specs." });
    }

    // Step 4: PSU (cheapest adequate)
    let requiredTdp = 0;
    if (selectedBuild.Processor) requiredTdp += (selectedBuild.Processor.specs.tdp || 65);
    if (selectedBuild["Graphics Card"]) requiredTdp += (selectedBuild["Graphics Card"].specs.tdp || 0);
    const targetPsuWattage = (requiredTdp * 1.2) + 50;
    const psuRemainingMin = getRemainingCoreMinimum(coreMinimums, selectedBuild, noGpu, needsCooler, 'PSU');
    const psuAllowedMax = coreBudget - totalCost - psuRemainingMin;
    if (psuAllowedMax <= 0) {
      return res.json({ error: formatMinimumError("core components", coreMinimums.total + peripheralMinimums.total) });
    }
    const psuRange = { min: 0, max: Math.min(coreRanges['PSU'].max, psuAllowedMax) };
    const psuCondition = p => p.specs.wattage >= targetPsuWattage;
    selectedBuild.PSU = await selectWithFallback(partsCache, site, 'PSU', psuRange, 'price_asc', psuCondition, psuAllowedMax);
    if (selectedBuild.PSU) {
      console.log(`✓ PSU: ${selectedBuild.PSU.name} - ${selectedBuild.PSU.price} BDT`);
      totalCost += selectedBuild.PSU.price;
    } else {
      console.error(`ERROR: Could not find adequate PSU (need ${targetPsuWattage}W)`);
      return res.json({ error: "Could not find a PSU with adequate wattage. Try increasing budget." });
    }

    // Step 5: Storage (essential)
    const storageRemainingMin = getRemainingCoreMinimum(coreMinimums, selectedBuild, noGpu, needsCooler, 'Storage');
    const storageAllowedMax = coreBudget - totalCost - storageRemainingMin;
    if (storageAllowedMax <= 0) {
      return res.json({ error: formatMinimumError("core components", coreMinimums.total + peripheralMinimums.total) });
    }
    const storageRange = { min: 0, max: Math.min(coreRanges['Storage'].max, storageAllowedMax) };
    selectedBuild.Storage = await selectWithFallback(partsCache, site, 'Storage', storageRange, 'price_desc', undefined, storageAllowedMax);
    if (selectedBuild.Storage) {
      console.log(`✓ Storage: ${selectedBuild.Storage.name} - ${selectedBuild.Storage.price} BDT`);
      totalCost += selectedBuild.Storage.price;
    }

    // Step 6: CPU Cooler (if TDP >= 105W and budget available)
    if (selectedBuild.Processor && selectedBuild.Processor.specs.tdp >= 105) {
      const coolerRemainingMin = getRemainingCoreMinimum(coreMinimums, selectedBuild, noGpu, needsCooler, 'CPU Cooler');
      const coolerAllowedMax = coreBudget - totalCost - coolerRemainingMin;
      if (coolerAllowedMax <= 0) {
        return res.json({ error: formatMinimumError("core components", coreMinimums.total + peripheralMinimums.total) });
      }
      const coolerRange = { min: 0, max: Math.min(coreRanges['CPU Cooler'].max, coolerAllowedMax) };
      const cooler = await selectWithFallback(partsCache, site, 'CPU Cooler', coolerRange, 'price_desc', undefined, coolerAllowedMax);
      if (cooler) {
        selectedBuild["CPU Cooler"] = cooler;
        console.log(`✓ CPU Cooler: ${cooler.name} - ${cooler.price} BDT`);
        totalCost += cooler.price;
      }
    }

    // Step 7: Casing (if budget available)
    const casingRemainingMin = getRemainingCoreMinimum(coreMinimums, selectedBuild, noGpu, needsCooler, 'Casing');
    const casingAllowedMax = coreBudget - totalCost - casingRemainingMin;
    if (casingAllowedMax <= 0) {
      return res.json({ error: formatMinimumError("core components", coreMinimums.total + peripheralMinimums.total) });
    }
    const casingRange = { min: 0, max: Math.min(coreRanges['Casing'].max, casingAllowedMax) };
    if (casingRange.max > 0) {
      const casing = await selectWithFallback(partsCache, site, 'Casing', casingRange, 'price_desc', undefined, casingAllowedMax);
      if (casing) {
        selectedBuild.Casing = casing;
        console.log(`✓ Casing: ${casing.name} - ${casing.price} BDT`);
        totalCost += casing.price;
      }
    }

    if (totalCost > coreBudget) {
      return res.json({
        error: "Core components exceeded the available budget after reserving peripherals. Try reducing requirements or increasing budget."
      });
    }

    console.log("\nPHASE 3: Selecting peripherals with reserved budget...");

    // Step 8: Select peripherals with guaranteed reserved budget from mustHaves
    // Monitor (if requested)
    if (intent.needs_monitor && peripheralMinimums.monitor > 0) {
      const monitorRange = { min: 0, max: peripheralMinimums.monitor + 5000 };
      let monitor = null;
      
      if (intent.monitor_hz) {
        const hzCondition = p => {
          const n = p.name.toLowerCase();
          return n.includes(`${intent.monitor_hz}hz`) || n.includes(`${intent.monitor_hz} hz`);
        };
        monitor = await selectWithFallback(partsCache, site, 'Monitor', monitorRange, 'price_desc', hzCondition, budget);
      }
      
      if (!monitor) {
        const gamingCondition = p => {
          const n = p.name.toLowerCase();
          return n.includes('144hz') || n.includes('165hz') || n.includes('240hz') || n.includes('360hz') || n.includes('gaming');
        };
        monitor = await selectWithFallback(partsCache, site, 'Monitor', monitorRange, 'price_desc', gamingCondition, budget);
      }
      
      if (!monitor) {
        monitor = await selectWithFallback(partsCache, site, 'Monitor', monitorRange, 'price_asc', undefined, budget);
      }
      
      if (monitor) {
        selectedBuild.Monitor = monitor;
        console.log(`✓ Monitor: ${monitor.name} - ${monitor.price} BDT`);
        totalCost += monitor.price;
      } else {
        console.warn(`⚠ WARNING: Could not find monitor within reserved budget of ${peripheralMinimums.monitor} BDT`);
      }
    }

    // Mouse (if requested)
    if (intent.needs_mouse && peripheralMinimums.mouse > 0) {
      const mouseRange = { min: 0, max: peripheralMinimums.mouse + 2000 };
      const mouse = await selectWithFallback(partsCache, site, 'Mouse', mouseRange, 'price_desc', undefined, budget);
      if (mouse) {
        selectedBuild.Mouse = mouse;
        console.log(`✓ Mouse: ${mouse.name} - ${mouse.price} BDT`);
        totalCost += mouse.price;
      } else {
        console.warn(`⚠ WARNING: Could not find mouse within reserved budget of ${peripheralMinimums.mouse} BDT`);
      }
    }

    // Keyboard (if requested)
    if (intent.needs_keyboard && peripheralMinimums.keyboard > 0) {
      const keyboardRange = { min: 0, max: peripheralMinimums.keyboard + 2000 };
      const keyboard = await selectWithFallback(partsCache, site, 'Keyboard', keyboardRange, 'price_desc', undefined, budget);
      if (keyboard) {
        selectedBuild.Keyboard = keyboard;
        console.log(`✓ Keyboard: ${keyboard.name} - ${keyboard.price} BDT`);
        totalCost += keyboard.price;
      } else {
        console.warn(`⚠ WARNING: Could not find keyboard within reserved budget of ${peripheralMinimums.keyboard} BDT`);
      }
    }

    // Step 9: Rebalance if underspent (cap iterations to avoid infinite loops)
    console.log("\nPHASE 4: Rebalancing underspent budget...");
    for (let i = 0; i < 3; i++) {
      if (totalCost >= budget * 0.9) break;
      const remaining = budget - totalCost;
      if (remaining < 2000) break;

      const upgradeCandidates = ['Graphics Card', 'Processor', 'RAM', 'Monitor', 'Storage'];
      let best = null;

      upgradeCandidates.forEach(category => {
        const current = selectedBuild[category];
        if (!current) return;

        const expandedMax = Math.min(Math.round(budget * 0.5), current.price + remaining); // Don't let single component exceed half budget
        const gap = expandedMax - current.price;
        if (gap > 500 && (!best || gap > best.gap)) { // Minimum upgrade gap of 500 BDT
          best = { category, possibleMax: expandedMax, gap };
        }
      });

      if (!best) break;

      const currentPart = selectedBuild[best.category];
      const upgradeRange = {
        min: currentPart.price + 1,
        max: best.possibleMax
      };
      if (upgradeRange.max <= upgradeRange.min) break;

      let filterFn;
      if (best.category === 'Graphics Card') {
        filterFn = p => !intent.preferred_gpu_brand || p.specs.gpu_brand === intent.preferred_gpu_brand.toLowerCase();
      } else if (best.category === 'Processor') {
        filterFn = p => {
          const brandMatch = !intent.preferred_cpu_brand || p.specs.brand === intent.preferred_cpu_brand.toLowerCase();
          const socketMatch = selectedBuild.Motherboard ? p.specs.socket === selectedBuild.Motherboard.specs.socket : true;
          return brandMatch && socketMatch;
        };
      } else if (best.category === 'RAM') {
        filterFn = p => {
          const typeMatch = p.specs.ram_type !== 'UNKNOWN'
            && selectedBuild.Motherboard?.specs.ram_type !== 'UNKNOWN'
            && p.specs.ram_type === selectedBuild.Motherboard?.specs.ram_type;
          if (!intent.ram_gb) return typeMatch;
          const name = p.name.toLowerCase();
          const half = intent.ram_gb / 2;
          const gbMatch = name.includes(`${intent.ram_gb}gb`)
            || name.includes(`${intent.ram_gb} gb`)
            || name.includes(`2x${half}gb`)
            || name.includes(`2x${half} gb`);
          return typeMatch && gbMatch;
        };
      } else if (best.category === 'Monitor' && intent.monitor_hz) {
        filterFn = p => {
          const n = p.name.toLowerCase();
          return n.includes(`${intent.monitor_hz}hz`) || n.includes(`${intent.monitor_hz} hz`);
        };
      }

      const upgraded = await selectPart(partsCache, site, best.category, upgradeRange, 'price_desc', filterFn);
      if (upgraded && upgraded.price > currentPart.price) {
        totalCost -= currentPart.price;
        selectedBuild[best.category] = upgraded;
        totalCost += upgraded.price;
        console.log(`  Upgraded ${best.category}: ${upgraded.name} (+${upgraded.price - currentPart.price} BDT)`);
      }
    }

    // Validate if core build is basically functional
    if (!selectedBuild.Processor || !selectedBuild.Motherboard || !selectedBuild.RAM || !selectedBuild.PSU) {
      console.error("CORE BUILD INCOMPLETE:");
      console.error(`  Processor: ${selectedBuild.Processor ? '✓' : '✗'}`);
      console.error(`  Motherboard: ${selectedBuild.Motherboard ? '✓' : '✗'}`);
      console.error(`  RAM: ${selectedBuild.RAM ? '✓' : '✗'}`);
      console.error(`  PSU: ${selectedBuild.PSU ? '✓' : '✗'}`);
      console.error(`  Total spent: ${totalCost} BDT (cap was ${maxCoreComponentBudget} BDT)`);
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
Avoid generic fluff and do not mention parts that are not selected.
`;

    const fetchExplanation = async (provider) => {
        if (provider === 'gemini') {
            const client = getGeminiClient();
            const explanationResponse = await client.models.generateContent({
              model: 'gemini-2.5-pro',
              contents: [{ role: 'user', parts: [{ text: explanationPrompt }] }]
            });
            return explanationResponse.text;
        } else {
            const client = getGroqClient();
            const explanationResponse = await client.chat.completions.create({
              model: "llama-3.3-70b-versatile",
              messages: [{ role: "user", content: explanationPrompt }],
              temperature: 0.3,
            });
            return explanationResponse.choices[0].message.content;
        }
    };

    let explanation = "";
    try {
        explanation = await fetchExplanation(usedProvider);
    } catch (error) {
        console.warn(`${usedProvider} failed for explanation. Auto-failover to secondary...`, error.message);
        const secondaryProvider = usedProvider === 'groq' ? 'gemini' : 'groq';
        try {
            explanation = await fetchExplanation(secondaryProvider);
        } catch (secondaryError) {
            console.error("Both primary and secondary APIs failed for explanation.", secondaryError);
            explanation = "Explanation could not be generated due to API limits.";
        }
    }

    res.json({
      build: selectedBuild,
      total: totalCost,
      explanation: explanation,
      intent: intent
    });

  } catch (error) {
    console.error("Error in /api/build:", error);
    res.status(500).json({ error: "An internal server error occurred while building your PC." });
  }
});

app.listen(port, () => {
  console.log(`Backend server running on http://localhost:${port}`);
});
