# Graph Report - D:\Coding\BuildMyPC  (2026-10-16)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 561 nodes · 1018 edges · 26 communities (23 shown, 3 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 16 edges (avg confidence: 0.73)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `fb45abb4`
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

## God Nodes (most connected - your core abstractions)
1. `executeBuild()` - 17 edges
2. `formatPrice()` - 14 edges
3. `applyIntentOverrides()` - 13 edges
4. `Builder()` - 13 edges
5. `part()` - 12 edges
6. `useBuild()` - 10 edges
7. `chaos()` - 9 edges
8. `followUps()` - 9 edges
9. `SwapDrawer()` - 9 edges
10. `runBuild()` - 8 edges

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

## Communities (26 total, 3 thin omitted)

### Community 0 - "server.js"
Cohesion: 0.06
Nodes (57): buildFacts(), createExplanationGenerator(), KNOWN(), ALWAYS_REQUIRED, createIntentExtractor(), DEFAULT_STRATEGY, EXPECTED_CATEGORIES, parseIntentJson() (+49 more)

### Community 1 - "Builder.jsx"
Cohesion: 0.05
Nodes (47): AmbientBackground(), H_TRACES, V_TRACES, AnimatedPrice(), Builder(), STAGE_MESSAGES, MobileSummaryBar(), Notice() (+39 more)

### Community 2 - "buildOrchestrator.js"
Cohesion: 0.09
Nodes (37): findAlternatives(), SWAPPABLE_CATEGORIES, applyDefaultExcludes(), applyDefaultRamCapacity(), applyDefaultStorageCapacity(), BuildError, DEFAULT_EXCLUDES, executeBuild() (+29 more)

### Community 3 - "constants.js"
Cohesion: 0.09
Nodes (34): BuildList(), SECTIONS, PartRow(), rowMotion(), SkeletonRow(), PROVIDERS, SettingsDialog(), DeltaLabel() (+26 more)

### Community 4 - "harness.mjs"
Cohesion: 0.08
Nodes (36): args, brands, budgetAllocator, cache, catalogPath, CATEGORIES, chaos(), check() (+28 more)

### Community 5 - "sync_db.py"
Cohesion: 0.09
Nodes (32): clean_price(), parse_products_from_page(), Scrape all pages for a category from ComputerMania BD.          Uses DrissionPag, Extract numeric price from WooCommerce bdi text like '13,800৳ '., Wait for Cloudflare 'Just a moment...' challenge to clear (up to 5 minutes)., Extract product data from a loaded DrissionPage.          HTML structure (Woodma, scrape(), wait_for_cloudflare() (+24 more)

### Community 6 - "build.js"
Cohesion: 0.11
Nodes (26): createStatusHandler(), createSubmitHandler(), sanitizePreviousBuild(), sanitizeRemovedCategories(), createError(), ERROR_GROQ_UNAVAILABLE, ERROR_INTERNAL, ERROR_INVALID_INTENT (+18 more)

### Community 7 - "prerender.mjs"
Cohesion: 0.12
Nodes (24): bodyHtml(), dist, esc(), jsonScript(), list(), pages, render(), sitemap (+16 more)

### Community 8 - "devDependencies"
Cohesion: 0.07
Nodes (28): dependencies, axios, framer-motion, lucide-react, react, react-dom, tailwindcss, @tailwindcss/vite (+20 more)

### Community 9 - "package.json"
Cohesion: 0.08
Nodes (23): author, dependencies, cors, dotenv, express, express-rate-limit, groq-sdk, @libsql/client (+15 more)

### Community 10 - "intentEval.mjs"
Cohesion: 0.09
Nodes (22): all, args, baseIntent(), byCheck, CATS, checks, client, CONCURRENCY (+14 more)

### Community 11 - "StoreSelect.jsx"
Cohesion: 0.14
Nodes (14): BuildProgress(), STEPS, Composer(), Header(), Hero(), LogoMark(), ModifiersMenu(), RowMenu() (+6 more)

### Community 12 - "dashboard.py"
Cohesion: 0.11
Nodes (12): Request, get_sync_state(), BuildMyPC Scraper Dashboard — Local web UI for monitoring and controlling the sc, SSE endpoint that streams log entries and progress updates., Return the raw sync_state.json for the UI to show resume info., Create a queue for an SSE subscriber., Target function for the scraper thread., _run_scraper() (+4 more)

### Community 13 - "package.json"
Cohesion: 0.12
Nodes (16): dependencies, dotenv, @libsql/client, devDependencies, concurrently, name, private, scripts (+8 more)

### Community 14 - "applyIntentOverrides"
Cohesion: 0.33
Nodes (9): addExclude(), addKeyword(), addStructured(), applyIntentOverrides(), parseBudgetFromMessage(), parseMonitorHz(), plausible(), UNIT_PATTERNS (+1 more)

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

## Knowledge Gaps
- **190 isolated node(s):** `EXPECTED_CATEGORIES`, `DEFAULT_STRATEGY`, `ALWAYS_REQUIRED`, `CORE_COMPONENTS`, `DEFAULT_EXCLUDES` (+185 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `part()` connect `buildOrchestrator.js` to `server.js`, `Builder.jsx`, `constants.js`?**
  _High betweenness centrality (0.282) - this node is a cross-community bridge._
- **Why does `SwapDrawer()` connect `constants.js` to `Builder.jsx`, `buildOrchestrator.js`?**
  _High betweenness centrality (0.150) - this node is a cross-community bridge._
- **Why does `createPartRepository()` connect `server.js` to `buildOrchestrator.js`, `harness.mjs`?**
  _High betweenness centrality (0.121) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `applyIntentOverrides()` (e.g. with `createDepsForKey()` and `build()`) actually correct?**
  _`applyIntentOverrides()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `Builder()` (e.g. with `part()` and `readShareFromLocation()`) actually correct?**
  _`Builder()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 5 inferred relationships involving `part()` (e.g. with `findAlternatives()` and `createPartRepository()`) actually correct?**
  _`part()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `EXPECTED_CATEGORIES`, `DEFAULT_STRATEGY`, `ALWAYS_REQUIRED` to the rest of the system?**
  _207 weakly-connected nodes found - possible documentation gaps or missing edges._