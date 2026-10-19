import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from './fixtures/miniCatalog.js';
import { createEngine, build } from './engineHarness.js';
import { SITES, VALID_SITES, siteLabel, siteTracks, untrackedCategories } from '../config/sites.js';
import { API } from '../config/thresholds.js';
import { ERROR_INVALID_SITE } from '../utils/errors.js';
import { INTENT_PROMPT } from '../ai/intentPrompt.js';
import { sanitizePreviousIntent } from '../routes/build.js';

// The mini catalog is a StarTech slice; relabelled, it stands in for another store's stock.
const asSite = (site) => catalog
  .filter((r) => r.site === 'startech')
  .map((r) => ({ ...r, site, url: r.url.replace('https://www.startech.com.bd/', `https://www.${site}.test/`) }));

test('every site id is valid, and ryans is one of them', () => {
  assert.deepEqual(VALID_SITES, Object.keys(SITES));
  assert.ok(VALID_SITES.includes('ryans'));
  assert.deepEqual(API.VALID_SITES, VALID_SITES);
});

test('siteLabel and siteTracks read the site list', () => {
  assert.equal(siteLabel('ryans'), 'Ryans BD');
  assert.equal(siteLabel('nosuchshop'), 'nosuchshop');
  assert.ok(siteTracks('ryans', 'Monitor'));
  assert.ok(siteTracks('startech', 'Keyboard'));
  assert.ok(!siteTracks('computermania', 'Mouse'));
  assert.ok(siteTracks('computermania', 'Processor'));
  assert.deepEqual(untrackedCategories('ryans'), []);
});

test('the invalid-site error and the intent prompt list every site', () => {
  for (const site of VALID_SITES) {
    assert.ok(ERROR_INVALID_SITE.message.includes(site), `error message is missing ${site}`);
    assert.ok(INTENT_PROMPT.includes(`"${site}"`), `prompt enum is missing ${site}`);
  }
});

test('sanitizePreviousIntent keeps ryans as the preferred and applied site', () => {
  const clean = sanitizePreviousIntent({
    budget_bdt: 60000,
    preferred_site: 'ryans',
    _applied_site: 'ryans',
    component_strategy: { Processor: { weight: 2, required: true } },
  });
  assert.equal(clean.preferred_site, 'ryans');
  assert.equal(clean._applied_site, 'ryans');
});

test('a build at ryans uses only ryans stock and is stamped with the site', async () => {
  const eng = createEngine([...catalog, ...asSite('ryans')]);
  const result = await build({ budget: 60000 }, { site: 'ryans', eng });

  for (const category of ['Processor', 'Motherboard', 'RAM', 'PSU']) {
    assert.ok(result.build[category], `missing ${category}`);
  }
  for (const [category, part] of Object.entries(result.build)) {
    if (part) assert.ok(part.url.startsWith('https://www.ryans.test/'), `${category} came from another store: ${part.url}`);
  }
  assert.equal(result.intent._applied_site, 'ryans');
  assert.ok(!result.warnings.some((w) => /not tracked/.test(w)));
});

test('a store that lacks peripherals still says so, by its display name', async () => {
  const eng = createEngine([...catalog, ...asSite('computermania')]);
  const result = await build({ budget: 60000 }, { site: 'computermania', eng, message: 'gaming pc with a monitor' });

  const note = result.warnings.find((w) => /not tracked/.test(w));
  assert.ok(note, 'expected an untracked-categories warning');
  assert.match(note, /CompMania BD/);
  assert.equal(result.build.Monitor ?? null, null);
});
