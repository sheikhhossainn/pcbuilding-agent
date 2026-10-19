<div align="center">

<img src="frontend/public/icon-512.png" alt="BuildMyPC logo" width="112" height="112" />

# BuildMyPC

**Describe the PC you want. Get a compatible build with live Bangladeshi prices in seconds, then see which store sells it cheapest.**

AI-assisted PC configurator for the Bangladesh market: budget in BDT in, compatibility-checked parts list out, priced across StarTech, TechLand, ComputerMania and Ryans.

[![Live demo](https://img.shields.io/badge/live%20demo-buildmypc--eight.vercel.app-6366F1?style=for-the-badge)](https://buildmypc-eight.vercel.app)

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white&style=flat-square)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white&style=flat-square)](https://vite.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white&style=flat-square)](https://tailwindcss.com)
[![Node.js](https://img.shields.io/badge/Node.js-Express%205-339933?logo=nodedotjs&logoColor=white&style=flat-square)](https://expressjs.com)
[![Turso](https://img.shields.io/badge/Turso-libSQL-4FF8D2?logo=turso&logoColor=black&style=flat-square)](https://turso.tech)
[![Python](https://img.shields.io/badge/Scraper-Python-3776AB?logo=python&logoColor=white&style=flat-square)](https://www.python.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)

[Live demo](https://buildmypc-eight.vercel.app) ·
[Features](#features) ·
[How it works](#how-it-works) ·
[Quick start](#quick-start) ·
[Configuration](#configuration) ·
[Deployment](#deployment) ·
[Testing](#testing)

<br />

<img src="frontend/public/og-image.png" alt="BuildMyPC: AI PC builder for Bangladesh" width="760" />

</div>

---

## Why BuildMyPC

Picking parts in Bangladesh means juggling retailer tabs, fluctuating prices and a spreadsheet of socket and memory rules. BuildMyPC takes a sentence like

> *"Gaming PC under 80k, Intel CPU, Nvidia GPU, 144Hz monitor"*

and returns a full build: every part is **in stock**, **compatible**, **priced from a real retailer catalog**, and linked to its product page. Ask a follow-up ("make it AMD", "add a UPS", "I already have a monitor") and only the affected parts change. One more tap prices the same build at every other supported store, so you know where to buy it.

## Features

| | |
|---|---|
| **Natural-language input** | English, Banglish and mixed messages: `65k`, `1.5 lakh`, `৳70,000`, `70 hajar taka`. |
| **Compatibility by construction** | CPU socket ↔ motherboard, DDR4/DDR5 across CPU, board and RAM, PSU headroom from real TDP, cooler required for hot CPUs, integrated-graphics checks for no-GPU builds. |
| **Budget-aware allocation** | AI-assigned weights split the budget per use case (a gaming build leans on the GPU, an editing build on cores and RAM). Leftover budget is spent by upgrading the highest-impact parts. |
| **Honest refusals** | If no compatible build exists at a price, it says what the cheapest viable build costs instead of returning a broken one. |
| **Iterative refinement** | Follow-ups lock unchanged categories, so one tweak never reshuffles the whole build. |
| **Swap and validate** | Swap any part for alternatives, remove parts you own, and re-validate the whole build on every change. |
| **Compare stores** | Prices the finished build at every other retailer: the same part where it is stocked, an equivalent with the same key specs, or a compatible substitute. Shows the cheapest complete store, the saving, and a part-by-part table, and switches your build to that store in one tap. No AI call, so it is fast and free. |
| **Version history** | Every build and refinement is kept as a version you can step back to. |
| **Shareable builds** | A build encodes into the URL hash; nothing is stored server-side, so links never expire. They keep the prices from when they were shared. |
| **Bring your own key** | Paste an Ollama Cloud or Groq key in Settings to skip the public queue. The key is saved in your browser and sent only with your own build requests. |
| **Polished, native-feeling UI** | Spring-based motion, light and dark themes (or follow the system), soft synthesized sound effects and haptics that can be turned off, swipe-to-dismiss sheets and toasts, and full `prefers-reduced-motion` support. Works from 320 px phones to wide desktops. |
| **Live inventory** | Python scraper keeps StarTech, TechLand, ComputerMania and Ryans prices and stock fresh in Turso. A store that cannot supply a full build right now (ComputerMania currently stocks only laptops and accessories) is flagged with a notice. |
| **Resilient backend** | Async job queue with position and ETA, per-IP rate limits, bounded queue, response caching with stampede protection. |
| **SEO-ready** | Prerendered budget landing pages, FAQ and breadcrumb structured data, a web app manifest and a generated sitemap. |

## How it works

```mermaid
flowchart LR
    U([User prompt]) --> UI[React + Vite UI]
    UI -- POST /api/build --> API[Express API + job queue]
    API --> I[1. Intent extraction<br/>LLM + deterministic overrides]
    I --> F[2. Floor prices<br/>and feasibility]
    F --> A[3. Weighted budget<br/>allocation]
    A --> S[4. Compatible part<br/>selection]
    S --> R[5. Rebalance<br/>spend the surplus]
    R --> V[6. Validation<br/>and explanation]
    V --> UI
    UI -- POST /api/build/cross-check --> X[Cross-check<br/>match parts per store]
    X --> UI
    DB <--> X
    DB[(Turso / libSQL<br/>components)] <--> F
    DB <--> S
    SC[Python scraper<br/>StarTech · TechLand · ComputerMania · Ryans] --> DB
```

1. **Intent extraction**: an LLM turns the message into a typed blueprint (budget, use case, brand and DDR preferences, per-category weights). Deterministic overrides then re-parse the hard facts (budget, "no GPU", retailer) so a model slip cannot change your numbers.
2. **Floor prices**: the cheapest compatible part per category sets the minimum viable cost. Impossible budgets fail fast with a clear message; tight ones shed optional extras (UPS, monitor, peripherals) before touching core parts.
3. **Weighted allocation**: surplus above the floor is distributed by the blueprint's weights.
4. **Selection**: parts are chosen in dependency order (CPU, motherboard, RAM, GPU, PSU, storage, case, cooler, peripherals), each constrained by what is already picked.
5. **Rebalance**: remaining budget upgrades the parts that matter most for the use case, within caps.
6. **Validation and explanation**: the finished build is re-checked end to end, and a short plain-language rationale is generated.

**Compare stores** runs separately and never calls the AI. For each other store it looks for the same model of every part, then an equivalent with matching key specs. Matches that still fit together are locked, and the normal engine fills any gaps from that store's stock using the original build's intent. Each part is labelled *Same part*, *Equivalent*, *Substitute*, *Not in stock* or *Added* (for example a cooler a hotter CPU now needs), so you can see exactly what changes before switching.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS 4, Framer Motion, Web Audio (synthesized sound effects, no audio files) |
| Backend | Node.js, Express 5, `express-rate-limit` |
| Database | [Turso](https://turso.tech) (libSQL / SQLite) |
| AI | Any OpenAI-compatible endpoint: Ollama Cloud by default, Groq supported |
| Scraper | Python, DrissionPage, Scrapling, FastAPI dashboard |
| Hosting | Vercel (frontend), Render (backend) |

## Quick start

### Prerequisites

- Node.js 20+
- Python 3.10+ (only to run the scraper)
- A [Turso](https://turso.tech) database
- An [Ollama Cloud](https://ollama.com/settings/keys) or [Groq](https://console.groq.com/keys) API key

### 1. Install

```bash
git clone https://github.com/sheikhhossainn/pcbuilding-agent.git
cd pcbuilding-agent

npm install
npm --prefix backend install
npm --prefix frontend install
```

### 2. Configure

Create `backend/.env` (see [Configuration](#configuration)):

```env
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your_turso_token

AI_PROVIDER=ollama
OLLAMA_API_KEY=your_ollama_key
```

### 3. Create the schema and load parts

```bash
# create the components table and indexes in Turso
node scripts/apply_schema.js

# scrape retailers into the database (first run takes a while)
cd scraper
python -m venv venv
./venv/Scripts/activate        # macOS / Linux: source venv/bin/activate
pip install -r requirements.txt
python sync_db.py
```

The scraper checkpoints after every category and resumes from the exact point of failure.

### 4. Run

```bash
npm run start:all
```

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:3001 |

## Configuration

### Backend (`backend/.env`)

| Variable | Required | Description |
|---|:---:|---|
| `TURSO_DATABASE_URL` | yes | libSQL URL of your Turso database |
| `TURSO_AUTH_TOKEN` | yes | Turso auth token |
| `AI_PROVIDER` | no | `ollama` (default) or `groq` |
| `OLLAMA_API_KEY` | with `ollama` | Ollama Cloud API key |
| `GROQ_API_KEY`, `GROQ_API_KEY_2` | with `groq` | Groq keys; the second is used for rate-limit rotation |
| `AI_BASE_URL` | no | Override the OpenAI-compatible base URL (default `https://ollama.com/v1`) |
| `AI_PRIMARY_MODEL` | no | Model for intent extraction (default `gpt-oss:120b`) |
| `AI_FALLBACK_MODEL` | no | Used if the primary call fails |
| `AI_EXPLANATION_MODEL` | no | Model for the build rationale |
| `PORT` | no | HTTP port (default `3001`) |

### Frontend (`frontend/.env`)

| Variable | Description |
|---|---|
| `VITE_API_BASE_URL` | Backend origin, e.g. `https://your-api.onrender.com`. Empty in dev (Vite proxies `/api`). |

### Choosing a model

Intent extraction is the only model-sensitive step. `backend/tests/eval/intentEval.mjs` scores a model on 38 realistic messages (budget, use case, brands, DDR, RAM, storage, follow-ups):

```bash
cd backend
AI_PRIMARY_MODEL=gemma4:31b AI_FALLBACK_MODEL=gemma4:31b \
  node tests/eval/intentEval.mjs --out results/gemma4.json
```

In our runs `gemma4:31b` matched `gpt-oss:120b` at 100% accuracy with roughly half the latency.

## API

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/build` | Submit a prompt; returns a `jobId` |
| `GET` | `/api/build/:jobId` | Poll status, queue position and the finished build |
| `POST` | `/api/build/cross-check` | Price a finished build at every other store (no AI call) |
| `POST` | `/api/build/validate` | Re-validate an edited build (no AI call) |
| `POST` | `/api/parts/alternatives` | Compatible swaps for one category |
| `GET` | `/health` | Liveness + database check (`503` if the database is down) |

## Deployment

### Backend on Render

| Field | Value |
|---|---|
| Root Directory | `backend` |
| Build Command | `npm install` |
| Start Command | `npm start` |

Add the variables from [Configuration](#configuration). Render injects `PORT`. Point an uptime monitor at `/health` (every 5 to 10 minutes) to keep a free instance warm.

### Frontend on Vercel

| Field | Value |
|---|---|
| Root Directory | `frontend` |
| Framework Preset | Vite |
| Build Command | `npm run build` (runs `vite build` then the prerender step) |
| Env var | `VITE_API_BASE_URL` = your Render URL |

The build writes one static HTML file per landing page plus `sitemap.xml`. After deploying, submit the sitemap in Google Search Console.

## Testing

```bash
npm test                              # backend + frontend unit tests
npm --prefix backend run stress       # randomized engine stress harness
npm --prefix backend run stress -- --quick
```

The stress harness drives the real engine against a catalog snapshot and asserts invariants: socket and DDR compatibility, PSU headroom, cooler for hot CPUs, brand and DDR preferences honoured, total within the budget ceiling, and no crashes. See [`backend/tests/stress/README.md`](backend/tests/stress/README.md).

## Project structure

```text
.
├── frontend/                 React + Vite app
│   ├── src/components/       Builder, Hero, part rows, swap drawer, compare stores dialog, settings, toasts, SEO content
│   ├── src/hooks/            Build session, cross-check, settings, toasts, sheet drag
│   ├── src/lib/              Share links, motion tokens, sound and haptics, theme, formatting
│   ├── src/seo/              Landing page copy, FAQ and structured data
│   ├── scripts/prerender.mjs Static HTML + sitemap generation
│   └── public/               Icons, social card, robots.txt
├── backend/
│   ├── ai/                   Intent prompt, extractor, explanation generator
│   ├── engine/               Orchestrator, budget allocator, part selector, validators, cross-check
│   ├── routes/               Build, status, cross-check, validate and alternatives handlers
│   ├── utils/                Part repository, cache, queue, spec inference, product matching
│   └── tests/                Unit, property, stress and LLM eval suites
├── scraper/                  Python ETL for StarTech, TechLand, ComputerMania and Ryans
├── scripts/apply_schema.js   Create the Turso schema
└── turso_schema.sql
```

## Supported retailers

| Retailer | Status |
|---|---|
| StarTech BD | Supported |
| TechLand BD | Supported |
| ComputerMania BD | Supported |
| Ryans BD | Supported |

All eleven categories are covered: CPU, motherboard, RAM, storage, GPU, PSU, casing, CPU cooler, monitor, mouse and keyboard, plus UPS.

## Contributing

Issues and pull requests are welcome. Please run `npm test` and the stress harness before opening a PR, and keep changes to the recommendation engine covered by a test or a stress scenario.

## License

MIT, see [LICENSE](LICENSE). Created by [Sheikh Hossain](https://github.com/sheikhhossainn).
