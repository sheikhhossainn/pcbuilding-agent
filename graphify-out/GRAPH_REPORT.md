# Graph Report - BuildMyPC  (2026-10-16)

## Corpus Check
- 102 files · ~77,373 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 660 nodes · 1126 edges · 46 communities (41 shown, 5 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 16 edges (avg confidence: 0.73)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1b3dc866`
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
- SettingsDialog.jsx
- UI/UX Enhancements (Senior-Level)
- Phase 4: Queue System ✅
- Phase 5: Conversational Follow-Up ✅
- Infrastructure Changes (May 19, 2026)
- Testing Strategy
- Critical Dependencies
- graphify.md
- graphify.md

## God Nodes (most connected - your core abstractions)
1. `BuildMyPC — Project Context` - 19 edges
2. `executeBuild()` - 17 edges
3. `formatPrice()` - 14 edges
4. `BuildMyPC` - 14 edges
5. `applyIntentOverrides()` - 13 edges
6. `Builder()` - 13 edges
7. `part()` - 12 edges
8. `useBuild()` - 10 edges
9. `chaos()` - 9 edges
10. `followUps()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `Builder()` --indirect_call--> `part()`  [INFERRED]
  frontend/src/components/Builder.jsx → backend/tests/helpers.js
- `SwapDrawer()` --indirect_call--> `part()`  [INFERRED]
  frontend/src/components/SwapDrawer.jsx → backend/tests/helpers.js
- `useBuild()` --indirect_call--> `part()`  [INFERRED]
  frontend/src/hooks/useBuild.js → backend/tests/helpers.js
- `AnimatedPrice()` --indirect_call--> `v()`  [INFERRED]
  frontend/src/components/AnimatedPrice.jsx → backend/tests/stress/harness.mjs
- `executeBuild()` --indirect_call--> `score()`  [INFERRED]
  backend/engine/buildOrchestrator.js → backend/tests/eval/intentEval.mjs

## Import Cycles
- None detected.

## Communities (46 total, 5 thin omitted)

### Community 0 - "server.js"
Cohesion: 0.06
Nodes (57): buildFacts(), createExplanationGenerator(), KNOWN(), ALWAYS_REQUIRED, createIntentExtractor(), DEFAULT_STRATEGY, EXPECTED_CATEGORIES, parseIntentJson() (+49 more)

### Community 1 - "Builder.jsx"
Cohesion: 0.13
Nodes (13): AmbientBackground(), H_TRACES, V_TRACES, STAGE_MESSAGES, Notice(), TONES, RationaleCard(), Toast() (+5 more)

### Community 2 - "buildOrchestrator.js"
Cohesion: 0.09
Nodes (37): findAlternatives(), SWAPPABLE_CATEGORIES, applyDefaultExcludes(), applyDefaultRamCapacity(), applyDefaultStorageCapacity(), BuildError, DEFAULT_EXCLUDES, executeBuild() (+29 more)

### Community 3 - "constants.js"
Cohesion: 0.26
Nodes (11): PartRow(), rowMotion(), SkeletonRow(), computeTelemetry(), estimateLocally(), getPartSpecs(), getSpecChips(), known() (+3 more)

### Community 4 - "harness.mjs"
Cohesion: 0.07
Nodes (45): addExclude(), addKeyword(), addStructured(), applyIntentOverrides(), parseBudgetFromMessage(), parseMonitorHz(), plausible(), UNIT_PATTERNS (+37 more)

### Community 5 - "sync_db.py"
Cohesion: 0.10
Nodes (31): clean_price(), parse_products_from_page(), Scrape all pages for a category from ComputerMania BD.          Uses DrissionPag, Extract numeric price from WooCommerce bdi text like '13,800৳ '., Wait for Cloudflare 'Just a moment...' challenge to clear (up to 5 minutes)., Extract product data from a loaded DrissionPage.          HTML structure (Woodma, scrape(), wait_for_cloudflare() (+23 more)

### Community 6 - "build.js"
Cohesion: 0.11
Nodes (26): createStatusHandler(), createSubmitHandler(), sanitizePreviousBuild(), sanitizeRemovedCategories(), createError(), ERROR_GROQ_UNAVAILABLE, ERROR_INTERNAL, ERROR_INVALID_INTENT (+18 more)

### Community 7 - "prerender.mjs"
Cohesion: 0.10
Nodes (31): baseDir, distDir, publicDir, sitemap, bodyHtml(), dist, esc(), jsonScript() (+23 more)

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
Cohesion: 0.14
Nodes (15): BuildProgress(), STEPS, Composer(), Header(), Hero(), LogoMark(), ModifiersMenu(), RowMenu() (+7 more)

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
Cohesion: 0.22
Nodes (13): Builder(), buildShareUrl(), clearShareFromLocation(), decodeShare(), encodeShare(), fromBase64Url(), readShareFromLocation(), safeUrl() (+5 more)

### Community 27 - "SwapDrawer.jsx"
Cohesion: 0.30
Nodes (9): AnimatedPrice(), MobileSummaryBar(), TotalCard(), DeltaLabel(), EMPTY, SwapDrawer(), toPartsPayload(), CATEGORY_ICONS (+1 more)

### Community 28 - "SummaryRail.jsx"
Cohesion: 0.21
Nodes (8): StatusChip(), TONES, BudgetSplitCard(), SEGMENTS, CompatCard(), PowerCard(), STATUS, SummaryRail()

### Community 29 - "BuildMyPC — Project Context"
Cohesion: 0.18
Nodes (10): AI Providers & Model Tiers, Architecture (Phase 2: Modularized), BuildMyPC — Project Context, Deployment Checklist, Environment Variables (.env), Files to Delete/Archive, Module Dependencies (Dependency Injection), Next Phase: Phase 3 (Post-Deployment) (+2 more)

### Community 30 - "useBuild.js"
Cohesion: 0.33
Nodes (9): buildSignature(), loadSavedSession(), STAGE_TO_STATE, toValidationIntent(), toValidationPayload(), useBuild(), BUSY_STATES, INITIAL_BUILD (+1 more)

### Community 31 - "constants.js"
Cohesion: 0.39
Nodes (7): BuildList(), SECTIONS, CATEGORY_DEPENDENCIES, CORE_CATEGORIES, PERIPHERAL_CATEGORIES, PLATFORM_CATEGORIES, REQUIRED_CATEGORIES

### Community 32 - "startech.py"
Cohesion: 0.36
Nodes (8): build_url(), clean_price(), get_first(), # IMPORTANT: For some StarTech categories, adding sort params makes the site rep, Fetch URL with automatic retry and exponential backoff on network errors., safe_fetch(), scrape(), scrape_page()

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

### Community 37 - "SettingsDialog.jsx"
Cohesion: 0.60
Nodes (3): PROVIDERS, SettingsDialog(), useDialogFocus()

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

## Knowledge Gaps
- **262 isolated node(s):** `EXPECTED_CATEGORIES`, `DEFAULT_STRATEGY`, `ALWAYS_REQUIRED`, `CORE_COMPONENTS`, `DEFAULT_EXCLUDES` (+257 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `part()` connect `buildOrchestrator.js` to `server.js`, `share.js`, `SwapDrawer.jsx`, `useBuild.js`?**
  _High betweenness centrality (0.213) - this node is a cross-community bridge._
- **Why does `SwapDrawer()` connect `SwapDrawer.jsx` to `Builder.jsx`, `buildOrchestrator.js`, `constants.js`, `SettingsDialog.jsx`, `StoreSelect.jsx`?**
  _High betweenness centrality (0.108) - this node is a cross-community bridge._
- **Why does `createPartRepository()` connect `server.js` to `buildOrchestrator.js`, `harness.mjs`?**
  _High betweenness centrality (0.091) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `applyIntentOverrides()` (e.g. with `createDepsForKey()` and `build()`) actually correct?**
  _`applyIntentOverrides()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `EXPECTED_CATEGORIES`, `DEFAULT_STRATEGY`, `ALWAYS_REQUIRED` to the rest of the system?**
  _279 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `server.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05627545353572751 - nodes in this community are weakly interconnected._
- **Should `Builder.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.12987012987012986 - nodes in this community are weakly interconnected._