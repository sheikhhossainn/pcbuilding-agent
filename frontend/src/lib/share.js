import { INITIAL_BUILD } from './constants.js';

// Shareable build links live entirely in the URL hash (#b=...), so there is no
// server storage to run or expire. The payload is compact JSON, base64url-encoded.
//
// A link is untrusted input: decodeShare() validates the shape, caps sizes, only
// accepts http(s) URLs, and only keeps known categories.

const HASH_KEY = 'b';
const VERSION = 1;
const MAX_ENCODED_LENGTH = 20000;
const MAX_TEXT = 300;
const MAX_EXPLANATION = 1500;
const MAX_WARNINGS = 12;
const USE_CASES = new Set(['gaming', 'editing', 'office', 'general']);
const SITES = new Set(['startech', 'techland', 'computermania']);

function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(encoded) {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

const safeUrl = (value) => {
  if (typeof value !== 'string' || value.length > 500) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
};

const text = (value, max = MAX_TEXT) =>
  typeof value === 'string' ? value.slice(0, max) : '';

/**
 * @param {{ build: object, intent?: object|null, notes?: string[], explanation?: string, site?: string }} session
 * @returns {string} encoded payload for the URL hash
 */
export function encodeShare({ build, intent, notes = [], explanation = '', site = null }) {
  const parts = {};
  for (const [category, item] of Object.entries(build)) {
    if (item?.name) parts[category] = [item.name, item.price, item.url || ''];
  }

  const payload = {
    v: VERSION,
    p: parts,
    b: intent?.budget_bdt || 0,
    u: intent?.use_case || 'general',
    s: site || intent?._applied_site || null,
    n: notes.slice(0, MAX_WARNINGS),
    e: explanation.length <= MAX_EXPLANATION ? explanation : '',
  };

  return toBase64Url(JSON.stringify(payload));
}

export function buildShareUrl(session) {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#${HASH_KEY}=${encodeShare(session)}`;
}

/**
 * Parse and validate a share payload.
 * @returns {{ build: object, intent: object, notes: string[], explanation: string, site: string|null } | null}
 */
export function decodeShare(encoded) {
  try {
    if (typeof encoded !== 'string' || encoded.length === 0 || encoded.length > MAX_ENCODED_LENGTH) return null;
    const data = JSON.parse(fromBase64Url(encoded));
    if (!data || data.v !== VERSION || typeof data.p !== 'object' || data.p === null) return null;

    const build = { ...INITIAL_BUILD };
    let count = 0;
    for (const category of Object.keys(INITIAL_BUILD)) {
      const entry = data.p[category];
      if (!Array.isArray(entry)) continue;
      const [name, price, url] = entry;
      const cleanName = text(name);
      const cleanPrice = Number(price);
      if (!cleanName || !Number.isFinite(cleanPrice) || cleanPrice < 0) continue;
      build[category] = { name: cleanName, price: cleanPrice, url: safeUrl(url), category };
      count += 1;
    }
    if (count === 0) return null;

    const budget = Number(data.b);

    // The link carries parts, not the engine's original blueprint. Rebuild a faithful one:
    // every part that is present is required, everything else is not. That keeps a
    // follow-up "refine" coherent and lets the engine lock the parts the link contains.
    const component_strategy = Object.fromEntries(
      Object.keys(INITIAL_BUILD).map((category) => [category, {
        weight: 1,
        required: Boolean(build[category]),
        required_keywords: [],
        exclude_keywords: [],
        structured_reqs: {},
      }])
    );

    return {
      build,
      intent: {
        budget_bdt: Number.isFinite(budget) && budget > 0 ? budget : 0,
        use_case: USE_CASES.has(data.u) ? data.u : 'general',
        component_strategy,
        no_gpu: !build['Graphics Card'],
        _applied_site: SITES.has(data.s) ? data.s : undefined,
      },
      notes: Array.isArray(data.n) ? data.n.slice(0, MAX_WARNINGS).map((n) => text(n, 500)).filter(Boolean) : [],
      explanation: text(data.e, MAX_EXPLANATION),
      site: SITES.has(data.s) ? data.s : null,
    };
  } catch {
    return null;
  }
}

/** Read a share payload from the current URL hash, if there is one. */
export function readShareFromLocation() {
  const hash = window.location.hash.replace(/^#/, '');
  const params = new URLSearchParams(hash);
  const encoded = params.get(HASH_KEY);
  return encoded ? decodeShare(encoded) : null;
}

/** Remove the share payload from the address bar once it has been loaded. */
export function clearShareFromLocation() {
  const { pathname, search } = window.location;
  window.history.replaceState(null, '', `${pathname}${search}`);
}
