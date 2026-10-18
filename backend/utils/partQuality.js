/**
 * What "better" means for each kind of part.
 *
 * "A stronger PSU", "a better monitor", "faster storage": the words are the same but the
 * meaning is not. For a PSU it is wattage, efficiency rating and modular cabling; for RAM it
 * is capacity, generation and speed; for a monitor, resolution, refresh rate and panel type.
 * Each category gets a list of measurable axes read from the product name and inferred specs,
 * and a score that is the weighted sum. Parts are compared with the same function, so "better
 * than the one I have" is an exact test, and a swap can say what actually improved.
 *
 * For CPU, GPU, case and peripherals the catalog gives no reliable spec ladder, so price is
 * the measure (within one retailer a dearer card is the faster card), with VRAM or feature
 * flags added where the name states them.
 */

import { parseRamCapacityGb, parseStorageCapacityGb } from './capacity.js';

const lower = (part) => String(part?.name || '').toLowerCase();
const firstNumber = (text, re) => {
  const m = text.match(re);
  return m ? Number(m[1].replace(',', '.')) : 0;
};

const PSU_EFFICIENCY = [
  ['titanium', 6], ['platinum', 5], ['gold', 4], ['silver', 3], ['bronze', 2], ['white', 1],
];
const EFFICIENCY_NAME = { 1: '80+', 2: '80+ Bronze', 3: '80+ Silver', 4: '80+ Gold', 5: '80+ Platinum', 6: '80+ Titanium' };

function psuAxes(part) {
  const n = lower(part);
  const wattage = Number(part.specs?.wattage) || firstNumber(n, /(\d{3,4})\s?w\b/);
  let efficiency = 0;
  const plus = /80\s?\+|80\s?plus/.test(n);
  for (const [word, rank] of PSU_EFFICIENCY) {
    if (n.includes(word) && (plus || word !== 'white')) { efficiency = rank; break; }
  }
  if (!efficiency && plus) efficiency = 1;
  const modular = /fully?[\s-]*modular/.test(n) ? 2 : /semi[\s-]*modular/.test(n) ? 1 : 0;
  return [
    { label: 'Wattage', value: wattage, weight: 1 / 50, text: wattage ? `${wattage}W` : 'unspecified' },
    { label: 'Efficiency', value: efficiency, weight: 4, text: efficiency ? EFFICIENCY_NAME[efficiency] : 'unrated' },
    { label: 'Cabling', value: modular, weight: 3, text: ['non-modular', 'semi-modular', 'fully modular'][modular] },
  ];
}

function ramAxes(part) {
  const n = lower(part);
  const gb = parseRamCapacityGb(part.name) || 0;
  const gen = part.specs?.ram_type === 'DDR5' || n.includes('ddr5') ? 2 : part.specs?.ram_type === 'DDR4' || n.includes('ddr4') ? 1 : 0;
  const mhz = firstNumber(n, /(\d{4})\s?mhz/) || firstNumber(n, /ddr[45][-\s](\d{4})/);
  return [
    { label: 'Capacity', value: gb, weight: 1, text: gb ? `${gb}GB` : 'unspecified' },
    { label: 'Generation', value: gen, weight: 8, text: ['unspecified', 'DDR4', 'DDR5'][gen] },
    { label: 'Speed', value: mhz, weight: 0.01, text: mhz ? `${mhz}MHz` : 'unspecified' },
  ];
}

function storageAxes(part) {
  const n = lower(part);
  const gb = parseStorageCapacityGb(part.name) || 0;
  const hdd = /\bhdd\b|\brpm\b|barracuda|skyhawk|ironwolf|hard disk/.test(n);
  const nvme = /nvme|m\.2.*pcie|pcie/.test(n);
  const gen = /gen\s?5|pcie\s?5/.test(n) ? 3 : /gen\s?4|pcie\s?4/.test(n) ? 2 : /gen\s?3|pcie\s?3/.test(n) ? 1 : 0;
  const type = hdd ? 0 : nvme ? 2 : 1; // hdd < sata ssd < nvme
  return [
    { label: 'Capacity', value: gb, weight: 0.01, text: gb >= 1000 ? `${gb / 1000}TB` : gb ? `${gb}GB` : 'unspecified' },
    { label: 'Type', value: type, weight: 12, text: ['hard disk', 'SATA SSD', 'NVMe SSD'][type] },
    { label: 'PCIe generation', value: gen, weight: 3, text: gen ? `PCIe Gen ${gen + 2}` : 'older' },
  ];
}

function monitorAxes(part) {
  const n = lower(part);
  const res = /\b(4k|uhd|2160p)\b/.test(n) ? 4 : /\b(qhd|2k|1440p|wqhd)\b/.test(n) ? 3 : /\b(fhd|1080p|full hd)\b/.test(n) ? 2 : 1;
  const hz = firstNumber(n, /(\d{2,3})\s?hz/) || 60;
  const panel = /oled/.test(n) ? 3 : /\bips\b|fast ips/.test(n) ? 2 : /\bva\b/.test(n) ? 1 : 0;
  const inches = firstNumber(n, /(\d{2}(?:\.\d)?)\s?("|”|inch|in\b)/);
  return [
    { label: 'Resolution', value: res, weight: 10, text: ['unspecified', 'HD', 'FHD', 'QHD', '4K'][res] },
    { label: 'Refresh rate', value: hz, weight: 0.05, text: `${hz}Hz` },
    { label: 'Panel', value: panel, weight: 2, text: ['standard', 'VA', 'IPS', 'OLED'][panel] },
    { label: 'Size', value: inches, weight: 0.3, text: inches ? `${inches}"` : 'unspecified' },
  ];
}

const BOARD_TIER = [
  // The chipset may carry a variant letter after it: A620M, B650E, X870E.
  [1, /\b(a320|a520|a620|h110|h310|h410|h510|h610|b360)[a-z]{0,2}\b/],
  [2, /\b(b450|b550|b650|b840|b460|b560|b660|b760|b860|h770|h470|h570)[a-z]{0,2}\b/],
  [3, /\b(x470|x570|z370|z390|z490|z590|q570)[a-z]{0,2}\b/],
  [4, /\b(x670|x870|z690|z790|z890)[a-z]{0,2}\b/],
];

function boardAxes(part) {
  const n = lower(part);
  const tier = (BOARD_TIER.find(([, re]) => re.test(n)) || [0])[0];
  const wifi = /wi-?fi|wireless/.test(n) ? 1 : 0;
  const ddr5 = part.specs?.ram_type === 'DDR5' ? 1 : 0;
  return [
    { label: 'Chipset tier', value: tier, weight: 5, text: ['unspecified', 'entry chipset', 'mainstream chipset', 'high-end chipset', 'enthusiast chipset'][tier] },
    { label: 'Wi-Fi', value: wifi, weight: 2, text: wifi ? 'Wi-Fi' : 'no Wi-Fi' },
    { label: 'Memory', value: ddr5, weight: 3, text: ddr5 ? 'DDR5' : 'DDR4 or older' },
  ];
}

function coolerAxes(part) {
  const n = lower(part);
  const liquid = /aio|liquid|water/.test(n);
  const kind = liquid ? 3 : /dual[\s-]*tower/.test(n) ? 2 : /tower/.test(n) ? 1 : 0;
  const rad = firstNumber(n, /\b(120|140|240|280|360|420)\s?mm?\b/);
  return [
    { label: 'Type', value: kind, weight: 4, text: ['basic air cooler', 'tower air cooler', 'dual-tower air cooler', 'liquid cooler'][kind] },
    { label: 'Radiator', value: liquid ? rad : 0, weight: 0.01, text: liquid && rad ? `${rad}mm radiator` : 'no radiator' },
  ];
}

function upsAxes(part) {
  const n = lower(part);
  const va = firstNumber(n, /(\d{3,5})\s?va\b/);
  const kind = /online/.test(n) ? 2 : /line[\s-]*interactive/.test(n) ? 1 : 0;
  return [
    { label: 'Capacity', value: va, weight: 0.01, text: va ? `${va}VA` : 'unspecified' },
    { label: 'Type', value: kind, weight: 4, text: ['offline UPS', 'line-interactive', 'online UPS'][kind] },
  ];
}

function gpuAxes(part) {
  const vram = firstNumber(lower(part), /(\d{1,2})\s?gb/);
  return [{ label: 'VRAM', value: vram, weight: 0.5, text: vram ? `${vram}GB VRAM` : 'unspecified' }];
}

function keyboardAxes(part) {
  const n = lower(part);
  const mech = /mechanical/.test(n) ? 1 : 0;
  const wireless = /wireless|bluetooth|tri-?mode/.test(n) ? 1 : 0;
  return [
    { label: 'Switches', value: mech, weight: 2, text: mech ? 'mechanical' : 'membrane' },
    { label: 'Connection', value: wireless, weight: 0.5, text: wireless ? 'wireless' : 'wired' },
  ];
}

function mouseAxes(part) {
  const n = lower(part);
  const wireless = /wireless|bluetooth|tri-?mode/.test(n) ? 1 : 0;
  const dpi = firstNumber(n, /(\d{4,6})\s?dpi/);
  return [
    { label: 'Connection', value: wireless, weight: 1, text: wireless ? 'wireless' : 'wired' },
    { label: 'Sensor', value: dpi, weight: 0.0003, text: dpi ? `${dpi} DPI` : 'unspecified' },
  ];
}

const AXES = {
  PSU: psuAxes,
  RAM: ramAxes,
  Storage: storageAxes,
  Monitor: monitorAxes,
  Motherboard: boardAxes,
  'CPU Cooler': coolerAxes,
  UPS: upsAxes,
  'Graphics Card': gpuAxes,
  Keyboard: keyboardAxes,
  Mouse: mouseAxes,
};

// Price decides where the named axes do not: for CPU/GPU/case it is the main measure, elsewhere a tie-break.
const PRICE_WEIGHT = { Processor: 1 / 1000, 'Graphics Card': 1 / 1000, Casing: 1 / 1000 };
const TIE_BREAK = 1 / 1_000_000;

/** The measurable parts of "better" for a category: [{ label, value, weight, text }]. */
export function qualityAxes(category, part) {
  const make = AXES[category];
  return make && part ? make(part) : [];
}

/** One number per part and category; higher is better. Only compare parts of the same category. */
export function qualityScore(category, part) {
  if (!part) return 0;
  const axes = qualityAxes(category, part);
  const named = axes.reduce((sum, a) => sum + (a.value || 0) * a.weight, 0);
  const price = Number(part.price) || 0;
  return named + price * (PRICE_WEIGHT[category] ?? TIE_BREAK);
}

/**
 * What differs between two parts of one category, in words: ["Wattage 850W → 1000W", ...].
 * Axes that read the same on both sides are left out.
 */
export function describeDifference(category, before, after) {
  const a = qualityAxes(category, before);
  const b = qualityAxes(category, after);
  const out = [];
  for (let i = 0; i < b.length; i++) {
    if (!a[i] || a[i].text === b[i].text) continue;
    out.push(`${b[i].label} ${a[i].text} → ${b[i].text}`);
  }
  return out;
}
