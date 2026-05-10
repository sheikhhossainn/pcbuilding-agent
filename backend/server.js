import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

// Initialize AI SDKs
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const intentPrompt = `
You are a PC building assistant for the Bangladesh market.
Extract the user's requirements and return ONLY a valid JSON object, no explanation.

{
  "budget_bdt": number or null,
  "use_case": "gaming" | "editing" | "office" | "general",
  "preferred_site": "startech" | "techland" | "computermania" | null,
  "preferred_cpu_brand": "amd" | "intel" | null,
  "no_gpu": boolean,
  "ram_gb": number or null,
  "ram_type": "DDR4" | "DDR5" | null,
  "needs_monitor": boolean,
  "needs_mouse": boolean,
  "needs_keyboard": boolean,
  "rgb_needed": boolean,
  "components_user_has": [],
  "preferred_brands": [],
  "other_notes": ""
}

Rules:
- Normalize budget written as "50k", "৫০ হাজার", "50,000" all to a number
- If use case is unclear default to "general"
- "simulation" tasks like Proteus, Multisim, MATLAB = use_case "office"
- Prioritize CPU and RAM over GPU for office/simulation builds
- If no site is preferred, default preferred_site to "startech"
- Default needs_monitor, needs_mouse, needs_keyboard to true unless user explicitly says they already have them
- If user says DDR4, set ram_type to "DDR4"; DDR4 = AM4 socket (Ryzen 5000 series and older)
- If user says DDR5, set ram_type to "DDR5"; DDR5 = AM5 socket (Ryzen 7000 series and newer)
- Return ONLY valid JSON
`;

const CATEGORY_MAPPING = {
  'Processor': 'cpu',
  'Motherboard': 'motherboard',
  'RAM': 'ram',
  'Storage': 'storage',
  'Graphics Card': 'gpu',
  'PSU': 'psu',
  'Casing': 'casing',
  'CPU Cooler': 'cpu-cooler',
  'Monitor': 'monitor',
  'Mouse': 'mouse',
  'Keyboard': 'keyboard'
};

async function fetchPartsFromScraper(site, category) {
    try {
        const response = await fetch(`http://localhost:8000/scrape?site=${site}&category=${CATEGORY_MAPPING[category]}`);
        if (!response.ok) return [];
        const data = await response.json();
        // Decorate with basic inferred specs so our compatibility rules don't crash
        return data.products.map(p => ({
            ...p,
            category: category,
            specs: inferSpecs(category, p.name)
        }));
    } catch (e) {
        console.error(`Failed to fetch ${category} from ${site}`, e);
        return [];
    }
}

function inferSpecs(category, name) {
    const specs = {};
    const n = name.toLowerCase();
    
    if (category === 'Processor') {
        if (n.includes('amd') || n.includes('ryzen') || n.includes('athlon') || n.includes('threadripper')) specs.brand = 'amd';
        else if (n.includes('intel') || n.includes('core i') || n.includes('pentium') || n.includes('celeron')) specs.brand = 'intel';
        else specs.brand = 'unknown';
    }

    if (category === 'Processor' || category === 'Motherboard') {
        if (n.includes('am5') || n.includes('b650') || n.includes('x670') || n.includes('a620') || n.includes('x870') || n.match(/ryzen [579] (7|8|9)\d{3}/)) {
            specs.socket = 'AM5';
            specs.ram_type = 'DDR5';
        } else if (n.includes('am4') || n.includes('b450') || n.includes('b550') || n.includes('x570') || n.includes('a320') || n.includes('a520') || n.match(/ryzen [3579] (3|4|5)\d{3}/) || n.includes('4600g') || n.includes('5600g') || n.includes('5700g')) {
            specs.socket = 'AM4';
            specs.ram_type = 'DDR4';
        } else if (n.includes('lga1700') || n.includes('lga 1700') || n.includes('h610') || n.includes('b660') || n.includes('b760') || n.includes('z690') || n.includes('z790') || n.match(/1[234][14679]00/)) {
            specs.socket = 'LGA1700';
            specs.ram_type = (n.includes('ddr4')) ? 'DDR4' : 'DDR5';
        } else if (n.includes('lga1200') || n.includes('lga 1200') || n.includes('h410') || n.includes('b460') || n.includes('h510') || n.includes('b560') || n.includes('z490') || n.includes('z590') || n.match(/1[01][1479]00/) || n.includes('10105')) {
            specs.socket = 'LGA1200';
            specs.ram_type = 'DDR4';
        } else if (n.includes('lga1151') || n.includes('lga 1151') || n.includes('h310') || n.includes('b360') || n.includes('b365') || n.includes('z390') || n.match(/[89][1479]00/)) {
            specs.socket = 'LGA1151';
            specs.ram_type = 'DDR4';
        } else {
            specs.socket = 'UNKNOWN'; // Fallback
            specs.ram_type = (n.includes('ddr5')) ? 'DDR5' : (n.includes('ddr3') ? 'DDR3' : 'UNKNOWN');
        }
    }
    
    if (category === 'Processor') {
        if (n.includes('i9') || n.includes('ryzen 9')) specs.tdp = 125;
        else if (n.includes('i7') || n.includes('ryzen 7')) specs.tdp = 105;
        else specs.tdp = 65;
    }

    if (category === 'RAM') {
        if (n.includes('ddr5')) specs.ram_type = 'DDR5';
        else specs.ram_type = 'DDR4';
    }

    if (category === 'Graphics Card') {
        if (n.includes('4090')) specs.tdp = 450;
        else if (n.includes('4080') || n.includes('7900')) specs.tdp = 320;
        else if (n.includes('4070') || n.includes('7800')) specs.tdp = 220;
        else if (n.includes('4060') || n.includes('7600')) specs.tdp = 160;
        else specs.tdp = 150;
    }

    if (category === 'PSU') {
        const match = n.match(/(\d+)\s*(w\b|watt)/i);
        if (match) specs.wattage = parseInt(match[1]);
        else specs.wattage = 500;
    }

    return specs;
}

app.post('/api/build', async (req, res) => {
  try {
    const { message, site: bodySite } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const apiProvider = req.body.apiProvider || 'groq';

    let intentText = "";

    if (apiProvider === 'gemini') {
      const intentResponse = await gemini.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: [{ role: 'user', parts: [{ text: intentPrompt + "\n\nUser Message: " + message }] }]
      });
      intentText = intentResponse.text;
    } else {
      // Step 1: Extract Intent using Groq
      const intentResponse = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: intentPrompt },
          { role: "user", content: message }
        ],
        temperature: 0.1,
      });
      intentText = intentResponse.choices[0].message.content;
    }
    intentText = intentText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    let intent;
    try {
      intent = JSON.parse(intentText);
    } catch (e) {
      console.error("Failed to parse intent JSON:", intentText);
      return res.status(500).json({ error: 'Failed to process your request correctly.' });
    }
    console.log("Extracted intent:", JSON.stringify(intent, null, 2));

    if (!intent.budget_bdt) {
       return res.json({
          error: "I need a budget to build a PC. Please specify your budget in BDT."
       });
    }

    if (intent.budget_bdt < 20000) {
      return res.json({
         error: "Your budget is a bit too low to build a functional new PC. The minimum budget required is around 20,000 BDT. Please increase your budget or consider used parts."
      });
    }

    const site = bodySite || intent.preferred_site || "startech";
    console.log(`Building PC from ${site} for ${intent.budget_bdt} BDT`);

    // Fetch all core categories in parallel from scraper
    const categoriesToFetch = Object.keys(CATEGORY_MAPPING);
    const results = await Promise.all(
        categoriesToFetch.map(cat => fetchPartsFromScraper(site, cat))
    );
    
    // Flatten into a single catalog
    let partsCatalog = [];
    results.forEach(res => {
        partsCatalog = partsCatalog.concat(res);
    });

    if (partsCatalog.length === 0) {
         return res.json({
             error: `Could not fetch any parts from ${site}. The scraping service might be down or blocked.`
         });
    }

    console.log("Sample CPU parts:", JSON.stringify(partsCatalog.filter(p => p.category === 'Processor').slice(0, 2), null, 2));


    // Step 2 & 3 & 4: Select Parts and check Compatibility
    const budget = intent.budget_bdt;
    const noGpu = intent.no_gpu || false;
    let allocations = {};
    if (intent.use_case === 'gaming' || intent.use_case === 'editing') {
      if (noGpu) {
        // Gaming/editing without GPU: big monitor + strong CPU+RAM
        allocations = { 'Processor': 0.22, 'Motherboard': 0.18, 'RAM': 0.20, 'Storage': 0.10, 'PSU': 0.07, 'Casing': 0.03, 'Graphics Card': 0, 'Monitor': 0.13, 'Mouse': 0.03, 'Keyboard': 0.03 };
      } else {
        allocations = { 'Graphics Card': 0.35, 'Processor': 0.20, 'Motherboard': 0.13, 'RAM': 0.08, 'Storage': 0.08, 'PSU': 0.05, 'Casing': 0.05, 'Monitor': 0.04, 'Mouse': 0.01, 'Keyboard': 0.01 };
      }
    } else { // Office / General (covers simulation/EEE use cases)
      if (noGpu) {
        // Office/sim without GPU: CPU+RAM priority, reasonable monitor
        allocations = { 'Processor': 0.22, 'Motherboard': 0.18, 'RAM': 0.20, 'Storage': 0.10, 'PSU': 0.07, 'Casing': 0.03, 'Graphics Card': 0, 'Monitor': 0.13, 'Mouse': 0.03, 'Keyboard': 0.03 };
      } else {
        allocations = { 'Processor': 0.20, 'Motherboard': 0.18, 'RAM': 0.10, 'Storage': 0.10, 'PSU': 0.08, 'Casing': 0.05, 'Graphics Card': 0.15, 'Monitor': 0.10, 'Mouse': 0.02, 'Keyboard': 0.02 };
      }
    }
    
    // If they explicitly don't need peripherals, zero them out and give budget back to core
    if (intent.needs_monitor === false) { allocations['Processor'] += allocations['Monitor']; allocations['Monitor'] = 0; }
    if (intent.needs_mouse === false) { allocations['Casing'] += allocations['Mouse']; allocations['Mouse'] = 0; }
    if (intent.needs_keyboard === false) { allocations['Casing'] += allocations['Keyboard']; allocations['Keyboard'] = 0; }

    let selectedBuild = {
      Processor: null,
      Motherboard: null,
      RAM: null,
      Storage: null,
      "Graphics Card": null,
      PSU: null,
      Casing: null,
      "CPU Cooler": null,
      Monitor: null,
      Mouse: null,
      Keyboard: null
    };

    let totalCost = 0;
    
    const findPart = (category, targetBudget, conditionFn) => {
      let options = partsCatalog.filter(p => p.category === category && p.price !== null && p.price <= targetBudget && p.in_stock);
      if (conditionFn) options = options.filter(conditionFn);
      
      options.sort((a, b) => b.price - a.price);
      return options[0] || null;
    };

    // 1. CPU
    const cpuCondition = (p) => {
      const brandMatch = !intent.preferred_cpu_brand || p.specs.brand === intent.preferred_cpu_brand;
      // If user explicitly requests a RAM type, lock the CPU socket to match it
      if (intent.ram_type === 'DDR4') return brandMatch && p.specs.socket === 'AM4';
      if (intent.ram_type === 'DDR5') return brandMatch && p.specs.socket === 'AM5';
      // If no explicit ram_type but AMD + budget context — prefer AM4 (DDR4) first for affordability
      // (AM5 + DDR5 kit costs ~15-20% more)
      return brandMatch;
    };
    
    selectedBuild.Processor = findPart('Processor', budget * allocations['Processor'], cpuCondition);
    if (!selectedBuild.Processor) {
       // Relax budget by 20%
       selectedBuild.Processor = findPart('Processor', budget * allocations['Processor'] * 1.2, cpuCondition);
    }
    
    // Fallback logic
    if (!selectedBuild.Processor && intent.preferred_cpu_brand) {
         return res.json({ error: `Could not find a compatible ${intent.preferred_cpu_brand.toUpperCase()} processor within your budget limit. Try increasing your budget.` });
    }
    if (!selectedBuild.Processor) {
       const sortedCpus = partsCatalog.filter(p => p.category === 'Processor' && p.price !== null && p.in_stock).sort((a,b) => a.price - b.price);
       selectedBuild.Processor = sortedCpus[0];
    }
    
    if (selectedBuild.Processor) {
      totalCost += selectedBuild.Processor.price;
      
      // 2. Motherboard (Must match socket AND enforce ram_type if specified)
      const moboCondition = p => {
        if (p.specs.socket === 'UNKNOWN' || selectedBuild.Processor.specs.socket === 'UNKNOWN') return false;
        const socketMatch = p.specs.socket === selectedBuild.Processor.specs.socket;
        // Hard enforce requested ram_type on the motherboard
        if (intent.ram_type) return socketMatch && p.specs.ram_type === intent.ram_type;
        return socketMatch;
      };
      
      selectedBuild.Motherboard = findPart('Motherboard', budget * allocations['Motherboard'], moboCondition);
      
      // Relax budget if failed (up to 20%)
      if (!selectedBuild.Motherboard) {
         selectedBuild.Motherboard = findPart('Motherboard', budget * allocations['Motherboard'] * 1.2, moboCondition);
      }
      
      if (!selectedBuild.Motherboard) {
         return res.json({ error: `Found a CPU (${selectedBuild.Processor.name}) but couldn't find a matching ${selectedBuild.Processor.specs.socket} Motherboard within budget. Try increasing budget.` });
      }
      
      if (selectedBuild.Motherboard) {
        totalCost += selectedBuild.Motherboard.price;
        
        // 3. RAM (Must match motherboard ram type)
        const ramCondition = p => {
          const typeMatch = p.specs.ram_type !== 'UNKNOWN'
            && selectedBuild.Motherboard.specs.ram_type !== 'UNKNOWN'
            && p.specs.ram_type === selectedBuild.Motherboard.specs.ram_type;
          if (!intent.ram_gb) return typeMatch;
          const name = p.name.toLowerCase();
          const half = intent.ram_gb / 2;
          const gbMatch = name.includes(`${intent.ram_gb}gb`)       // e.g. "16gb"
            || name.includes(`${intent.ram_gb} gb`)                 // e.g. "16 gb"
            || name.includes(`2x${half}gb`)                         // e.g. "2x8gb"
            || name.includes(`2x${half} gb`)                        // e.g. "2x8 gb"
            || name.includes(`${intent.ram_gb}g `);                 // e.g. "16g ddr4"
          return typeMatch && gbMatch;
        };
        selectedBuild.RAM = findPart('RAM', budget * allocations['RAM'], ramCondition);
        
        if (!selectedBuild.RAM) {
          // Relax budget up to 20%
          selectedBuild.RAM = findPart('RAM', budget * allocations['RAM'] * 1.2, ramCondition);
        }
        if (!selectedBuild.RAM && intent.ram_gb) {
          // Requested GB size not found — fall back to best matching DDR type without GB constraint
          console.warn(`No ${intent.ram_gb}GB ${selectedBuild.Motherboard.specs.ram_type} RAM found — falling back to best available`);
          const typeOnlyCondition = p => p.specs.ram_type !== 'UNKNOWN'
            && selectedBuild.Motherboard.specs.ram_type !== 'UNKNOWN'
            && p.specs.ram_type === selectedBuild.Motherboard.specs.ram_type;
          selectedBuild.RAM = findPart('RAM', budget * allocations['RAM'] * 1.2, typeOnlyCondition);
        }
        if (!selectedBuild.RAM) {
          return res.json({ error: `Found a Motherboard (${selectedBuild.Motherboard.name}) but couldn't find any compatible ${selectedBuild.Motherboard.specs.ram_type} RAM in stock. Try a different site or increase your budget.` });
        }
        if (selectedBuild.RAM) totalCost += selectedBuild.RAM.price;
      }
    }

    // 4. Storage
    selectedBuild.Storage = findPart('Storage', budget * allocations['Storage']);
    if (!selectedBuild.Storage) {
       const sorted = partsCatalog.filter(p => p.category === 'Storage' && p.price !== null && p.in_stock).sort((a,b) => a.price - b.price);
       selectedBuild.Storage = sorted[0];
    }
    if (selectedBuild.Storage) totalCost += selectedBuild.Storage.price;

    // 5. GPU (If allocated)
    if (allocations['Graphics Card'] > 0) {
      selectedBuild["Graphics Card"] = findPart('Graphics Card', budget * allocations['Graphics Card']);
      if (selectedBuild["Graphics Card"]) totalCost += selectedBuild["Graphics Card"].price;
    }

    let requiredTdp = 0;
    if (selectedBuild.Processor) requiredTdp += (selectedBuild.Processor.specs.tdp || 65);
    if (selectedBuild["Graphics Card"]) requiredTdp += (selectedBuild["Graphics Card"].specs.tdp || 0);
    const targetPsuWattage = (requiredTdp * 1.2) + 50;

    // 6. PSU
    selectedBuild.PSU = findPart('PSU', budget * allocations['PSU'], p => p.specs.wattage >= targetPsuWattage);
    if (!selectedBuild.PSU) {
       const sorted = partsCatalog.filter(p => p.category === 'PSU' && p.price !== null && p.in_stock && p.specs.wattage >= targetPsuWattage).sort((a,b) => a.price - b.price);
       selectedBuild.PSU = sorted[0];
    }
    if (selectedBuild.PSU) totalCost += selectedBuild.PSU.price;

    // 7. Casing
    selectedBuild.Casing = findPart('Casing', budget * allocations['Casing']);
    if (!selectedBuild.Casing) {
       const sorted = partsCatalog.filter(p => p.category === 'Casing' && p.price !== null && p.in_stock).sort((a,b) => a.price - b.price);
       selectedBuild.Casing = sorted[0];
    }
    if (selectedBuild.Casing) totalCost += selectedBuild.Casing.price;

    // 8. Peripherals
    ['Monitor', 'Mouse', 'Keyboard'].forEach(perif => {
       if (allocations[perif] > 0) {
           selectedBuild[perif] = findPart(perif, budget * allocations[perif]);
           if (selectedBuild[perif]) totalCost += selectedBuild[perif].price;
       }
    });

    // Optional Cooler
    if (selectedBuild.Processor && selectedBuild.Processor.specs.tdp >= 105) {
      const remainingBudget = budget - totalCost;
      if (remainingBudget > 3000) {
        selectedBuild["CPU Cooler"] = findPart('CPU Cooler', remainingBudget);
        if (selectedBuild["CPU Cooler"]) totalCost += selectedBuild["CPU Cooler"].price;
      }
    }

    // Second pass — upgrade components with remaining budget
    let remaining = budget - totalCost;
    if (remaining > 3000 && intent.ram_gb && selectedBuild.RAM) {
      const currentHas = selectedBuild.RAM.name.toLowerCase().includes(`${intent.ram_gb}gb`);
      if (!currentHas) {
        const ramUpgradeCondition = p => {
          const typeMatch = p.specs.ram_type !== 'UNKNOWN' && selectedBuild.Motherboard?.specs.ram_type !== 'UNKNOWN' && p.specs.ram_type === selectedBuild.Motherboard?.specs.ram_type;
          const gbMatch = p.name.toLowerCase().includes(`${intent.ram_gb}gb`);
          return typeMatch && gbMatch;
        };
        const betterRam = findPart('RAM', selectedBuild.RAM.price + remaining, ramUpgradeCondition);
        if (betterRam && betterRam.price > selectedBuild.RAM.price) {
          totalCost -= selectedBuild.RAM.price;
          selectedBuild.RAM = betterRam;
          totalCost += betterRam.price;
          remaining = budget - totalCost;
        }
      }
    }

    // Upgrade storage with remaining budget
    if (remaining > 2000 && selectedBuild.Storage) {
      const betterStorage = findPart('Storage', selectedBuild.Storage.price + remaining);
      if (betterStorage && betterStorage.price > selectedBuild.Storage.price) {
        totalCost -= selectedBuild.Storage.price;
        selectedBuild.Storage = betterStorage;
        totalCost += betterStorage.price;
        remaining = budget - totalCost;
      }
    }

    // Upgrade monitor with remaining budget
    if (remaining > 2000 && selectedBuild.Monitor) {
      const betterMonitor = findPart('Monitor', selectedBuild.Monitor.price + remaining);
      if (betterMonitor && betterMonitor.price > selectedBuild.Monitor.price) {
        totalCost -= selectedBuild.Monitor.price;
        selectedBuild.Monitor = betterMonitor;
        totalCost += betterMonitor.price;
      }
    }

    // Validate if core build is basically functional
    if (!selectedBuild.Processor || !selectedBuild.Motherboard || !selectedBuild.RAM || !selectedBuild.PSU) {
      return res.json({
         error: "I couldn't put together a fully compatible build within that exact budget from the live scraped parts. Please try adjusting your budget."
      });
    }

    // Step 5: Explanation generation
    const explanationPrompt = `
You are a PC building assistant. You have selected the following components for a user who wants a ${intent.use_case} PC with a budget of ${budget} BDT from ${site}.

Selected Parts:
${Object.keys(selectedBuild).map(k => {
  if (selectedBuild[k]) return `- ${k}: ${selectedBuild[k].name} (${selectedBuild[k].price} BDT)`;
  return '';
}).filter(Boolean).join('\n')}

Total Cost: ${totalCost} BDT

Write a short paragraph (3-4 sentences) explaining WHY these major components were chosen for their specific use case and budget. Keep it friendly and concise.
`;

    let explanation = "";
    if (apiProvider === 'gemini') {
        const explanationResponse = await gemini.models.generateContent({
          model: 'gemini-2.5-pro',
          contents: [{ role: 'user', parts: [{ text: explanationPrompt }] }]
        });
        explanation = explanationResponse.text;
    } else {
        const explanationResponse = await groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: explanationPrompt }],
          temperature: 0.3,
        });
        explanation = explanationResponse.choices[0].message.content;
    }

    res.json({
      build: selectedBuild,
      total: totalCost,
      explanation: explanation,
      intent: intent
    });

  } catch (error) {
    console.error("Error in /api/build:", error);
    res.status(500).json({ error: "An internal server error occurred while building your PC." });
  }
});

app.listen(port, () => {
  console.log(`Backend server running on http://localhost:${port}`);
});
