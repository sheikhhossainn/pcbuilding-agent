/**
 * Product identity: is a listing at one store the same product as a listing at another?
 *
 * Stores name the same part differently ("Intel Core i5-12400F Alder Lake Processor" vs
 * "INTEL CORE I5 12400F 6 CORE 12 THREAD 12TH GEN PROCESSOR"), so names are reduced to two things:
 *   - fields: the specs that define the part for a build (CPU model, GPU chip and VRAM, RAM size and
 *     speed, PSU wattage and rating...), read per category;
 *   - model tokens: the words left once specs, colours and shop wording are removed.
 * Two listings are
 *   - "exact" when they are the same model (same fields, same vendor, same model words);
 *   - "equivalent" when they would do the same job in the build (same defining specs, any brand).
 * Pure functions, no I/O.
 */

import { parseRamCapacityGb, parseStorageCapacityGb } from './capacity.js';

// Shop wording that says nothing about which model it is.
const STOP_WORDS = new Set([
  'with', 'and', 'the', 'for', 'of', 'in', 'to', 'new', 'original', 'genuine', 'official',
  'warranty', 'year', 'years', 'box', 'boxed', 'tray', 'oem', 'fan', 'included', 'not', 'without',
  'processor', 'cpu', 'desktop', 'pc', 'computer', 'ram', 'memory', 'dimm', 'udimm', 'u',
  'motherboard', 'mainboard', 'board', 'graphics', 'graphic', 'card', 'gpu', 'video',
  'power', 'supply', 'psu', 'unit', 'case', 'casing', 'chassis', 'cooler', 'cooling', 'cpu-cooler',
  'monitor', 'display', 'screen', 'mouse', 'keyboard', 'ups', 'drive', 'ssd', 'hdd', 'internal',
  'intel', 'amd', 'nvidia', 'geforce', 'radeon', 'socket', 'series', 'gaming', 'game', 'gamer',
  'heatsink', 'certified', 'certificate', 'modular', 'non', 'semi', 'full', 'fully',
  'atx', 'matx', 'eatx', 'micro', 'mini', 'itx', 'tower', 'mid', 'edition', 'version',
  'black', 'white', 'red', 'blue', 'grey', 'gray', 'silver', 'pink', 'yellow', 'green', 'purple',
  'dark', 'light', 'gold-color', 'offline', 'online', 'interactive', 'line', 'body', 'plastic', 'metal',
  'wired', 'wireless', 'usb', 'hdmi', 'dp', 'displayport', 'ips', 'va', 'tn', 'led', 'panel',
  'wifi', 'bluetooth', 'bt', 'ddr3', 'ddr4', 'ddr5', 'd4', 'd5', 'nvme', 'sata', 'pcie', 'm2', 'gen',
  'alder', 'raptor', 'lake', 'arrow', 'comet', 'rocket', 'coffee', 'refresh',
  'bd', 'bangladesh', 'price',
]);

// Words that do tell models apart: a name with one of these is a different product from one without.
const SIGNIFICANT_WORDS = new Set([
  'ii', 'iii', 'iv', 'vi', 'ti', 'super', 'xt', 'xtx', 'gre', 'pro', 'max', 'plus', 'lite', 'ultra',
  'rgb', 'argb', 'oc', 'se', 'elite', 'mesh', 'glass', 'v2', 'v3', 'x3d', 'evo',
]);

// Spec phrases already read into fields (or meaningless for identity). Removed before tokenising.
const SPEC_PHRASES = [
  /\b\d+(?:\.\d+)?\s*(?:gb|tb|mb|mhz|mt\/s|ghz|watt|w|hz|mm|va|kva|ms|nits|cm|mah)\b/g,
  /\b\d+(?:\.\d+)?\s*-?\s*(?:inch|in\b|"|″|”|'')/g,
  /\bsata\s*-?\s*(?:iii|ii|3|6gb\/s)?\b/g,
  /\bm\.?2\b|\b22(?:30|42|60|80|110)\b|\bx\s?[248]\b|\bnvme\s*\d\.\d\b/g,
  /\b\d+\s*-?\s*(?:core|thread)s?\b/g,
  /\b\d+(?:st|nd|rd|th)\s*(?:gen(?:eration)?)?\b/g,
  /\bwi-?fi\s*\d?e?\b/g,
  /\b(?:ddr\d|gddr\d+x?|pcie?\s*\d(?:\.\d)?|gen\s*\d|cl\d+|lga\s*\d+|am[45]|atx\s*3\.\d)\b/g,
  /\b80\s*(?:\+|plus)\s*\w*/g,
];

const normalise = (name) => String(name || '')
  .toLowerCase()
  .split('#')[0] // Ryans appends the part code: "... Desktop RAM #HSC416U32E2"
  .replace(/([a-z])\.([a-z])/g, '$1$2') // g.skill -> gskill
  .replace(/[()[\]|,/]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/** Model words of a name, in order, with hyphenated codes joined ("b760m-k" -> "b760mk"). */
export function modelTokens(name) {
  let text = normalise(name);
  for (const re of SPEC_PHRASES) text = text.replace(re, ' ');
  return text
    .replace(/([a-z0-9])-(?=[a-z0-9])/g, '$1')
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !STOP_WORDS.has(t) && !/^\d+(?:st|nd|rd|th)$/.test(t));
}

const vendorOf = (name) => normalise(name).replace(/([a-z0-9])-(?=[a-z0-9])/g, '$1').split(/[^a-z0-9]+/).find(Boolean) || '';

const isSignificant = (token) => /\d/.test(token) || SIGNIFICANT_WORDS.has(token);

/** Same model words: most words shared, and the ones that differ are not model codes. */
function sameModelWords(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 || B.size === 0) return false;
  let shared = 0;
  for (const t of A) if (B.has(t)) shared += 1;
  if (shared / Math.min(A.size, B.size) < 0.8) return false;
  for (const t of A) if (!B.has(t) && isSignificant(t)) return false;
  for (const t of B) if (!A.has(t) && isSignificant(t)) return false;
  return true;
}

// ─── fields per category ───

const num = (re, text) => {
  const m = re.exec(text);
  return m ? parseFloat(m[1]) : null;
};

function cpuModel(n) {
  let m = /\bi([3579])[\s-]*(\d{4,5}[a-z]{0,3})\b/.exec(n);
  if (m) return `i${m[1]}-${m[2]}`;
  m = /\bultra\s*([3579])\s*(?:processor\s*)?(\d{3}[a-z]{0,2})\b/.exec(n);
  if (m) return `ultra${m[1]}-${m[2]}`;
  m = /\bryzen\s*(?:threadripper\s*)?(?:[3579]\s*)?(?:pro\s*)?(\d{4}[a-z0-9]{0,4})\b/.exec(n);
  if (m) return `ryzen-${m[1]}`;
  m = /\bathlon\s*(?:silver|gold\s*)?(\d{3,4}[a-z]{0,2})\b/.exec(n);
  if (m) return `athlon-${m[1]}`;
  m = /\b(?:pentium|celeron)\b.*?\b(g\d{4}[a-z]?|n\d{3,4})\b/.exec(n);
  if (m) return m[1];
  return null;
}

function gpuChip(n) {
  const m = /\b(rtx|gtx|gt|rx|arc\s*[ab]?)\s*-?\s*(\d{3,4})\s*(ti\s*super|ti|super|xtx|xt|gre)?\b/.exec(n);
  if (!m) return null;
  return `${m[1].replace(/\s+/g, '')}${m[2]}${m[3] ? m[3].replace(/\s+/g, '') : ''}`;
}

const PSU_RATING = { titanium: 6, platinum: 5, gold: 4, silver: 3, bronze: 2, white: 1, standard: 1 };
const psuRating = (n) => {
  const m = /80\s*(?:\+|plus)\s*(titanium|platinum|gold|silver|bronze|white|standard)?/.exec(n);
  if (m) return PSU_RATING[m[1] || 'white'];
  const word = /\b(titanium|platinum|gold|silver|bronze)\b/.exec(n);
  return word ? PSU_RATING[word[1]] : null;
};

const storageType = (n) => {
  if (/\b(hdd|hard\s*(disk|drive)|\d{4}\s*rpm|barracuda|wd\s*blue\s*\d+tb)\b/.test(n)) return 'hdd';
  // M.2 alone says nothing: M.2 SATA drives exist.
  if (/\b(nvme|pcie)\b/.test(n)) return 'nvme';
  return 'sata';
};

const caseForm = (n) => {
  if (/\be-?atx\b/.test(n)) return 'eatx';
  if (/\b(micro[\s-]?atx|m-?atx|micro)\b/.test(n)) return 'matx';
  if (/\b(mini[\s-]?itx|itx)\b/.test(n)) return 'itx';
  if (/\b(atx|mid[\s-]?tower|full[\s-]?tower)\b/.test(n)) return 'atx';
  return null;
};

const monitorRes = (n) => {
  if (/\b(4k|uhd|2160p?|3840)\b/.test(n)) return 2160;
  if (/\b(qhd|2k|1440p?|2560)\b/.test(n)) return 1440;
  if (/\b(fhd|full\s*hd|1080p?|1920)\b/.test(n)) return 1080;
  if (/\b(hd|720p?|768p?|1366)\b/.test(n)) return 768;
  return null;
};

/**
 * Per category: fields(name, specs) and equivalent(ref, cand) on those fields.
 * `exactFields` must all be equal (and known) for an exact match on top of the model words.
 */
const RULES = {
  Processor: {
    fields: (n) => ({ model: cpuModel(n) }),
    exactFields: ['model'],
    // A CPU is its model; the same chip boxed or tray is the same CPU.
    equivalent: (r, c) => Boolean(r.model) && r.model === c.model,
    modelIsIdentity: true,
  },
  'Graphics Card': {
    fields: (n) => ({ chip: gpuChip(n), vram: num(/\b(\d{1,2})\s*g(?:b)?\b/, n) }), // "8GB", "WINDFORCE 4G"
    exactFields: ['chip', 'vram'],
    equivalent: (r, c) => Boolean(r.chip) && r.chip === c.chip && (r.vram === null || r.vram === c.vram),
  },
  Motherboard: {
    fields: (n, specs) => ({
      // "PRIME B760M-K", "XN-B450M-VH-PRO", "B760D4-MA-V4": the chipset starts a word or follows a hyphen.
      chipset: (/(?:^|[\s-])([abhqxz]\d{3}e?)(?=[a-z0-9-]|\s|$)/.exec(n) || [])[1] || null,
      ddr: specs?.ram_type && specs.ram_type !== 'UNKNOWN' ? specs.ram_type : null,
      // The Wi-Fi version of a board is its own model ("B450M DS3H" vs "B450M DS3H WIFI").
      wifi: /\bwi-?fi|wireless\b|\bax\b/.test(n),
    }),
    exactFields: ['chipset'],
    // Same chipset and memory generation; a Wi-Fi board stays a Wi-Fi board.
    equivalent: (r, c) => Boolean(r.chipset) && r.chipset === c.chipset
      && Boolean(r.ddr) && r.ddr === c.ddr && (!r.wifi || c.wifi),
  },
  RAM: {
    fields: (n, specs) => ({
      gb: parseRamCapacityGb(n) || null,
      ddr: specs?.ram_type && specs.ram_type !== 'UNKNOWN' ? specs.ram_type : null,
      mhz: num(/(\d{4})\s*(?:mhz|mt\/s)/, n) ?? num(/ddr\d[\s-](\d{4})\b/, n),
    }),
    exactFields: ['gb', 'ddr'],
    equivalent: (r, c) => Boolean(r.gb && r.ddr) && r.gb === c.gb && r.ddr === c.ddr
      && (r.mhz === null || (c.mhz !== null && c.mhz >= r.mhz)),
  },
  Storage: {
    fields: (n) => ({
      gb: parseStorageCapacityGb(n) || null,
      type: storageType(n),
      form: /\bm\.?2\b/.test(n) ? 'm2' : /\b2\.5\b/.test(n) ? '2.5' : /\b3\.5\b/.test(n) ? '3.5' : null,
      pcieGen: num(/(?:gen|pcie)\s*([345])/, n),
    }),
    exactFields: ['gb', 'type'],
    // 500GB and 512GB are the same tier; an NVMe drive is not replaced by a slower kind.
    equivalent: (r, c) => Boolean(r.gb && c.gb) && Math.abs(r.gb - c.gb) / Math.max(r.gb, c.gb) <= 0.08
      && r.type === c.type && (r.form === null || c.form === null || r.form === c.form)
      && (r.pcieGen === null || c.pcieGen === null || c.pcieGen >= r.pcieGen),
  },
  PSU: {
    fields: (n, specs) => ({ watts: specs?.wattage || num(/(\d{3,4})\s*w\b/, n), rating: psuRating(n) }),
    exactFields: ['watts'],
    equivalent: (r, c) => Boolean(r.watts && c.watts) && c.watts >= r.watts && c.watts <= r.watts * 1.35
      && (c.rating ?? 0) >= (r.rating ?? 0),
  },
  'CPU Cooler': {
    fields: (n) => {
      const liquid = /\b(liquid|aio|water|lcs)\b/.test(n);
      return { liquid, radiator: liquid ? num(/\b(120|140|240|280|360|420)\s*(?:mm)?\b/, n) : null };
    },
    exactFields: [],
    equivalent: (r, c) => r.liquid === c.liquid && (!r.liquid || (r.radiator !== null && r.radiator === c.radiator)),
  },
  Casing: {
    fields: (n) => ({ form: caseForm(n), withPsu: /\b(with|w\/|including)\b.*\b(psu|power supply|\d{3}\s*w)\b/.test(n) }),
    exactFields: [],
    equivalent: (r, c) => Boolean(r.form) && r.form === c.form && r.withPsu === c.withPsu,
  },
  Monitor: {
    fields: (n) => ({
      inch: num(/(\d{2}(?:\.\d)?)\s*(?:inch|in\b|"|″|”|-inch)/, n),
      res: monitorRes(n),
      hz: num(/(\d{2,3})\s*hz/, n),
    }),
    exactFields: [],
    equivalent: (r, c) => Boolean(r.inch && c.inch && r.res) && Math.abs(r.inch - c.inch) <= 1
      && r.res === c.res && (c.hz ?? 60) >= (r.hz ?? 60),
  },
  UPS: {
    fields: (n) => ({ va: num(/(\d{3,4})\s*va\b/, n) }),
    exactFields: [],
    equivalent: (r, c) => Boolean(r.va && c.va) && c.va >= r.va && c.va <= r.va * 1.5,
  },
  // Taste parts: only the same model counts.
  Mouse: { fields: () => ({}), exactFields: [], equivalent: () => false },
  Keyboard: { fields: () => ({}), exactFields: [], equivalent: () => false },
};

const memo = new Map();
const MEMO_LIMIT = 20000;

/**
 * @param {string} category
 * @param {{ name: string, specs?: object }} part
 * @returns {{ vendor: string, tokens: string[], fields: object }}
 */
export function identityOf(category, part) {
  const key = `${category}|${part?.name}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const rule = RULES[category];
  const n = normalise(part?.name);
  const identity = {
    vendor: vendorOf(part?.name),
    tokens: modelTokens(part?.name),
    fields: rule ? rule.fields(n, part?.specs || {}) : {},
  };
  if (memo.size >= MEMO_LIMIT) memo.clear();
  memo.set(key, identity);
  return identity;
}

/**
 * How a candidate listing relates to a reference part.
 * @returns {'exact'|'equivalent'|null}
 */
export function compareParts(category, ref, cand) {
  const rule = RULES[category];
  if (!rule || !ref?.name || !cand?.name) return null;
  const r = identityOf(category, ref);
  const c = identityOf(category, cand);

  const known = (v) => v !== null && v !== undefined;
  // The defining fields must be readable and equal; any other field both names state must agree too.
  const fieldsKnownAndEqual = rule.exactFields.every((f) => known(r.fields[f]) && r.fields[f] === c.fields[f])
    && Object.keys(r.fields).every((f) => !known(r.fields[f]) || !known(c.fields[f]) || r.fields[f] === c.fields[f]);
  if (rule.modelIsIdentity && r.fields.model) {
    return r.fields.model === c.fields.model ? 'exact' : null;
  }
  if (fieldsKnownAndEqual && r.vendor && r.vendor === c.vendor && sameModelWords(r.tokens, c.tokens)) return 'exact';
  if (rule.equivalent(r.fields, c.fields)) return 'equivalent';
  return null;
}

/**
 * Best counterpart of `ref` among `candidates` (in-stock listings at another store):
 * the cheapest exact match, else the equivalent closest in price to the reference.
 * @returns {{ part: object, match: 'exact'|'equivalent' } | null}
 */
export function findCounterpart(category, ref, candidates) {
  let exact = null;
  let equivalent = null;
  for (const cand of candidates || []) {
    const match = compareParts(category, ref, cand);
    if (match === 'exact') {
      if (!exact || cand.price < exact.price) exact = cand;
    } else if (match === 'equivalent') {
      if (!equivalent || Math.abs(cand.price - ref.price) < Math.abs(equivalent.price - ref.price)) equivalent = cand;
    }
  }
  if (exact) return { part: exact, match: 'exact' };
  if (equivalent) return { part: equivalent, match: 'equivalent' };
  return null;
}

export const IDENTITY_CATEGORIES = Object.keys(RULES);
