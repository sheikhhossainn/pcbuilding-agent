// Post-build step: turn dist/index.html into one static HTML file per route, with the page's
// own <title>, meta tags, structured data and visible copy already in the markup, so crawlers
// and link previews see real content without running JavaScript. React replaces the static
// copy as soon as the app mounts. Also writes sitemap.xml from the same page list.
//
// Run by `npm run build` after `vite build`.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  SITE_URL, SITE_NAME, LAST_MODIFIED, HOME, HOW_IT_WORKS, FAQ, LANDING_PAGES, FEATURES,
  absoluteUrl, faqJsonLd,
} from '../src/seo/pages.js';
import { generateSitemapXml } from '../src/seo/sitemap.js';

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const template = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
if (!template.includes('<!--PRERENDER-->')) {
  throw new Error('dist/index.html is missing the <!--PRERENDER--> marker');
}

const esc = (value) => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// JSON inside <script> must not be able to close the tag.
const jsonScript = (data) => JSON.stringify(data).replace(/</g, '\\u003c');

function structuredData(page, faq) {
  const url = absoluteUrl(page.path);
  const graph = [
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: `${SITE_URL}/`,
      name: SITE_NAME,
      description: HOME.description,
      inLanguage: 'en',
    },
    {
      '@type': 'WebApplication',
      '@id': `${SITE_URL}/#app`,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Any',
      browserRequirements: 'Requires JavaScript',
      description: 'Generates compatible custom PC builds from a budget in BDT and a use case, using live prices from Bangladesh PC retailers, and compares the build across stores.',
      featureList: FEATURES,
      inLanguage: 'en',
      areaServed: { '@type': 'Country', name: 'Bangladesh' },
      image: `${SITE_URL}/og-image.png`,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'BDT' },
    },
    faqJsonLd(faq),
  ];
  if (page.path !== '/') {
    graph.push({
      '@type': 'WebPage',
      '@id': `${url}#webpage`,
      url,
      name: page.title,
      description: page.description,
      isPartOf: { '@id': `${SITE_URL}/#website` },
      dateModified: LAST_MODIFIED,
    });
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: SITE_NAME, item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: page.h1, item: url },
      ],
    });
  }
  return { '@context': 'https://schema.org', '@graph': graph };
}

const list = (items) => `<ul>${items.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`;

function bodyHtml(page, faq) {
  const isLanding = page.path !== '/';
  const others = LANDING_PAGES.filter((p) => `/${p.slug}` !== page.path);
  return [
    '<div class="prerender">',
    `<p><strong>${esc(SITE_NAME)}</strong> — AI PC builder for Bangladesh</p>`,
    `<h1>${esc(page.h1)}</h1>`,
    `<p>${esc(page.lead)}</p>`,
    '<p>Enable JavaScript to use the builder.</p>',
    isLanding ? `<h2>What to expect at this budget</h2>${list(page.expect)}<h3>Tips for this budget</h3>${list(page.tips)}` : '',
    `<h2>From budget to build in three steps</h2><ol>${HOW_IT_WORKS.map((s) => `<li><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></li>`).join('')}</ol>`,
    `<h2>Frequently asked questions</h2><dl>${faq.map((f) => `<dt>${esc(f.q)}</dt><dd>${esc(f.a)}</dd>`).join('')}</dl>`,
    `<h2>PC builds by budget</h2><ul>${others.map((p) => `<li><a href="/${p.slug}">${esc(p.h1)}</a></li>`).join('')}${isLanding ? '<li><a href="/">PC builder home</a></li>' : ''}</ul>`,
    '</div>',
  ].join('');
}

function render(page) {
  const faq = page.faq ? [...page.faq, ...FAQ] : FAQ;
  const url = absoluteUrl(page.path);
  // Short title for social cards; the full title is for the search result.
  const social = page.path === '/' ? 'BuildMyPC — AI PC Builder for Bangladesh' : page.h1;

  let html = template;
  const swap = (pattern, replacement) => {
    if (!pattern.test(html)) throw new Error(`prerender: pattern not found ${pattern}`);
    html = html.replace(pattern, () => replacement);
  };

  swap(/<title>.*?<\/title>/s, `<title>${esc(page.title)}</title>`);
  swap(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${esc(page.description)}" />`);
  swap(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${url}" />`);
  swap(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${esc(social)}" />`);
  swap(/<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${esc(page.description)}" />`);
  swap(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${url}" />`);
  swap(/<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${esc(social)}" />`);
  swap(/<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${esc(page.description)}" />`);
  swap(/<script type="application\/ld\+json">.*?<\/script>/s, `<script type="application/ld+json">${jsonScript(structuredData(page, faq))}</script>`);
  swap(/<!--PRERENDER-->/, bodyHtml(page, faq));
  return html;
}

const pages = [
  { ...HOME, path: '/' },
  ...LANDING_PAGES.map((p) => ({ ...p, path: `/${p.slug}` })),
];

for (const page of pages) {
  const out = page.path === '/'
    ? path.join(dist, 'index.html')
    : path.join(dist, page.path.slice(1), 'index.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, render(page));
}

const sitemap = generateSitemapXml(pages, LAST_MODIFIED);
fs.writeFileSync(path.join(dist, 'sitemap.xml'), sitemap, 'utf8');

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), sitemap, 'utf8');

console.log(`prerendered ${pages.length} pages + sitemap.xml (dist/ and public/)`);
