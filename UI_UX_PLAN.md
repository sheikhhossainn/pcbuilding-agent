# BuildMyPC — UI/UX Redesign Plan

Scope: `frontend/src/components/Builder.jsx` (1342 lines, single component), `frontend/src/index.css`.
Audited: code read in full + live render at desktop and 375px mobile.

---

## 1. Verdict on current UI

Looks "premium dark / sci-fi cockpit". Works, but style is fighting the job. Job = *help a Bangladeshi buyer trust a PC build and spend money on it*. Cockpit theme adds noise, not trust.

### What is good (keep)
- Chat-first flow: describe build, get build, refine by chat. Core idea is right.
- Presets with budget tags, refine mode, queue position feedback, toast feedback.
- Tactile button press (160ms scale), skeleton loading, `tabular-nums` for prices.
- Retailer selector, copy spec sheet, print/PDF.

### Problems (ranked by user impact)

| # | Problem | Evidence | Impact |
|---|---------|----------|--------|
| 1 | **Fake "Integrity Verification"** — 4 green checks always render, even with empty build and even when `buildWarnings` has INCOMPATIBLE items | `Builder.jsx:1043-1068` | Trust. Worst issue. UI claims safety it did not verify. |
| 2 | **Real warnings buried** at bottom of page inside AI rationale card | `Builder.jsx:925-938` | User misses incompatibility, buys wrong part. |
| 3 | **Empty state = 12 "Awaiting configuration" cards** + prompt hidden in bottom bar | screenshots | First visit shows a wall of nothing. No hero, no clear first action. |
| 4 | **Total price at very bottom on mobile** (right column stacks after all rows) | grid `lg:col-span-4` | Most important number invisible on phones. Likely majority of BD traffic. |
| 5 | **No manual part swap / undo**. Trash button only; only chat can change a part. | `Builder.jsx:568-578` | Users cannot say "same but cheaper RAM" without typing. Remove has no undo. |
| 6 | **Build lost on refresh** — no persistence, no share link | state only in `useState` | Build is the product. Losing it is a bounce. |
| 7 | **Budget not shown against total** — user said "under 60k", UI shows only total | `total` only | Cannot see "am I under budget?" at a glance. |
| 8 | **Jargon labels**: "Hardware Blueprint", "Anchor Processing Silicon", "Core Anchor", "Telemetry", "Integrity Verification", "Inventory Engine" | throughout | Slows comprehension; sounds like a game HUD. |
| 9 | **Visual noise**: double-bezel nested borders, glows, gradient button, 4 badge types per row, mono UPPERCASE micro-labels at 10–11px everywhere | `index.css`, row render | Flat hierarchy: 12 identical heavy cards. Eye has no entry point. |
| 10 | **Duplicate actions**: Copy/Export in header *and* right-column dock; "API Key" is a top-level nav item | `Builder.jsx:640-670, 1071-1087` | Settings concern promoted to primary nav; confusion. |
| 11 | **Accessibility**: `text-zinc-600/700` on near-black, 10–11px text, `focus:outline-none` with no replacement ring, modal has no `role="dialog"`/focus trap/Esc, toast not `aria-live`, modal has no exit animation (not in `AnimatePresence`) | grep | WCAG AA fail; keyboard users stuck. |
| 12 | **Fake progress**: 1.5s / 3s timers cycle labels regardless of real backend stage | `Builder.jsx:281-287` | Label lies. In refine mode skeletons also replace locked rows → layout jump. |
| 13 | **Telemetry shown when empty** ("~25 Watts", "36W+") and TDP heuristics duplicated client-side vs `backend/config/tdpHeuristics.js` | `parseComponentTelemetry` | Two sources of truth; numbers can disagree with backend warnings. |
| 14 | **Currency formatted "BDT 0"** (Intl `en-BD` + `currency: BDT`) | `formatPrice` | Local convention is ৳ . |
| 15 | **Emoji as icons** (🎮🚀🎬 in presets, ✨ ✓ in toasts) next to Lucide icons | presets, toasts | Inconsistent, renders differently per OS. |
| 16 | **One 1342-line component** | file | Every UI change is risky; blocks the redesign. |

---

## 2. Design direction: "Calm Retail Workbench"

### Light or dark?
**Light-first, dark as a toggle.** Reasons:
- It is a *shopping decision* tool. Product photos from retailers are white-background; current UI force-wraps them in `bg-white` boxes because they clash with dark. On light they sit natively.
- Price tables, spec lists, and PDF export read better and print natively on light.
- Daylight phone use is the common case for BD buyers.
- Trust cues (finance/commerce — Stripe-style) are light-first; dark is a developer-tool convention.
- Dark stays available: tokens make it cheap (see §3).

### Principles
1. **One screen = one decision.** Empty → prompt. Built → review. Review → refine/export.
2. **Truthful UI.** Never show a green check that was not computed. Warnings go top, not bottom.
3. **Price and status always visible.** Total + budget + compat state pinned (rail on desktop, bar on mobile).
4. **Color means state.** Neutral palette + one accent. Green/amber/red only for compat, power, budget.
5. **Plain words.** Say "Processor", "Compatibility", "Power", "Total".
6. **Show less by default.** Spec chips max 3. Optional categories collapsed. Details on expand.

### Research basis (honest note)
Search results were thin; nothing PC-builder-specific and several vendor blogs. Used only where it agrees with established practice:
- Keep a familiar part-list layout (Jakob's Law) — people know PCPartPicker-style rows. [DriveWorks configurator tips](https://www.driveworks.co.uk/blog/our-top-tips-for-optimizing-configurator-user-experience/)
- Running per-item prices and a visible total raise perceived control in configurators. [MDPI study, 180 users](https://www.mdpi.com/2071-1050/14/23/15903)
- AI chat should not bury or cover the deliverable; keep one source of truth, give a mobile fallback. [AI UX glossary: canvas](https://aiuxplayground.com/glossary/canvas), [artifacts vs chat](https://p0stman.com/agent-ux/artifacts-vs-chat)
- Restraint, one accent, color for status, progressive disclosure, data tables as primary UI (Linear/Vercel/Stripe pattern). [SaaS design trends 2026](https://saasui.design/blog/7-saas-ui-design-trends-2026), [dashboard anatomy](https://www.saasframe.io/blog/the-anatomy-of-high-performance-saas-dashboard-design-2026-trends-patterns)

---

## 3. Visual system

### Color tokens (CSS variables on `:root`, mirrored under `[data-theme="dark"]`)

| Token | Light | Dark |
|-------|-------|------|
| `--bg` | `#FAFAF9` | `#0C0D10` |
| `--surface` | `#FFFFFF` | `#14161B` |
| `--surface-2` | `#F5F5F4` | `#1B1E25` |
| `--border` | `#E7E5E4` | `#2A2E37` |
| `--text` | `#1C1917` | `#F4F4F5` |
| `--text-2` | `#57534E` | `#A1A1AA` |
| `--accent` | `#4F46E5` (indigo-600) | `#818CF8` |
| `--ok` | `#15803D` | `#4ADE80` |
| `--warn` | `#B45309` | `#FBBF24` |
| `--bad` | `#B91C1C` | `#F87171` |

Text/background pairs must hit ≥ 4.5:1. `--text-2` is the lowest allowed body text; drop all `zinc-600/700` text.

### Type
- UI: **Inter** (or Geist), base 14–15px, weights 400/500/600. Replace Outfit.
- Numbers (prices, watts): same font with `font-variant-numeric: tabular-nums`. Mono only for API-key input and code-like values. Kill uppercase mono micro-labels.
- Scale: 12 / 14 / 16 / 20 / 28 (total price only).
- Min text size 12px.

### Shape and depth
- Radius 8 (inputs/buttons), 12 (cards). Single 1px border, no nested bezels, no glows, no gradient buttons.
- Shadow only on floating layers (composer, modal, toast): `0 8px 24px rgba(0,0,0,.08)`.
- Spacing on 4px grid; page gutter 16 mobile / 24 desktop; max width 1200.

### Motion (keep what already works)
- 160ms press scale, 200ms ease-out for enter. Keep framer-motion `layout` for row insert/remove.
- On build complete: stagger rows 30ms; total counts up 400ms.
- Respect `prefers-reduced-motion` (currently ignored).
- Remove infinite pulse/glow loops.

---

## 4. Information architecture and layout

### 4.1 Empty state (first visit)
Centered hero, no 12 empty cards:
```
            Build a PC for your budget
   Describe what you need. We match live prices from BD retailers.

   ┌──────────────────────────────────────────────┐
   │ Gaming PC under 75,000 BDT with Ryzen 5   [→]│
   └──────────────────────────────────────────────┘
   Retailer: StarTech ▾

   [1080p Gaming · 60k] [1440p Gaming · 120k] [Editing · 90k] [Office · 35k] [Workstation · 180k]
```
Presets become real cards with icon (Lucide, not emoji), title, budget. Click = fill prompt (not submit) — keep current behavior.

### 4.2 Result state — desktop (≥1024px)
```
┌ top bar: logo · retailer ▾ · [Copy] [Share] [Export] · ⚙ · theme ──────────┐
│                                                                            │
│ Build list (8 cols)                          │ Summary rail (4 cols, sticky)│
│  ⚠ 1 compatibility issue  [View]  ← banner   │  ৳ 58,400                   │
│  CORE                                        │  ▓▓▓▓▓▓▓▓▓░ 97% of ৳60,000  │
│  CPU   Ryzen 5 5600  [AM4][6C]   ৳14,200 ⇄ ✕ │  Compatibility  ✓ / ⚠ 2     │
│  GPU   RTX 4060 8GB  [8GB]       ৳38,000 ⇄ ✕ │  Power  420W of 650W  ▓▓▓░  │
│  PLATFORM …                                  │  Where money goes ▓▓▓▓      │
│  ▸ Peripherals (4 optional)  ← collapsed     │                             │
│  AI rationale (collapsible)                  │                             │
└──────────────────────────────────────────────┴─────────────────────────────┘
        [ Refine: "swap GPU to RTX 4060…"                         [→] ]  ← docked composer
```
- **Rows are dense, single-line** (≈64px): icon+category | thumb + name + ≤3 spec chips | price | actions. Not 12 tall cards.
- Group labels (Core / Platform / Peripherals) as quiet section headings; drop "Anchor/Core Anchor/Required" badges. Show a small "Missing" dashed row only for required categories not filled.
- **Row actions**: `⇄ Swap`, open on retailer, remove (with **Undo toast**, 5s).
- **Compat banner at top** of list when warnings exist; red for INCOMPATIBLE, amber otherwise. Rail Compatibility card links to same list.
- **Composer**: docked, centered `max-w-2xl` floating pill (not full-width bar), with bottom padding on list so it never covers content. Modifier chips move into a `+` popover. Presets only in empty state.

### 4.3 Result state — mobile (<1024px)
- Header collapses to logo + overflow menu. Retailer chip sits under header as a pill, not buried in a hamburger.
- **Sticky summary bar** at top of list: `৳58,400 · 97% of budget · ✓ Compatible` — tap to expand rail details as a sheet.
- Rows: 2 lines (name + price right-aligned); actions in a `⋯` menu / swipe is optional later.
- Composer pinned bottom with safe-area inset; collapses to one line until focused.
- Peripherals collapsed by default.

### 4.4 Swap part (new interaction)
Right-side drawer (sheet on mobile): current part on top, ranked alternatives for same category filtered by compatibility, each with price delta vs current (`−৳1,200`). Selecting updates total + re-runs compat check.
Needs backend: `GET /api/parts?category=&site=&socket=&ram_type=&limit=` using existing `partRepository`. UI can ship first with chat-only swap ("Ask AI to change") as fallback.

### 4.5 Settings
Move API key + provider into one `Settings` dialog behind a gear icon (not primary nav). Proper dialog: `role="dialog"`, focus trap, Esc, return focus, `AnimatePresence` exit. Keep the 429 hint that points here only when relevant.

---

## 5. Behavior fixes (truthful, resilient)

1. **Compat status from data.** Drive the checks from `buildWarnings` + backend-supplied flags. States: `Not checked` (empty), `All checks passed`, `N issues`. Delete hardcoded list.
2. **Budget awareness.** Backend already parses intent budget → return `result.budget` (or reuse `intent.budget`) and show total vs budget.
3. **Persist** `build`, `total`, `explanation`, `warnings`, `previousIntent` to `localStorage` (try/catch). Restore on load. Add "New build" to reset.
4. **Share link** (phase 3): `POST /api/builds` → short id; `/b/:id` read-only view. Interim: URL-hash encoded compact build.
5. **Undo for remove**; recompute total from items (`sum(price)`) instead of incremental subtraction to avoid drift.
6. **Real progress.** Backend job returns `stage` (`intent` / `selecting` / `checking` / `explaining`); poll maps stage → label. Drop fake timers. In refine mode, skeleton only the *changed* rows; keep locked rows visible.
7. **Single telemetry source.** Return `power: {draw, recommended}` and parsed `specs` from backend (`specInference.js`); delete `parseComponentTelemetry` from client.
8. **Format**: `৳ 58,400` via `Intl.NumberFormat('en-BD')` + manual ৳ prefix, or `bn-BD` digits as optional setting.
9. **Stock/freshness**: show "In stock" / "Updated 2h ago" per row if scraper timestamp available (`last_seen`). Retail trust cue.
10. **Errors**: inline, actionable ("Retry", "Open settings"); not just a red box.

---

## 6. Accessibility checklist
- Contrast ≥ 4.5:1 body, ≥ 3:1 UI borders/icons. No text under 12px.
- Visible `:focus-visible` ring on every control (2px accent, 2px offset).
- Dialog: labelled, focus trap, Esc, restore focus. Drawer same.
- Toast region `aria-live="polite"`; errors `role="alert"`.
- Icon-only buttons get `aria-label` (not just `title`).
- Status never by color alone: icon + text for ok/warn/bad.
- Touch targets ≥ 40px. `prefers-reduced-motion` honored. Print stylesheet rebuilt on tokens (light already).

---

## 7. Implementation plan

### Phase 0 — Quick wins (≈½ day, no restructure)
- Delete fake Integrity checklist → real compat card from `buildWarnings`.
- Move warnings above the list.
- Hide power/budget cards until a build exists.
- ৳ formatting; swap emoji for Lucide icons; rename jargon labels.
- Focus rings, `aria-label`s, toast `aria-live`, modal Esc + `role="dialog"`.
- Persist build to `localStorage`; undo on remove.

### Phase 1 — Foundation (≈1–2 days)
- Tokens in `index.css` (light + dark), Inter font, remove bezel/titanium/glow classes.
- Split `Builder.jsx`: `useBuild` hook (state, polling, abort), `PromptHero`, `Composer`, `BuildList`, `PartRow`, `SummaryRail`, `CompatCard`, `PowerCard`, `SettingsDialog`, `Toast`.
- Theme toggle (`data-theme` + `prefers-color-scheme` default).

### Phase 2 — Layout and flow (≈2 days)
- Hero empty state → result layout (list + sticky rail).
- Mobile sticky summary bar + sheet; collapsed peripherals.
- Docked composer, modifier popover, refine-mode pill refined.
- Stagger/count-up motion; reduced-motion.

### Phase 3 — Capability (≈2–3 days, touches backend)
- Stage-based progress from queue job.
- Return `budget`, `power`, `specs`, `last_seen` in result payload.
- Swap drawer + `/api/parts` endpoint.
- Share link (`/b/:id`).

### Phase 4 — Polish
- Skeletons matching new rows; empty/error illustrations (text-only is fine).
- Print/PDF template.
- Lighthouse a11y ≥ 95; manual keyboard + screen-reader pass; test 360px, 768px, 1280px.

---

## 8. Success measures
- First-visit: time to first prompt submit (target < 10s; hero + presets).
- Build completion → copy/export/share rate.
- Refine rate (follow-up prompts per build).
- Mobile: total visible without scrolling in 100% of result views.
- 0 sessions where UI shows "all checks passed" while warnings exist.
- Lighthouse a11y ≥ 95.

---

## 8b. Status

| Phase | State |
|-------|-------|
| 0 Quick wins | Shipped (PR #3) |
| 1 Design system + split | Shipped (PR #3) |
| 2 Hero, dense rows, dock | Shipped (PR #3) |
| 3 Backend + swap + share | This branch. Stage progress, `power`/`budget`/`notes` in payload, `POST /api/build/validate`, `POST /api/parts/alternatives`, swap drawer, hash share link, per-part freshness |

Follow-ups found while verifying Phase 3 (branch `fix/phase3-followups`):

| Finding | Fix |
|---------|-----|
| Spec inference returned `UNKNOWN` for 42 live listings (7 CPUs, 11 boards, 5 RAM kits, 19 GPUs): Ryzen PRO APUs, B840/H770/X299/TRX/LGA775 boards, RAM without a "DDR4" keyword, Intel Arc and GT cards | Data-driven rules + regression tests using the real names. Catalog survey is now 0 unknown in every category |
| Removing a part by hand then refining re-added it | `removedCategories` is sent with the refine; the engine marks them not required (CPU, board, RAM, PSU are never dropped) |
| A refine on a shared link had an empty blueprint and parts with no specs | Link decode rebuilds a full strategy; the engine infers missing specs before locking |
| Sessions saved before Phase 3 kept a stale false INCOMPATIBLE | Re-validated once on load when `power` is missing |
| Two retailer pickers on the start screen | Header picker hidden while the hero is shown |

Phase 3 decisions taken (open questions from §9): swap endpoint included; share link uses the URL hash (no new DB table); Bangla UI out of scope.

## 9. Decisions needed from you
1. **Light-first default** (recommended) vs keep dark default with light option.
2. **Swap-part drawer** needs a new backend endpoint — include in this round, or ship UI with chat-only swap first?
3. **Share link** — worth a DB table (Turso/Supabase), or hash-in-URL is enough for now?
4. **Bangla UI / ৳ Bangla numerals** — in scope?
