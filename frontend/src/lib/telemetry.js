// Client-side spec inference for display and rough power estimates.
// NOTE: duplicates backend/utils/specInference.js heuristics. Phase 3 moves this
// to the API payload so there is a single source of truth.
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

// Ordered, display-ready chips for a part. Capped so rows stay calm.
export function getSpecChips(category, name, limit = 3) {
  const s = parseComponentTelemetry(category, name);
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

export function computeTelemetry({ build, total, warnings }) {
  const cpuItem = build["Processor"];
  const gpuItem = build["Graphics Card"];
  const psuItem = build["PSU"];
  const moboItem = build["Motherboard"];

  const cpuSpecs = parseComponentTelemetry("Processor", cpuItem?.name);
  const gpuSpecs = parseComponentTelemetry("Graphics Card", gpuItem?.name);
  const psuSpecs = parseComponentTelemetry("PSU", psuItem?.name);

  const cpuTdp = cpuSpecs.tdp || 65;
  const gpuTdp = gpuSpecs.tdp || (gpuItem ? 160 : 25);
  const baseSystemTdp = 45; // motherboard, fans, storage, RAM
  const estimatedDraw = (cpuItem ? cpuTdp : 0) + (gpuItem ? gpuTdp : 25) + (moboItem ? baseSystemTdp : 0);
  const recommendedPsu = Math.round(estimatedDraw * 1.45);
  const installedPsu = psuSpecs.wattage || 0;

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
  const gpuPct = total > 0 ? Math.round(((gpuItem?.price || 0) / total) * 100) : 0;
  const cpuPct = total > 0 ? Math.round(((cpuItem?.price || 0) / total) * 100) : 0;
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
