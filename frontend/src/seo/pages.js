// Single source of truth for everything search engines should see: the home page copy, the
// budget landing pages, and the FAQ. The React app renders these (SeoContent.jsx) and
// scripts/prerender.mjs writes the same content into static HTML at build time, so crawlers get
// real text without running JavaScript. Plain ESM (no JSX) so Node can import it directly.

export const SITE_URL = 'https://buildmypc-eight.vercel.app';
export const SITE_NAME = 'BuildMyPC';
export const LAST_MODIFIED =
  globalThis.process?.env?.BUILD_DATE ||
  new Date().toISOString().split('T')[0];

// What the web app does, for structured data (schema.org featureList).
export const FEATURES = [
  'Compatible PC builds from a budget in BDT and a plain-language description',
  'Live prices from StarTech, TechLand, Ryans and ComputerMania',
  'Compare the same build across stores and find the cheapest',
  'Socket, DDR memory, power supply and cooler compatibility checks',
  'Swap or remove any part and re-check the build',
  'Refine with follow-ups such as "make it AMD" or "add a UPS"',
  'Shareable build links',
];

export const HOME = {
  path: '/',
  title: 'BuildMyPC — AI PC Builder & Price Comparison for Bangladesh',
  description:
    'Get a compatible PC build for your BDT budget, then compare its price at StarTech, TechLand, Ryans and ComputerMania to see where it is cheapest.',
  h1: 'Build a PC for your budget',
  lead: 'Describe what you need. We match live prices from Bangladeshi retailers and check compatibility.',
};

export const HOW_IT_WORKS = [
  {
    title: 'Say what you need',
    text: 'Type your budget in BDT and what the PC is for, for example "gaming PC under 80k with an Nvidia GPU". Bangla-English mixed messages like "70 hajar taka" work too.',
  },
  {
    title: 'We pick compatible parts',
    text: 'The builder splits your budget across processor, motherboard, RAM, graphics card, storage, power supply and case, and checks socket, memory type, power and cooling compatibility.',
  },
  {
    title: 'Live prices, real links',
    text: 'Every part comes from a Bangladeshi retailer catalog (StarTech, TechLand, Ryans, ComputerMania) with its current price and a link to the product page. Swap any part and the build is re-checked, then compare stores to see which shop sells the whole build for less.',
  },
];

export const FAQ = [
  {
    q: 'How much does a gaming PC cost in Bangladesh?',
    a: 'A usable 1080p gaming PC with a dedicated graphics card starts at roughly 50,000 BDT. Around 80,000 to 100,000 BDT gets a comfortable 1080p to 1440p build, and 150,000 BDT or more is the range for high-refresh 1440p and 4K. Prices move with the exchange rate and retailer stock, which is why BuildMyPC reads live prices.',
  },
  {
    q: 'Is the PC build compatible?',
    a: 'Yes. Each build is checked for CPU and motherboard socket, DDR4 or DDR5 memory type, power supply headroom, and whether a processor needs a separate cooler. Anything the checker is unsure about is shown as a note on the build.',
  },
  {
    q: 'Which shops do the prices come from?',
    a: 'Prices come from Bangladeshi PC retailer catalogs: StarTech, TechLand, Ryans and ComputerMania. You can pick the retailer before you build. Stock and prices change often, so confirm on the shop page before ordering.',
  },
  {
    q: 'Which shop in Bangladesh sells my PC build cheapest?',
    a: 'After a build is made, tap Compare stores. BuildMyPC prices the same build at every other supported retailer, using the same model where it is in stock and an equivalent part with the same key specs where it is not, then shows the cheapest complete store and how much you save. You can switch your build to that store in one tap.',
  },
  {
    q: 'Can I change a part after the build is made?',
    a: 'Yes. Swap any part for an alternative, remove parts you already own such as the monitor, keyboard or mouse, or ask a follow-up like "make it an Intel build" or "add a UPS". Parts you did not touch stay as they are.',
  },
  {
    q: 'Is BuildMyPC free?',
    a: 'Yes, it is free to use. There is no account and nothing to install.',
  },
  {
    q: 'Can I share a PC build with a friend?',
    a: 'Yes. Copy the share link and send it. The whole build is stored in the link itself, so it does not expire. The prices shown are the ones from when you shared it, so check the shop pages before buying.',
  },
];

// Budget / use-case landing pages. `prompt` pre-fills the composer so a visitor is one click
// from a build. Budgets stay at or above what the engine can actually satisfy at these prices.
export const LANDING_PAGES = [
  {
    slug: 'gaming-pc-under-50000-taka',
    title: 'Gaming PC Build Under 50,000 Taka in Bangladesh | BuildMyPC',
    description:
      'Plan a gaming PC under 50,000 BDT with compatible parts and live Bangladesh prices. See what a 50k budget buys and generate a build in seconds.',
    h1: 'Gaming PC under 50,000 taka',
    lead: 'A 50,000 BDT budget can run popular esports and older AAA titles at 1080p, but every taka has to go to the processor and graphics card.',
    prompt: 'I need a budget 1080p gaming PC under 50,000 BDT with a dedicated GPU',
    budget: 50000,
    useCase: 'gaming',
    expect: [
      'A modern 6-core processor (Ryzen 5 or Core i5 class), often a DDR4 platform to save money.',
      'An entry-level dedicated graphics card; this is where most of the budget goes.',
      '16 GB of RAM where possible, 8 GB only if the card is the priority.',
      'A 256 GB to 512 GB NVMe SSD and a basic, reliable power supply and case.',
    ],
    tips: [
      'Skip the monitor, keyboard and mouse from this budget if you already own them; say so and the builder reallocates the money to the GPU.',
      'Prefer a DDR4 board at this price. DDR5 platforms eat budget that is better spent on the graphics card.',
      'If prices have jumped, the builder may tell you the cheapest compatible build costs more than 50k. That is the market, not a bug.',
    ],
    faq: [
      {
        q: 'Can I get a gaming PC with a dedicated GPU for 50,000 taka?',
        a: 'Usually yes, with an entry-level graphics card and a mid-range 6-core processor, but not always with a brand new Nvidia card. If you require a specific brand at 50k, the builder will tell you honestly when it cannot fit.',
      },
      {
        q: 'Should I buy a used GPU to fit this budget?',
        a: 'BuildMyPC only picks new parts from retailer catalogs. If you buy used, expect more performance per taka but no warranty, so inspect carefully.',
      },
    ],
  },
  {
    slug: 'gaming-pc-under-80000-taka',
    title: 'Gaming PC Build Under 80,000 Taka in Bangladesh | BuildMyPC',
    description:
      'Build a 1080p/1440p gaming PC under 80,000 BDT. Compatible parts, live prices from Bangladesh retailers, and a build you can tweak part by part.',
    h1: 'Gaming PC under 80,000 taka',
    lead: 'Around 80,000 BDT is the sweet spot for smooth 1080p gaming and entry 1440p, with room for 16 GB of RAM and a proper SSD.',
    prompt: 'I need a gaming PC under 80,000 BDT with a dedicated GPU and 16GB RAM',
    budget: 80000,
    useCase: 'gaming',
    expect: [
      'A mid-range 6-core processor with good gaming performance, such as Ryzen 5 or Core i5 class.',
      'A mid-range graphics card capable of high settings at 1080p.',
      '16 GB of RAM and a 500 GB to 1 TB NVMe SSD.',
      'A 550 to 650 W power supply from a known brand and a case with decent airflow.',
    ],
    tips: [
      'Put most of the money into the graphics card; a mid-range CPU rarely holds back a mid-range GPU.',
      'Ask for a specific brand ("Intel CPU, Nvidia GPU") if you care; otherwise the builder picks the best value.',
      'Say "144hz monitor" if you need one and the budget is split to include it.',
    ],
    faq: [
      {
        q: 'Is 80,000 taka enough for 1440p gaming?',
        a: 'It is enough for entry 1440p in many games at medium to high settings, and very comfortable for 1080p. Competitive titles run at high refresh rates.',
      },
      {
        q: 'Intel or AMD at this budget?',
        a: 'Both are competitive. AMD Ryzen 5 parts are often the better value on DDR4; recent Intel Core i5 parts are strong too. The builder picks by price and compatibility unless you state a preference.',
      },
    ],
  },
  {
    slug: 'gaming-pc-under-100000-taka',
    title: 'Gaming PC Build Under 1 Lakh Taka in Bangladesh | BuildMyPC',
    description:
      'Gaming PC under 1 lakh BDT: compatible parts with live Bangladesh prices for strong 1080p and 1440p gaming. Generate and tweak your build.',
    h1: 'Gaming PC under 1 lakh taka',
    lead: 'One lakh taka buys a well-balanced 1440p-capable gaming PC with a strong graphics card, 16 to 32 GB of RAM and fast storage.',
    prompt: 'I need a gaming PC under 1 lakh BDT with a strong GPU, 16GB RAM and a 1TB SSD',
    budget: 100000,
    useCase: 'gaming',
    expect: [
      'A fast 6 to 8 core processor from the current or previous generation.',
      'A strong mid-range graphics card for high settings at 1080p and good 1440p.',
      '16 GB DDR4 or DDR5 depending on the platform, with room to upgrade.',
      '1 TB NVMe SSD, a quality 650 W power supply and a well-ventilated case.',
    ],
    tips: [
      'Choose DDR5 only if the platform price still leaves a strong GPU in the budget.',
      'A good CPU cooler is worth it with a 12th gen Intel Core i5 K-series or a Ryzen 7.',
      'Leave 3 to 5 percent of the budget for a UPS if your area has frequent power cuts.',
    ],
    faq: [
      {
        q: 'What GPU can I expect under 1 lakh taka?',
        a: 'A mid-range current-generation card or a high-end previous-generation card, depending on which has the better price at your retailer that week.',
      },
      {
        q: 'Do I need 32 GB of RAM for gaming?',
        a: '16 GB is enough for gaming today. 32 GB helps if you stream, edit, or run many apps at once, and you can say so when you describe your build.',
      },
    ],
  },
  {
    slug: 'gaming-pc-under-150000-taka',
    title: 'High-End Gaming PC Under 1.5 Lakh Taka in Bangladesh | BuildMyPC',
    description:
      'Build a high-end gaming PC under 1.5 lakh BDT for 1440p high refresh or entry 4K. Compatible parts, live prices from Bangladesh retailers.',
    h1: 'High-end gaming PC under 1.5 lakh taka',
    lead: 'At 150,000 BDT you can target high-refresh 1440p, ray tracing in many titles, and a build that stays relevant for years.',
    prompt: 'I need a high-end 1440p gaming PC under 150,000 BDT with a fast GPU and 32GB RAM',
    budget: 150000,
    useCase: 'gaming',
    expect: [
      'A high-end gaming processor, with a proper tower cooler or AIO.',
      'A high-end graphics card with enough VRAM for 1440p and light 4K.',
      '32 GB of RAM, DDR5 on a current platform.',
      '1 to 2 TB NVMe SSD, a 750 W or larger power supply and a premium airflow case.',
    ],
    tips: [
      'Specify the monitor refresh rate (for example 165 Hz) so the builder budgets for a matching display.',
      'A 750 W or 850 W power supply gives headroom for GPU upgrades later.',
      'If you also edit video, mention it; storage and RAM priorities shift.',
    ],
    faq: [
      {
        q: 'Is 1.5 lakh taka enough for 4K gaming?',
        a: 'It can reach playable 4K in many titles with a high-end card and upscaling, but 1440p high refresh is the comfortable target at this price.',
      },
      {
        q: 'Should I buy the best CPU or the best GPU?',
        a: 'For gaming, the graphics card gives more performance per taka. Buy a strong but not top-tier CPU and put the rest into the GPU.',
      },
    ],
  },
  {
    slug: 'office-pc-under-35000-taka',
    title: 'Office PC Build Under 35,000 Taka in Bangladesh | BuildMyPC',
    description:
      'Fast, quiet office PC under 35,000 BDT for work, study and browsing. Compatible parts and live Bangladesh prices, no GPU needed.',
    h1: 'Office PC under 35,000 taka',
    lead: 'For documents, browsing, video calls and light multitasking you do not need a graphics card. Spend on a fast SSD and enough RAM instead.',
    prompt: 'I need a fast office productivity PC under 35,000 BDT with a fast SSD and no dedicated GPU',
    budget: 35000,
    useCase: 'office',
    expect: [
      'A processor with integrated graphics (for example a Ryzen APU or a Core i3/i5 with UHD graphics).',
      '8 to 16 GB of RAM; 16 GB if you keep many browser tabs and apps open.',
      'A 256 to 512 GB SSD so the PC boots and opens apps quickly.',
      'A small, quiet case and an efficient power supply.',
    ],
    tips: [
      'Do not buy a graphics card for office work; integrated graphics handle multiple monitors and 4K video playback.',
      'An SSD matters more than a faster CPU for how fast the PC feels day to day.',
      'Add a UPS if power cuts are common to protect your work.',
    ],
    faq: [
      {
        q: 'Do I need a graphics card for an office PC?',
        a: 'No. Integrated graphics cover office work, browsing, video calls and video playback. A dedicated card is only worth it for gaming or heavy creative work.',
      },
      {
        q: 'How much RAM does an office PC need?',
        a: '8 GB is the minimum today and 16 GB is more comfortable if you work with many tabs, spreadsheets or video calls at the same time.',
      },
    ],
  },
  {
    slug: 'office-pc-under-50000-taka',
    title: 'Office & Productivity PC Under 50,000 Taka in Bangladesh | BuildMyPC',
    description:
      'Office and productivity PC under 50,000 BDT: strong multi-core CPU, 16 GB RAM and a fast SSD with live Bangladesh prices.',
    h1: 'Office and productivity PC under 50,000 taka',
    lead: 'For heavier multitasking, spreadsheets, coding and light design work, 50,000 BDT buys a responsive PC with 16 GB of RAM and a fast SSD.',
    prompt: 'I need a fast productivity PC under 50,000 BDT with 16GB RAM and a 512GB SSD, no dedicated GPU',
    budget: 50000,
    useCase: 'office',
    expect: [
      'A 6-core processor with integrated graphics for smooth multitasking.',
      '16 GB of RAM as the default at this budget.',
      '512 GB to 1 TB NVMe SSD.',
      'A reliable power supply and a case with good airflow.',
    ],
    tips: [
      'If you plan to add a graphics card later, mention it so the power supply has headroom.',
      'A processor with integrated graphics lets you start without a GPU and add one later.',
      'Say "intel" or "amd" if your software or preference demands one.',
    ],
    faq: [
      {
        q: 'Is this good for programming?',
        a: 'Yes. A 6-core processor, 16 GB of RAM and an NVMe SSD handle most development work, containers and IDEs comfortably.',
      },
    ],
  },
  {
    slug: 'programming-pc-under-60000-taka',
    title: 'Programming PC Build Under 60,000 Taka in Bangladesh | BuildMyPC',
    description:
      'Programming and development PC under 60,000 BDT: multi-core CPU, 16 to 32 GB RAM, fast NVMe SSD. Live prices from Bangladesh retailers.',
    h1: 'Programming PC under 60,000 taka',
    lead: 'Compiling, containers and a browser with fifty tabs want cores, RAM and fast storage. A graphics card is optional.',
    prompt: 'I need a PC for programming under 60,000 BDT with 16GB RAM and a 1TB SSD, no GPU',
    budget: 60000,
    useCase: 'office',
    expect: [
      'A multi-core processor (6 cores or more) with integrated graphics.',
      '16 GB of RAM, with a motherboard that can take 32 GB or more later.',
      '1 TB NVMe SSD for projects, containers and virtual machines.',
      'A quiet cooler and a case that keeps it cool under long compiles.',
    ],
    tips: [
      'RAM and storage are the upgrades you will feel most; leave the second RAM slot free.',
      'Skip the discrete GPU unless you train models or do game development.',
      'If you want a second monitor, check the motherboard has the video outputs you need.',
    ],
    faq: [
      {
        q: 'Do I need a GPU for programming?',
        a: 'Not for most development work. You only need a graphics card for machine learning, game development or GPU-accelerated rendering.',
      },
    ],
  },
  {
    slug: 'video-editing-pc-under-100000-taka',
    title: 'Video Editing PC Build Under 1 Lakh Taka in Bangladesh | BuildMyPC',
    description:
      'Video editing and rendering PC under 1 lakh BDT: fast multi-core CPU, 32 GB RAM, NVMe storage. Compatible parts with live Bangladesh prices.',
    h1: 'Video editing PC under 1 lakh taka',
    lead: 'Editing rewards cores, RAM and fast storage. At 100,000 BDT you can build a smooth 1080p to 4K editing machine for Premiere Pro or DaVinci Resolve.',
    prompt: 'I need a video editing and rendering PC under 100,000 BDT with a fast multi-core CPU and 32GB RAM',
    budget: 100000,
    useCase: 'editing',
    expect: [
      'A strong multi-core processor; core count drives export times.',
      '32 GB of RAM so timelines and previews stay smooth.',
      'A mid-range graphics card with enough VRAM for effects and GPU encoding.',
      '1 TB NVMe SSD for the project drive and a power supply with headroom.',
    ],
    tips: [
      'Choose 32 GB RAM before a faster GPU; running out of RAM is the biggest slowdown in editing.',
      'Keep footage on a fast NVMe drive and archive finished projects elsewhere.',
      'If your editor uses CUDA or NVENC, say "Nvidia GPU" when you describe the build.',
    ],
    faq: [
      {
        q: 'How much RAM do I need for video editing?',
        a: '16 GB works for 1080p, but 32 GB is the sensible target for 4K or effects-heavy timelines.',
      },
      {
        q: 'Is an Nvidia GPU needed for editing?',
        a: 'Not required, but many editors benefit from Nvidia hardware encoding. Tell the builder if your software prefers it.',
      },
    ],
  },
];

export const ALL_PAGES = [HOME, ...LANDING_PAGES.map((p) => ({ ...p, path: `/${p.slug}` }))];

export const absoluteUrl = (path) => `${SITE_URL}${path === '/' ? '/' : path}`;

/** Landing page for a pathname, or null (home and unknown paths). */
export function findLandingPage(pathname = '/') {
  const clean = String(pathname).replace(/\/+$/, '').replace(/^\//, '');
  return LANDING_PAGES.find((p) => p.slug === clean) || null;
}

export function faqJsonLd(items) {
  return {
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
}
