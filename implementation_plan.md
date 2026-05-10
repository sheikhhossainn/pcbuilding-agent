# Auto-Failover, Rate Limiting, and Custom API Keys Implementation

This plan outlines how to make the backend robust against API limits, provide an auto-switch mechanism when one API goes down, and allow power users to bring their own API keys.

## User Question Answered: How many builds can your APIs handle?

Every PC generation takes **2 API calls** (1 for intent extraction, 1 for the summary explanation).

*   **Groq (Default):** The free tier allows 14,400 requests per day, and 30 requests per minute.
    *   **Capacity:** 7,200 builds per day / 15 builds per minute.
*   **Gemini:** The free tier allows 1,500 requests per day, and 15 requests per minute.
    *   **Capacity:** 750 builds per day / 7.5 builds per minute.

**Total Capacity:** Your app can serve nearly **8,000 builds per day** on free tiers. The only bottleneck is the per-minute limit (max ~22 simultaneous users hitting the button at the exact same second). 

To protect this generous limit from bots or abuse, we will limit individual users (by IP address) to **5 builds per 15 minutes**.

---

## Proposed Changes

### 1. Backend (`backend/server.js`)

#### [MODIFY] `backend/server.js`
*   **Install & Apply Rate Limiter:** Add `express-rate-limit` to restrict each IP to 5 requests to `/api/build` per 15-minute window.
*   **Dynamic API Client Initialization:** Instead of reusing a global Groq/Gemini client, modify the `extractIntent` and `generateExplanation` functions to accept the API key. 
    *   If the user provides a custom key in the request payload (`req.body.customKeys.groq`), use it.
    *   If not, fall back to your `process.env` keys.
*   **Auto-Failover Logic:** 
    *   Wrap the primary AI call in a `try...catch`.
    *   If the primary API (e.g., Groq) fails (e.g., due to rate limits or API downtime), catch the error, log a warning, and immediately retry the call using the secondary API (Gemini).

---

### 2. Frontend (`src/components/builder.jsx`)

#### [MODIFY] `src/components/builder.jsx`
*   **State Management:** Add state for `customGroqKey` and `customGeminiKey`. Persist these in the browser's `localStorage` so users don't have to re-enter them.
*   **Settings UI:** Add a small "API Settings" button/modal or inline inputs in the header navbar where users can securely paste their own keys. Include a small help link pointing to `https://console.groq.com/keys`.
*   **API Payload:** Update the `axios.post('/api/build', ...)` payload to include the custom keys if the user has provided them.
*   **Handle Rate Limit Response:** If the backend returns a 429 (Too Many Requests) from the IP rate limiter, show a friendly error in the UI: *"You've reached the free limit. Please wait 15 minutes, or enter your own API key in the settings to continue immediately."*

---

## Open Questions

> [!WARNING] 
> **Are you okay with installing `express-rate-limit`?** This is standard practice and will prevent a single user from draining your 7,000 daily builds.
> 
> **Does the UI placement for the API Keys matter to you?** I will place it as a clean "Key" icon button next to the AI selector that opens a small popup modal. Let me know if you prefer a different layout.

Please review and approve this plan.
