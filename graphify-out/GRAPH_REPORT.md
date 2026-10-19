# Graph Report - BuildMyPC  (2026-10-19)

## Corpus Check
- 163 files · ~151,087 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1190 nodes · 2243 edges · 77 communities (69 shown, 8 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 55 edges (avg confidence: 0.7)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `3312ebf1`
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
- share.js
- SwapDrawer.jsx
- BuildMyPC — Project Context
- Notice.jsx
- SummaryRail.jsx
- startech.py
- Phase 3.5: Modular Audit & Hardening
- 1. Key Logic Refinements
- Core Issues & Fixes (Integration Phase)
- Phase 2: Modularization Complete ✅
- AmbientBackground.jsx
- UI/UX Enhancements (Senior-Level)
- Phase 4: Queue System ✅
- Phase 5: Conversational Follow-Up ✅
- Infrastructure Changes (May 19, 2026)
- Testing Strategy
- Critical Dependencies
- graphify.md
- graphify.md
- build.js
- useSettings.js
- patchEval.mjs
- followUpPatch.test.js
- buildOrchestrator.js
- computermania.py
- Steps
- Logo.jsx
- Steps
- engineHarness.js
- budgetAllocator.js
- server.js
- __init__.py
- errors.js
- buildLimiters.js
- constants.js
- buildLimiters.js
- useSettings.js
- has_consecutive_segments
- trim_html
- parse_listing
- MockBrowser
- time.js
- BuildProgress.jsx
- buildValidator.js
- Header.jsx
- InterpretationChips.jsx
- PartImage.jsx
- useDialogFocus.js
- main.jsx
- AmbientBackground.jsx

## God Nodes (most connected - your core abstractions)
1. `executeBuild()` - 31 edges
2. `formatPrice()` - 30 edges
3. `Builder()` - 21 edges
4. `BuildMyPC — Project Context` - 19 edges
5. `applyIntentOverrides()` - 16 edges
6. `useBuild()` - 16 edges
7. `CloudflareBrowser` - 15 edges
8. `crossCheckSite()` - 14 edges
9. `fadeIn()` - 14 edges
10. `BuildMyPC` - 14 edges

## Surprising Connections (you probably didn't know these)
- `buildPatchPrompt()` --indirect_call--> `text()`  [INFERRED]
  backend/ai/intentExtractor.js → frontend/src/lib/share.js
- `RefineSummary()` --indirect_call--> `before()`  [INFERRED]
  frontend/src/components/RefineSummary.jsx → backend/tests/refineExplanation.test.js
- `useBuild()` --indirect_call--> `before()`  [INFERRED]
  frontend/src/hooks/useBuild.js → backend/tests/refineExplanation.test.js
- `AnimatedPrice()` --indirect_call--> `v()`  [INFERRED]
  frontend/src/components/AnimatedPrice.jsx → backend/tests/stress/harness.mjs
- `useBuild()` --indirect_call--> `label()`  [INFERRED]
  frontend/src/hooks/useBuild.js → backend/tests/stress/harness.mjs

## Import Cycles
- None detected.

## Communities (77 total, 8 thin omitted)

### Community 0 - "server.js"
Cohesion: 0.10
Nodes (24): Builder(), CATEGORIES, ColumnHeader(), CompareTable(), CompareTabs(), Delta(), MATCH_ICONS, PartCell() (+16 more)

### Community 1 - "Builder.jsx"
Cohesion: 0.11
Nodes (19): compare(), part(), SAME, specInference, compareParts(), findCounterpart(), IDENTITY_CATEGORIES, identityOf() (+11 more)

### Community 2 - "buildOrchestrator.js"
Cohesion: 0.23
Nodes (16): AnimatedPrice(), BADGE, PartRow(), RemovedRow(), rowMotion(), BudgetImpact(), partLabel(), RefineSummary() (+8 more)

### Community 3 - "constants.js"
Cohesion: 0.13
Nodes (7): FakeScraper, _quiet(), Offline tests for how sync_db wires sites together. Nothing here touches the net, Stands in for a scraper module: scrape() returns one priced item or raises on a, TestRunSyncSelectedSites, TestScrapeSite, TestSites

### Community 4 - "harness.mjs"
Cohesion: 0.06
Nodes (51): addExclude(), addKeyword(), addStructured(), applyIntentOverrides(), parseBudgetFromMessage(), parseMonitorHz(), PART_NOUNS, partNamed() (+43 more)

### Community 5 - "sync_db.py"
Cohesion: 0.17
Nodes (19): execute_turso(), execute_turso_batch(), fresh_state(), get_turso_stats(), infer_specs(), load_state(), mark_stale_out_of_stock(), Progress state with every site at its first category. (+11 more)

### Community 6 - "build.js"
Cohesion: 0.18
Nodes (17): SWAPPABLE_CATEGORIES, cleanWords(), CPU_BRANDS, createCrossCheckHandler(), createSubmitHandler(), CROSS_CHECK_REQUIRED, finiteIn(), GPU_BRANDS (+9 more)

### Community 7 - "prerender.mjs"
Cohesion: 0.11
Nodes (30): baseDir, distDir, publicDir, sitemap, bodyHtml(), dist, esc(), jsonScript() (+22 more)

### Community 8 - "devDependencies"
Cohesion: 0.07
Nodes (29): dependencies, axios, framer-motion, lucide-react, react, react-dom, tailwindcss, @tailwindcss/vite (+21 more)

### Community 9 - "package.json"
Cohesion: 0.07
Nodes (26): author, dependencies, cors, dotenv, express, express-rate-limit, groq-sdk, @libsql/client (+18 more)

### Community 10 - "intentEval.mjs"
Cohesion: 0.09
Nodes (22): all, args, baseIntent(), byCheck, CATS, checks, client, CONCURRENCY (+14 more)

### Community 11 - "StoreSelect.jsx"
Cohesion: 0.13
Nodes (16): createStatusHandler(), BUILD, received, fakeRes(), createJob(), createLaneJob(), getJobStatus(), jobs (+8 more)

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
Cohesion: 0.14
Nodes (18): AmbientBackground(), H_TRACES, V_TRACES, STAGE_MESSAGES, USE_LABEL, Composer(), Hero(), Notice() (+10 more)

### Community 27 - "share.js"
Cohesion: 0.13
Nodes (17): WarningsBanner(), INITIAL_BUILD, renderBold(), buildShareUrl(), clearShareFromLocation(), decodeShare(), encodeShare(), fromBase64Url() (+9 more)

### Community 28 - "SwapDrawer.jsx"
Cohesion: 0.19
Nodes (15): ABSORB_CAPS, absorbCapFor(), applyDefaultExcludes(), applyDefaultRamCapacity(), applyDefaultStorageCapacity(), BuildError, consolidateBuildWarnings(), COUPLED_TO_PLATFORM (+7 more)

### Community 29 - "BuildMyPC — Project Context"
Cohesion: 0.18
Nodes (10): AI Providers & Model Tiers, Architecture (Phase 2: Modularized), BuildMyPC — Project Context, Deployment Checklist, Environment Variables (.env), Files to Delete/Archive, Module Dependencies (Dependency Injection), Next Phase: Phase 3 (Post-Deployment) (+2 more)

### Community 30 - "Notice.jsx"
Cohesion: 0.42
Nodes (8): describeRefine(), FORCED_BY, LABEL, money(), reasonFor(), shortName(), signed(), describeDifference()

### Community 31 - "SummaryRail.jsx"
Cohesion: 0.05
Nodes (36): CloudflareBrowser, Navigate to URL and wait for Cloudflare challenge to clear., Wait for an element matching selector to be displayed., Execute func(page) and retry if elements go stale or exception occurs during Clo, Quit the browser instance if running., Returns the active ChromiumPage, launching it lazily if not already started., Launch the Chromium browser instance., Check if Cloudflare challenge has cleared based on page title. (+28 more)

### Community 32 - "startech.py"
Cohesion: 0.11
Nodes (16): BuildProgress(), STAGE_SECONDS, STEPS, morph, Header(), useScrolled(), InterpretationChips(), sentenceCase() (+8 more)

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

### Community 37 - "AmbientBackground.jsx"
Cohesion: 0.21
Nodes (12): BUDGET, build(), engine, makeIntent(), assertSound(), BUDGETS, buildWithPriceyMonitor(), ceilingOf() (+4 more)

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
Cohesion: 0.16
Nodes (11): MobileSummaryBar(), StatusChip(), TONES, BudgetSplitCard(), SEGMENTS, CompatCard(), CrossCheckCard(), PowerCard() (+3 more)

### Community 47 - "useSettings.js"
Cohesion: 0.17
Nodes (11): 1. Composer dock (Composer.jsx), 2. Refine in progress (new `RefineProgress`), 3. Refine result (RefineSummary.jsx, rewritten), 4. Part rows (PartRow.jsx), 5. Version history (useBuild.js + new `HistoryCard`), 6. Copy and small fixes, 7. Rest of the site, Builder UI/UX redesign: follow-up (refine) flow (+3 more)

### Community 48 - "patchEval.mjs"
Cohesion: 0.12
Nodes (13): args, CASES, client, CONCURRENCY, extractor, here, PREV_BUILD, PREV_INTENT (+5 more)

### Community 49 - "followUpPatch.test.js"
Cohesion: 0.19
Nodes (14): siteLabel(), budgetCeiling(), consistentPins(), countLabels(), crossCheckIntent(), crossCheckSite(), executeCrossCheck(), labelMatches() (+6 more)

### Community 51 - "computermania.py"
Cohesion: 0.22
Nodes (12): API, CPU_GPU_BALANCE, GPU_ADEQUACY, PART_SELECTION, createBudgetAllocator(), createCompatibilityChecker(), SOCKET_RAM_TYPES, createPartSelector() (+4 more)

### Community 52 - "Steps"
Cohesion: 0.15
Nodes (12): Files touched, How a cross-check works, Order and size, Phase 0 — Remove the custom site (frontend only), Phase 1 — Product identity (backend, pure functions), Phase 2 — Engine changes (small, reuse what exists), Phase 3 — Cross-check module and job, Phase 4 — Frontend (+4 more)

### Community 53 - "Logo.jsx"
Cohesion: 0.52
Nodes (6): computeTelemetry(), estimateLocally(), getPartSpecs(), getSpecChips(), known(), parseComponentTelemetry()

### Community 54 - "Steps"
Cohesion: 0.17
Nodes (11): 1. Discovery (manual, before writing the parser), 2. Shared helpers (small refactor, no behaviour change), 3. `scraper/scrapers/ryans.py`, 4. Wire the site in, 5. Tests, 6. Rollout, Files touched, Plan 1 — Ryans Computers scraper (+3 more)

### Community 55 - "engineHarness.js"
Cohesion: 0.14
Nodes (18): buildFacts(), createExplanationGenerator(), KNOWN(), AI, { apiLimiter, refineLimiter, crossCheckLimiter }, app, cacheManager, compatibilityChecker (+10 more)

### Community 56 - "budgetAllocator.js"
Cohesion: 0.38
Nodes (7): CPU_TDP, GPU_MODEL_TDP_MAP, GPU_TDP, PSU_SIZING, PSU_WATTAGE, SYSTEM_DRAW, CORE_COMPONENTS

### Community 57 - "server.js"
Cohesion: 0.13
Nodes (14): Design principles (the "Mac feel" checklist), Goal, New and changed files, Open decisions, Order and size, Phase 0: Foundations (no visible change), Phase 1: Feedback layer (sound and haptics), Phase 2: Surfaces and visual polish (+6 more)

### Community 59 - "errors.js"
Cohesion: 0.29
Nodes (10): createError(), ERROR_GROQ_UNAVAILABLE, ERROR_INTERNAL, ERROR_INVALID_INTENT, errorBudgetTooLow(), errorCannotMeetRequirements(), errorComponentNotFound(), errorCoreComponentMissing() (+2 more)

### Community 60 - "buildLimiters.js"
Cohesion: 0.05
Nodes (63): ALWAYS_REQUIRED, buildPatchPrompt(), createIntentExtractor(), DEFAULT_STRATEGY, EXPECTED_CATEGORIES, parseIntentJson(), validateAndNormalizeIntent(), ACTIONS (+55 more)

### Community 61 - "constants.js"
Cohesion: 0.29
Nodes (9): BuildList(), SECTIONS, SkeletonRow(), CATEGORY_DEPENDENCIES, CORE_CATEGORIES, PERIPHERAL_CATEGORIES, PLATFORM_CATEGORIES, PRESET_WORKLOADS (+1 more)

### Community 62 - "buildLimiters.js"
Cohesion: 0.31
Nodes (6): RATE_LIMITING, strat, withApp(), createBuildLimiters(), hasCustomKey(), isRefine()

### Community 63 - "useSettings.js"
Cohesion: 0.40
Nodes (9): findAlternatives(), collectBuildWarnings(), estimatePower(), createAlternativesHandler(), createValidateHandler(), finiteNumber(), sanitizeBuild(), sanitizeIntent() (+1 more)

### Community 64 - "has_consecutive_segments"
Cohesion: 0.15
Nodes (15): CrossCheckDialog(), PartImage(), APPEARANCE, PROVIDERS, SettingsDialog(), DeltaLabel(), EMPTY, SwapDrawer() (+7 more)

### Community 65 - "trim_html"
Cohesion: 0.67
Nodes (3): Trim raw HTML string down to product cards and pagination bar., run_trim(), trim_html()

### Community 66 - "parse_listing"
Cohesion: 0.08
Nodes (23): clean_price(), Extract numeric price from text like '13,800৳' or 'Tk 12,500'.          Returns, Strip common tracking query parameters and fragment from URL to ensure stable up, strip_tracking(), close(), _get_browser(), last_page(), _load_page() (+15 more)

### Community 67 - "MockBrowser"
Cohesion: 0.09
Nodes (16): _card(), MockBrowser, MockPage, _page(), scrape() raises ValueError for any unmapped category., scrape() stops pagination early when a page has only out-of-stock items, returni, scrape() de-duplicates items with identical URLs across pages, keeping the first, CPU routes where page 1 says there are 3 pages; page2 is the route value for pag (+8 more)

### Community 68 - "time.js"
Cohesion: 0.27
Nodes (8): describeFreshness(), parseTimestamp(), parse_products_from_page(), Scrape all pages for a category from ComputerMania BD.          Uses DrissionP, Wait for Cloudflare 'Just a moment...' challenge to clear (up to 5 minutes)., Extract product data from a loaded DrissionPage.          HTML structure (Wood, scrape(), wait_for_cloudflare()

### Community 69 - "BuildProgress.jsx"
Cohesion: 0.07
Nodes (37): label(), App(), buildSignature(), loadSavedSession(), STAGE_TO_STATE, toValidationIntent(), toValidationPayload(), useBuild() (+29 more)

### Community 70 - "buildValidator.js"
Cohesion: 0.14
Nodes (14): baseBuild(), intent, repoReturning(), run(), am4Build(), gamingIntent, budgetAllocator, compatibilityChecker (+6 more)

### Community 71 - "Header.jsx"
Cohesion: 0.42
Nodes (5): siteNotice(), SITES, siteTracks(), untrackedCategories(), VALID_SITES

### Community 72 - "InterpretationChips.jsx"
Cohesion: 0.36
Nodes (8): build_url(), clean_price(), get_first(), # IMPORTANT: For some StarTech categories, adding sort params makes the site rep, Fetch URL with automatic retry and exponential backoff on network errors., safe_fetch(), scrape(), scrape_page()

### Community 73 - "PartImage.jsx"
Cohesion: 0.43
Nodes (7): build_url(), clean_price(), get_first(), Fetch URL with automatic retry and exponential backoff on network errors., safe_fetch(), scrape(), scrape_page()

### Community 74 - "useDialogFocus.js"
Cohesion: 0.33
Nodes (6): CATALOG, CATEGORIES, CORE, makeDeps(), makeIntent(), initWorkers()

### Community 75 - "main.jsx"
Cohesion: 0.53
Nodes (4): ramGb(), suggestRefines(), build(), part()

## Knowledge Gaps
- **368 isolated node(s):** `EXPECTED_CATEGORIES`, `DEFAULT_STRATEGY`, `ALWAYS_REQUIRED`, `CORE_COMPONENTS`, `DEFAULT_EXCLUDES` (+363 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AnimatedPrice()` connect `buildOrchestrator.js` to `server.js`, `harness.mjs`, `build.js`?**
  _High betweenness centrality (0.137) - this node is a cross-community bridge._
- **Why does `v()` connect `harness.mjs` to `buildOrchestrator.js`, `buildLimiters.js`?**
  _High betweenness centrality (0.135) - this node is a cross-community bridge._
- **Why does `useBuild()` connect `BuildProgress.jsx` to `server.js`, `share.js`, `share.js`, `buildValidator.js`?**
  _High betweenness centrality (0.077) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `Builder()` (e.g. with `result()` and `readShareFromLocation()`) actually correct?**
  _`Builder()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 4 inferred relationships involving `applyIntentOverrides()` (e.g. with `createDepsForKey()` and `depsFor()`) actually correct?**
  _`applyIntentOverrides()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `EXPECTED_CATEGORIES`, `DEFAULT_STRATEGY`, `ALWAYS_REQUIRED` to the rest of the system?**
  _437 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `server.js` be split into smaller, more focused modules?**
  _Cohesion score 0.09879032258064516 - nodes in this community are weakly interconnected._