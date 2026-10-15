# Engine stress harness

Runs the real recommendation engine (orchestrator, allocator, selector, repository,
compatibility checker) against a snapshot of the live catalog, with only the LLM and the DB
transport stubbed. It checks hard invariants on every build: socket/RAM compatibility, PSU
sizing, coolers, brand/DDR requests honoured, totals under the ceiling, no crashes.

```bash
# 1. dump the live catalog (read-only SELECT, needs backend/.env)
node tests/stress/snapshot.mjs catalog.json

# 2. run the grid (~1,900 builds, ~10s); --quick for a smaller grid
npm run stress -- catalog.json --json report.json

# 3. inspect one scenario or group
npm run stress -- catalog.json --only "startech 80000 gaming"
npm run stress -- catalog.json --only FOLLOWUP
npm run stress -- catalog.json --only CHAOS
```

`catalog.json` is git-ignored. The fast regression suite for CI lives in
`tests/engineProperties.test.js` and uses the committed `tests/fixtures/miniCatalog.js` slice.
