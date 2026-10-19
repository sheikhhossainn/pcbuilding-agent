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
import { createBuildLimiters } from './utils/buildLimiters.js';
import Groq from 'groq-sdk';
import OpenAI from 'openai';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@libsql/client';

// ──── Imports: Configuration ────
import { BUDGET } from './config/budget.js';
import { API, RATE_LIMITING, AI } from './config/thresholds.js';

// ──── Imports: Modules ────
import { createIntentExtractor } from './ai/intentExtractor.js';
import { INTENT_PROMPT } from './ai/intentPrompt.js';
import { createExplanationGenerator } from './ai/explanationGenerator.js';
import { createCompatibilityChecker } from './engine/compatibilityChecker.js';
import { createBudgetAllocator } from './engine/budgetAllocator.js';
import { createPartSelector } from './engine/partSelector.js';
import { createCacheManager } from './utils/cacheManager.js';
import { createSpecInference } from './utils/specInference.js';
import { createPartRepository } from './utils/partRepository.js';
import { createSubmitHandler, createStatusHandler, createCrossCheckHandler } from './routes/build.js';
import { createAlternativesHandler, createValidateHandler } from './routes/parts.js';
import { sendError, ERROR_INTERNAL } from './utils/errors.js';
import { initWorkers, registerLane } from './utils/queueManager.js';
import { executeBuild } from './engine/buildOrchestrator.js';
import { executeCrossCheck } from './engine/crossCheck.js';
import { applyIntentOverrides } from './engine/intentOverrides.js';

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
  // Uptime monitors hit /health every few minutes; logging each one only buries real traffic.
  if (req.path === '/health') return next();
  const line = `[http] ${req.method} ${req.url}`;
  console.log(line);
  process.stdout.write(`${line}\n`);
  next();
});

// ──── Rate Limiting ────
const { apiLimiter, refineLimiter, crossCheckLimiter } = createBuildLimiters();

// Swap/validate calls are cheap (no AI), so they get a much higher ceiling than /api/build.
const partsLimiter = rateLimit({
  windowMs: RATE_LIMITING.WINDOW_MS,
  max: 120,
  message: { error: 'Too many requests. Please wait a moment and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ──── Initialize Database (Turso LibSQL) ────
const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoAuthToken = process.env.TURSO_AUTH_TOKEN;
const db = (tursoUrl && tursoAuthToken)
  ? createClient({ url: tursoUrl, authToken: tursoAuthToken })
  : null;

if (!db) {
  console.error("[init] ⚠️  Turso database not configured. Database queries will fail.");
}

// ──── Universal AI Client (Ollama Cloud & Groq) ────
export function createUniversalAIClient(keyConfig) {
  let key = typeof keyConfig === 'object' && keyConfig !== null ? keyConfig.key : keyConfig;
  let provider = typeof keyConfig === 'object' && keyConfig !== null ? keyConfig.provider : null;

  if (!provider) {
    if (key && (key.includes('.') || key.startsWith('ollama_'))) {
      provider = 'ollama';
    } else if (key && key.startsWith('gsk_')) {
      provider = 'groq';
    } else {
      provider = process.env.AI_PROVIDER || (process.env.OLLAMA_API_KEY ? 'ollama' : 'groq');
    }
  }

  if (provider === 'ollama') {
    const apiKey = key || process.env.OLLAMA_API_KEY;
    const baseURL = process.env.AI_BASE_URL || 'https://ollama.com/v1';
    return new OpenAI({ apiKey, baseURL });
  }

  // Fallback to Groq via OpenAI client
  const apiKey = key || process.env.GROQ_API_KEY;
  return new OpenAI({
    apiKey,
    baseURL: 'https://api.groq.com/openai/v1',
  });
}

const getAIClient = () => {
  return createUniversalAIClient();
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

// Part repository (unified Turso LibSQL query interface)
const partRepository = db
  ? createPartRepository({ db, specInference, cache: cacheManager })
  : null;

// Compatibility checker
const compatibilityChecker = createCompatibilityChecker();

// Budget allocator (floor prices, dynamic allocation, rebalancing)
const budgetAllocator = partRepository
  ? createBudgetAllocator({ partRepository, compatChecker: compatibilityChecker })
  : null;

// Power sizing only needs the allocator's pure math, so it works even without a database.
const powerAllocator = createBudgetAllocator({ partRepository: null, compatChecker: compatibilityChecker });

// Part selector (with fallback logic)
const partSelector = partRepository
  ? createPartSelector({ partRepository, compatChecker: compatibilityChecker })
  : null;

console.log("[init] ✓ All modules initialized");

// ──── Routes ────

// API Root Info
app.get('/', (req, res) => {
  res.json({
    name: 'BuildMyPC Backend API',
    status: 'online',
    version: '1.0.0',
    documentation: 'AI-Powered PC Configurator for Bangladesh',
    endpoints: {
      health: 'GET /health',
      submitBuild: 'POST /api/build',
      buildStatus: 'GET /api/build/:jobId',
      validateBuild: 'POST /api/build/validate',
      partAlternatives: 'POST /api/parts/alternatives'
    }
  });
});

// Health check
app.get('/health', async (req, res) => {
  let dbActive = false;
  
  if (db) {
    try {
      // Lightweight query to check Turso DB connectivity
      await db.execute('SELECT 1;');
      dbActive = true;
    } catch (e) {
      dbActive = false;
    }
  }

  // A configured database that fails its ping is a real outage: report 503 so monitors alert.
  const healthy = !db || dbActive;

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    modules: {
      turso: dbActive,
      cache: !!cacheManager,
      aiProvider: process.env.AI_PROVIDER || 'ollama',
      aiReady: !!(process.env.OLLAMA_API_KEY || process.env.GROQ_API_KEY),
    }
  });
});

// Build routes (queue-based)
app.post('/api/build', apiLimiter, refineLimiter, createSubmitHandler());
app.post('/api/build/cross-check', crossCheckLimiter, createCrossCheckHandler());
app.get('/api/build/:jobId', createStatusHandler());

// Edit-time helpers: re-check an edited build, and list compatible swap candidates
const partsRouteDeps = { specInference, compatibilityChecker, budgetAllocator: powerAllocator };
app.post('/api/build/validate', partsLimiter, createValidateHandler(partsRouteDeps));
app.post('/api/parts/alternatives', partsLimiter, createAlternativesHandler({ ...partsRouteDeps, partRepository }));

// ──── Error Handling ────
app.use((err, req, res, next) => {
  console.error("[server] Unhandled error:", err);
  const logMsg = (err.stack || err) + "\n\n";
  fs.appendFile(path.join(__dirname, 'error.log'), logMsg, (logErr) => {
    if (logErr) console.error("[server] Failed to write error.log:", logErr);
  });
  sendError(res, ERROR_INTERNAL);
});

// ──── Deps Factory (creates fresh deps per AI key/provider) ────
const createDepsForKey = (keyConfig) => {
  const client = createUniversalAIClient(keyConfig);
  return {
    intentExtractor: createIntentExtractor({ groqClient: client, systemPrompt: INTENT_PROMPT }),
    explanationGenerator: createExplanationGenerator({ groqClient: client }),
    compatibilityChecker,
    budgetAllocator,
    partSelector,
    partRepository,
    specInference,
    intentOverrideApplier: applyIntentOverrides,
  };
};

// ──── Initialize Queue Workers ────
const defaultAiKeys = [
  process.env.OLLAMA_API_KEY,
  process.env.GROQ_API_KEY,
  process.env.GROQ_API_KEY_2
].filter(Boolean);

initWorkers({
  buildFn: executeBuild,
  depsFactory: createDepsForKey,
  groqKeys: defaultAiKeys.length > 0 ? defaultAiKeys : ['ollama-default'],
});

// Cross-checks reuse the engine without the AI: they get their own lane (see queueManager).
if (partRepository) {
  const crossCheckDeps = {
    compatibilityChecker, budgetAllocator, partSelector, partRepository, specInference,
    intentOverrideApplier: applyIntentOverrides,
    intentExtractor: { extract: async () => { throw new Error('A cross-check never reads a message.'); } },
    explanationGenerator: { generate: async () => '' },
  };
  registerLane('crossCheck', {
    run: (payload, ctx) => executeCrossCheck(payload, crossCheckDeps, ctx),
    concurrency: 2,
  });
}

// ──── Startup ────
app.listen(port, () => {
  console.log(`[server] ✓ Backend running on http://localhost:${port}`);
  console.log(`[server] Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[server] AI Provider: ${process.env.AI_PROVIDER || 'ollama'} (Endpoint: ${process.env.AI_BASE_URL || 'https://ollama.com/v1'})`);
  console.log(`[server] Turso Database: ${db ? 'connected' : 'disconnected'}`);
  console.log(`[server] Queue workers: ${defaultAiKeys.length || 1}`);
});

export default app;
