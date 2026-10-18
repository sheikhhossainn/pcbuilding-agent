# Graph Report - BuildMyPC  (2026-10-18)

## Corpus Check
- 108 files · ~87,183 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 730 nodes · 1260 edges · 47 communities (42 shown, 5 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 15 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `fb5dc2d6`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- server.js
- Builder.jsx
- buildOrchestrator.js
- constants.js
- harness.mjs
- sync_db.py
- build.js
- prerender.mjs
- devDependencies
- package.json
- intentEval.mjs
- StoreSelect.jsx
- dashboard.py
- package.json
- applyIntentOverrides
- types.js
- compilerOptions
- apply_schema.js
- snapshot.mjs
- vercel.json
- parseStorageCapacityGB
- createBuildHandler
- share.js
- SwapDrawer.jsx
- SummaryRail.jsx
- BuildMyPC — Project Context
- useBuild.js
- constants.js
- startech.py
- Phase 3.5: Modular Audit & Hardening
- 1. Key Logic Refinements
- Core Issues & Fixes (Integration Phase)
- Phase 2: Modularization Complete ✅
- UI/UX Enhancements (Senior-Level)
- Phase 4: Queue System ✅
- Phase 5: Conversational Follow-Up ✅
- Infrastructure Changes (May 19, 2026)
- Testing Strategy
- Critical Dependencies
- graphify.md
- graphify.md
- build.js
- patchEval.mjs

## God Nodes (most connected - your core abstractions)
1. `executeBuild()` - 19 edges
2. `BuildMyPC — Project Context` - 19 edges
3. `formatPrice()` - 16 edges
4. `applyIntentOverrides()` - 14 edges
5. `BuildMyPC` - 14 edges
6. `normalizePatch()` - 12 edges
7. `Builder()` - 12 edges
8. `useBuild()` - 11 edges
9. `createIntentExtractor()` - 9 edges
10. `chaos()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `buildPatchPrompt()` --indirect_call--> `text()`  [INFERRED]
  backend/ai/intentExtractor.js → frontend/src/lib/share.js
- `AnimatedPrice()` --indirect_call--> `v()`  [INFERRED]
  frontend/src/components/AnimatedPrice.jsx → backend/tests/stress/harness.mjs
- `normalizePatch()` --indirect_call--> `v()`  [INFERRED]
  backend/engine/followUpPatch.js → backend/tests/stress/harness.mjs
- `createDepsForKey()` --indirect_call--> `applyIntentOverrides()`  [INFERRED]
  backend/server.js → backend/engine/intentOverrides.js
- `build()` --indirect_call--> `applyIntentOverrides()`  [INFERRED]
  backend/tests/engineProperties.test.js → backend/engine/intentOverrides.js

## Import Cycles
- None detected.

## Communities (47 total, 5 thin omitted)

### Community 0 - "server.js"
Cohesion: 0.13
Nodes (18): buildFacts(), createExplanationGenerator(), KNOWN(), AI, apiLimiter, app, cacheManager, compatibilityChecker (+10 more)

### Community 1 - "Builder.jsx"
Cohesion: 0.21
Nodes (8): StatusChip(), TONES, BudgetSplitCard(), SEGMENTS, CompatCard(), PowerCard(), STATUS, SummaryRail()

### Community 2 - "buildOrchestrator.js"
Cohesion: 0.27
Nodes (7): API, CPU_GPU_BALANCE, GPU_ADEQUACY, PART_SELECTION, RATE_LIMITING, SOCKET_RAM_TYPES, createPartSelector()

### Community 3 - "constants.js"
Cohesion: 0.16
Nodes (17): createBudgetAllocator(), createCompatibilityChecker(), assertSound(), BUDGETS, build(), buildWithPriceyMonitor(), CATEGORIES, ceilingOf() (+9 more)

### Community 4 - "harness.mjs"
Cohesion: 0.08
Nodes (36): args, brands, budgetAllocator, cache, catalogPath, CATEGORIES, chaos(), check() (+28 more)

### Community 5 - "sync_db.py"
Cohesion: 0.09
Nodes (32): clean_price(), parse_products_from_page(), Scrape all pages for a category from ComputerMania BD.          Uses DrissionPag, Extract numeric price from WooCommerce bdi text like '13,800৳ '., Wait for Cloudflare 'Just a moment...' challenge to clear (up to 5 minutes)., Extract product data from a loaded DrissionPage.          HTML structure (Woodma, scrape(), wait_for_cloudflare() (+24 more)

### Community 6 - "build.js"
Cohesion: 0.05
Nodes (59): findAlternatives(), SWAPPABLE_CATEGORIES, cleanWords(), CPU_BRANDS, createStatusHandler(), createSubmitHandler(), finiteIn(), GPU_BRANDS (+51 more)

### Community 7 - "prerender.mjs"
Cohesion: 0.11
Nodes (30): baseDir, distDir, publicDir, sitemap, bodyHtml(), dist, esc(), jsonScript() (+22 more)

### Community 8 - "devDependencies"
Cohesion: 0.07
Nodes (29): dependencies, axios, framer-motion, lucide-react, react, react-dom, tailwindcss, @tailwindcss/vite (+21 more)

### Community 9 - "package.json"
Cohesion: 0.08
Nodes (23): author, dependencies, cors, dotenv, express, express-rate-limit, groq-sdk, @libsql/client (+15 more)

### Community 10 - "intentEval.mjs"
Cohesion: 0.09
Nodes (22): all, args, baseIntent(), byCheck, CATS, checks, client, CONCURRENCY (+14 more)

### Community 11 - "StoreSelect.jsx"
Cohesion: 0.07
Nodes (45): AnimatedPrice(), BuildList(), SECTIONS, MobileSummaryBar(), PartRow(), rowMotion(), SkeletonRow(), partLabel() (+37 more)

### Community 12 - "dashboard.py"
Cohesion: 0.11
Nodes (12): Request, get_sync_state(), BuildMyPC Scraper Dashboard — Local web UI for monitoring and controlling the sc, SSE endpoint that streams log entries and progress updates., Return the raw sync_state.json for the UI to show resume info., Create a queue for an SSE subscriber., Target function for the scraper thread., _run_scraper() (+4 more)

### Community 13 - "package.json"
Cohesion: 0.12
Nodes (16): dependencies, dotenv, @libsql/client, devDependencies, concurrently, name, private, scripts (+8 more)

### Community 14 - "applyIntentOverrides"
Cohesion: 0.07
Nodes (25): Engine stress harness, 1. Install, 2. Configure, 3. Create the schema and load parts, 4. Run, API, Backend (`backend/.env`), Backend on Render (+17 more)

### Community 15 - "types.js"
Cohesion: 0.20
Nodes (9): AppError, BuildIntent, BuildResponse, ComponentStrategy, FloorPriceResult, Part, PartSpecs, PriceRange (+1 more)

### Community 16 - "compilerOptions"
Cohesion: 0.22
Nodes (8): compilerOptions, checkJs, module, moduleResolution, skipLibCheck, target, exclude, include

### Community 17 - "apply_schema.js"
Cohesion: 0.25
Nodes (6): cleanedSql, __dirname, __filename, schemaPath, schemaSql, statements

### Community 18 - "snapshot.mjs"
Cohesion: 0.40
Nodes (4): counts, db, here, rows

### Community 26 - "share.js"
Cohesion: 0.06
Nodes (42): App(), AmbientBackground(), H_TRACES, V_TRACES, Builder(), STAGE_MESSAGES, BuildProgress(), STEPS (+34 more)

### Community 27 - "SwapDrawer.jsx"
Cohesion: 0.31
Nodes (8): BUDGET, CPU_TDP, GPU_MODEL_TDP_MAP, GPU_TDP, PSU_SIZING, PSU_WATTAGE, SYSTEM_DRAW, CORE_COMPONENTS

### Community 28 - "SummaryRail.jsx"
Cohesion: 0.20
Nodes (14): ABSORB_CAPS, absorbCapFor(), applyDefaultExcludes(), applyDefaultRamCapacity(), applyDefaultStorageCapacity(), BuildError, DEFAULT_EXCLUDES, executeBuild() (+6 more)

### Community 29 - "BuildMyPC — Project Context"
Cohesion: 0.18
Nodes (10): AI Providers & Model Tiers, Architecture (Phase 2: Modularized), BuildMyPC — Project Context, Deployment Checklist, Environment Variables (.env), Files to Delete/Archive, Module Dependencies (Dependency Injection), Next Phase: Phase 3 (Post-Deployment) (+2 more)

### Community 30 - "useBuild.js"
Cohesion: 0.43
Nodes (7): build_url(), clean_price(), get_first(), Fetch URL with automatic retry and exponential backoff on network errors., safe_fetch(), scrape(), scrape_page()

### Community 31 - "constants.js"
Cohesion: 0.53
Nodes (4): parseRamCapacityGb(), parseStorageCapacityGb(), CATEGORY_MAPPING, createPartRepository()

### Community 32 - "startech.py"
Cohesion: 0.24
Nodes (14): addExclude(), addKeyword(), addStructured(), applyIntentOverrides(), parseBudgetFromMessage(), parseMonitorHz(), PART_NOUNS, partNamed() (+6 more)

### Community 33 - "Phase 3.5: Modular Audit & Hardening"
Cohesion: 0.29
Nodes (7): 10. LGA1700 Motherboard RAM Default Changed, 5. DDR Keyword Matching Gap (Critical), 6. Pentium/Celeron Socket Detection Blindness, 7. Post-Build Validation Deleted During Modularization, 8. Budget Parsing Fallbacks Removed, 9. Intent Override Gaps (4 sub-issues), Phase 3.5: Modular Audit & Hardening

### Community 34 - "1. Key Logic Refinements"
Cohesion: 0.29
Nodes (7): 1. Key Logic Refinements, 2. Database Performance, 3. Configuration System, Fallback Degradation (Fixes 400K Budget Builds), Migration Guide, Model Tier Fallback, Peripheral "Combo" Exclusion

### Community 35 - "Core Issues & Fixes (Integration Phase)"
Cohesion: 0.40
Nodes (5): 1. The "Trap CPU" Inventory Gap, 2. Chipset Detection Blindness, 3. API Rate Limit Failures, 4. RAM Type Desync, Core Issues & Fixes (Integration Phase)

### Community 36 - "Phase 2: Modularization Complete ✅"
Cohesion: 0.40
Nodes (5): Key Bug Fix: Fallback Degradation, New Features, New File Structure, Phase 2: Modularization Complete ✅, What Changed

### Community 38 - "UI/UX Enhancements (Senior-Level)"
Cohesion: 0.50
Nodes (4): 1. Perceived Performance, 2. Spatial Efficiency, 3. User Guidance, UI/UX Enhancements (Senior-Level)

### Community 39 - "Phase 4: Queue System ✅"
Cohesion: 0.50
Nodes (4): Architecture, Files Created/Modified, Phase 4: Queue System ✅, Traffic Warning Feature

### Community 40 - "Phase 5: Conversational Follow-Up ✅"
Cohesion: 0.50
Nodes (4): Architecture, Files Modified, Phase 5: Conversational Follow-Up ✅, UX

### Community 41 - "Infrastructure Changes (May 19, 2026)"
Cohesion: 0.50
Nodes (4): ComputerMania BD Scraper (May 20, 2026), Infrastructure Changes (May 19, 2026), Keep-Alive Cron Job, pg_cron TTL Removed

### Community 42 - "Testing Strategy"
Cohesion: 0.50
Nodes (4): Integration Testing, Manual Testing (Node REPL), Testing Strategy, Unit Tests (Jest Examples Provided)

### Community 43 - "Critical Dependencies"
Cohesion: 0.67
Nodes (3): Backend, Critical Dependencies, Frontend

### Community 46 - "build.js"
Cohesion: 0.12
Nodes (27): ALWAYS_REQUIRED, buildPatchPrompt(), createIntentExtractor(), DEFAULT_STRATEGY, EXPECTED_CATEGORIES, parseIntentJson(), validateAndNormalizeIntent(), ACTIONS (+19 more)

### Community 48 - "patchEval.mjs"
Cohesion: 0.12
Nodes (13): args, CASES, client, CONCURRENCY, extractor, here, PREV_BUILD, PREV_INTENT (+5 more)

## Knowledge Gaps
- **285 isolated node(s):** `EXPECTED_CATEGORIES`, `DEFAULT_STRATEGY`, `ALWAYS_REQUIRED`, `CORE_COMPONENTS`, `DEFAULT_EXCLUDES` (+280 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `v()` connect `harness.mjs` to `StoreSelect.jsx`, `build.js`?**
  _High betweenness centrality (0.128) - this node is a cross-community bridge._
- **Why does `AnimatedPrice()` connect `StoreSelect.jsx` to `harness.mjs`?**
  _High betweenness centrality (0.127) - this node is a cross-community bridge._
- **Why does `text()` connect `share.js` to `StoreSelect.jsx`, `build.js`?**
  _High betweenness centrality (0.096) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `applyIntentOverrides()` (e.g. with `createDepsForKey()` and `build()`) actually correct?**
  _`applyIntentOverrides()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `EXPECTED_CATEGORIES`, `DEFAULT_STRATEGY`, `ALWAYS_REQUIRED` to the rest of the system?**
  _302 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `server.js` be split into smaller, more focused modules?**
  _Cohesion score 0.12857142857142856 - nodes in this community are weakly interconnected._
- **Should `harness.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.0796221322537112 - nodes in this community are weakly interconnected._