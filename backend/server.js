/**
 * BuildMyPC Backend Server
 * Modular architecture with dependency injection
 * 
 * Modules:
 * - /ai: LLM intent extraction and explanation generation
 * - /engine: Compatibility checking, budget allocation, part selection
 * - /utils: Caching, spec inference, part repository
 * - /routes: HTTP handlers
 * - /config: Centralized configuration
 */

import express from 'express';
import fs from 'fs';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import Groq from 'groq-sdk';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

// ──── Imports: Configuration ────
import { BUDGET } from './config/budget.js';
import { API, RATE_LIMITING, AI } from './config/thresholds.js';

// ──── Imports: Modules ────
import { createIntentExtractor } from './ai/intentExtractor.js';
import { createExplanationGenerator } from './ai/explanationGenerator.js';
import { createCompatibilityChecker } from './engine/compatibilityChecker.js';
import { createBudgetAllocator } from './engine/budgetAllocator.js';
import { createPartSelector } from './engine/partSelector.js';
import { createCacheManager } from './utils/cacheManager.js';
import { createSpecInference } from './utils/specInference.js';
import { createPartRepository } from './utils/partRepository.js';
import { createBuildHandler } from './routes/build.js';
import { sendError, ERROR_INTERNAL } from './utils/errors.js';

// ──── Setup ────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const port = process.env.PORT || 3001;

// ──── Trust Proxy ────
// For PaaS (Render, Heroku, etc.) behind reverse proxy
app.set('trust proxy', 1);

// ──── Middleware ────
app.use(cors());
app.use(express.json());

// HTTP request logging
app.use((req, res, next) => {
  const line = `[http] ${req.method} ${req.url}`;
  console.log(line);
  process.stdout.write(`${line}\n`);
  next();
});

// ──── Rate Limiting ────
const apiLimiter = rateLimit({
  windowMs: RATE_LIMITING.WINDOW_MS,
  max: RATE_LIMITING.MAX_REQUESTS_PER_WINDOW,
  message: { error: RATE_LIMITING.LIMIT_MESSAGE },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip test endpoint
    if (req.path === '/api/test/build') return true;
    // Skip for custom API keys
    return (req.body && req.body.customKeys && req.body.customKeys.groq);
  }
});

// ──── Initialize Supabase ────
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

if (!supabase) {
  console.error("[init] ⚠️  Supabase not configured. Database queries will fail.");
}

// ──── Rotating Groq Client ────
class RotatingGroqClient {
  constructor(apiKeys) {
    this.clients = apiKeys.filter(k => k).map(key => new Groq({ apiKey: key }));
    this.currentIndex = 0;
    if (this.clients.length === 0) {
      throw new Error("No Groq API keys found in environment (GROQ_API_KEY, GROQ_API_KEY_2)");
    }
    console.log(`[AI] Initialized with ${this.clients.length} API keys`);
  }

  get chat() {
    return {
      completions: {
        create: async (params) => {
          let retryCount = 0;
          while (retryCount < this.clients.length) {
            try {
              return await this.clients[this.currentIndex].chat.completions.create(params);
            } catch (error) {
              const isRateLimit = error.status === 429 || (error.message && error.message.includes('rate limit'));
              if (isRateLimit && this.clients.length > 1 && retryCount < this.clients.length - 1) {
                console.warn(`[AI] Rate limit on key ${this.currentIndex + 1}. Rotating to next key...`);
                this.currentIndex = (this.currentIndex + 1) % this.clients.length;
                retryCount++;
                continue;
              }
              throw error;
            }
          }
        }
      }
    };
  }
}

const getGroqClient = () => {
  const keys = [process.env.GROQ_API_KEY, process.env.GROQ_API_KEY_2];
  return new RotatingGroqClient(keys);
};

// ──── Intent Prompt ────
const INTENT_PROMPT = `
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
- component_strategy MUST include all 11 categories.
- Weights dictate budget distribution. Total weight can be any number.
- Keyword Constraints: Use only 1-2 standard retail terms. Never use subjective adjectives.
- Structured First: For numerical requirements (min_gb, min_hz, min_tb, min_wattage), use structured_reqs.
- Exclusions: Use exclude_keywords for "no RGB", "no combo", etc.
- Default needs_monitor, needs_mouse, needs_keyboard to true unless user says they have them.
- Return ONLY valid JSON.
`;

// ──── Helper Functions for Intent Overrides ────
const parseBudgetFromMessage = (message) => {
  if (!message) return null;
  const text = message.toLowerCase();
  const normalized = text.replace(/[,]/g, '');
  
  // Explicit budget pattern: "budget 80k" or "80k bdt"
  const budgetMatch = normalized.match(/budget\s*.*?(\d+(?:\.\d+)?)\s*k\b/) || normalized.match(/(\d+(?:\.\d+)?)\s*k\s*(?:bdt|tk|taka)/);
  if (budgetMatch) {
    const value = Math.round(parseFloat(budgetMatch[1]) * 1000);
    return Number.isFinite(value) ? value : null;
  }

  // Fallback: general K matching, but ignore common resolutions (4k, 5k, 8k)
  const kMatches = [...normalized.matchAll(/(\d+(?:\.\d+)?)\s*k\b/g)];
  for (const match of kMatches) {
    const num = parseFloat(match[1]);
    if (num !== 4 && num !== 5 && num !== 8) {
      const value = Math.round(num * 1000);
      if (value >= 15000) return value;
    }
  }

  // Final fallback: raw 4-7 digit number ≥15000
  const numberMatch = normalized.match(/\b(\d{4,7})\b/);
  if (numberMatch) {
    const value = parseInt(numberMatch[1], 10);
    if (value >= 15000) return value;
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

const applyIntentOverrideApplier = (intent, message) => {
  // Parse budget from message (handles "400k", "400K BDT", etc.)
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
  if (text.includes('16gb')) addStructured(strat, 'RAM', 'min_gb', 16);
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
  if (text.includes('radeon') || text.includes('rx ')) {
    intent.preferred_gpu_brand = 'amd';
    if (strat['Graphics Card']) strat['Graphics Card'].required = true;
  }

  // Handle "no GPU" request
  if (text.includes('no gpu') || text.includes('without gpu') || text.includes('no graphics')) {
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

// ──── Initialize Modules with Dependency Injection ────
console.log("[init] Initializing modular architecture...");

// Cache manager (in-memory by default; set useRedis: true to enable Redis)
const cacheManager = createCacheManager({
  redisClient: null,
  useRedis: false, // TODO: Set to true when Redis is running
});

// Spec inference (extract CPU socket, GPU brand, etc. from product names)
const specInference = createSpecInference();

// Part repository (unified Supabase query interface)
const partRepository = supabase
  ? createPartRepository({ supabase, specInference, cache: cacheManager })
  : null;

// Compatibility checker
const compatibilityChecker = createCompatibilityChecker();

// Budget allocator (floor prices, dynamic allocation, rebalancing)
const budgetAllocator = partRepository
  ? createBudgetAllocator({ partRepository, compatChecker: compatibilityChecker })
  : null;

// Part selector (with fallback logic)
const partSelector = partRepository
  ? createPartSelector({ partRepository, compatChecker: compatibilityChecker })
  : null;

// AI modules
const groqClient = getGroqClient();

const intentExtractor = createIntentExtractor({
  groqClient,
  systemPrompt: INTENT_PROMPT,
});

const explanationGenerator = createExplanationGenerator({
  groqClient,
});

console.log("[init] ✓ All modules initialized");

// ──── Routes ────

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    modules: {
      supabase: !!supabase,
      cache: !!cacheManager,
      groq: !!getGroqClient(),
    }
  });
});

// Build route
const buildHandler = createBuildHandler({
  intentExtractor,
  explanationGenerator,
  compatibilityChecker,
  budgetAllocator,
  partSelector,
  partRepository,
  intentOverrideApplier: applyIntentOverrideApplier,
});

app.post('/api/build', apiLimiter, buildHandler);

// ──── Error Handling ────
app.use((err, req, res, next) => {
  console.error("[server] Unhandled error:", err);
  const logMsg = (err.stack || err) + "\n\n";
  fs.appendFile(path.join(__dirname, 'error.log'), logMsg, (logErr) => {
    if (logErr) console.error("[server] Failed to write error.log:", logErr);
  });
  sendError(res, ERROR_INTERNAL);
});

// ──── Startup ────
app.listen(port, () => {
  console.log(`[server] ✓ Backend running on http://localhost:${port}`);
  console.log(`[server] Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[server] Supabase: ${supabase ? 'connected' : 'disconnected'}`);
});

export default app;
