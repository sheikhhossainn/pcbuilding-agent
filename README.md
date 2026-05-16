# BuildMyPC 🇧🇩
### AI-Powered PC Configurator for the Bangladeshi Market

BuildMyPC turns a plain-language prompt into a fully compatible, budget-optimised PC build using live inventory from Bangladesh's top retailers. No spreadsheets, no guesswork — just type what you need.

> *"Gaming PC, 80k budget, AMD, no GPU, include monitor"* → Full compatible build in seconds.

**Live Demo**
- Frontend (Vercel): `https://your-frontend-url.vercel.app`
- Backend (Render): `https://your-backend-url.onrender.com`

---

## Table of Contents

- [How It Works](#how-it-works)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Local Setup](#local-setup)
- [Deployment](#deployment)
- [Project Structure](#project-structure)

---

## How It Works

BuildMyPC uses a five-phase **Dynamic Blueprint Architecture** that replaces static budget ratios with AI-driven, per-build decision making.

```
User Prompt
    │
    ▼
┌─────────────────────────────────────────┐
│  Phase 0 — Intent Extraction            │
│  Groq (Llama 3.3 70B / 8B Instant)      │
│  Parses budget, use case, constraints   │
│  Outputs a weighted component blueprint │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│  Phase 1 — Pre-Flight Floor Check       │
│  Queries Supabase for the cheapest      │
│  part that satisfies each constraint.   │
│  Fails fast if budget is impossible.    │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│  Phase 2 — Weighted Budget Allocation   │
│  Surplus above floor is distributed     │
│  proportionally by AI-assigned weights. │
│  (e.g. GPU gets more budget for gaming) │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│  Phase 3 — Component Selection          │
│  Picks best part per category within    │
│  each dynamic budget cap, enforcing:    │
│  · CPU socket ↔ Motherboard match       │
│  · DDR4 / DDR5 generation match         │
│  · PSU wattage = (CPU+GPU TDP) × 1.4   │
│  · iGPU enforcement for no-GPU builds   │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│  Phase 4 — Iterative Rebalancing        │
│  Spends remaining surplus by upgrading  │
│  components in AI weight order until    │
│  budget is fully utilised.              │
└──────────────────┬──────────────────────┘
                   │
                   ▼
         Full Build + Warnings + Explanation
```

---

## Features

**AI & Build Engine**
- Modular Dependency Injection Architecture for clean, testable logic
- Natural language prompts in English or Bangla numerals (`৬৫ হাজার`, `65k BDT`)
- AI Resilience — `RotatingGroqClient` automatically cycles through multiple API keys to prevent 429 rate limit downtime
- Keyword degradation safety net — relaxes constraints progressively if no match is found
- Spec-based fallback — dynamically infers RAM type requirements based on motherboard socket (LGA1200/AM4) even when keywords are missing
- CPU/GPU bottleneck prevention (`isCpuBalanced` guard)
- Integrated GPU detection for no-discrete-GPU builds

**Hardware Compatibility**
- Socket chain: `CPU → Motherboard → RAM → PSU`
- DDR4/DDR5 enforced across CPU, Motherboard, and RAM simultaneously
- LGA1700 boards with ambiguous DDR type are rejected when generation is specified
- PSU wattage floor scales dynamically with actual CPU and GPU TDP estimates

**Inventory & Data**
- Live parts data from StarTech, TechLand, and ComputerMania via background ETL scraper
- 30-minute in-memory cache with active TTL eviction — fresh data, no Supabase hammering
- ComputerMania peripheral categories (monitor/mouse/keyboard) automatically excluded — those pages return 403

**Security & Reliability**
- Rate limiting: 5 builds per 15 minutes per IP (bypassed with custom API keys)
- Prompt length capped at 2,000 characters
- API key length sanitisation before passing to LLM SDKs
- Site parameter whitelist (`startech`, `techland`, `computermania`) — no injection surface
- Post-build validation layer surfaces incompatibility warnings to the frontend (e.g., storage capacity, PSU wattage, GPU adequacy, DDR sync)
- Request Cancellation — Aborting a build on the UI instantly stops the AI and DB search process to save resources

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 6, Tailwind CSS 4 |
| Backend | Node.js, Express 4 |
| Database | Supabase (PostgreSQL) |
| AI — Primary | Groq (Llama 3.3 70B Versatile) |
| AI — Fallback | Groq (Llama 8B Instant) |
| Scraper | Python, Scrapling, Playwright |
| Frontend Hosting | Vercel |
| Backend Hosting | Render (Singapore) |

---

## Local Setup

### Prerequisites

- Node.js 18+
- Python 3.10+ (for the scraper)
- A [Supabase](https://supabase.com) project with the `components` table created
- A [Groq](https://console.groq.com) API key

---

### 1. Clone & Install

```bash
git clone https://github.com/sheikhhossainn/pcbuilding-agent.git
cd pcbuilding-agent

# Install backend dependencies
npm install

# Install frontend dependencies
cd frontend && npm install && cd ..
```

---

### 2. Configure Environment

Create `backend/.env`:

```env
# AI Providers (At least one Groq key required for Llama-3.3-70B)
GROQ_API_KEY=your_primary_groq_key
GROQ_API_KEY_2=your_fallback_groq_key  # Optional: For automatic 429 rate-limit rotation

# Supabase
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Optional
PORT=3001
```

Create `scraper/.env` (same Supabase credentials):

```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

---

### 3. Populate the Database

The app needs product data before it can build anything. Run the scraper once to seed Supabase:

```bash
cd scraper

# Create and activate virtual environment
python -m venv venv

# Windows
./venv/Scripts/activate
# macOS / Linux
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run the ETL sync (scrapes StarTech → TechLand → ComputerMania)
python sync_db.py
```

The scraper is fault-tolerant — it checkpoints after each category and resumes from the exact failure point on restart. A full sync takes roughly 15–30 minutes depending on inventory size.

---

### 4. Run Locally

From the project root:

```bash
npm run start:all
```

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:3001 |

---

## Deployment

### Backend → Render

1. Create a **New Web Service** and connect your GitHub repository.
2. Set the following:

| Field | Value |
|---|---|
| Root Directory | *(leave blank)* |
| Build Command | `npm install` |
| Start Command | `npm run start:backend` |
| Region | Singapore (closest to BD) |

3. Add all keys from `backend/.env` under **Environment Variables**.
4. Render automatically injects `PORT` — no need to set it manually.

---

### Frontend → Vercel

1. Create a **New Project** and connect your GitHub repository.
2. Set the following:

| Field | Value |
|---|---|
| Root Directory | `frontend` |
| Framework Preset | Vite |
| Build Command | `npm run build` |

3. Add this environment variable:

| Key | Value |
|---|---|
| `VITE_BACKEND_URL` | Your Render service URL, e.g. `https://buildmypc-api.onrender.com` |

---

## Project Structure

```
pcbuilding-agent/
├── frontend/
│   └── src/
│       ├── components/
│       │   └── Builder.jsx        # Main UI — prompt input, build results
│       ├── App.jsx
│       └── vite.config.js         # Proxies /api/* → :3001 in dev
│
├── backend/
│   ├── ai/                        # LLM Intent Extraction & Explanation (Rotating API keys)
│   ├── engine/                    # Budget Allocation, Part Selection & Compatibility
│   ├── config/                    # Global constraints, tdp heuristics, & budgets
│   ├── utils/                     # Supabase Repository, Cache Manager & Spec Inference
│   ├── routes/                    # API route handlers
│   ├── server.js                  # Express setup and dependency injection
│   └── .env                       # API keys (not committed)
│
├── scraper/
│   ├── sync_db.py                 # ETL daemon — scrapes and upserts to Supabase
│   ├── sync_state.json            # Checkpoint file for fault recovery
│   └── scrapers/
│       ├── startech.py
│       ├── techland.py
│       ├── computermania.py
│       └── generic.py
│
└── package.json                   # Root — runs frontend + backend concurrently
```

---

## Supported Retailers & Categories

| Category | StarTech | TechLand | ComputerMania |
|---|:---:|:---:|:---:|
| CPU | ✅ | ✅ | ✅ |
| Motherboard | ✅ | ✅ | ✅ |
| RAM | ✅ | ✅ | ✅ |
| Storage (SSD) | ✅ | ✅ | ✅ |
| GPU | ✅ | ✅ | ✅ |
| PSU | ✅ | ✅ | ✅ |
| Casing | ✅ | ✅ | ✅ |
| CPU Cooler | ✅ | ✅ | ✅ |
| Monitor | ✅ | ✅ | ❌ |
| Mouse | ✅ | ✅ | ❌ |
| Keyboard | ✅ | ✅ | ❌ |

> ComputerMania's monitor, mouse, and keyboard pages return HTTP 403 and are automatically skipped.

---

## License

MIT License — Created by [Sheikh Hossain](https://github.com/sheikhhossainn)