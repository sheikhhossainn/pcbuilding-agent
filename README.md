# BuildMyPC

BuildMyPC is an AI powered PC configurator for the Bangladesh market. You type a request and it returns a full build with compatible parts and an explanation.

## What You Need

- Node.js 18+ (recommended)
- Python 3.10+ (for the scraper)
- Git

## Clone The Project

```bash
git clone https://github.com/sheikhhossainn/pcbuilding-agent.git
cd pcbuilding-agent
```

## Install Dependencies

### 1) Frontend

```bash
cd frontend
npm install
```

### 2) Backend (root)

```bash
cd ..
npm install
```

### 3) Scraper (Python)

```bash
cd scraper
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

## Set Up API Keys

Create a file at:

```
backend/.env
```

Add your keys:

```
GROQ_API_KEY=your_groq_key_here
GEMINI_API_KEY=your_gemini_key_here
```

Where to get keys:
- Groq: https://console.groq.com/keys
- Gemini: https://aistudio.google.com/app/apikey

## Run Everything

From the repo root:

```bash
npm run start:all
```

This starts:
- Frontend: http://localhost:5173
- Backend: http://localhost:3001
- Scraper: http://localhost:8000

## How It Works (Simple)

1) The frontend sends your prompt to the backend.
2) The backend asks the AI for structured intent.
3) The scraper collects live parts from shops.
4) The backend builds a compatible PC and sends it back.

## Common Issues

- If you see rate limit errors, add your own API keys in the UI settings.
- If the scraper shows no results, make sure the Python venv is activated and running.
