// Display specs and a fallback power estimate.
//
// Parts that come from the API carry `item.specs` inferred on the server
// (socket, ram_type, tdp, wattage). Those win. The name-based parsing below only
// fills in gaps (VRAM, capacity, chipset) and covers sessions saved before the
// API returned specs.
const known = (value) => value && value !== 'UNKNOWN' && value !== 'INTEGRATED';

export function parseComponentTelemetry(category, name) {
  if (!name) return {};
  const upper = name.toUpperCase();
  const specs = {};

  if (category === "Processor") {
    if (upper.includes("AM5") || /RYZEN\s*[579]\s*(7|8|9)\d{3}/i.test(name)) specs.socket = "AM5";
    else if (upper.includes("AM4") || /RYZEN\s*[3579]\s*[12345]\d{3}/i.test(name)) specs.socket = "AM4";
    else if (/1[234]\d{2}[0-9]K?F?/i.test(name) || upper.includes("LGA1700") || upper.includes("1700")) specs.socket = "LGA1700";
    else if (/CORE\s*ULTRA/i.test(name) || upper.includes("1851")) specs.socket = "LGA1851";

    if (/RYZEN\s*9/i.test(name) || /I9/i.test(name)) specs.tdp = 125;
    else if (/RYZEN\s*7/i.test(name) || /I7/i.test(name)) specs.tdp = 105;
    else specs.tdp = 65;
  }

  if (category === "Graphics Card") {
    const vramMatch = name.match(/(\d{1,2})\s*GB/i);
    if (vramMatch) specs.vram = `${vramMatch[1]}GB VRAM`;

    if (/4090|5090|7900\s*XTX/i.test(name)) specs.tdp = 450;
    else if (/4080|5080|7900\s*XT/i.test(name)) specs.tdp = 320;
    else if (/4070|5070|7800\s*XT|6800/i.test(name)) specs.tdp = 220;
    else if (/4060|5060|7600|6600|6700/i.test(name)) specs.tdp = 160;
    else if (/3050|6500|1650/i.test(name)) specs.tdp = 130;
    else specs.tdp = 160;
  }

  if (category === "PSU") {
    const wattMatch = name.match(/(\d{3,4})\s*W/i);
    if (wattMatch) specs.wattage = parseInt(wattMatch[1], 10);
    else specs.wattage = 550;
  }

  if (category === "Motherboard") {
    if (/B650|X670|A620|X870/i.test(name)) specs.chipset = "AMD AM5";
    else if (/B550|X570|B450|A520/i.test(name)) specs.chipset = "AMD AM4";
    else if (/B760|Z790|H610|B660|Z690/i.test(name)) specs.chipset = "Intel LGA1700";
    else if (/Z890|B860/i.test(name)) specs.chipset = "Intel LGA1851";
  }

  if (category === "RAM") {
    if (upper.includes("DDR5")) specs.gen = "DDR5";
    else if (upper.includes("DDR4")) specs.gen = "DDR4";

    const capMatch = name.match(/(\d{1,3})\s*GB/i);
    if (capMatch) specs.capacity = `${capMatch[1]}GB`;

    const mhzMatch = name.match(/(\d{4})\s*MHZ/i);
    if (mhzMatch) specs.speed = `${mhzMatch[1]}MHz`;
  }

  return specs;
}

/** Name-derived specs, overridden by server-inferred `item.specs` when present. */
export function getPartSpecs(category, item) {
  if (!item) return {};
  const specs = parseComponentTelemetry(category, item.name);
  const server = item.specs;
  if (!server) return specs;

  if (category === "Processor") {
    if (known(server.socket)) specs.socket = server.socket;
    if (Number.isFinite(server.tdp)) specs.tdp = server.tdp;
  }
  if (category === "Motherboard") {
    if (known(server.ram_type)) specs.gen = server.ram_type;
    if (known(server.socket) && !specs.chipset) specs.socket = server.socket;
  }
  if (category === "RAM" && known(server.ram_type)) specs.gen = server.ram_type;
  if (category === "Graphics Card" && Number.isFinite(server.tdp)) specs.tdp = server.tdp;
  if (category === "PSU" && Number.isFinite(server.wattage)) specs.wattage = server.wattage;

  return specs;
}

// Ordered, display-ready chips for a part. Capped so rows stay calm.
export function getSpecChips(category, item, limit = 3) {
  const s = getPartSpecs(category, item);
  const chips = [];
  if (s.socket) chips.push(`Socket ${s.socket}`);
  if (s.chipset) chips.push(s.chipset);
  if (s.vram) chips.push(s.vram);
  if (s.gen) chips.push(s.gen);
  if (s.capacity) chips.push(s.capacity);
  if (s.speed) chips.push(s.speed);
  if (s.wattage) chips.push(`${s.wattage}W`);
  if (s.tdp) chips.push(`TDP ~${s.tdp}W`);
  return chips.slice(0, limit);
}

function estimateLocally(build) {
  const cpuItem = build["Processor"];
  const gpuItem = build["Graphics Card"];
  const psuItem = build["PSU"];
  const moboItem = build["Motherboard"];

  const cpuTdp = getPartSpecs("Processor", cpuItem).tdp || 65;
  const gpuTdp = getPartSpecs("Graphics Card", gpuItem).tdp || (gpuItem ? 160 : 25);
  const baseSystemTdp = 45; // motherboard, fans, storage, RAM
  const draw = (cpuItem ? cpuTdp : 0) + (gpuItem ? gpuTdp : 25) + (moboItem ? baseSystemTdp : 0);

  return {
    draw,
    recommended: Math.round(draw * 1.45),
    psuWattage: getPartSpecs("PSU", psuItem).wattage || 0,
  };
}

/**
 * @param {Object} params
 * @param {Object} params.build
 * @param {number} params.total
 * @param {string[]} params.warnings
 * @param {{draw:number, recommended:number, psuWattage:number}|null} [params.power] - from the API; preferred
 */
export function computeTelemetry({ build, total, warnings, power = null }) {
  const source = power && Number.isFinite(power.draw) ? power : estimateLocally(build);

  const estimatedDraw = source.draw;
  const recommendedPsu = source.recommended;
  const installedPsu = source.psuWattage || 0;

  let psuStatus = "idle";
  let psuRatio = 0;
  if (installedPsu > 0) {
    psuRatio = Math.round((estimatedDraw / installedPsu) * 100);
    if (psuRatio < 75) psuStatus = "optimal";
    else if (psuRatio <= 90) psuStatus = "headroom";
    else psuStatus = "warning";
  }

  // What the bar shows: real load when a PSU is picked, otherwise draw vs a 750W reference.
  const loadPct = Math.min(100, installedPsu > 0 ? psuRatio : Math.round((estimatedDraw / 750) * 100));

  const incompatibleCount = warnings.filter((w) => String(w).includes('INCOMPATIBLE')).length;
  const noteCount = warnings.length - incompatibleCount;

  const configuredCount = Object.values(build).filter(Boolean).length;
  const gpuPct = total > 0 ? Math.round(((build["Graphics Card"]?.price || 0) / total) * 100) : 0;
  const cpuPct = total > 0 ? Math.round(((build["Processor"]?.price || 0) / total) * 100) : 0;
  const otherPct = total > 0 ? Math.max(0, 100 - gpuPct - cpuPct) : 0;

  return {
    estimatedDraw,
    recommendedPsu,
    installedPsu,
    psuStatus,
    psuRatio,
    loadPct,
    configuredCount,
    gpuPct,
    cpuPct,
    otherPct,
    incompatibleCount,
    noteCount,
  };
}
