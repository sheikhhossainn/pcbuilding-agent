import test from 'node:test';
import assert from 'node:assert/strict';
import { HOME, LANDING_PAGES, FAQ, findLandingPage, faqJsonLd } from './pages.js';

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
