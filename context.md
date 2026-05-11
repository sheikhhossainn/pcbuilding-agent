# BuildMyPC — Project Context

## What It Does

BuildMyPC is a full-stack AI-powered PC configurator for the Bangladesh market. A user types a natural-language prompt (e.g. *"EEE student, 65K budget, AMD, DDR4, no GPU, include monitor"*), and the system:

1. Extracts structured intent from the prompt using an LLM
2. Scrapes live product data from Bangladeshi PC retailers
3. Runs a compatibility + budget engine to select matching parts
4. Returns a full build with explanation

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (React + Vite)         :5173                  │
│  frontend/src/components/Builder.jsx                    │
│  → POST /api/build  (proxied to :3001)                  │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│  Backend (Node.js + Express)     :3001                  │
│  backend/server.js                                      │
│  1. Extract intent via Groq/Gemini LLM                  │
│  2. Fetch parts from Scraper API for each category      │
│  3. Run compatibility + budget engine                   │
│  4. Generate explanation via LLM                        │
│  → GET /scrape?site=&category=   (calls SCRAPER_URL)    │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│  Scraper Service (FastAPI + scrapling)   :8000          │
│  scraper/main.py                                        │
│  → Dynamically loads scrapers/startech.py etc.          │
│  → Returns product list (name, price, image, in_stock)  │
│  → Endpoints: / (200), /health (200), /scrape (data)     │
└─────────────────────────────────────────────────────────┘
```

---

## Running the Project

```bash
npm run start:all
```

This runs all three services concurrently:

| Service | Command | Port |
|---------|---------|------|
| Frontend | `npm --prefix frontend run dev` | 5173 |
| Backend | `node backend/server.js` | 3001 |
| Scraper | `uvicorn main:app --reload` | 8000 |

> Python scraper uses a virtual environment at `scraper/venv/`.

---

## Key Files

### Frontend
| File | Purpose |
|------|---------|
| `frontend/src/components/Builder.jsx` | Main UI — chat input, site/AI selector, build results table |
| `frontend/src/App.jsx` | Root app component |
| `frontend/vite.config.js` | Vite config — proxies `/api/*` → `:3001` |

### Backend
| File | Purpose |
|------|---------|
| `backend/server.js` | Express server — intent extraction, part selection, compatibility engine, explanation generation |
| `backend/.env` | `GROQ_API_KEY` and `GEMINI_API_KEY` |
| `backend/package.json` | Dependencies: `groq-sdk`, `@google/genai`, `express`, `dotenv`, `cors` |

### Scraper
| File | Purpose |
|------|---------|
| `scraper/main.py` | FastAPI app — routes `/scrape?site=&category=` to correct scraper module |
| `scraper/scrapers/startech.py` | StarTech scraper — paginates up to 3 pages per category |
| `scraper/scrapers/techland.py` | TechLand scraper |
| `scraper/scrapers/computermania.py` | ComputerMania scraper (core parts only — peripherals 403) |
| `scraper/scrapers/generic.py` | Generic scraper for custom user-supplied URLs |

**Scraper notes:**
- Uses an in-memory cache with a 30-minute TTL and a size cap to avoid unbounded growth.
- `scraper/requirements.txt` includes extra Scrapling runtime deps (`curl_cffi`, `playwright`, `browserforge`) needed on fresh deploys.
- **TechLand pagination optimization** — when the backend asks for `price_asc`/`price_desc`, the TechLand scraper stops early after collecting enough priced, in-stock items to reduce latency and load.

---

## Supported Categories

```
cpu, motherboard, ram, storage, gpu,
psu, casing, cpu-cooler,
monitor, mouse, keyboard
```

---

## Scraper URL Maps (Current)

### StarTech
```python
"cpu":        startech.com.bd/component/processor
"motherboard":startech.com.bd/component/motherboard
"ram":        startech.com.bd/component/ram
"gpu":        startech.com.bd/component/graphics-card
"storage":    startech.com.bd/ssd
"psu":        startech.com.bd/component/power-supply
"casing":     startech.com.bd/component/casing
"cpu-cooler": startech.com.bd/component/cpu-cooler
"monitor":    startech.com.bd/monitor
"mouse":      startech.com.bd/accessories/mouse
"keyboard":   startech.com.bd/accessories/keyboards
```

### TechLand
```python
"cpu":        techlandbd.com/pc-components/processor
"motherboard":techlandbd.com/pc-components/motherboard
"ram":        techlandbd.com/pc-components/shop-desktop-ram
"gpu":        techlandbd.com/pc-components/graphics-card
"storage":    techlandbd.com/pc-components/solid-state-drive
"psu":        techlandbd.com/pc-components/power-supply
"casing":     techlandbd.com/pc-components/computer-case
"cpu-cooler": techlandbd.com/pc-components/cpu-cooler
"monitor":    techlandbd.com/monitor-and-display
"mouse":      techlandbd.com/accessories/shop-computer-mouse
"keyboard":   techlandbd.com/accessories/computer-keyboard
```

---

## Intent Extraction Schema (LLM Output)

The LLM is given the user's message and returns this JSON:

```json
{
  "budget_bdt": 65000,
  "use_case": "gaming | editing | office | general",
  "preferred_site": "startech | techland | computermania | null",
  "preferred_cpu_brand": "amd | intel | null",
  "no_gpu": true,
  "ram_gb": 16,
  "ram_type": "DDR4 | DDR5 | null",
  "needs_monitor": true,
  "needs_mouse": true,
  "needs_keyboard": true,
  "rgb_needed": false,
  "components_user_has": [],
  "preferred_brands": [],
  "other_notes": ""
}
```

**Special rules extracted automatically:**
- `"simulation"` tasks (Proteus, MATLAB) → `use_case: "office"`
- Budget strings like `"65k"`, `"৬৫ হাজার"` → normalized to number
- `needs_monitor/mouse/keyboard` default to `true` unless user says they already have them
- `ram_type: "DDR4"` → forces AM4 socket; `"DDR5"` → forces AM5

---

## Part Selection Logic (`backend/server.js`)

### Budget Allocation

**Office/General — No GPU (e.g. EEE student):**
```
Processor:  22%   Monitor: 13%
Motherboard:18%   Mouse:    3%
RAM:        20%   Keyboard: 3%
Storage:    10%
PSU:         7%
Casing:      3%
```

**Gaming — With GPU:**
```
GPU:        35%   Monitor:  4%
Processor:  20%   Mouse:    1%
Motherboard:13%   Keyboard: 1%
RAM:         8%
Storage:     8%
PSU:         5%
Casing:      5%
```

### Compatibility Chain

```
CPU selected (brand + socket locked by ram_type)
  └─ Motherboard matched by socket + ram_type
       └─ RAM matched by DDR type + GB size
            └─ PSU wattage ≥ (CPU TDP + GPU TDP) × 1.2 + 50W
```

**Budget relaxation:** each component tries strict budget first, then retries at +20% before failing.

**PSU vs Casing (generalized rule across all sites):**
- PSU is treated as higher importance than casing for stability and upgrade headroom.
- Budget ratios were adjusted so PSU gets a larger share and casing gets a smaller share.
- PSU sizing uses conservative headroom plus minimum wattage floors for gaming/high-end builds (so high-end GPU builds won’t pair with tiny PSUs).

**RAM fallback chain:**
1. Match DDR type + GB size within budget
2. Match DDR type + GB size at +20% budget
3. Match DDR type only (any GB) — with console warning
4. Hard error with informative message

### Second Pass (Budget Utilization)
After all parts are selected, leftover budget is used to upgrade parts to better match the budget tier.

**Dynamic budget utilization (tier-aware):**
- For `high-end` budgets, the builder targets spending closer to the full budget (aims for ~97% utilization) instead of stopping at ~90%.
- Upgrade priority is weighted by use-case (e.g., gaming prioritizes GPU/monitor/CPU first, then RAM/storage, then peripherals).
- Peripherals (mouse/keyboard/monitor) are allowed to scale up with budget using the calculated budget ranges, instead of always picking the cheapest available.

---

## AI Providers

Both are initialized at startup. The user can switch via the UI dropdown.

| Provider | Model | SDK |
|----------|-------|-----|
| **Groq** (default) | `llama-3.3-70b-versatile` | `groq-sdk` |
| Gemini | `gemini-2.5-pro` | `@google/genai` |

---

## Environment Variables (`backend/.env`)

```
GROQ_API_KEY=your_groq_key_here
GEMINI_API_KEY=your_gemini_key_here
SCRAPER_URL=https://your-scraper-service.onrender.com
```

---

## Known Constraints

- **ComputerMania peripherals disabled** — their monitor/mouse/keyboard pages return 403.
- **StarTech pagination truncation fix** — because scraper fetches only up to 3 pages (~75 items), using `price_asc` truncates expensive parts like AM5 boards or RTX 4080s. To fix this, `getCheapestPart` and Phase 2 now fetch both `price_asc` and `price_desc` when needed to guarantee access to the full spectrum of high-end and low-end parts.
- **Scraper caching** — results can be up to ~30 minutes stale (by design) to reduce scraping load and rate-limit risk.
- **`inferSpecs` heuristics** — socket/RAM type is inferred from product name strings; products with unusual naming may fall into `UNKNOWN` socket and be skipped by the compatibility engine.
- **`UNKNOWN` socket blocking** — if a CPU or motherboard resolves to `UNKNOWN`, it is never matched to avoid pairing incompatible hardware.

---

## Chatbox & Stop Button UX

- The fixed chatbox at the bottom uses a `<textarea>` that auto-grows as the user types, capped at **120px on mobile** (`max-h-[120px]`) and **200px on desktop** (`max-h-[200px]`).
- The send/stop button is wrapped in a `self-center` container so it stays **vertically centered** relative to the textarea regardless of how tall the textarea grows.
- **Stop button** uses `AbortController` to cancel the in-flight `axios` request when pressed. The catch block detects `CanceledError` / `ERR_CANCELED` and silently resets state to `idle`. A `requestIdRef` counter ensures stale responses from previously-aborted requests are ignored.
- Loading-state timers (`setTimeout` for "Selecting..." -> "Checking...") include an `idle` guard so they never re-trigger after a stop.

---

## Active Issue (May 11, 2026) — StarTech build shows wrong inventory

**User scenario**
- User: CSE student, UI/UX focus
- Budget: 60,000 BDT (also reproduced at 80,000 BDT)
- Requirements: **no graphics card**, at least **16GB DDR4**, **no UPS**, but needs **monitor + mouse + keyboard**

**Observed problems**
- Backend sometimes returns: `No storage found in the available inventory.` for StarTech even though StarTech has many storage items.
- A StarTech build can show peripherals that are clearly from a different shop (e.g. TechLand monitor), indicating vendor mix-up.
- "No GPU" builds must avoid CPUs with no iGPU (e.g. Ryzen 9 5900X) — otherwise the PC has no display output.

**Example build snapshot (as reported)**
- Total: 73,200 BDT (10 items)
- CPU: AMD Ryzen 9 5900X — 29,900
- Motherboard: Biostar B550MHP — 8,500
- RAM: Adata XPG Spectrix D35G 16GB DDR4 3200 — 13,500
- Storage: Orico Y20-512GB 2.5" SATA SSD — 7,500
- PSU: OVO OPS-P4-450M — 1,200
- Cooler: 1STPLAYER CRYO CY12 — 2,200
- Casing: PC Power ICEBOX X2 — 3,000
- Monitor: Thunderobot L1A — 2,950 (does not look like StarTech inventory)
- Mouse: Redragon M602P-KS — 2,150
- Keyboard: Jedel KL81 — 2,300

**Likely root cause to verify/fix**
- Backend part caching must be keyed by both `site` and `category`. If cache ignores `site`, an empty or mismatched inventory from one site can be reused for another, producing both vendor mix-ups and false “no inventory” errors.
