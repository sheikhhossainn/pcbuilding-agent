import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBlockedImage, withViewableImages, buildWithViewableImages } from '../utils/partImages.js';

const RYANS_IMG = 'https://www.ryans.com/storage/products/small/ryzen-5-3400g.webp';
const STARTECH_IMG = 'https://www.startech.com.bd/image/cache/catalog/processor/3400g.jpg';
const TECHLAND_IMG = 'https://www.techlandbd.com/cache/images/3400g.webp';

const ryzen = (site, image) => ({
  name: 'AMD Ryzen 5 3400G Processor with Radeon RX Vega 11 Graphics',
  price: 7800,
  category: 'Processor',
  site,
  image,
});

function repo(stock) {
  const calls = [];
  return {
    calls,
    listInStock: async (site, category) => {
      calls.push(`${site}:${category}`);
      return stock[site]?.[category] || [];
    },
  };
}

test('only images on a blocked host are flagged', () => {
  assert.equal(isBlockedImage(RYANS_IMG), true);
  assert.equal(isBlockedImage('https://ryans.com/x.webp'), true);
  assert.equal(isBlockedImage(STARTECH_IMG), false);
  assert.equal(isBlockedImage('https://notryans.com/x.webp'), false);
  assert.equal(isBlockedImage(null), false);
  assert.equal(isBlockedImage('not a url'), false);
});

test('a blocked photo is replaced by the same product from another store', async () => {
  const r = repo({ startech: { Processor: [ryzen('startech', STARTECH_IMG)] } });
  const [part] = await withViewableImages([ryzen('ryans', RYANS_IMG)], r);
  assert.equal(part.image, STARTECH_IMG);
  assert.equal(part.name, ryzen('ryans').name, 'everything else is untouched');
});

test('falls through to the next store, and to no photo when no store has the model', async () => {
  const r = repo({ techland: { Processor: [ryzen('techland', TECHLAND_IMG)] } });
  const [found] = await withViewableImages([ryzen('ryans', RYANS_IMG)], r);
  assert.equal(found.image, TECHLAND_IMG);

  const other = {
    name: 'AMD Ryzen 7 5700X Processor', price: 18000, category: 'Processor', image: STARTECH_IMG,
  };
  const none = repo({ startech: { Processor: [other] } });
  const [missing] = await withViewableImages([ryzen('ryans', RYANS_IMG)], none);
  assert.equal(missing.image, null, 'a different model never lends its photo');
});

test('parts with loadable photos are left alone and cost no lookups', async () => {
  const r = repo({});
  const part = ryzen('startech', STARTECH_IMG);
  const [out] = await withViewableImages([part, null], r);
  assert.equal(out, part);
  assert.deepEqual(r.calls, []);
});

test('a build keeps its shape, empty slots included', async () => {
  const r = repo({ startech: { Processor: [ryzen('startech', STARTECH_IMG)] } });
  const { category, ...noCategory } = ryzen('ryans', RYANS_IMG);
  void category;
  const build = await buildWithViewableImages({ Processor: noCategory, Monitor: null }, r);
  assert.deepEqual(Object.keys(build), ['Processor', 'Monitor']);
  assert.equal(build.Processor.image, STARTECH_IMG);
  assert.equal(build.Monitor, null);
});

test('a failing store lookup is skipped, not thrown', async () => {
  const r = {
    listInStock: async (site) => {
      if (site === 'startech') throw new Error('db down');
      return [ryzen('techland', TECHLAND_IMG)];
    },
  };
  const [part] = await withViewableImages([ryzen('ryans', RYANS_IMG)], r);
  assert.equal(part.image, TECHLAND_IMG);
});
