import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SITE_URL, ALL_PAGES, HOME, LANDING_PAGES, FAQ,
  findLandingPage, faqJsonLd, absoluteUrl,
} from './pages.js';
import { generateSitemapXml, VALID_CHANGEFREQS } from './sitemap.js';

test('landing page slugs are unique, url-safe and not reserved', () => {
  const slugs = LANDING_PAGES.map((p) => p.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const slug of slugs) {
    assert.match(slug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.notEqual(slug, 'api');
    assert.notEqual(slug, 'assets');
  }
});

test('titles and descriptions fit search result snippets', () => {
  for (const page of [HOME, ...LANDING_PAGES]) {
    assert.ok(page.title.length <= 70, `title too long: ${page.title}`);
    assert.ok(page.description.length >= 70 && page.description.length <= 160, `description length: ${page.slug || 'home'} ${page.description.length}`);
  }
  const titles = [HOME, ...LANDING_PAGES].map((p) => p.title);
  assert.equal(new Set(titles).size, titles.length, 'titles must be unique');
});

test('every landing page has content, a prompt and faq entries', () => {
  for (const page of LANDING_PAGES) {
    assert.ok(page.h1 && page.lead && page.prompt, page.slug);
    assert.ok(page.expect.length >= 3 && page.tips.length >= 2 && page.faq.length >= 1, page.slug);
  }
});

test('findLandingPage matches paths with or without slashes', () => {
  assert.equal(findLandingPage('/gaming-pc-under-80000-taka').slug, 'gaming-pc-under-80000-taka');
  assert.equal(findLandingPage('/gaming-pc-under-80000-taka/').slug, 'gaming-pc-under-80000-taka');
  assert.equal(findLandingPage('/'), null);
  assert.equal(findLandingPage('/nope'), null);
});

test('faq structured data carries every question', () => {
  const ld = faqJsonLd(FAQ);
  assert.equal(ld['@type'], 'FAQPage');
  assert.equal(ld.mainEntity.length, FAQ.length);
});

test('sitemap generator produces valid XML for all pages', () => {
  const xml = generateSitemapXml(ALL_PAGES, '2026-10-16');

  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(xml.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'));
  assert.ok(xml.endsWith('</urlset>\n'));

  // Ensure every page in ALL_PAGES is in the sitemap with absolute URL
  for (const page of ALL_PAGES) {
    const url = absoluteUrl(page.path);
    assert.ok(xml.includes(`<loc>${url}</loc>`), `Missing url: ${url}`);
  }

  // Parse all <url> blocks
  const urlBlocks = xml.match(/<url>[\s\S]*?<\/url>/g) || [];
  assert.equal(urlBlocks.length, ALL_PAGES.length);

  for (const block of urlBlocks) {
    const locMatch = block.match(/<loc>(.*?)<\/loc>/);
    const lastmodMatch = block.match(/<lastmod>(.*?)<\/lastmod>/);
    const changefreqMatch = block.match(/<changefreq>(.*?)<\/changefreq>/);
    const priorityMatch = block.match(/<priority>(.*?)<\/priority>/);

    assert.ok(locMatch, 'Every url must have a loc');
    assert.ok(locMatch[1].startsWith(SITE_URL), 'loc must start with SITE_URL');

    assert.ok(lastmodMatch, 'Every url must have a lastmod');
    assert.match(lastmodMatch[1], /^\d{4}-\d{2}-\d{2}$/, 'lastmod must be YYYY-MM-DD');

    assert.ok(changefreqMatch, 'Every url must have a changefreq');
    assert.ok(VALID_CHANGEFREQS.has(changefreqMatch[1]), `Invalid changefreq: ${changefreqMatch[1]}`);

    assert.ok(priorityMatch, 'Every url must have a priority');
    const priority = parseFloat(priorityMatch[1]);
    assert.ok(priority >= 0.0 && priority <= 1.0, `Priority out of bounds: ${priority}`);

    if (locMatch[1] === `${SITE_URL}/`) {
      assert.equal(priorityMatch[1], '1.0', 'Home page should have priority 1.0');
      assert.equal(changefreqMatch[1], 'weekly');
    } else {
      assert.equal(priorityMatch[1], '0.8', 'Landing pages should have priority 0.8');
    }
  }
});

test('public/sitemap.xml exists and matches current pages', () => {
  const publicSitemapPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../public/sitemap.xml');
  assert.ok(fs.existsSync(publicSitemapPath), 'public/sitemap.xml must exist');

  const content = fs.readFileSync(publicSitemapPath, 'utf8');
  assert.ok(content.includes('<loc>https://buildmypc-eight.vercel.app/</loc>'));
  // The date is stamped when the site is built, so it is allowed to be older than today. The page list is what must match.
  const stamped = content.match(/<lastmod>(\d{4}-\d{2}-\d{2})<\/lastmod>/)?.[1];
  assert.equal(content.replace(/\r\n/g, '\n'), generateSitemapXml(ALL_PAGES, stamped).replace(/\r\n/g, '\n'));
});
